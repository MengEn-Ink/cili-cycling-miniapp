import type { Role } from '../models';
import {
  authenticateWithCloud,
  type AuthAttempt,
  type AuthCloudApi,
} from '../services/auth-service';
import { isMock } from '../repositories';

export type AuthStatus = 'idle' | 'loading' | 'authenticated' | 'unavailable' | 'error';

interface StorageApi {
  getStorageSync(key: string): unknown;
  setStorageSync(key: string, value: unknown): void;
}

type Authenticate = (cloud?: AuthCloudApi) => Promise<AuthAttempt>;

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
  ) {}

  bootstrap() {
    const storedRole = this.storage.getStorageSync('ride-role');
    if (this.isMock && !this.openid && (storedRole === 'member' || storedRole === 'admin')) {
      this.role = storedRole;
    }
  }

  async refreshIdentity(cloud?: AuthCloudApi): Promise<AuthAttempt> {
    if (this.authPromise) return this.authPromise;

    this.authStatus = 'loading';
    this.authError = '';
    this.authPromise = this.authenticate(cloud).then((attempt) => {
      if (attempt.status === 'authenticated') {
        this.openid = attempt.identity.openid;
        this.role = attempt.identity.role;
        this.isSuper = attempt.identity.isSuper;
        this.authStatus = 'authenticated';
      } else {
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
