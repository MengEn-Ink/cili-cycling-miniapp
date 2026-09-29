import type { Role } from '../models';
import {
  authenticateWithCloud,
  type AuthAttempt,
  type AuthCloudApi,
  type AuthIdentity,
} from '../services/auth-service';
import { isMock } from '../repositories/index';

export type AuthStatus = 'idle' | 'loading' | 'authenticated' | 'unavailable' | 'error';

interface StorageApi {
  getStorageSync(key: string): unknown;
  setStorageSync(key: string, value: unknown): void;
}

type Authenticate = (cloud?: AuthCloudApi) => Promise<AuthAttempt>;

// 已授权身份本地持久化：避免每次进入页面都调用一次 auth 云函数
const IDENTITY_CACHE_KEY = 'ride-identity-v1';
// 身份缓存有效期 24 小时；管理员页与手动重试会强制拉取最新身份
const IDENTITY_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface CachedIdentity extends AuthIdentity {
  saved_at: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

// 读取本地身份缓存；allowExpired 时允许在云端不可用时兜底沿用过期身份
function readCachedIdentity(
  storage: StorageApi,
  now: () => number,
  allowExpired = false,
): CachedIdentity | null {
  const raw = storage.getStorageSync(IDENTITY_CACHE_KEY);
  if (!isRecord(raw)) return null;
  const { openid, role, isSuper, saved_at } = raw;
  if (
    typeof openid !== 'string' ||
    openid.length === 0 ||
    (role !== 'member' && role !== 'admin') ||
    typeof isSuper !== 'boolean' ||
    typeof saved_at !== 'number' ||
    (role === 'member' && isSuper)
  ) {
    return null;
  }
  if (!allowExpired && now() - saved_at > IDENTITY_CACHE_TTL_MS) return null;
  return { openid, role, isSuper, saved_at };
}

function defaultStorage(): StorageApi {
  return {
    getStorageSync: (key) => wx.getStorageSync(key),
    setStorageSync: (key, value) => wx.setStorageSync(key, value),
  };
}

export class AppStore {
  openid: string | null = null;
  role: Role = 'member';
  isSuper = false;
  authStatus: AuthStatus = 'idle';
  authError = '';
  readonly isMock = isMock;
  private authPromise: Promise<AuthAttempt> | null = null;

  constructor(
    private readonly storage: StorageApi = defaultStorage(),
    private readonly authenticate: Authenticate = authenticateWithCloud,
    private readonly now: () => number = Date.now,
  ) {}

  bootstrap() {
    const storedRole = this.storage.getStorageSync('ride-role');
    if (this.isMock && !this.openid && (storedRole === 'member' || storedRole === 'admin')) {
      this.role = storedRole;
    }
  }

  async refreshIdentity(
    cloud?: AuthCloudApi,
    // force 为 true 时跳过内存与本地缓存强制拉取：管理员守卫页和手动重试使用
    force = false,
  ): Promise<AuthAttempt> {
    if (this.authPromise) return this.authPromise;

    // 已有内存身份且非强制：直接复用，不产生网络请求
    if (!force && this.openid) {
      this.authStatus = 'authenticated';
      this.authError = '';
      return { status: 'authenticated', identity: this.identitySnapshot() };
    }

    // 无内存身份时优先恢复 24 小时内的本地缓存，避免频繁获取
    if (!force) {
      const cached = readCachedIdentity(this.storage, this.now);
      if (cached) {
        this.applyIdentity(cached);
        return { status: 'authenticated', identity: this.identitySnapshot() };
      }
    }

    this.authStatus = 'loading';
    this.authError = '';
    this.authPromise = this.authenticate(cloud).then((attempt) => {
      if (attempt.status === 'authenticated') {
        this.applyIdentity(attempt.identity);
        this.storage.setStorageSync(IDENTITY_CACHE_KEY, {
          ...attempt.identity,
          saved_at: this.now(),
        });
      } else {
        // 云端不可用但本地存在过期身份时沿用，避免弱网下页面报错或反复登录
        const stale = force ? null : readCachedIdentity(this.storage, this.now, true);
        if (stale) {
          this.applyIdentity(stale);
          return { status: 'authenticated', identity: this.identitySnapshot() };
        }
        this.authStatus = attempt.status;
        this.authError = attempt.message;
        if (!this.openid) this.isSuper = false;
      }
      return attempt;
    });

    try {
      return await this.authPromise;
    } finally {
      this.authPromise = null;
    }
  }

  private identitySnapshot(): AuthIdentity {
    return {
      openid: this.openid as string,
      role: this.role,
      isSuper: this.isSuper,
    };
  }

  private applyIdentity(identity: AuthIdentity) {
    this.openid = identity.openid;
    this.role = identity.role;
    this.isSuper = identity.isSuper;
    this.authStatus = 'authenticated';
    this.authError = '';
  }

  canSwitchRole(): boolean {
    return this.isMock && !this.openid;
  }

  switchRole(role: Role) {
    if (!this.canSwitchRole()) throw Error('真实身份生效后不可切换角色');
    this.role = role;
    this.storage.setStorageSync('ride-role', role);
  }
}

export const appStore = new AppStore();
