// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Profile } from '../miniprogram/models';

const rideService = vi.hoisted(() => ({
  getProfile: vi.fn(),
  getProfileMediaUploadPath: vi.fn(),
  getPersonalCapabilityCard: vi.fn(),
  getStravaReadiness: vi.fn(),
  registerProfileMedia: vi.fn(),
  reportProfileMediaOrphan: vi.fn(),
  setAvatar: vi.fn(),
  importStravaAvatar: vi.fn(),
  updateProfile: vi.fn(),
}));

vi.mock('../miniprogram/services/ride-service', () => ({ rideService }));

const profile: Profile = {
  nickname: '骑手',
  title: '',
  avatarId: 'cloud://env/profiles/owner/old.jpg',
  avatarSource: 'custom',
  avatarRevision: 4,
  realName: '曹**',
  phone: '138****5678',
  gender: '',
  emergencyName: '联系人',
  emergencyPhone: '139****0000',
  photos: [],
};

const ready = {
  state: 'ready',
  canRegister: true,
  avatarAvailable: true,
  athleteName: 'Strava Rider',
  snapshot: null,
  error: null,
};

const capabilityCard = (avatarUrl = 'https://temporary.example/old-avatar.jpg') => ({
  state: 'ready',
  generatedAt: '2026-09-30T00:00:00.000Z',
  profile: { displayName: '骑手', title: '', avatarUrl },
  backgrounds: [],
  summary: {
    totalKm90d: null,
    rides90d: null,
    longestKm: null,
    elevationM90d: null,
    weightedAvgSpeedKmh: null,
  },
  coverage: null,
  syncedAt: null,
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

describe('资料编辑头像交互', () => {
  let page: any;

  beforeEach(async () => {
    vi.resetModules();
    Object.values(rideService).forEach((mock) => mock.mockReset());
    rideService.getProfile.mockResolvedValue(profile);
    rideService.getProfileMediaUploadPath.mockResolvedValue(
      'profiles/0123456789abcdef0123456789abcdef/123e4567-e89b-42d3-a456-426614174000.jpg',
    );
    rideService.getPersonalCapabilityCard.mockResolvedValue(capabilityCard());
    rideService.getStravaReadiness.mockResolvedValue(ready);
    rideService.registerProfileMedia.mockResolvedValue(undefined);
    rideService.reportProfileMediaOrphan.mockResolvedValue(undefined);
    rideService.setAvatar.mockImplementation(
      async (source: 'wechat' | 'custom', fileId: string) => ({
        ...profile,
        avatarId: fileId,
        avatarSource: source,
        avatarRevision: 5,
      }),
    );
    rideService.importStravaAvatar.mockResolvedValue({
      ...profile,
      avatarId: 'cloud://env/profiles/owner/strava.jpg',
      avatarSource: 'strava',
      avatarRevision: 5,
    });
    rideService.updateProfile.mockResolvedValue(profile);
    vi.stubGlobal('wx', {
      showToast: vi.fn(),
      navigateTo: vi.fn(),
      getStorageSync: vi.fn(() => []),
      setStorageSync: vi.fn(),
      removeStorageSync: vi.fn(),
    });
    vi.stubGlobal('Page', (definition: any) => {
      page = definition;
      page.data = {
        ...definition.data,
        p: { ...profile, photos: [] },
        avatarPreviewUrl: 'https://temporary.example/old-avatar.jpg',
      };
      page.setData = vi.fn((patch: Record<string, unknown>) => Object.assign(page.data, patch));
    });
    await import('../miniprogram/pages/profile-edit/index');
  });

  afterEach(() => vi.unstubAllGlobals());

  it('通用保存不提交任何头像来源或文件 ID', async () => {
    await page.save();

    const patch = rideService.updateProfile.mock.calls[0][0];
    expect(patch).not.toHaveProperty('avatarFileId');
    expect(patch).not.toHaveProperty('avatarSource');
  });

  it('展示时仅采用服务端返回的短期 HTTPS URL 作为头像预览', async () => {
    rideService.getPersonalCapabilityCard.mockResolvedValueOnce(
      capabilityCard('cloud://env/profiles/owner/raw.jpg'),
    );

    await page.onShow();

    expect(page.data.p.avatarId).toBe('cloud://env/profiles/owner/old.jpg');
    expect(page.data.avatarPreviewUrl).toBe('');

    rideService.getPersonalCapabilityCard.mockResolvedValueOnce(
      capabilityCard('https://temporary.example/signed-avatar.jpg'),
    );
    await page.loadAvatarPreview();
    expect(page.data.avatarPreviewUrl).toBe('https://temporary.example/signed-avatar.jpg');
  });

  it('微信选择入口按 owner path→upload→register(wechat)→setAvatar 顺序执行', async () => {
    const uploadedFileId = 'cloud://env/profiles/owner/wechat.jpg';
    const uploadFile = vi.fn().mockResolvedValue({ fileID: uploadedFileId });
    Object.assign(wx, { cloud: { uploadFile, deleteFile: vi.fn() } });
    rideService.getPersonalCapabilityCard.mockResolvedValueOnce(
      capabilityCard('https://temporary.example/wechat-avatar.jpg'),
    );

    await page.chooseWechatAvatar({ detail: { avatarUrl: '/private/tmp/wechat-avatar.jpg' } });

    expect(uploadFile).toHaveBeenCalledWith({
      cloudPath:
        'profiles/0123456789abcdef0123456789abcdef/123e4567-e89b-42d3-a456-426614174000.jpg',
      filePath: '/private/tmp/wechat-avatar.jpg',
    });
    expect(rideService.registerProfileMedia).toHaveBeenCalledWith(
      uploadedFileId,
      'other',
      'wechat',
    );
    expect(rideService.setAvatar).toHaveBeenCalledWith('wechat', uploadedFileId);
    expect(rideService.getProfileMediaUploadPath.mock.invocationCallOrder[0]).toBeLessThan(
      uploadFile.mock.invocationCallOrder[0],
    );
    expect(uploadFile.mock.invocationCallOrder[0]).toBeLessThan(
      rideService.registerProfileMedia.mock.invocationCallOrder[0],
    );
    expect(rideService.registerProfileMedia.mock.invocationCallOrder[0]).toBeLessThan(
      rideService.setAvatar.mock.invocationCallOrder[0],
    );
    expect(page.data.p).toMatchObject({ avatarId: uploadedFileId, avatarSource: 'wechat' });
    expect(page.data.avatarPreviewUrl).toBe('https://temporary.example/wechat-avatar.jpg');
  });

  it('自定义头像通过 chooseMedia 后以 custom 来源注册并设置', async () => {
    const uploadedFileId = 'cloud://env/profiles/owner/custom.jpg';
    const uploadFile = vi.fn().mockResolvedValue({ fileID: uploadedFileId });
    const chooseMedia = vi.fn().mockResolvedValue({
      tempFiles: [{ tempFilePath: '/private/tmp/custom-avatar.jpg' }],
    });
    Object.assign(wx, { chooseMedia, cloud: { uploadFile, deleteFile: vi.fn() } });
    page.data.p = {
      ...page.data.p,
      nickname: '尚未保存的昵称',
      phone: '13900001111',
      photos: [{ id: 'cloud://draft/photo.jpg', category: 'ride' }],
    };

    await page.chooseCustomAvatar();

    expect(chooseMedia).toHaveBeenCalledWith({
      count: 1,
      mediaType: ['image'],
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
    });
    expect(rideService.registerProfileMedia).toHaveBeenCalledWith(
      uploadedFileId,
      'other',
      'custom',
    );
    expect(rideService.setAvatar).toHaveBeenCalledWith('custom', uploadedFileId);
    expect(page.data.p).toMatchObject({
      nickname: '尚未保存的昵称',
      phone: '13900001111',
      photos: [{ id: 'cloud://draft/photo.jpg', category: 'ride' }],
      avatarId: uploadedFileId,
      avatarSource: 'custom',
    });
  });

  it('chooseMedia 不可用时自定义头像降级 chooseImage 上传', async () => {
    const uploadedFileId = 'cloud://env/profiles/owner/custom-fallback.jpg';
    const uploadFile = vi.fn().mockResolvedValue({ fileID: uploadedFileId });
    const chooseMedia = vi.fn().mockRejectedValue({ errMsg: 'chooseMedia:fail api not supported' });
    const chooseImage = vi.fn().mockResolvedValue({ tempFilePaths: ['/private/tmp/fallback.jpg'] });
    Object.assign(wx, { chooseMedia, chooseImage, cloud: { uploadFile, deleteFile: vi.fn() } });

    await page.chooseCustomAvatar();

    expect(chooseImage).toHaveBeenCalledWith({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
    });
    expect(uploadFile).toHaveBeenCalledWith(
      expect.objectContaining({ filePath: '/private/tmp/fallback.jpg' }),
    );
    expect(rideService.setAvatar).toHaveBeenCalledWith('custom', uploadedFileId);
  });

  it('chooseMedia 权限错误不降级 chooseImage 且显示选择阶段错误码', async () => {
    const chooseImage = vi.fn();
    Object.assign(wx, {
      chooseMedia: vi.fn().mockRejectedValue({ errMsg: 'chooseMedia:fail permission denied' }),
      chooseImage,
    });

    await page.chooseCustomAvatar();

    expect(chooseImage).not.toHaveBeenCalled();
    expect(page.data.mediaError).toContain('[MEDIA_SELECTION_FAILED]');
  });

  it('选择结果保留 size 并在上传前拒绝超过 5MiB 的图片', async () => {
    const uploadFile = vi.fn();
    Object.assign(wx, {
      chooseMedia: vi.fn().mockResolvedValue({
        tempFiles: [{ tempFilePath: '/private/tmp/too-large.jpg', size: 5 * 1024 * 1024 + 1 }],
      }),
      cloud: { uploadFile },
    });

    await page.chooseCustomAvatar();

    expect(rideService.getProfileMediaUploadPath).not.toHaveBeenCalled();
    expect(uploadFile).not.toHaveBeenCalled();
    expect(page.data.mediaError).toContain('[MEDIA_TOO_LARGE]');
  });

  it('所有头像入口共用单一 busy lock 防止重复动作', async () => {
    const uploadPath = deferred<string>();
    rideService.getProfileMediaUploadPath.mockReturnValueOnce(uploadPath.promise);
    const chooseMedia = vi.fn().mockResolvedValue({
      tempFiles: [{ tempFilePath: '/private/tmp/custom-avatar.jpg' }],
    });
    const uploadFile = vi
      .fn()
      .mockResolvedValue({ fileID: 'cloud://env/profiles/owner/custom.jpg' });
    Object.assign(wx, { chooseMedia, cloud: { uploadFile, deleteFile: vi.fn() } });

    const first = page.chooseCustomAvatar();
    await Promise.resolve();
    const second = page.chooseCustomAvatar();

    expect(page.data.avatarBusy).toBe(true);
    expect(chooseMedia).toHaveBeenCalledTimes(1);
    expect(rideService.importStravaAvatar).not.toHaveBeenCalled();
    uploadPath.resolve(
      'profiles/0123456789abcdef0123456789abcdef/123e4567-e89b-42d3-a456-426614174000.jpg',
    );
    await Promise.all([first, second]);
    expect(page.data.avatarBusy).toBe(false);
  });

  it('setAvatar 派发前失败时保留旧头像并复用删除与 orphan 补偿', async () => {
    const uploadedFileId = 'cloud://env/profiles/owner/failed.jpg';
    const deleteFile = vi.fn().mockResolvedValue({
      fileList: [{ fileID: uploadedFileId, status: -1 }],
    });
    Object.assign(wx, {
      chooseMedia: vi.fn().mockResolvedValue({
        tempFiles: [{ tempFilePath: '/private/tmp/failed.jpg' }],
      }),
      cloud: {
        uploadFile: vi.fn().mockResolvedValue({ fileID: uploadedFileId }),
        deleteFile,
      },
    });
    rideService.registerProfileMedia.mockRejectedValueOnce(new Error('register failed'));
    rideService.reportProfileMediaOrphan.mockRejectedValueOnce(new Error('report unavailable'));

    await page.chooseCustomAvatar();

    expect(page.data.p).toMatchObject({
      avatarId: 'cloud://env/profiles/owner/old.jpg',
      avatarSource: 'custom',
    });
    expect(page.data.avatarPreviewUrl).toBe('https://temporary.example/old-avatar.jpg');
    expect(rideService.setAvatar).not.toHaveBeenCalled();
    expect(deleteFile).toHaveBeenCalledWith({ fileList: [uploadedFileId] });
    expect(rideService.reportProfileMediaOrphan).toHaveBeenCalledWith(
      uploadedFileId,
      'other',
      'custom',
    );
    expect(wx.setStorageSync).toHaveBeenCalledWith('profile-media-orphans-v1', [
      { fileId: uploadedFileId, category: 'other', origin: 'custom' },
    ]);
  });

  it('setAvatar CALL_FAILED 后权威头像匹配则收敛成功且不清理对象', async () => {
    const uploadedFileId = 'cloud://env/profiles/owner/delivery-unknown.jpg';
    const deleteFile = vi.fn();
    Object.assign(wx, {
      chooseMedia: vi.fn().mockResolvedValue({
        tempFiles: [{ tempFilePath: '/private/tmp/delivery-unknown.jpg' }],
      }),
      cloud: {
        uploadFile: vi.fn().mockResolvedValue({ fileID: uploadedFileId }),
        deleteFile,
      },
    });
    page.data.p = { ...page.data.p, nickname: '本地草稿昵称', phone: '13900001111' };
    rideService.setAvatar.mockRejectedValueOnce(
      Object.assign(new Error('云函数调用失败'), { code: 'CALL_FAILED' }),
    );
    rideService.getProfile.mockResolvedValueOnce({
      ...profile,
      nickname: '服务端旧昵称',
      phone: '138****5678',
      avatarId: uploadedFileId,
      avatarSource: 'custom',
    });

    await page.chooseCustomAvatar();

    expect(deleteFile).not.toHaveBeenCalled();
    expect(rideService.reportProfileMediaOrphan).not.toHaveBeenCalled();
    expect(rideService.getProfile).toHaveBeenCalledOnce();
    expect(page.data.p).toMatchObject({
      nickname: '本地草稿昵称',
      phone: '13900001111',
      avatarId: uploadedFileId,
      avatarSource: 'custom',
    });
    expect(wx.showToast).toHaveBeenCalledWith({ title: '头像已更新' });
    expect(wx.showToast).not.toHaveBeenCalledWith({
      title: '头像更新结果未确认，请稍后重试',
      icon: 'none',
    });
  });

  it('setAvatar CALL_FAILED 后权威头像未生效才显示失败', async () => {
    const uploadedFileId = 'cloud://env/profiles/owner/not-applied.jpg';
    Object.assign(wx, {
      chooseMedia: vi.fn().mockResolvedValue({
        tempFiles: [{ tempFilePath: '/private/tmp/not-applied.jpg' }],
      }),
      cloud: {
        uploadFile: vi.fn().mockResolvedValue({ fileID: uploadedFileId }),
        deleteFile: vi.fn(),
      },
    });
    rideService.setAvatar.mockRejectedValueOnce(
      Object.assign(new Error('云函数调用失败'), { code: 'CALL_FAILED' }),
    );
    rideService.getProfile.mockResolvedValueOnce(profile);

    await page.chooseCustomAvatar();

    expect(wx.showToast).toHaveBeenCalledWith({
      title: '头像更新结果未确认，请稍后重试',
      icon: 'none',
    });
    expect(page.data.mediaError).toBe('[CALL_FAILED] 头像保存未确认，请稍后重试');
  });

  it('稳定错误码提供准确提示，未知错误回退为通用提示', async () => {
    await page.runAvatarAction(() =>
      Promise.reject(
        Object.assign(new Error('对象尚不可见'), { code: 'MEDIA_OBJECT_VERIFY_FAILED' }),
      ),
    );
    expect(wx.showToast).toHaveBeenLastCalledWith({
      title: '头像文件暂未同步到云端，请稍后重试',
      icon: 'none',
    });

    await page.runAvatarAction(() =>
      Promise.reject(Object.assign(new Error('未连接'), { code: 'STRAVA_NOT_CONNECTED' })),
    );
    expect(wx.showToast).toHaveBeenLastCalledWith({
      title: 'Strava 尚未连接或没有可用头像，请先同步 Strava',
      icon: 'none',
    });

    await page.runAvatarAction(() => Promise.reject(new Error('unexpected')));
    expect(wx.showToast).toHaveBeenLastCalledWith({
      title: '头像更新失败，请稍后重试',
      icon: 'none',
    });
  });

  it('Strava 未 ready 时不导入并提供绑定/同步跳转', async () => {
    page.data.stravaAvatarReady = false;

    await page.importStravaAvatar();
    page.goToStrava();

    expect(rideService.importStravaAvatar).not.toHaveBeenCalled();
    expect(wx.navigateTo).toHaveBeenCalledWith({ url: '/pages/strava/index' });
  });

  it('Strava ready 时调用无 URL 参数的专用仓储方法', async () => {
    page.data.stravaAvatarReady = true;
    page.data.p = { ...page.data.p, nickname: '尚未保存的昵称', emergencyName: '本地联系人' };
    rideService.getPersonalCapabilityCard.mockResolvedValueOnce(
      capabilityCard('https://temporary.example/strava-avatar.jpg'),
    );

    await page.importStravaAvatar();

    expect(rideService.importStravaAvatar).toHaveBeenCalledOnce();
    expect(rideService.importStravaAvatar.mock.calls[0]).toEqual([]);
    expect(page.data.p).toMatchObject({
      nickname: '尚未保存的昵称',
      emergencyName: '本地联系人',
      avatarSource: 'strava',
    });
    expect(page.data.avatarPreviewUrl).toBe('https://temporary.example/strava-avatar.jpg');
  });

  it('importStravaAvatar CALL_FAILED 后权威头像匹配则收敛成功并保留草稿', async () => {
    page.data.stravaAvatarReady = true;
    page.data.p = {
      ...page.data.p,
      nickname: '尚未保存的昵称',
      emergencyName: '本地联系人',
      avatarId: 'cloud://env/profiles/owner/previous-strava.jpg',
      avatarSource: 'strava',
      avatarRevision: 4,
    };
    rideService.importStravaAvatar.mockRejectedValueOnce(
      Object.assign(new Error('云函数调用失败'), { code: 'CALL_FAILED' }),
    );
    rideService.getProfile
      .mockResolvedValueOnce({ ...profile, avatarRevision: 4 })
      .mockResolvedValueOnce({
        ...profile,
        nickname: '服务端旧昵称',
        emergencyName: '服务端旧联系人',
        avatarId: 'cloud://env/profiles/owner/imported-strava.jpg',
        avatarSource: 'strava',
        avatarRevision: 5,
      });

    await page.importStravaAvatar();

    expect(rideService.getProfile).toHaveBeenCalledTimes(2);
    expect(page.data.p).toMatchObject({
      nickname: '尚未保存的昵称',
      emergencyName: '本地联系人',
      avatarId: 'cloud://env/profiles/owner/imported-strava.jpg',
      avatarSource: 'strava',
      avatarRevision: 5,
    });
    expect(wx.showToast).toHaveBeenCalledWith({ title: 'Strava 头像已导入' });
    expect(wx.showToast).not.toHaveBeenCalledWith({
      title: '头像更新结果未确认，请稍后重试',
      icon: 'none',
    });
  });

  it('importStravaAvatar CALL_FAILED 后权威头像未生效才显示失败', async () => {
    page.data.stravaAvatarReady = true;
    rideService.importStravaAvatar.mockRejectedValueOnce(
      Object.assign(new Error('云函数调用失败'), { code: 'CALL_FAILED' }),
    );
    rideService.getProfile.mockResolvedValueOnce(profile);

    await page.importStravaAvatar();

    expect(wx.showToast).toHaveBeenCalledWith({
      title: '头像更新结果未确认，请稍后重试',
      icon: 'none',
    });
    expect(page.data.mediaError).toBe('[CALL_FAILED] Strava 头像导入失败，请重新授权或稍后重试');
  });

  it('已有 Strava 头像 re-import 完全失败时相同 revision 不得误报成功', async () => {
    page.data.stravaAvatarReady = true;
    page.data.p = {
      ...page.data.p,
      avatarId: 'cloud://env/profiles/owner/existing-strava.jpg',
      avatarSource: 'strava',
      avatarRevision: 9,
    };
    rideService.importStravaAvatar.mockRejectedValueOnce(
      Object.assign(new Error('云函数调用失败'), { code: 'CALL_FAILED' }),
    );
    rideService.getProfile.mockResolvedValueOnce({ ...page.data.p });

    await page.importStravaAvatar();

    expect(wx.showToast).toHaveBeenCalledWith({
      title: '头像更新结果未确认，请稍后重试',
      icon: 'none',
    });
    expect(wx.showToast).not.toHaveBeenCalledWith({ title: 'Strava 头像已导入' });
  });

  it('Strava 导入以操作前权威 revision 为基线而不信任页面旧缓存', async () => {
    page.data.stravaAvatarReady = true;
    page.data.p = {
      ...page.data.p,
      avatarId: 'cloud://env/profiles/owner/stale-cache.jpg',
      avatarSource: 'strava',
      avatarRevision: 4,
    };
    const authoritative = {
      ...profile,
      avatarId: 'cloud://env/profiles/owner/other-device.jpg',
      avatarSource: 'strava' as const,
      avatarRevision: 10,
    };
    rideService.getProfile
      .mockResolvedValueOnce(authoritative)
      .mockResolvedValueOnce(authoritative);
    rideService.importStravaAvatar.mockRejectedValueOnce(
      Object.assign(new Error('云函数调用失败'), { code: 'CALL_FAILED' }),
    );

    await page.importStravaAvatar();

    expect(rideService.getProfile).toHaveBeenCalledTimes(2);
    expect(wx.showToast).toHaveBeenCalledWith({
      title: '头像更新结果未确认，请稍后重试',
      icon: 'none',
    });
    expect(wx.showToast).not.toHaveBeenCalledWith({ title: 'Strava 头像已导入' });
  });

  it('从 Strava 页面返回后的 onShow 会刷新 readiness 与预览', async () => {
    rideService.getStravaReadiness
      .mockResolvedValueOnce({ ...ready, state: 'disconnected', canRegister: false })
      .mockResolvedValueOnce(ready);

    await page.onShow();
    expect(page.data.stravaAvatarReady).toBe(false);

    await page.onShow();
    expect(page.data.stravaAvatarReady).toBe(true);
    expect(rideService.getStravaReadiness).toHaveBeenCalledTimes(2);
    expect(rideService.getPersonalCapabilityCard).toHaveBeenCalledTimes(2);
  });

  it('readiness 响应异常时显式报错并 fail closed', async () => {
    rideService.getStravaReadiness.mockRejectedValueOnce(new Error('Strava 响应格式错误'));

    await page.loadStravaAvatarReadiness();

    expect(page.data).toMatchObject({
      stravaAvatarReady: false,
      stravaAvatarHint: 'Strava 状态暂时无法确认',
      stravaAvatarError: 'Strava 响应格式错误',
    });
  });

  it('Strava 数据 ready 但没有头像时禁用导入并引导重新授权或同步', async () => {
    rideService.getStravaReadiness.mockResolvedValueOnce({ ...ready, avatarAvailable: false });

    await page.loadStravaAvatarReadiness();

    expect(page.data).toMatchObject({
      stravaAvatarReady: false,
      stravaAvatarHint: 'Strava 未提供头像，请重新授权或同步',
      stravaAvatarError: '',
    });
  });

  it('readiness 刷新开始即禁用旧的可导入状态', async () => {
    const pending = deferred<typeof ready>();
    rideService.getStravaReadiness.mockReturnValueOnce(pending.promise);
    page.data.stravaAvatarReady = true;

    const loading = page.loadStravaAvatarReadiness();

    expect(page.data).toMatchObject({
      stravaAvatarReady: false,
      stravaAvatarHint: '正在检查 Strava 状态',
    });
    pending.resolve(ready);
    await loading;
  });

  it('较早 readiness 成功不得覆盖较新失败并重新启用导入', async () => {
    const older = deferred<typeof ready>();
    const newer = deferred<typeof ready>();
    rideService.getStravaReadiness
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(newer.promise);

    const olderLoad = page.loadStravaAvatarReadiness();
    const newerLoad = page.loadStravaAvatarReadiness();
    newer.reject(new Error('较新的 readiness 失败'));
    await newerLoad;
    older.resolve(ready);
    await olderLoad;

    expect(page.data).toMatchObject({
      stravaAvatarReady: false,
      stravaAvatarHint: 'Strava 状态暂时无法确认',
      stravaAvatarError: '较新的 readiness 失败',
    });
  });

  it.each(['onHide', 'onUnload'])('%s 会让未完成的 readiness 响应失效', async (hook) => {
    const pending = deferred<typeof ready>();
    rideService.getStravaReadiness.mockReturnValueOnce(pending.promise);
    page.data.stravaAvatarReady = false;
    page.data.stravaAvatarHint = '离开前状态';
    page.data.stravaAvatarError = '离开前错误';

    const loading = page.loadStravaAvatarReadiness();
    page[hook]();
    pending.resolve(ready);
    await loading;

    expect(page.data).toMatchObject({
      stravaAvatarReady: false,
      stravaAvatarHint: '正在检查 Strava 状态',
      stravaAvatarError: '',
    });
  });

  it('较早头像预览不得覆盖较新的预览结果', async () => {
    const older = deferred<ReturnType<typeof capabilityCard>>();
    const newer = deferred<ReturnType<typeof capabilityCard>>();
    rideService.getPersonalCapabilityCard
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(newer.promise);

    const olderLoad = page.loadAvatarPreview();
    const newerLoad = page.loadAvatarPreview();
    newer.resolve(capabilityCard('https://temporary.example/newer.jpg'));
    await newerLoad;
    older.resolve(capabilityCard('https://temporary.example/older.jpg'));
    await olderLoad;

    expect(page.data.avatarPreviewUrl).toBe('https://temporary.example/newer.jpg');
  });

  it('头像预览失败显示 preview 阶段码但不阻塞资料', async () => {
    rideService.getPersonalCapabilityCard.mockRejectedValueOnce(new Error('private preview url'));

    await page.loadAvatarPreview();

    expect(page.data.p).not.toBeNull();
    expect(page.data.mediaError).toBe('[AVATAR_PREVIEW_FAILED] 头像预览暂不可用，请稍后重试');
    expect(page.data.mediaError).not.toContain('private preview url');
  });

  it.each(['onHide', 'onUnload'])('%s 会让未完成的头像预览响应失效', async (hook) => {
    const pending = deferred<ReturnType<typeof capabilityCard>>();
    rideService.getPersonalCapabilityCard.mockReturnValueOnce(pending.promise);
    page.data.avatarPreviewUrl = 'https://temporary.example/current.jpg';

    const loading = page.loadAvatarPreview();
    page[hook]();
    pending.resolve(capabilityCard('https://temporary.example/late.jpg'));
    await loading;

    expect(page.data.avatarPreviewUrl).toBe('https://temporary.example/current.jpg');
  });

  it('旧头像的迟到加载失败不会清空已成功更新的新预览', () => {
    page.data.avatarPreviewUrl = 'https://temporary.example/newer.jpg';

    page.avatarPreviewError({
      currentTarget: { dataset: { url: 'https://temporary.example/older.jpg' } },
    });

    expect(page.data.avatarPreviewUrl).toBe('https://temporary.example/newer.jpg');
  });

  it('权威头像回读不等待可选预览请求即可完成交付判定', async () => {
    const preview = deferred<ReturnType<typeof capabilityCard>>();
    rideService.getPersonalCapabilityCard.mockReturnValueOnce(preview.promise);
    rideService.getProfile.mockResolvedValueOnce({
      ...profile,
      avatarId: 'cloud://env/profiles/owner/confirmed.jpg',
      avatarSource: 'custom',
      avatarRevision: 5,
    });
    let settled: boolean | undefined;

    const reload = page
      .reloadAvatarProfile({
        source: 'custom',
        fileId: 'cloud://env/profiles/owner/confirmed.jpg',
      })
      .then((value: boolean) => {
        settled = value;
      });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(settled).toBe(true);
    preview.resolve(capabilityCard('https://temporary.example/confirmed.jpg'));
    await reload;
  });

  it('用户取消 chooseMedia 时静默结束且释放 busy lock', async () => {
    Object.assign(wx, {
      chooseMedia: vi.fn().mockRejectedValue({ errMsg: 'chooseMedia:fail cancel' }),
    });

    await page.chooseCustomAvatar();

    expect(wx.showToast).not.toHaveBeenCalled();
    expect(rideService.getProfileMediaUploadPath).not.toHaveBeenCalled();
    expect(page.data.avatarBusy).toBe(false);
  });

  it('照片上传与资料保存双向互斥', async () => {
    const chooseMedia = vi.fn();
    Object.assign(wx, { chooseMedia });
    page.data.photoBusy = true;

    await page.save();

    expect(rideService.updateProfile).not.toHaveBeenCalled();

    page.data.photoBusy = false;
    page.data.saving = true;
    await page.addPhoto();

    expect(chooseMedia).not.toHaveBeenCalled();
  });

  it('头像与照片失败显示无敏感信息的阶段码和下一步', async () => {
    Object.assign(wx, {
      chooseMedia: vi.fn().mockResolvedValue({
        tempFiles: [{ tempFilePath: '/private/tmp/photo.jpg', size: 1024 }],
      }),
      cloud: { uploadFile: vi.fn() },
    });
    rideService.getProfileMediaUploadPath.mockRejectedValueOnce(new Error('private path detail'));

    await page.addPhoto();

    expect(page.data.mediaError).toBe(
      '[MEDIA_UPLOAD_PATH_FAILED] 无法准备安全上传，请检查网络后重试',
    );
    expect(page.data.mediaError).not.toContain('private path detail');
  });

  it('用户取消个人相册 chooseMedia 时也静默结束', async () => {
    Object.assign(wx, {
      chooseMedia: vi.fn().mockRejectedValue({ errMsg: 'chooseMedia:fail cancel' }),
      cloud: { uploadFile: vi.fn() },
    });

    await page.addPhoto();

    expect(wx.showToast).not.toHaveBeenCalled();
    expect(rideService.getProfileMediaUploadPath).not.toHaveBeenCalled();
  });

  it('添加照片在途时再次触发被 busy lock 拦截，不重复 chooseMedia', async () => {
    let releaseChoose: (value: unknown) => void = () => {};
    const chooseGate = new Promise((resolve) => {
      releaseChoose = resolve;
    });
    const chooseMedia = vi.fn().mockReturnValueOnce(chooseGate);
    Object.assign(wx, { chooseMedia, cloud: { uploadFile: vi.fn() } });

    const first = page.addPhoto();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(page.data.photoBusy).toBe(true);

    await page.addPhoto();
    expect(chooseMedia).toHaveBeenCalledTimes(1);

    // 返回空选择，命中 !path 提前返回，干净释放锁。
    releaseChoose({ tempFiles: [] });
    await first;
    expect(page.data.photoBusy).toBe(false);
  });

  it('选择个人相册照片后仍先请求 owner-bound path 再上传并写入 photos', async () => {
    const uploadFile = vi
      .fn()
      .mockResolvedValue({ fileID: 'cloud://env/profiles/owner/photo.jpg' });
    Object.assign(wx, {
      chooseMedia: vi.fn().mockResolvedValue({
        tempFiles: [{ tempFilePath: '/private/tmp/photo.jpg' }],
      }),
      cloud: { uploadFile },
    });

    await page.addPhoto();

    expect(rideService.registerProfileMedia).toHaveBeenCalledWith(
      'cloud://env/profiles/owner/photo.jpg',
      'other',
    );
    expect(page.data.p.photos).toEqual([
      { id: 'cloud://env/profiles/owner/photo.jpg', category: 'other' },
    ]);
  });

  it('个人相册 chooseMedia 不可用时降级 chooseImage 上传照片', async () => {
    const uploadedFileId = 'cloud://env/profiles/owner/photo-fallback.jpg';
    const uploadFile = vi.fn().mockResolvedValue({ fileID: uploadedFileId });
    Object.assign(wx, {
      chooseMedia: vi.fn().mockRejectedValue({ errMsg: 'chooseMedia:fail api not supported' }),
      chooseImage: vi
        .fn()
        .mockResolvedValue({ tempFilePaths: ['/private/tmp/photo-fallback.jpg'] }),
      cloud: { uploadFile, deleteFile: vi.fn() },
    });

    await page.addPhoto();

    expect(uploadFile).toHaveBeenCalledWith(
      expect.objectContaining({ filePath: '/private/tmp/photo-fallback.jpg' }),
    );
    expect(page.data.p.photos).toEqual([{ id: uploadedFileId, category: 'other' }]);
  });

  it('个人相册 owner-bound path 请求失败时不上传也不写 photos', async () => {
    const uploadFile = vi.fn();
    rideService.getProfileMediaUploadPath.mockRejectedValueOnce(new Error('path unavailable'));
    Object.assign(wx, {
      chooseMedia: vi.fn().mockResolvedValue({
        tempFiles: [{ tempFilePath: '/private/tmp/photo.jpg' }],
      }),
      cloud: { uploadFile },
    });

    await page.addPhoto();

    expect(uploadFile).not.toHaveBeenCalled();
    expect(page.data.p.photos).toEqual([]);
    expect(wx.showToast).toHaveBeenCalledWith({
      title: '照片上传未完成，请稍后重试',
      icon: 'none',
    });
    expect(page.data.mediaError).toBe(
      '[MEDIA_UPLOAD_PATH_FAILED] 无法准备安全上传，请检查网络后重试',
    );
  });

  it('个人相册上传失败显示 upload 阶段码且不登记媒体', async () => {
    Object.assign(wx, {
      chooseMedia: vi.fn().mockResolvedValue({
        tempFiles: [{ tempFilePath: '/private/tmp/photo.jpg', size: 1024 }],
      }),
      cloud: { uploadFile: vi.fn().mockRejectedValue(new Error('private upload detail')) },
    });

    await page.addPhoto();

    expect(rideService.registerProfileMedia).not.toHaveBeenCalled();
    expect(page.data.mediaError).toBe('[MEDIA_UPLOAD_FAILED] 图片上传失败，请重新选择图片后重试');
    expect(page.data.mediaError).not.toContain('private upload detail');
  });

  it('个人相册 registerMedia 失败时保留 photos 并执行删除与 orphan 补偿', async () => {
    const uploadedFileId = 'cloud://env/profiles/owner/photo.jpg';
    const deleteFile = vi.fn().mockResolvedValue({
      fileList: [{ fileID: uploadedFileId, status: -1, errMsg: 'delete failed' }],
    });
    Object.assign(wx, {
      chooseMedia: vi.fn().mockResolvedValue({
        tempFiles: [{ tempFilePath: '/private/tmp/photo.jpg' }],
      }),
      cloud: {
        uploadFile: vi.fn().mockResolvedValue({ fileID: uploadedFileId }),
        deleteFile,
      },
    });
    rideService.registerProfileMedia.mockRejectedValueOnce(new Error('register failed'));
    rideService.reportProfileMediaOrphan.mockRejectedValueOnce(new Error('report unavailable'));

    await page.addPhoto();

    expect(deleteFile).toHaveBeenCalledWith({ fileList: [uploadedFileId] });
    expect(rideService.reportProfileMediaOrphan).toHaveBeenCalledWith(uploadedFileId, 'other');
    expect(wx.setStorageSync).toHaveBeenCalledWith('profile-media-orphans-v1', [
      { fileId: uploadedFileId, category: 'other' },
    ]);
    expect(page.data.p.photos).toEqual([]);
    expect(page.data.mediaError).toBe(
      '[MEDIA_REGISTER_FAILED] 云端图片校验失败，请重新选择图片后重试',
    );
  });

  it('再次进入资料页会重试 durable orphan ledger 并在成功后清除', async () => {
    vi.mocked(wx.getStorageSync).mockReturnValue([
      {
        fileId: 'cloud://env/profiles/owner/orphan.jpg',
        category: 'other',
        origin: 'wechat',
      },
    ]);

    await page.onLoad();

    expect(rideService.reportProfileMediaOrphan).toHaveBeenCalledWith(
      'cloud://env/profiles/owner/orphan.jpg',
      'other',
      'wechat',
    );
    expect(wx.removeStorageSync).toHaveBeenCalledWith('profile-media-orphans-v1');
  });
});

describe('资料编辑头像页面契约', () => {
  const template = readFileSync('miniprogram/pages/profile-edit/index.wxml', 'utf8');
  const styles = readFileSync('miniprogram/pages/profile-edit/index.wxss', 'utf8');

  it('删除头像来源 radio，提供微信、自定义与 Strava 三个真实动作', () => {
    expect(template).not.toMatch(/radio-group|avatarSources/);
    expect(template).toContain('open-type="chooseAvatar"');
    expect(template).toContain('bindchooseavatar="chooseWechatAvatar"');
    expect(template).toContain('bindtap="chooseCustomAvatar"');
    expect(template).toContain('bindtap="importStravaAvatar"');
    expect(template).toContain(
      'disabled="{{avatarBusy || photoBusy || saving || !stravaAvatarReady}}"',
    );
    expect(template).toContain('先绑定/同步 Strava');
    expect(template).toContain('bindtap="goToStrava"');
    expect(template).toContain('stravaAvatarError');
    expect(template).toContain('mediaError');
    expect(template).toContain('disabled="{{photoBusy || saving || avatarBusy}}"');
    expect(template).toContain('disabled="{{saving || photoBusy || avatarBusy}}"');
  });

  it('头像预览仅绑定净化后的 preview URL 并提供无障碍名称', () => {
    const preview = template.match(/<image\b[^>]*class="avatar-preview"[^>]*\/>/)?.[0] || '';
    expect(preview).toContain('src="{{avatarPreviewUrl}}"');
    expect(preview).toContain('data-url="{{avatarPreviewUrl}}"');
    expect(preview).toContain('aria-label=');
    expect(template).not.toContain('src="{{p.avatarId}}"');
  });

  it('三个头像动作均有 aria-label 且触控高度至少 88rpx', () => {
    const avatarButtons = template.match(/<button\b[^>]*class="avatar-action[^>]*>/g) || [];
    expect(avatarButtons).toHaveLength(3);
    expect(avatarButtons.every((button: string) => button.includes('aria-label='))).toBe(true);
    expect(styles).toMatch(/\.avatar-action\s*\{[^}]*min-height:\s*88rpx/s);
  });
});
