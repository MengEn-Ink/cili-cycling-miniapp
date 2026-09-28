import { describe, expect, it, vi } from 'vitest';
import {
  AuthServiceError,
  authenticateWithCloud,
  parseAuthResponse,
} from '../miniprogram/services/auth-service';
import { AppStore } from '../miniprogram/store/app-store';

const fakeIdentity = {
  openid: 'openid-for-unit-test-only',
  role: 'admin' as const,
  isSuper: true,
};

function memoryStorage(initialRole: 'member' | 'admin' = 'member') {
  let role = initialRole;
  return {
    getStorageSync: () => role,
    setStorageSync: (_key: string, value: unknown) => {
      role = value as 'member' | 'admin';
    },
  };
}

describe('云身份响应解析', () => {
  it('接受最小且一致的可信身份', () => {
    expect(parseAuthResponse({ result: fakeIdentity })).toEqual(fakeIdentity);
  });

  it.each([
    undefined,
    {},
    { result: null },
    { result: {} },
    { result: { openid: '', role: 'member', isSuper: false } },
    { result: { openid: 'x', role: 'owner', isSuper: false } },
    { result: { openid: 'x', role: 'member', isSuper: true } },
  ])('拒绝空或异常响应 %#', (response) => {
    expect(() => parseAuthResponse(response)).toThrow(AuthServiceError);
  });

  it('映射云端 openid 缺失错误', () => {
    expect(() =>
      parseAuthResponse({ result: { error: { code: 'AUTH_OPENID_MISSING' } } }),
    ).toThrowError('云端未取得微信身份，请从小程序内重试。');
  });
});

describe('云身份调用边界', () => {
  it('没有 wx.cloud 时返回 unavailable，且不生成 openid', async () => {
    await expect(authenticateWithCloud(undefined)).resolves.toEqual({
      status: 'unavailable',
      code: 'CLOUD_UNAVAILABLE',
      message: '当前环境不支持微信云开发，请在微信开发者工具或真机中重试。',
    });
  });

  it('始终调用 auth 且不向云函数传 openid', async () => {
    const callFunction = vi.fn().mockResolvedValue({ result: fakeIdentity });
    await expect(authenticateWithCloud({ callFunction })).resolves.toEqual({
      status: 'authenticated',
      identity: fakeIdentity,
    });
    expect(callFunction).toHaveBeenCalledWith({ name: 'auth' });
  });

  it('将未部署和普通调用失败映射为稳定错误', async () => {
    await expect(
      authenticateWithCloud({
        callFunction: vi.fn().mockRejectedValue({ errMsg: 'cloud function not found' }),
      }),
    ).resolves.toMatchObject({ status: 'error', code: 'FUNCTION_NOT_DEPLOYED' });
    await expect(
      authenticateWithCloud({ callFunction: vi.fn().mockRejectedValue(new Error('network')) }),
    ).resolves.toMatchObject({ status: 'error', code: 'CALL_FAILED' });
  });
});

describe('身份 store', () => {
  it('真实角色成功后不再允许开发态 storage 覆盖或切换', async () => {
    const storage = memoryStorage('member');
    const store = new AppStore(storage, async () => ({
      status: 'authenticated',
      identity: fakeIdentity,
    }));
    store.bootstrap();
    await store.refreshIdentity();
    expect(store.role).toBe('admin');
    expect(store.canSwitchRole()).toBe(false);
    expect(() => store.switchRole('member')).toThrow('真实身份生效后不可切换角色');
    store.bootstrap();
    expect(store.role).toBe('admin');
  });

  it('cloud 不可用时不启用开发态角色且没有伪造身份', async () => {
    const store = new AppStore(memoryStorage('admin'), authenticateWithCloud);
    store.bootstrap();
    await store.refreshIdentity(undefined);
    expect(store).toMatchObject({
      openid: null,
      role: 'member',
      isSuper: false,
      authStatus: 'unavailable',
    });
    expect(store.canSwitchRole()).toBe(false);
  });
});
