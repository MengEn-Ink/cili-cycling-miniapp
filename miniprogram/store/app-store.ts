import type { Role } from '../models';
import {
  authenticateWithCloud,
  type AuthAttempt,
  type AuthCloudApi,
} from '../services/auth-service';
import { isMock } from '../repositories/index';

export type AuthStatus = 'idle' | 'loading' | 'authenticated' | 'unavailable' | 'error';

interface StorageApi {
  getStorageSync(key: string): unknown;
  setStorageSync(key: string, value: unknown): void;
  removeStorageSync(key: string): void;
}

type Authenticate = (cloud?: AuthCloudApi) => Promise<AuthAttempt>;

type IdentityHint = {
  source: 'wechat_cloud';
  verifiedAt: number;
};

const IDENTITY_HINT_KEY = 'ride-identity-hint';
const IDENTITY_TTL_MS = 5 * 60_000;
const IDENTITY_HINT_WARMUP_TTL_MS = 12 * 60 * 60_000;

function defaultStorage(): StorageApi {
  return {
    getStorageSync: (key) => wx.getStorageSync(key),
    setStorageSync: (key, value) => wx.setStorageSync(key, value),
    removeStorageSync: (key) => wx.removeStorageSync(key),
  };
}

export class AppStore {
  openid: string | null = null;
  role: Role = 'member';
  isSuper = false;
  identityHint: IdentityHint | null = null;
  authStatus: AuthStatus = 'idle';
  authError = '';
  readonly isMock = isMock;
  private authPromise: Promise<AuthAttempt> | null = null;
  private identityVerifiedUntil = 0;

  constructor(
    private readonly storage: StorageApi = defaultStorage(),
    private readonly authenticate: Authenticate = authenticateWithCloud,
  ) {}

  bootstrap() {
    try {
      this.storage.removeStorageSync('ride-role');
    } catch {
      // Legacy mock-role cleanup is best-effort and never affects authorization.
    }
    this.identityHint = null;
    let stored: unknown;
    try {
      stored = this.storage.getStorageSync(IDENTITY_HINT_KEY);
    } catch {
      return;
    }
    if (!stored || typeof stored !== 'object') return;
    const hint = stored as Partial<IdentityHint>;
    if (
      hint.source === 'wechat_cloud' &&
      typeof hint.verifiedAt === 'number' &&
      Number.isFinite(hint.verifiedAt) &&
      Object.keys(stored).length === 2
    )
      this.identityHint = { source: hint.source, verifiedAt: hint.verifiedAt };
  }

  ensureIdentity(cloud?: AuthCloudApi, force = false): Promise<AuthAttempt> {
    if (this.authPromise) return this.authPromise;
    if (
      !force &&
      this.authStatus === 'authenticated' &&
      this.openid &&
      Date.now() < this.identityVerifiedUntil
    )
      return Promise.resolve({
        status: 'authenticated',
        identity: { openid: this.openid, role: this.role, isSuper: this.isSuper },
      });

    this.authStatus = 'loading';
    this.authError = '';
    let authentication: Promise<AuthAttempt>;
    try {
      authentication = this.authenticate(cloud);
    } catch (error) {
      authentication = Promise.reject(error);
    }
    const request = authentication.then(
      (attempt) => {
        if (attempt.status === 'authenticated') {
          const verifiedAt = Date.now();
          this.openid = attempt.identity.openid;
          this.role = attempt.identity.role;
          this.isSuper = attempt.identity.isSuper;
          this.identityVerifiedUntil = verifiedAt + IDENTITY_TTL_MS;
          this.identityHint = { source: 'wechat_cloud', verifiedAt };
          this.authStatus = 'authenticated';
          try {
            this.storage.setStorageSync(IDENTITY_HINT_KEY, this.identityHint);
          } catch {
            // The persisted hint is optional; remote authentication remains authoritative.
          }
        } else {
          this.clearIdentity();
          this.authStatus = attempt.status;
          this.authError = attempt.message;
        }
        return attempt;
      },
      (error: unknown) => {
        this.clearIdentity();
        this.authStatus = 'error';
        this.authError = error instanceof Error ? error.message : '身份服务暂时不可用';
        throw error;
      },
    );
    this.authPromise = request;
    void request.then(
      () => this.clearAuthPromise(request),
      () => this.clearAuthPromise(request),
    );
    return request;
  }

  private clearAuthPromise(request: Promise<AuthAttempt>) {
    if (this.authPromise === request) this.authPromise = null;
  }

  private clearIdentity() {
    this.openid = null;
    this.role = 'member';
    this.isSuper = false;
    this.identityVerifiedUntil = 0;
  }

  hasFreshIdentityHint(now = Date.now()): boolean {
    return (
      !!this.identityHint &&
      Number.isFinite(this.identityHint.verifiedAt) &&
      now < this.identityHint.verifiedAt + IDENTITY_HINT_WARMUP_TTL_MS
    );
  }

  canSwitchRole(): boolean {
    return this.isMock && !this.openid;
  }

  switchRole(role: Role) {
    if (!this.canSwitchRole()) throw Error('真实身份生效后不可切换角色');
    this.role = role;
  }
}

export const appStore = new AppStore();
