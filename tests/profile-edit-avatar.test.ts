// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Profile } from '../miniprogram/models';

const rideService = vi.hoisted(() => ({
  getProfile: vi.fn(),
  getProfileMediaUploadPath: vi.fn(),
  getPersonalCapabilityCard: vi.fn(),
  registerProfileMedia: vi.fn(),
  reportProfileMediaOrphan: vi.fn(),
  setAvatar: vi.fn(),
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

const blankProfile: Profile = {
  nickname: '',
  title: '',
  avatarRevision: 0,
  realName: '',
  phone: '',
  gender: '',
  emergencyName: '',
  emergencyPhone: '',
  photos: [],
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
    rideService.updateProfile.mockResolvedValue(profile);
    vi.stubGlobal('wx', {
      env: { USER_DATA_PATH: 'wxfile://usr' },
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
        canEditDetails: true,
        avatarPreviewUrl: 'https://temporary.example/old-avatar.jpg',
      };
      page.setData = vi.fn((patch: Record<string, unknown>) => {
        for (const [key, value] of Object.entries(patch)) {
          const [root, child] = key.split('.');
          if (child) page.data[root][child] = value;
          else page.data[root] = value;
        }
      });
    });
    await import('../miniprogram/pages/profile-edit/index');
  });

  afterEach(() => vi.unstubAllGlobals());

  it('首次资料加载完成后立即补载已有头像预览', async () => {
    page.data.p = null;
    page.data.avatarPreviewUrl = '';

    await page.onLoad();
    await vi.waitFor(() =>
      expect(page.data.avatarPreviewUrl).toBe(capabilityCard().profile.avatarUrl),
    );

    expect(rideService.getPersonalCapabilityCard).toHaveBeenCalled();
  });

  it('通用保存不提交昵称、头像字段，并保留敏感字段掩码语义', async () => {
    await page.save();

    const patch = rideService.updateProfile.mock.calls[0][0];
    expect(patch).not.toHaveProperty('nickname');
    expect(patch).not.toHaveProperty('avatarFileId');
    expect(patch).not.toHaveProperty('avatarSource');
    expect(patch).toMatchObject({
      realName: undefined,
      phone: undefined,
      emergencyPhone: undefined,
    });
  });

  it('不再暴露头像可见性开关处理器', () => {
    expect(page.onAvatarVisibilityChange).toBeUndefined();
  });

  it('空白新用户未选择头像时资料保存被头像先行门禁拦截', async () => {
    rideService.getProfile.mockResolvedValueOnce(blankProfile);
    await page.onLoad();

    expect(page.data.canEditDetails).toBe(false);
    await page.save();

    expect(rideService.updateProfile).not.toHaveBeenCalled();
  });

  it.each([
    ['实名', { realName: '存量用户' }],
    ['手机号', { phone: '138****5678' }],
    ['性别', { gender: '男' }],
    ['联系人', { emergencyName: '紧急联系人' }],
    ['紧急电话', { emergencyPhone: '139****0000' }],
    ['相册', { photos: [{ id: 'cloud://env/existing.jpg', category: 'ride' }] }],
  ])('没有 avatarId 但已有%s资料的存量用户仍可编辑和保存', async (_label, fields) => {
    const storedProfile = { ...blankProfile, ...fields } as Profile;
    rideService.getProfile.mockResolvedValueOnce(storedProfile);
    await page.onLoad();

    expect(page.data.canEditDetails).toBe(true);
    await page.save();

    expect(rideService.updateProfile).toHaveBeenCalledOnce();
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

  it('微信头像在上传前通过 getFileInfo 拒绝超过 5MiB 的文件', async () => {
    const uploadFile = vi.fn();
    Object.assign(wx, {
      getFileInfo: vi.fn().mockResolvedValue({ size: 5 * 1024 * 1024 + 1 }),
      cloud: { uploadFile },
    });

    await page.chooseWechatAvatar({ detail: { avatarUrl: '/private/tmp/too-large.jpg' } });

    expect(rideService.getProfileMediaUploadPath).not.toHaveBeenCalled();
    expect(uploadFile).not.toHaveBeenCalled();
    expect(page.data.mediaError).toContain('[MEDIA_TOO_LARGE]');
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

  it('自定义头像调用 cropImage 让用户手动裁剪 1:1 并上传裁剪结果', async () => {
    const uploadFile = vi.fn().mockResolvedValue({
      fileID: 'cloud://env/profiles/owner/cropped.jpg',
    });
    const cropImage = vi.fn((options) =>
      options.success({ tempFilePath: '/private/tmp/cropped.jpg' }),
    );
    Object.assign(wx, {
      chooseMedia: vi.fn().mockResolvedValue({
        tempFiles: [{ tempFilePath: '/private/tmp/original.jpg', size: 1024 }],
      }),
      cropImage,
      cloud: { uploadFile, deleteFile: vi.fn() },
    });

    await page.chooseCustomAvatar();

    expect(cropImage).toHaveBeenCalledWith(
      expect.objectContaining({
        src: '/private/tmp/original.jpg',
        cropScale: '1:1',
        success: expect.any(Function),
        fail: expect.any(Function),
      }),
    );
    expect(uploadFile).toHaveBeenCalledWith(
      expect.objectContaining({ filePath: '/private/tmp/cropped.jpg' }),
    );
  });

  it.each([
    ['cropImage 缺失', false],
    ['cropImage 报 API 不支持', true],
  ])('%s 时安全回退上传原图', async (_label, hasCropApi) => {
    const uploadFile = vi.fn().mockResolvedValue({
      fileID: 'cloud://env/profiles/owner/original.jpg',
    });
    const cropImage = hasCropApi
      ? vi.fn((options) => options.fail({ errMsg: 'cropImage:fail api not supported' }))
      : undefined;
    Object.assign(wx, {
      chooseMedia: vi.fn().mockResolvedValue({
        tempFiles: [{ tempFilePath: '/private/tmp/original.jpg', size: 1024 }],
      }),
      cropImage,
      cloud: { uploadFile, deleteFile: vi.fn() },
    });

    await page.chooseCustomAvatar();

    if (cropImage) {
      expect(cropImage).toHaveBeenCalledWith(
        expect.objectContaining({ success: expect.any(Function), fail: expect.any(Function) }),
      );
    }
    expect(uploadFile).toHaveBeenCalledWith(
      expect.objectContaining({ filePath: '/private/tmp/original.jpg' }),
    );
  });

  it('用户取消裁剪时静默结束且释放 busy lock', async () => {
    Object.assign(wx, {
      chooseMedia: vi.fn().mockResolvedValue({
        tempFiles: [{ tempFilePath: '/private/tmp/original.jpg' }],
      }),
      cropImage: vi.fn((options) => options.fail({ errMsg: 'cropImage:fail cancel' })),
      cloud: { uploadFile: vi.fn(), deleteFile: vi.fn() },
    });

    await page.chooseCustomAvatar();

    expect(wx.cloud?.uploadFile).not.toHaveBeenCalled();
    expect(wx.showToast).not.toHaveBeenCalled();
    expect(page.data.avatarBusy).toBe(false);
  });

  it('裁剪的其他失败进入 crop 阶段安全错误链且不上传', async () => {
    const uploadFile = vi.fn();
    Object.assign(wx, {
      chooseMedia: vi.fn().mockResolvedValue({
        tempFiles: [{ tempFilePath: '/private/tmp/original.jpg' }],
      }),
      cropImage: vi.fn((options) => options.fail({ errMsg: 'cropImage:fail permission denied' })),
      cloud: { uploadFile, deleteFile: vi.fn() },
    });

    await page.chooseCustomAvatar();

    expect(uploadFile).not.toHaveBeenCalled();
    expect(page.data.mediaError).toBe('[MEDIA_CROP_FAILED] 图片裁剪失败，请重新选择图片后重试');
    expect(wx.showToast).toHaveBeenCalledWith({ title: page.data.mediaError, icon: 'none' });
  });

  it.each([
    [0, '/assets/profile/avatars/cili-black.png', 'wxfile://usr/cili-default-0.png'],
    [1, '/assets/profile/avatars/cili-orange.png', 'wxfile://usr/cili-default-1.png'],
    [2, '/assets/profile/avatars/cili-ivory.png', 'wxfile://usr/cili-default-2.png'],
  ])('第 %i 个默认头像转为本地文件并复用 custom 上传链路', async (index, asset, local) => {
    const uploadFile = vi.fn().mockResolvedValue({
      fileID: `cloud://env/profiles/owner/default-${index}.png`,
    });
    const readFile = vi.fn((options) => options.success({ data: new ArrayBuffer(8) }));
    const writeFile = vi.fn((options) => options.success({}));
    Object.assign(wx, {
      getFileSystemManager: () => ({ readFile, writeFile }),
      cloud: { uploadFile, deleteFile: vi.fn() },
    });

    await page.chooseDefaultAvatar({ currentTarget: { dataset: { index } } });

    expect(readFile).toHaveBeenCalledWith(expect.objectContaining({ filePath: asset }));
    expect(writeFile).toHaveBeenCalledWith(expect.objectContaining({ filePath: local }));
    expect(uploadFile).toHaveBeenCalledWith(expect.objectContaining({ filePath: local }));
    expect(rideService.registerProfileMedia).toHaveBeenCalledWith(
      `cloud://env/profiles/owner/default-${index}.png`,
      'other',
      'custom',
    );
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
    expect(page.data.mediaError).toBe('[MEDIA_TOO_LARGE] 图片超过 5MB，请压缩或更换图片后重试');
    expect(wx.showToast).toHaveBeenLastCalledWith({
      title: page.data.mediaError,
      icon: 'none',
    });
  });

  it('阶段化头像错误的 inline alert 与 toast 使用同一安全文案', async () => {
    await page.runAvatarAction(() =>
      Promise.reject(
        Object.assign(new Error('private upload detail'), {
          code: 'MEDIA_UPLOAD_FAILED',
          mediaStage: 'upload',
        }),
      ),
    );

    expect(page.data.mediaError).toBe('[MEDIA_UPLOAD_FAILED] 图片上传失败，请重新选择图片后重试');
    expect(wx.showToast).toHaveBeenLastCalledWith({
      title: page.data.mediaError,
      icon: 'none',
    });
  });

  it('所有头像入口共用单一 busy lock 防止重复动作', async () => {
    const uploadPath = deferred<string>();
    rideService.getProfileMediaUploadPath.mockReturnValueOnce(uploadPath.promise);
    const chooseMedia = vi.fn().mockResolvedValue({
      tempFiles: [{ tempFilePath: '/private/tmp/custom-avatar.jpg' }],
    });
    const getFileSystemManager = vi.fn();
    const uploadFile = vi
      .fn()
      .mockResolvedValue({ fileID: 'cloud://env/profiles/owner/custom.jpg' });
    Object.assign(wx, {
      chooseMedia,
      getFileSystemManager,
      cloud: { uploadFile, deleteFile: vi.fn() },
    });

    const first = page.chooseCustomAvatar();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const second = page.chooseCustomAvatar();
    const wechat = page.chooseWechatAvatar({ detail: { avatarUrl: '/private/tmp/wechat.jpg' } });
    const preset = page.chooseDefaultAvatar({ currentTarget: { dataset: { index: 0 } } });

    expect(page.data.avatarBusy).toBe(true);
    expect(chooseMedia).toHaveBeenCalledTimes(1);
    expect(getFileSystemManager).not.toHaveBeenCalled();
    expect(rideService.getProfileMediaUploadPath).toHaveBeenCalledTimes(1);
    uploadPath.resolve(
      'profiles/0123456789abcdef0123456789abcdef/123e4567-e89b-42d3-a456-426614174000.jpg',
    );
    await Promise.all([first, second, wechat, preset]);
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

    expect(page.data.mediaError).toBe('[AVATAR_SET_FAILED] 头像保存未确认，请稍后重试');
    expect(wx.showToast).toHaveBeenCalledWith({ title: page.data.mediaError, icon: 'none' });
  });

  it('稳定错误码提供准确提示，未知错误回退为通用提示', async () => {
    await page.runAvatarAction(() =>
      Promise.reject(
        Object.assign(new Error('对象尚不可见'), { code: 'MEDIA_OBJECT_VERIFY_FAILED' }),
      ),
    );
    expect(page.data.mediaError).toBe('[MEDIA_OBJECT_VERIFY_FAILED] 图片暂未准备好，请稍后重试');
    expect(wx.showToast).toHaveBeenLastCalledWith({ title: page.data.mediaError, icon: 'none' });

    await page.runAvatarAction(() => Promise.reject(new Error('unexpected')));
    expect(page.data.mediaError).toBe('[MEDIA_OPERATION_FAILED] 媒体操作失败，请稍后重试');
    expect(wx.showToast).toHaveBeenLastCalledWith({ title: page.data.mediaError, icon: 'none' });
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
    expect(page.data.avatarPreviewUrl).toBe('https://temporary.example/old-avatar.jpg');
    expect(page.data.mediaError).toBe('[AVATAR_PREVIEW_FAILED] 头像预览暂不可用，请稍后重试');
    expect(page.data.mediaError).not.toContain('private preview url');
  });

  it('新预览成功会清除旧 preview error', async () => {
    page.data.mediaError = '[AVATAR_PREVIEW_FAILED] 头像预览暂不可用，请稍后重试';
    page.mediaErrorStage = 'preview';
    rideService.getPersonalCapabilityCard.mockResolvedValueOnce(
      capabilityCard('https://temporary.example/recovered.jpg'),
    );

    await page.loadAvatarPreview();

    expect(page.data.avatarPreviewUrl).toBe('https://temporary.example/recovered.jpg');
    expect(page.data.mediaError).toBe('');
  });

  it('预览成功不得覆盖预览请求开始后产生的上传错误', async () => {
    const pending = deferred<ReturnType<typeof capabilityCard>>();
    rideService.getPersonalCapabilityCard.mockReturnValueOnce(pending.promise);
    const preview = page.loadAvatarPreview();

    await page.runAvatarAction(() =>
      Promise.reject(
        Object.assign(new Error('later upload failure'), {
          code: 'MEDIA_UPLOAD_FAILED',
          mediaStage: 'upload',
        }),
      ),
    );
    const laterError = page.data.mediaError;
    pending.resolve(capabilityCard('https://temporary.example/recovered.jpg'));
    await preview;

    expect(page.data.avatarPreviewUrl).toBe('https://temporary.example/recovered.jpg');
    expect(page.data.mediaError).toBe(laterError);
  });

  it('较早预览失败不得覆盖预览请求开始后产生的上传错误', async () => {
    const pending = deferred<ReturnType<typeof capabilityCard>>();
    rideService.getPersonalCapabilityCard.mockReturnValueOnce(pending.promise);
    const preview = page.loadAvatarPreview();

    await page.runAvatarAction(() =>
      Promise.reject(
        Object.assign(new Error('later register failure'), {
          code: 'MEDIA_REGISTER_FAILED',
          mediaStage: 'register',
        }),
      ),
    );
    const laterError = page.data.mediaError;
    pending.reject(new Error('older preview failure'));
    await preview;

    expect(page.data.mediaError).toBe(laterError);
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

    expect(page.data.mediaError).toBe('[MEDIA_UPLOAD_PATH_FAILED] 图片准备失败，请检查网络后重试');
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
    expect(page.data.mediaError).toBe('[MEDIA_UPLOAD_PATH_FAILED] 图片准备失败，请检查网络后重试');
    expect(wx.showToast).toHaveBeenCalledWith({ title: page.data.mediaError, icon: 'none' });
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

  it.each([
    ['微信头像', () => page.chooseWechatAvatar({ detail: { avatarUrl: '/tmp/avatar.jpg' } })],
    ['个人相册', () => page.addPhoto()],
  ])('wx.cloud 不可用时%s的 inline 与 toast 使用同一稳定错误', async (_label, action) => {
    Object.assign(wx, {
      cloud: undefined,
      chooseMedia: vi.fn().mockResolvedValue({
        tempFiles: [{ tempFilePath: '/private/tmp/photo.jpg', size: 1024 }],
      }),
    });

    await action();

    expect(page.data.mediaError).toBe(
      '[MEDIA_CLOUD_UNAVAILABLE] 当前环境暂不支持图片上传，请更新微信后重试',
    );
    expect(wx.showToast).toHaveBeenCalledWith({ title: page.data.mediaError, icon: 'none' });
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
    expect(page.data.mediaError).toBe('[MEDIA_REGISTER_FAILED] 图片校验失败，请重新选择图片后重试');
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

  it('性别只接受男/女单选事件并写入当前资料', () => {
    page.selectGender({ detail: { value: '男' } });
    expect(page.data.p.gender).toBe('男');

    page.selectGender({ detail: { value: '女' } });
    expect(page.data.p.gender).toBe('女');
  });

  it('已有相册文件解析为缩略图 URL，并可点击预览全部可用图片', async () => {
    const getTempFileURL = vi.fn().mockResolvedValue({
      fileList: [
        {
          fileID: 'cloud://env/profiles/owner/photo-a.jpg',
          tempFileURL: 'https://temporary.example/photo-a.jpg',
        },
      ],
    });
    const previewImage = vi.fn();
    Object.assign(wx, { cloud: { getTempFileURL }, previewImage });
    page.data.p.photos = [
      { id: 'cloud://env/profiles/owner/photo-a.jpg', category: 'ride' },
      { id: 'https://images.example/photo-b.jpg', category: 'other' },
    ];

    await page.loadPhotoPreviews();
    page.previewPhoto({
      currentTarget: { dataset: { url: 'https://temporary.example/photo-a.jpg' } },
    });

    expect(getTempFileURL).toHaveBeenCalledWith({
      fileList: ['cloud://env/profiles/owner/photo-a.jpg'],
    });
    expect(page.data.photoItems.map((item: any) => item.previewUrl)).toEqual([
      'https://temporary.example/photo-a.jpg',
      'https://images.example/photo-b.jpg',
    ]);
    expect(previewImage).toHaveBeenCalledWith({
      current: 'https://temporary.example/photo-a.jpg',
      urls: ['https://temporary.example/photo-a.jpg', 'https://images.example/photo-b.jpg'],
    });
  });

  it('新增照片立即使用本地路径预览，且上下移顺序写回 p.photos 并随保存提交', async () => {
    const uploadedFileId = 'cloud://env/profiles/owner/new-photo.jpg';
    Object.assign(wx, {
      chooseMedia: vi.fn().mockResolvedValue({
        tempFiles: [{ tempFilePath: '/private/tmp/new-photo.jpg', size: 1024 }],
      }),
      cloud: {
        uploadFile: vi.fn().mockResolvedValue({ fileID: uploadedFileId }),
        deleteFile: vi.fn(),
      },
    });
    page.data.p.photos = [{ id: 'https://images.example/existing.jpg', category: 'ride' }];

    await page.addPhoto();

    expect(page.data.photoItems[1]).toMatchObject({
      id: uploadedFileId,
      previewUrl: '/private/tmp/new-photo.jpg',
    });

    page.movePhoto({ currentTarget: { dataset: { index: 1, direction: -1 } } });
    expect(page.data.p.photos.map((item: any) => item.id)).toEqual([
      uploadedFileId,
      'https://images.example/existing.jpg',
    ]);

    page.movePhoto({ currentTarget: { dataset: { index: 0, direction: 1 } } });
    expect(page.data.p.photos.map((item: any) => item.id)).toEqual([
      'https://images.example/existing.jpg',
      uploadedFileId,
    ]);

    const expectedPhotos = [
      { id: 'https://images.example/existing.jpg', category: 'ride' },
      { id: uploadedFileId, category: 'other' },
    ];
    rideService.updateProfile.mockImplementationOnce(async (patch) => ({
      ...profile,
      ...patch,
    }));

    await page.save();
    expect(rideService.updateProfile.mock.calls[0][0].photos).toEqual(expectedPhotos);
    expect(page.data.photoItems[1].previewUrl).toBe('/private/tmp/new-photo.jpg');
  });
});

describe('资料编辑头像页面契约', () => {
  const template = readFileSync('miniprogram/pages/profile-edit/index.wxml', 'utf8');
  const source = readFileSync('miniprogram/pages/profile-edit/index.ts', 'utf8');
  const styles = readFileSync('miniprogram/pages/profile-edit/index.wxss', 'utf8');

  it('头像作为第一步门禁，并保留微信与自定义图片入口', () => {
    expect(template.indexOf('先选择头像')).toBeLessThan(template.indexOf('实名资料'));
    expect(template).toContain('<block wx:if="{{canEditDetails}}">');
    expect(template).toContain('open-type="chooseAvatar"');
    expect(template).toContain('bindchooseavatar="chooseWechatAvatar"');
    expect(template).toContain('bindtap="chooseCustomAvatar"');
    expect(template).toContain('mediaError');
    expect(template).toContain('disabled="{{photoBusy || saving || avatarBusy}}"');
    expect(template).toContain('disabled="{{saving || photoBusy || avatarBusy}}"');
  });

  it('彻底删除 Strava 头像 readiness、导入与引导契约', () => {
    expect(template).not.toMatch(/Strava|importStravaAvatar|stravaAvatar/);
    expect(source).not.toMatch(/getStravaReadiness|importStravaAvatar|STRAVA_AVATAR/);
  });

  it('删除昵称输入、展示身份与展示称号', () => {
    expect(template).not.toContain('data-k="nickname"');
    expect(source).not.toContain('nickname: p.nickname');
    expect(template).not.toContain('展示身份');
    expect(template).not.toContain('展示称号');
    expect(template).not.toContain('value="{{p.title}}"');
  });

  it('头像用途固定公开且不再显示开关', () => {
    expect(template).toContain('头像会展示在活动报名骑友列表中');
    expect(template).not.toContain('<switch');
    expect(template).not.toContain('onAvatarVisibilityChange');
    expect(styles).not.toContain('.avatar-visibility-row');
    expect(styles).not.toContain('.avatar-visibility-title');
  });

  it('头像预览仅绑定净化后的 preview URL 并提供无障碍名称', () => {
    const preview = template.match(/<image\b[^>]*class="avatar-preview"[^>]*\/>/)?.[0] || '';
    expect(preview).toContain('src="{{avatarPreviewUrl}}"');
    expect(preview).toContain('data-url="{{avatarPreviewUrl}}"');
    expect(preview).toContain('aria-label=');
    expect(template).not.toContain('src="{{p.avatarId}}"');
  });

  it('两个头像主动作均有 aria-label 且触控高度至少 88rpx', () => {
    const avatarButtons = template.match(/<button\b[^>]*class="avatar-action[^>]*>/g) || [];
    expect(avatarButtons).toHaveLength(2);
    expect(avatarButtons.every((button: string) => button.includes('aria-label='))).toBe(true);
    expect(styles).toMatch(/\.avatar-action\s*\{[^}]*min-height:\s*88rpx/s);
  });

  it('提供 CILI 黑、橙、米白三款默认头像', () => {
    expect(source).toContain('cili-black.png');
    expect(source).toContain('cili-orange.png');
    expect(source).toContain('cili-ivory.png');
    expect(template).toContain('bindtap="chooseDefaultAvatar"');
  });

  it('实名性别为男/女单选', () => {
    expect(template).toContain('<radio-group');
    expect(template).toContain('radio value="男"');
    expect(template).toContain('radio value="女"');
    expect(template).not.toContain('data-k="gender"');
  });

  it('相册提供缩略图、预览和上下移排序', () => {
    expect(template).toContain('class="photo-thumbnail"');
    expect(template).toContain('bindtap="previewPhoto"');
    expect(template).toContain('data-direction="{{-1}}"');
    expect(template).toContain('data-direction="{{1}}"');
    expect(styles).toMatch(/\.photo-thumbnail\s*\{/);
  });

  it('面向用户的页面和错误文案不出现实现技术词或主体限制', () => {
    expect(template).not.toMatch(/云存储|云端|owner path|fileID|主体限制|个人主体/);
    expect(source).not.toMatch(/当前环境不支持云存储|云端图片校验|同步到云端/);
  });
});
