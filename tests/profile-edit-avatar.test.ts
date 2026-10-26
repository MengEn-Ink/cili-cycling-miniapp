// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Profile } from '../miniprogram/models';

const rideService = vi.hoisted(() => ({
  getProfile: vi.fn(),
  legacyPath: vi.fn(),
  issueMediaUploadPath: vi.fn(),
  finalizeMediaUpload: vi.fn(),
  getPersonalCapabilityCard: vi.fn(),
  finalizeSpy: vi.fn(),
  cleanupSpy: vi.fn(),
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
  clubs: [],
  realName: '曹蒙恩',
  phone: '13812345678',
  gender: '',
  emergencyName: '联系人',
  emergencyPhone: '13912340000',
  sensitiveStatus: {
    realName: true,
    phone: true,
    emergencyPhone: true,
  },
  photos: [],
};

const blankProfile: Profile = {
  nickname: '',
  title: '',
  avatarRevision: 0,
  clubs: [],
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
  profile: { displayName: '骑手', gender: '', avatarUrl },
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

function canonicalFileId(sourceFileId: string) {
  return `cloud://env/canonical/${encodeURIComponent(sourceFileId)}`;
}

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
    rideService.legacyPath.mockResolvedValue(
      'profiles/0123456789abcdef0123456789abcdef/123e4567-e89b-42d3-a456-426614174000.jpg',
    );
    rideService.issueMediaUploadPath.mockImplementation(() => rideService.legacyPath());
    rideService.finalizeMediaUpload.mockImplementation(
      async (fileId: string, category: string, _requestId: string, origin = 'custom') => {
        if (category === 'profile-background') await rideService.finalizeSpy(fileId, 'ride');
        else await rideService.finalizeSpy(fileId, 'other', origin);
        return { canonicalFileId: `cloud://env/canonical/${encodeURIComponent(fileId)}` };
      },
    );
    rideService.getPersonalCapabilityCard.mockResolvedValue(capabilityCard());
    rideService.finalizeSpy.mockResolvedValue(undefined);
    rideService.cleanupSpy.mockResolvedValue(undefined);
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
      getFileInfo: vi.fn().mockResolvedValue({ size: 1024 }),
    });
    vi.stubGlobal('Page', (definition: any) => {
      page = definition;
      page.data = {
        ...definition.data,
        p: {
          ...profile,
          gender: '男',
          photos: [],
        },
        canEditDetails: true,
        avatarPreviewUrl: 'https://temporary.example/old-avatar.jpg',
      };
      page.loadedSensitive = {
        realName: profile.realName,
        phone: profile.phone,
        emergencyPhone: profile.emergencyPhone,
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

  it('通用保存提交昵称但不提交头像字段，未改动的完整敏感字段不重复提交', async () => {
    page.data.p.photos = [{ id: 'cloud://env/profiles/owner/bg.jpg', category: 'ride' }];

    await page.save();

    const patch = rideService.updateProfile.mock.calls[0][0];
    expect(patch.nickname).toBe(page.data.p.nickname);
    expect(patch).not.toHaveProperty('avatarFileId');
    expect(patch).not.toHaveProperty('avatarSource');
    expect(patch).toMatchObject({
      realName: undefined,
      phone: undefined,
      emergencyPhone: undefined,
    });
  });

  it('直接填写的本人手机号随资料保存', async () => {
    page.data.p.photos = [{ id: 'cloud://env/profiles/owner/bg.jpg', category: 'ride' }];
    page.data.p.phone = '13800138000';

    await page.save();

    expect(rideService.updateProfile.mock.calls[0][0].phone).toBe('13800138000');
  });

  it.each([
    ['真实姓名', 'realName', '', '请填写真实姓名'],
    ['本人手机号', 'phone', '123', '请填写有效联系电话'],
    ['紧急联系人姓名', 'emergencyName', '', '请填写紧急联系人'],
    ['紧急联系人电话', 'emergencyPhone', '123', '请填写有效紧急联系电话'],
  ] as const)(
    '当前表单%s不完整时阻止保存并沿用报名门槛文案',
    async (_label, key, value, message) => {
      page.data.p[key] = value;

      await page.save();

      expect(rideService.updateProfile).not.toHaveBeenCalled();
      expect(page.data.error).toBe(message);
      expect(wx.showToast).toHaveBeenCalledWith({ title: message, icon: 'none' });
    },
  );

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
    ['手机号', { phone: '13812345678' }],
    ['性别', { gender: '男' }],
    ['联系人', { emergencyName: '紧急联系人' }],
    ['紧急电话', { emergencyPhone: '13912340000' }],
    ['相册', { photos: [{ id: 'cloud://env/existing.jpg', category: 'ride' }] }],
  ])('没有 avatarId 但已有%s资料的存量用户可编辑但保存被头像门禁拦截', async (_label, fields) => {
    const storedProfile = { ...blankProfile, nickname: '骑手', ...fields } as Profile;
    rideService.getProfile.mockResolvedValueOnce(storedProfile);
    await page.onLoad();

    expect(page.data.canEditDetails).toBe(true);
    await page.save();

    expect(rideService.updateProfile).not.toHaveBeenCalled();
    expect(page.data.error).toBe('请先设置头像，再保存资料');
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

  it('资料照片优先复用云函数签发地址，不要求客户端读取受保护存储', async () => {
    const fileId = 'cloud://env/profile-canonical/owner/background.jpg';
    const getTempFileURL = vi.fn();
    Object.assign(wx, { cloud: { getTempFileURL } });
    page.data.p.photos = [{ id: fileId, category: 'ride' }];
    rideService.getPersonalCapabilityCard.mockResolvedValueOnce({
      ...capabilityCard(),
      backgrounds: [
        {
          id: fileId,
          url: 'https://temporary.example/server-signed-background.jpg',
          source: 'user_photo',
          category: 'ride',
        },
      ],
    });

    await page.onShow();

    expect(page.data.photoItems[0].previewUrl).toBe(
      'https://temporary.example/server-signed-background.jpg',
    );
    expect(getTempFileURL).not.toHaveBeenCalled();
  });

  it('每次回到编辑页都会刷新头像与背景图预览', async () => {
    const getTempFileURL = vi.fn().mockResolvedValue({
      fileList: [
        {
          fileID: 'cloud://env/profiles/owner/background.jpg',
          tempFileURL: 'https://temporary.example/background.jpg',
        },
      ],
    });
    Object.assign(wx, { cloud: { getTempFileURL } });
    page.data.p.photos = [{ id: 'cloud://env/profiles/owner/background.jpg', category: 'ride' }];

    await page.onShow();

    expect(rideService.getPersonalCapabilityCard).toHaveBeenCalledTimes(1);
    expect(getTempFileURL).toHaveBeenCalledWith({
      fileList: ['cloud://env/profiles/owner/background.jpg'],
    });
    expect(page.data.photoItems[0].previewUrl).toBe('https://temporary.example/background.jpg');
  });

  it('背景图地址失效时自动刷新一次，连续失败后保留手动重试入口', async () => {
    const getTempFileURL = vi
      .fn()
      .mockResolvedValueOnce({
        fileList: [
          {
            fileID: 'cloud://env/profiles/owner/photo-a.jpg',
            tempFileURL: 'https://temporary.example/photo-a-old.jpg',
          },
        ],
      })
      .mockResolvedValueOnce({
        fileList: [
          {
            fileID: 'cloud://env/profiles/owner/photo-a.jpg',
            tempFileURL: 'https://temporary.example/photo-a-new.jpg',
          },
        ],
      });
    Object.assign(wx, { cloud: { getTempFileURL } });
    page.data.p.photos = [{ id: 'cloud://env/profiles/owner/photo-a.jpg', category: 'ride' }];

    await page.loadPhotoPreviews();
    page.photoPreviewError({
      currentTarget: { dataset: { id: 'cloud://env/profiles/owner/photo-a.jpg' } },
    });
    await vi.waitFor(() => {
      expect(page.data.photoItems[0].previewUrl).toBe('https://temporary.example/photo-a-new.jpg');
    });
    page.photoPreviewError({
      currentTarget: { dataset: { id: 'cloud://env/profiles/owner/photo-a.jpg' } },
    });

    expect(getTempFileURL).toHaveBeenCalledTimes(2);
    expect(page.data.photoItems[0]).toMatchObject({ previewUrl: '', previewState: 'failed' });
  });

  it('本地临时照片失效后清除实例缓存并改用云函数重新签发地址', async () => {
    const fileId = 'cloud://env/profiles/owner/photo-local.jpg';
    page.data.p.photos = [{ id: fileId, category: 'ride' }];
    page.localPhotoPreviews[fileId] = 'wxfile://expired/photo-local.jpg';
    rideService.getPersonalCapabilityCard.mockResolvedValue({
      ...capabilityCard(),
      backgrounds: [
        {
          id: fileId,
          url: 'https://temporary.example/photo-local-fresh.jpg',
          source: 'user_photo',
          category: 'ride',
        },
      ],
    });
    await page.loadPhotoPreviews();
    expect(page.data.photoItems[0].previewUrl).toBe('wxfile://expired/photo-local.jpg');

    page.photoPreviewError({
      currentTarget: { dataset: { id: fileId, url: 'wxfile://expired/photo-local.jpg' } },
    });

    await vi.waitFor(() => {
      expect(page.data.photoItems[0].previewUrl).toBe(
        'https://temporary.example/photo-local-fresh.jpg',
      );
    });
    expect(page.localPhotoPreviews[fileId]).toBeUndefined();
  });

  it('旧图片节点的迟到错误不会清空已经刷新的新地址', async () => {
    const fileId = 'cloud://env/profiles/owner/photo-a.jpg';
    const getTempFileURL = vi.fn().mockResolvedValue({
      fileList: [{ fileID: fileId, tempFileURL: 'https://temporary.example/photo-a-new.jpg' }],
    });
    Object.assign(wx, { cloud: { getTempFileURL } });
    page.data.p.photos = [{ id: fileId, category: 'ride' }];
    await page.loadPhotoPreviews();

    page.photoPreviewError({
      currentTarget: {
        dataset: { id: fileId, url: 'https://temporary.example/photo-a-old.jpg' },
      },
    });

    expect(page.data.photoItems[0].previewUrl).toBe('https://temporary.example/photo-a-new.jpg');
    expect(getTempFileURL).toHaveBeenCalledTimes(1);
  });

  it('资料首屏不读取或重试已删除的客户端孤儿媒体账本', async () => {
    wx.getStorageSync.mockReturnValueOnce([
      { fileId: 'cloud://env/profiles/owner/orphan.jpg', category: 'other' },
    ]);

    await page.onLoad();

    expect(page.data.loading).toBe(false);
    expect(page.data.p).not.toBeNull();
    expect(wx.getStorageSync).toHaveBeenCalledOnce();
    expect(wx.getStorageSync).toHaveBeenCalledWith('cili-profile-media-consent-v1');
    expect(wx.setStorageSync).not.toHaveBeenCalled();
    expect(rideService.cleanupSpy).not.toHaveBeenCalled();
  });

  it('微信选择入口按 owner path→upload→register(wechat)→setAvatar 顺序执行', async () => {
    const uploadedFileId = 'cloud://env/profiles/owner/wechat.jpg';
    const uploadFile = vi.fn().mockResolvedValue({ fileID: uploadedFileId });
    Object.assign(wx, { cloud: { uploadFile, deleteFile: vi.fn() } });
    rideService.getPersonalCapabilityCard.mockResolvedValueOnce(
      capabilityCard('https://temporary.example/wechat-avatar.jpg'),
    );

    await page.chooseWechatAvatar({ detail: { avatarUrl: '/private/tmp/wechat-avatar.jpg' } });

    expect(uploadFile).toHaveBeenCalledWith(
      expect.objectContaining({
        cloudPath:
          'profiles/0123456789abcdef0123456789abcdef/123e4567-e89b-42d3-a456-426614174000.jpg',
        filePath: '/private/tmp/wechat-avatar.jpg',
      }),
    );
    expect(rideService.finalizeSpy).toHaveBeenCalledWith(uploadedFileId, 'other', 'wechat');
    const canonicalId = canonicalFileId(uploadedFileId);
    expect(rideService.setAvatar).toHaveBeenCalledWith('wechat', canonicalId);
    expect(rideService.setAvatar).not.toHaveBeenCalledWith('wechat', uploadedFileId);
    expect(rideService.legacyPath.mock.invocationCallOrder[0]).toBeLessThan(
      uploadFile.mock.invocationCallOrder[0],
    );
    expect(uploadFile.mock.invocationCallOrder[0]).toBeLessThan(
      rideService.finalizeSpy.mock.invocationCallOrder[0],
    );
    expect(rideService.finalizeSpy.mock.invocationCallOrder[0]).toBeLessThan(
      rideService.setAvatar.mock.invocationCallOrder[0],
    );
    expect(page.data.p).toMatchObject({ avatarId: canonicalId, avatarSource: 'wechat' });
    expect(page.data.avatarPreviewUrl).toBe('https://temporary.example/wechat-avatar.jpg');
  });

  it('微信头像在上传前通过 getFileInfo 拒绝超过 5MiB 的文件', async () => {
    const uploadFile = vi.fn();
    Object.assign(wx, {
      getFileInfo: vi.fn().mockResolvedValue({ size: 5 * 1024 * 1024 + 1 }),
      cloud: { uploadFile },
    });

    await page.chooseWechatAvatar({ detail: { avatarUrl: '/private/tmp/too-large.jpg' } });

    expect(rideService.legacyPath).not.toHaveBeenCalled();
    expect(uploadFile).not.toHaveBeenCalled();
    expect(page.data.mediaError).toBe('图片超过 5MB，请压缩或更换图片后重试');
  });

  it('微信头像临时文件以 wechat 来源注册并设置，保留尚未整表保存的资料', async () => {
    const uploadedFileId = 'cloud://env/profiles/owner/wechat.jpg';
    const uploadFile = vi.fn().mockResolvedValue({ fileID: uploadedFileId });
    const chooseMedia = vi.fn();
    const cropImage = vi.fn();
    Object.assign(wx, { chooseMedia, cropImage, cloud: { uploadFile, deleteFile: vi.fn() } });
    page.data.p = {
      ...page.data.p,
      nickname: '尚未保存的昵称',
      phone: '13900001111',
      photos: [{ id: 'cloud://draft/photo.jpg', category: 'ride' }],
    };

    await page.chooseWechatAvatar({ detail: { avatarUrl: '/private/tmp/avatar.jpg' } });

    expect(chooseMedia).not.toHaveBeenCalled();
    expect(cropImage).not.toHaveBeenCalled();
    expect(uploadFile).toHaveBeenCalledWith(
      expect.objectContaining({ filePath: '/private/tmp/avatar.jpg' }),
    );
    expect(rideService.finalizeSpy).toHaveBeenCalledWith(uploadedFileId, 'other', 'wechat');
    const canonicalId = canonicalFileId(uploadedFileId);
    expect(rideService.setAvatar).toHaveBeenCalledWith('wechat', canonicalId);
    expect(rideService.setAvatar).not.toHaveBeenCalledWith('wechat', uploadedFileId);
    expect(page.data.p).toMatchObject({
      nickname: '尚未保存的昵称',
      phone: '13900001111',
      photos: [{ id: 'cloud://draft/photo.jpg', category: 'ride' }],
      avatarId: canonicalId,
      avatarSource: 'wechat',
    });
  });

  it('微信头像回调缺少 avatarUrl 时静默结束', async () => {
    await page.chooseWechatAvatar({ detail: {} });

    expect(rideService.legacyPath).not.toHaveBeenCalled();
    expect(wx.showToast).not.toHaveBeenCalled();
    expect(page.data.avatarBusy).toBe(false);
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

    expect(page.data.mediaError).toBe('图片上传失败，请重新选择图片后重试');
    expect(wx.showToast).toHaveBeenLastCalledWith({
      title: page.data.mediaError,
      icon: 'none',
    });
  });

  it('微信头像入口共用单一 busy lock 防止重复动作', async () => {
    const uploadPath = deferred<string>();
    rideService.legacyPath.mockReturnValueOnce(uploadPath.promise);
    const uploadFile = vi
      .fn()
      .mockResolvedValue({ fileID: 'cloud://env/profiles/owner/wechat.jpg' });
    Object.assign(wx, { cloud: { uploadFile, deleteFile: vi.fn() } });

    const first = page.chooseWechatAvatar({ detail: { avatarUrl: '/private/tmp/first.jpg' } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const second = page.chooseWechatAvatar({ detail: { avatarUrl: '/private/tmp/second.jpg' } });

    expect(page.data.avatarBusy).toBe(true);
    expect(rideService.legacyPath).toHaveBeenCalledTimes(1);
    uploadPath.resolve(
      'profiles/0123456789abcdef0123456789abcdef/123e4567-e89b-42d3-a456-426614174000.jpg',
    );
    await Promise.all([first, second]);
    expect(page.data.avatarBusy).toBe(false);
  });

  it('finalize 失败时由统一上传删除 source，保留旧头像且不写客户端补偿账本', async () => {
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
    rideService.finalizeSpy.mockRejectedValueOnce(new Error('register failed'));

    await page.chooseWechatAvatar({ detail: { avatarUrl: '/private/tmp/avatar.jpg' } });

    expect(page.data.p).toMatchObject({
      avatarId: 'cloud://env/profiles/owner/old.jpg',
      avatarSource: 'custom',
    });
    expect(page.data.avatarPreviewUrl).toBe('https://temporary.example/old-avatar.jpg');
    expect(rideService.setAvatar).not.toHaveBeenCalled();
    expect(deleteFile).toHaveBeenCalledWith({ fileList: [uploadedFileId] });
    expect(rideService.cleanupSpy).not.toHaveBeenCalled();
    expect(wx.setStorageSync).not.toHaveBeenCalled();
  });

  it('setAvatar CALL_FAILED 后权威头像匹配则收敛成功且不清理对象', async () => {
    const uploadedFileId = 'cloud://env/profiles/owner/delivery-unknown.jpg';
    const canonicalId = canonicalFileId(uploadedFileId);
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
      phone: '13812345678',
      avatarId: canonicalId,
      avatarSource: 'wechat',
    });

    await page.chooseWechatAvatar({ detail: { avatarUrl: '/private/tmp/avatar.jpg' } });

    expect(deleteFile).not.toHaveBeenCalled();
    expect(rideService.cleanupSpy).not.toHaveBeenCalled();
    expect(rideService.getProfile).toHaveBeenCalledOnce();
    expect(page.data.p).toMatchObject({
      nickname: '本地草稿昵称',
      phone: '13900001111',
      avatarId: canonicalId,
      avatarSource: 'wechat',
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

    await page.chooseWechatAvatar({ detail: { avatarUrl: '/private/tmp/avatar.jpg' } });

    expect(page.data.mediaError).toBe('头像保存未确认，请稍后重试');
    expect(wx.showToast).toHaveBeenCalledWith({ title: page.data.mediaError, icon: 'none' });
  });

  it('稳定错误码提供准确提示，未知错误回退为通用提示', async () => {
    await page.runAvatarAction(() =>
      Promise.reject(
        Object.assign(new Error('对象尚不可见'), { code: 'MEDIA_OBJECT_VERIFY_FAILED' }),
      ),
    );
    expect(page.data.mediaError).toBe('图片暂未准备好，请稍后重试');
    expect(wx.showToast).toHaveBeenLastCalledWith({ title: page.data.mediaError, icon: 'none' });

    await page.runAvatarAction(() => Promise.reject(new Error('unexpected')));
    expect(page.data.mediaError).toBe('媒体操作失败，请稍后重试');
    expect(wx.showToast).toHaveBeenLastCalledWith({ title: page.data.mediaError, icon: 'none' });
  });

  it('运行时各阶段失败后 mediaError 与 toast 都不含方括号技术码', async () => {
    const scenarios: Array<[string, string, () => Promise<void>]> = [
      [
        'upload',
        'MEDIA_UPLOAD_FAILED',
        () =>
          page.runAvatarAction(() =>
            Promise.reject(
              Object.assign(new Error('private'), {
                code: 'MEDIA_UPLOAD_FAILED',
                mediaStage: 'upload',
              }),
            ),
          ),
      ],
      [
        'register',
        'MEDIA_REGISTER_FAILED',
        () =>
          page.runAvatarAction(() =>
            Promise.reject(
              Object.assign(new Error('private'), {
                code: 'MEDIA_REGISTER_FAILED',
                mediaStage: 'register',
              }),
            ),
          ),
      ],
      [
        'setAvatar',
        'AVATAR_SET_FAILED',
        () =>
          page.runAvatarAction(() =>
            Promise.reject(
              Object.assign(new Error('private'), {
                code: 'AVATAR_SET_FAILED',
                mediaStage: 'setAvatar',
              }),
            ),
          ),
      ],
      [
        'preview',
        'AVATAR_PREVIEW_FAILED',
        () =>
          page.runAvatarAction(() =>
            Promise.reject(
              Object.assign(new Error('private'), {
                code: 'AVATAR_PREVIEW_FAILED',
                mediaStage: 'preview',
              }),
            ),
          ),
      ],
    ];
    for (const [label, code, run] of scenarios) {
      await run();
      expect(page.data.mediaError, label).not.toMatch(/\[[A-Z0-9_]+\]/);
      expect(page.data.mediaError, label).not.toContain(code);
      expect(page.data.mediaError, label).not.toContain('[');
      expect(wx.showToast).toHaveBeenLastCalledWith({
        title: page.data.mediaError,
        icon: 'none',
      });
    }
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
    expect(page.data.mediaError).toBe('头像预览暂不可用，请稍后重试');
    expect(page.data.mediaError).not.toContain('private preview url');
  });

  it('新预览成功会清除旧 preview error', async () => {
    page.data.mediaError = '头像预览暂不可用，请稍后重试';
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

  it('用户取消微信头像选择时静默结束且释放 busy lock', async () => {
    await page.chooseWechatAvatar({ detail: { errMsg: 'chooseAvatar:fail cancel' } });

    expect(wx.showToast).not.toHaveBeenCalled();
    expect(rideService.legacyPath).not.toHaveBeenCalled();
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
    rideService.legacyPath.mockRejectedValueOnce(new Error('private path detail'));

    await page.addPhoto();

    expect(page.data.mediaError).toBe('图片准备失败，请检查网络后重试');
    expect(page.data.mediaError).not.toContain('private path detail');
  });

  it('用户取消个人相册 chooseMedia 时也静默结束', async () => {
    Object.assign(wx, {
      chooseMedia: vi.fn().mockRejectedValue({ errMsg: 'chooseMedia:fail cancel' }),
      cloud: { uploadFile: vi.fn() },
    });

    await page.addPhoto();

    expect(wx.showToast).not.toHaveBeenCalled();
    expect(rideService.legacyPath).not.toHaveBeenCalled();
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

    expect(rideService.finalizeSpy).toHaveBeenCalledWith(
      'cloud://env/profiles/owner/photo.jpg',
      'ride',
    );
    expect(page.data.p.photos).toEqual([
      { id: canonicalFileId('cloud://env/profiles/owner/photo.jpg'), category: 'ride' },
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
    expect(page.data.p.photos).toEqual([{ id: canonicalFileId(uploadedFileId), category: 'ride' }]);
  });

  it('个人相册 owner-bound path 请求失败时不上传也不写 photos', async () => {
    const uploadFile = vi.fn();
    rideService.legacyPath.mockRejectedValueOnce(new Error('path unavailable'));
    Object.assign(wx, {
      chooseMedia: vi.fn().mockResolvedValue({
        tempFiles: [{ tempFilePath: '/private/tmp/photo.jpg' }],
      }),
      cloud: { uploadFile },
    });

    await page.addPhoto();

    expect(uploadFile).not.toHaveBeenCalled();
    expect(page.data.p.photos).toEqual([]);
    expect(page.data.mediaError).toBe('图片准备失败，请检查网络后重试');
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

    expect(rideService.finalizeSpy).not.toHaveBeenCalled();
    expect(page.data.mediaError).toBe('图片上传失败，请重新选择图片后重试');
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

    expect(page.data.mediaError).toBe('当前环境暂不支持图片上传，请更新微信后重试');
    expect(wx.showToast).toHaveBeenCalledWith({ title: page.data.mediaError, icon: 'none' });
  });

  it('个人相册 finalize 失败时保留 photos 并由统一上传删除 source', async () => {
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
    rideService.finalizeSpy.mockRejectedValueOnce(new Error('register failed'));

    await page.addPhoto();

    expect(deleteFile).toHaveBeenCalledWith({ fileList: [uploadedFileId] });
    expect(rideService.cleanupSpy).not.toHaveBeenCalled();
    expect(wx.setStorageSync).not.toHaveBeenCalled();
    expect(page.data.p.photos).toEqual([]);
    expect(page.data.mediaError).toBe('图片校验失败，请重新选择图片后重试');
  });

  it('性别只接受男/女单选事件并写入当前资料', () => {
    page.selectGender({ detail: { value: '男' } });
    expect(page.data.p.gender).toBe('男');

    page.selectGender({ detail: { value: '女' } });
    expect(page.data.p.gender).toBe('女');
  });

  it('头像预览可点击打开当前安全图片', () => {
    const previewImage = vi.fn();
    Object.assign(wx, { previewImage });
    page.data.avatarPreviewUrl = 'https://images.example/avatar.jpg';

    page.previewAvatar();

    expect(previewImage).toHaveBeenCalledWith({
      current: 'https://images.example/avatar.jpg',
      urls: ['https://images.example/avatar.jpg'],
    });
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
    ]);
    expect(page.data.p.photos).toEqual([
      { id: 'cloud://env/profiles/owner/photo-a.jpg', category: 'ride' },
    ]);
    expect(previewImage).toHaveBeenCalledWith({
      current: 'https://temporary.example/photo-a.jpg',
      urls: ['https://temporary.example/photo-a.jpg'],
    });
  });

  it('新增背景图替换旧图，立即本地预览并以 ride 分类保存', async () => {
    const uploadedFileId = 'cloud://env/profiles/owner/new-photo.jpg';
    const canonicalId = canonicalFileId(uploadedFileId);
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

    expect(page.data.photoItems).toEqual([
      {
        id: canonicalId,
        category: 'ride',
        previewUrl: '/private/tmp/new-photo.jpg',
        previewState: 'ready',
      },
    ]);
    rideService.updateProfile.mockImplementationOnce(async (patch) => ({
      ...profile,
      ...patch,
    }));

    await page.save();
    expect(rideService.updateProfile.mock.calls[0][0].backgroundPhoto).toEqual({
      id: canonicalId,
      category: 'ride',
    });
    expect(rideService.updateProfile.mock.calls[0][0].backgroundPhoto.id).not.toBe(uploadedFileId);
    expect(rideService.updateProfile.mock.calls[0][0]).not.toHaveProperty('photos');
  });
  it('背景图裁剪固定使用 cropScale 16:9，并上传裁剪后的路径', async () => {
    const uploadFile = vi
      .fn()
      .mockResolvedValue({ fileID: 'cloud://env/profiles/owner/cropped.jpg' });
    const cropImage = vi.fn((options: { success: (value: unknown) => void }) => {
      options.success({ tempFilePath: '/private/tmp/cropped.jpg' });
    });
    Object.assign(wx, {
      chooseMedia: vi.fn().mockResolvedValue({
        tempFiles: [{ tempFilePath: '/private/tmp/original.jpg', size: 1024 }],
      }),
      cropImage,
      cloud: { uploadFile, deleteFile: vi.fn() },
    });

    await page.addPhoto();

    expect(cropImage).toHaveBeenCalledWith(
      expect.objectContaining({
        src: '/private/tmp/original.jpg',
        cropScale: '16:9',
        success: expect.any(Function),
        fail: expect.any(Function),
      }),
    );
    expect(uploadFile).toHaveBeenCalledWith(
      expect.objectContaining({ filePath: '/private/tmp/cropped.jpg' }),
    );
  });

  it('cropImage 不存在时友好降级并上传原图', async () => {
    const uploadFile = vi
      .fn()
      .mockResolvedValue({ fileID: 'cloud://env/profiles/owner/original.jpg' });
    Object.assign(wx, {
      chooseMedia: vi.fn().mockResolvedValue({
        tempFiles: [{ tempFilePath: '/private/tmp/original.jpg', size: 1024 }],
      }),
      cropImage: undefined,
      cloud: { uploadFile, deleteFile: vi.fn() },
    });

    await page.addPhoto();

    expect(uploadFile).toHaveBeenCalledWith(
      expect.objectContaining({ filePath: '/private/tmp/original.jpg' }),
    );
  });

  it('用户取消背景图裁剪时取消整个选择，不上传也不报错', async () => {
    const uploadFile = vi.fn();
    Object.assign(wx, {
      chooseMedia: vi.fn().mockResolvedValue({
        tempFiles: [{ tempFilePath: '/private/tmp/original.jpg', size: 1024 }],
      }),
      cropImage: vi.fn((options: { fail: (error: unknown) => void }) => {
        options.fail({ errMsg: 'cropImage:fail cancel' });
      }),
      cloud: { uploadFile, deleteFile: vi.fn() },
    });

    await page.addPhoto();

    expect(uploadFile).not.toHaveBeenCalled();
    expect(rideService.legacyPath).not.toHaveBeenCalled();
    expect(wx.showToast).not.toHaveBeenCalled();
  });

  it('瞬时上传失败后使用同一 cloudPath 自动重试并成功', async () => {
    const uploadFile = vi
      .fn()
      .mockRejectedValueOnce({ errMsg: 'uploadFile:fail network timeout' })
      .mockResolvedValueOnce({ fileID: 'cloud://env/profiles/owner/retried.jpg' });
    Object.assign(wx, {
      chooseMedia: vi.fn().mockResolvedValue({
        tempFiles: [{ tempFilePath: '/private/tmp/retried.jpg', size: 1024 }],
      }),
      cloud: { uploadFile, deleteFile: vi.fn() },
    });

    await page.addPhoto();

    expect(uploadFile).toHaveBeenCalledTimes(2);
    expect(uploadFile.mock.calls[0][0].cloudPath).toBe(uploadFile.mock.calls[1][0].cloudPath);
    expect(page.data.p.photos[0].id).toBe(
      canonicalFileId('cloud://env/profiles/owner/retried.jpg'),
    );
  });

  it('文件类上传错误不可重试', async () => {
    const uploadFile = vi.fn().mockRejectedValue({ errMsg: 'uploadFile:fail file not found' });
    Object.assign(wx, {
      chooseMedia: vi.fn().mockResolvedValue({
        tempFiles: [{ tempFilePath: '/private/tmp/missing.jpg', size: 1024 }],
      }),
      cloud: { uploadFile, deleteFile: vi.fn() },
    });

    await page.addPhoto();

    expect(uploadFile).toHaveBeenCalledOnce();
    expect(rideService.finalizeSpy).not.toHaveBeenCalled();
  });

  it('背景图裁剪后使用原生回调压缩参数并上传压缩结果', async () => {
    const compressImage = vi.fn((options: { success: (value: unknown) => void }) =>
      options.success({ tempFilePath: '/private/tmp/compressed.jpg' }),
    );
    const uploadFile = vi
      .fn()
      .mockResolvedValue({ fileID: 'cloud://env/profiles/owner/compressed.jpg' });
    Object.assign(wx, {
      chooseMedia: vi.fn().mockResolvedValue({
        tempFiles: [{ tempFilePath: '/private/tmp/original.jpg', size: 6 * 1024 * 1024 }],
      }),
      cropImage: vi.fn((options: { success: (value: unknown) => void }) =>
        options.success({ tempFilePath: '/private/tmp/cropped.jpg' }),
      ),
      compressImage,
      getFileInfo: vi.fn().mockResolvedValue({ size: 1024 }),
      cloud: { uploadFile, deleteFile: vi.fn() },
    });

    await page.addPhoto();

    expect(compressImage).toHaveBeenCalledWith({
      src: '/private/tmp/cropped.jpg',
      quality: 82,
      compressedWidth: 1600,
      compressedHeight: 900,
      success: expect.any(Function),
      fail: expect.any(Function),
    });
    expect(uploadFile).toHaveBeenCalledWith(
      expect.objectContaining({ filePath: '/private/tmp/compressed.jpg' }),
    );
  });

  it.each([
    ['无压缩 API', undefined, 'api-unavailable'],
    [
      '压缩运行失败',
      (options: { fail: (error: unknown) => void }) =>
        options.fail({ errMsg: 'compressImage:fail encoder busy /private/private.jpg' }),
      'compress-failed',
    ],
  ])('%s 时降级上传裁剪图并记录脱敏原因', async (_label, compressImage, reason) => {
    const diagnostic = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const uploadFile = vi
      .fn()
      .mockResolvedValue({ fileID: 'cloud://env/profiles/owner/fallback.jpg' });
    Object.assign(wx, {
      chooseMedia: vi.fn().mockResolvedValue({
        tempFiles: [{ tempFilePath: '/private/tmp/original.jpg', size: 1024 }],
      }),
      cropImage: vi.fn((options: { success: (value: unknown) => void }) =>
        options.success({ tempFilePath: '/private/tmp/cropped.jpg' }),
      ),
      compressImage,
      cloud: { uploadFile, deleteFile: vi.fn() },
    });

    await page.addPhoto();

    expect(uploadFile).toHaveBeenCalledWith(
      expect.objectContaining({ filePath: '/private/tmp/cropped.jpg' }),
    );
    const fallback = diagnostic.mock.calls.find((call) =>
      call.some((value) =>
        Boolean(
          value &&
          typeof value === 'object' &&
          (value as { event?: string }).event === 'compress-fallback',
        ),
      ),
    );
    expect(fallback?.[1]).toMatchObject({ event: 'compress-fallback', reason });
    expect(JSON.stringify(fallback)).not.toContain('/private/tmp');
  });

  it('压缩结果仍超过 5MiB 时提示并阻止上传', async () => {
    const uploadFile = vi.fn();
    Object.assign(wx, {
      chooseMedia: vi.fn().mockResolvedValue({
        tempFiles: [{ tempFilePath: '/private/tmp/original.jpg', size: 8 * 1024 * 1024 }],
      }),
      compressImage: vi.fn((options: { success: (value: unknown) => void }) =>
        options.success({ tempFilePath: '/private/tmp/still-large.jpg' }),
      ),
      getFileInfo: vi.fn().mockResolvedValue({ size: 6 * 1024 * 1024 }),
      cloud: { uploadFile, deleteFile: vi.fn() },
    });

    await page.addPhoto();

    expect(uploadFile).not.toHaveBeenCalled();
    expect(page.data.mediaError).toBe('图片超过 5MB，请压缩或更换图片后重试');
  });

  it('大于 5MiB 的源图可在压缩到限制内后上传', async () => {
    const uploadFile = vi
      .fn()
      .mockResolvedValue({ fileID: 'cloud://env/profiles/owner/smaller.jpg' });
    Object.assign(wx, {
      chooseMedia: vi.fn().mockResolvedValue({
        tempFiles: [{ tempFilePath: '/private/tmp/large-source.jpg', size: 9 * 1024 * 1024 }],
      }),
      compressImage: vi.fn((options: { success: (value: unknown) => void }) =>
        options.success({ tempFilePath: '/private/tmp/smaller.jpg' }),
      ),
      getFileInfo: vi.fn().mockResolvedValue({ size: 2 * 1024 * 1024 }),
      cloud: { uploadFile, deleteFile: vi.fn() },
    });

    await page.addPhoto();

    expect(uploadFile).toHaveBeenCalledWith(
      expect.objectContaining({ filePath: '/private/tmp/smaller.jpg' }),
    );
  });

  it('callback UploadTask 订阅进度并显示百分比', async () => {
    const uploadFile = vi.fn((options: { success: (value: unknown) => void }) => ({
      onProgressUpdate(callback: (event: { progress: number }) => void) {
        callback({ progress: 42 });
        queueMicrotask(() =>
          options.success({ fileID: 'cloud://env/profiles/owner/progress.jpg' }),
        );
      },
    }));
    Object.assign(wx, {
      chooseMedia: vi.fn().mockResolvedValue({
        tempFiles: [{ tempFilePath: '/private/tmp/progress.jpg', size: 1024 }],
      }),
      cloud: { uploadFile, deleteFile: vi.fn() },
    });

    await page.addPhoto();

    expect(page.setData).toHaveBeenCalledWith({ mediaProgress: '正在上传 42%' }, undefined);
    expect(page.data.mediaProgress).toBe('');
  });

  it('UploadTask 没有进度句柄时 callback 上传仍成功', async () => {
    const uploadFile = vi.fn((options: { success: (value: unknown) => void }) => {
      queueMicrotask(() =>
        options.success({ fileID: 'cloud://env/profiles/owner/no-progress.jpg' }),
      );
      return {};
    });
    Object.assign(wx, {
      chooseMedia: vi.fn().mockResolvedValue({
        tempFiles: [{ tempFilePath: '/private/tmp/no-progress.jpg', size: 1024 }],
      }),
      cloud: { uploadFile, deleteFile: vi.fn() },
    });

    await page.addPhoto();

    expect(page.data.p.photos[0].id).toBe(
      canonicalFileId('cloud://env/profiles/owner/no-progress.jpg'),
    );
    expect(page.data.mediaProgress).toBe('');
  });

  it('重试复用 cloudPath，诊断只包含次数与原因分类', async () => {
    const diagnostic = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const uploadFile = vi
      .fn()
      .mockRejectedValueOnce({ errMsg: 'uploadFile:fail network timeout /private/tmp/secret.jpg' })
      .mockResolvedValueOnce({ fileID: 'cloud://env/private-file-id' });
    Object.assign(wx, {
      chooseMedia: vi.fn().mockResolvedValue({
        tempFiles: [{ tempFilePath: '/private/tmp/secret.jpg', size: 1024 }],
      }),
      cloud: { uploadFile, deleteFile: vi.fn() },
    });

    await page.addPhoto();

    expect(uploadFile.mock.calls[0][0].cloudPath).toBe(uploadFile.mock.calls[1][0].cloudPath);
    const events = diagnostic.mock.calls
      .map((call) => call[1])
      .filter((value) => value && typeof value === 'object') as Array<Record<string, unknown>>;
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ event: 'upload-retry', attempt: 2, total: 3, reason: 'timeout' }),
        expect.objectContaining({ event: 'upload-success', attempt: 2, total: 3 }),
      ]),
    );
    const serialized = JSON.stringify(events);
    expect(serialized).not.toMatch(/private-file-id|\/private\/tmp|openid|nickname|phone/i);
  });

  it('页面卸载会 abort 当前头像 UploadTask，且不继续登记或设置头像', async () => {
    let failUpload!: (error: unknown) => void;
    const abort = vi.fn(() => failUpload({ errMsg: 'uploadFile:fail abort' }));
    const uploadFile = vi.fn((options: { fail: (error: unknown) => void }) => {
      failUpload = options.fail;
      return { abort };
    });
    Object.assign(wx, {
      cloud: { uploadFile, deleteFile: vi.fn() },
    });

    const action = page.chooseWechatAvatar({
      detail: { avatarUrl: '/private/tmp/unload-avatar.jpg' },
    });
    await vi.waitFor(() => expect(uploadFile).toHaveBeenCalledOnce());
    page.onUnload();
    await action;

    expect(abort).toHaveBeenCalledOnce();
    expect(rideService.finalizeSpy).not.toHaveBeenCalled();
    expect(rideService.setAvatar).not.toHaveBeenCalled();
    expect(wx.showToast).not.toHaveBeenCalled();
  });

  it('背景 source 上传完成后页面卸载仍完成 finalize，但不写入已卸载页面', async () => {
    const uploadedFileId = 'cloud://env/profiles/owner/unloaded-background.jpg';
    const uploadFile = vi.fn((options: { success: (value: unknown) => void }) => {
      queueMicrotask(() => {
        options.success({ fileID: uploadedFileId });
        page.onUnload();
      });
      return { abort: vi.fn() };
    });
    Object.assign(wx, {
      chooseMedia: vi.fn().mockResolvedValue({
        tempFiles: [{ tempFilePath: '/private/tmp/unloaded-background.jpg', size: 1024 }],
      }),
      cloud: { uploadFile, deleteFile: vi.fn() },
    });

    await page.addPhoto();

    expect(rideService.finalizeSpy).toHaveBeenCalledOnce();
    expect(page.data.p.photos).toEqual([]);
    expect(wx.showToast).not.toHaveBeenCalled();
  });

  it('UploadTask 结算后注销监听并忽略迟到 progress', async () => {
    let progressCallback!: (event: { progress: number }) => void;
    const offProgressUpdate = vi.fn();
    const uploadFile = vi.fn((options: { success: (value: unknown) => void }) => ({
      onProgressUpdate(callback: (event: { progress: number }) => void) {
        progressCallback = callback;
        queueMicrotask(() => options.success({ fileID: 'cloud://env/profiles/owner/settled.jpg' }));
      },
      offProgressUpdate,
    }));
    Object.assign(wx, {
      chooseMedia: vi.fn().mockResolvedValue({
        tempFiles: [{ tempFilePath: '/private/tmp/settled.jpg', size: 1024 }],
      }),
      cloud: { uploadFile, deleteFile: vi.fn() },
    });

    await page.addPhoto();
    page.setData.mockClear();
    progressCallback({ progress: 91 });

    expect(offProgressUpdate).toHaveBeenCalledWith(progressCallback);
    expect(page.setData).not.toHaveBeenCalled();
  });

  it('getFileInfo 不可用时使用文件系统 stat 校验大小', async () => {
    const stat = vi.fn((options: { success: (value: unknown) => void }) =>
      options.success({ stats: { size: 1024 } }),
    );
    const uploadFile = vi.fn().mockResolvedValue({
      fileID: 'cloud://env/profiles/owner/fs-stat-avatar.jpg',
    });
    Object.assign(wx, {
      getFileInfo: undefined,
      getFileSystemManager: vi.fn(() => ({ stat })),
      cloud: { uploadFile, deleteFile: vi.fn() },
    });

    await page.chooseWechatAvatar({ detail: { avatarUrl: '/private/tmp/fs-stat-avatar.jpg' } });

    expect(stat).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/private/tmp/fs-stat-avatar.jpg' }),
    );
    expect(uploadFile).toHaveBeenCalledOnce();
  });

  it('所有方式都无法读取大小时 fail-closed 且不上传', async () => {
    const uploadFile = vi.fn();
    Object.assign(wx, {
      getFileInfo: undefined,
      getFileSystemManager: vi.fn(() => ({
        stat: (options: { fail: (error: unknown) => void }) =>
          options.fail(new Error('stat unavailable')),
      })),
      cloud: { uploadFile, deleteFile: vi.fn() },
    });

    await page.chooseWechatAvatar({ detail: { avatarUrl: '/private/tmp/unknown-size.jpg' } });

    expect(uploadFile).not.toHaveBeenCalled();
    expect(page.data.mediaError).toBe('无法确认图片大小，请重新选择图片或升级微信后重试');
    expect(wx.showToast).toHaveBeenCalledWith({ title: page.data.mediaError, icon: 'none' });
  });

  it('源图 20MiB 与成品 5MiB 边界允许上传', async () => {
    const uploadFile = vi.fn().mockResolvedValue({
      fileID: 'cloud://env/profiles/owner/exact-boundary.jpg',
    });
    const getFileInfo = vi.fn().mockResolvedValue({ size: 5 * 1024 * 1024 });
    Object.assign(wx, {
      chooseMedia: vi.fn().mockResolvedValue({
        tempFiles: [{ tempFilePath: '/private/tmp/source-20m.jpg', size: 20 * 1024 * 1024 }],
      }),
      compressImage: vi.fn((options: { success: (value: unknown) => void }) =>
        options.success({ tempFilePath: '/private/tmp/product-5m.jpg' }),
      ),
      getFileInfo,
      cloud: { uploadFile, deleteFile: vi.fn() },
    });

    await page.addPhoto();

    expect(uploadFile).toHaveBeenCalledWith(
      expect.objectContaining({ filePath: '/private/tmp/product-5m.jpg' }),
    );
  });

  it('源图超过 20MiB 时在裁剪压缩前停止', async () => {
    const uploadFile = vi.fn();
    const compressImage = vi.fn();
    Object.assign(wx, {
      chooseMedia: vi.fn().mockResolvedValue({
        tempFiles: [
          { tempFilePath: '/private/tmp/source-too-large.jpg', size: 20 * 1024 * 1024 + 1 },
        ],
      }),
      compressImage,
      cloud: { uploadFile, deleteFile: vi.fn() },
    });

    await page.addPhoto();

    expect(compressImage).not.toHaveBeenCalled();
    expect(uploadFile).not.toHaveBeenCalled();
    expect(page.data.mediaError).toBe('原图超过 20MB，请选择更小的图片后重试');
  });
});

describe('资料编辑头像页面契约（骑行影像志）', () => {
  const template = readFileSync('miniprogram/pages/profile-edit/index.wxml', 'utf8');
  const source = readFileSync('miniprogram/pages/profile-edit/index.ts', 'utf8');
  const styles = readFileSync('miniprogram/pages/profile-edit/index.wxss', 'utf8');

  it('头像作为门禁：basic 资料受 canEditDetails 控制，只保留微信头像授权入口', () => {
    expect(template).toContain('wx:if="{{canEditDetails}}"');
    expect(template.indexOf('头像与背景')).toBeLessThan(template.indexOf('基础资料'));
    expect(template).toContain('open-type="chooseAvatar"');
    expect(template).toContain('bindchooseavatar="chooseWechatAvatar"');
    expect(template).not.toContain('chooseCustomAvatar');
    expect(template).toContain('mediaError');
    // 上传与保存按钮都在上传/保存繁忙时相互锁定。
    expect(template).toContain('disabled="{{avatarBusy || photoBusy || saving}}"');
    expect(template).toContain('disabled="{{saving || photoBusy || avatarBusy}}"');
  });

  it('彻底删除 Strava 头像 readiness、导入与引导契约', () => {
    expect(template).not.toMatch(/Strava|importStravaAvatar|stravaAvatar/);
    expect(source).not.toMatch(/getStravaReadiness|importStravaAvatar|STRAVA_AVATAR/);
  });

  it('提供微信昵称输入并随资料保存，展示身份与展示称号已移除', () => {
    expect(template).toContain('data-k="nickname"');
    expect(template).toContain('type="nickname"');
    expect(source).toContain('nickname: p.nickname');
    expect(template).not.toContain('展示身份');
    expect(template).not.toContain('展示称号');
    expect(template).not.toContain('value="{{p.title}}"');
  });

  it('头像用途文案保留且不出现 Switch 可见性开关', () => {
    expect(template).toContain('用于个人主页和活动报名中的骑手身份展示');
    expect(template).not.toContain('<switch');
    expect(template).not.toContain('onAvatarVisibilityChange');
    expect(styles).not.toContain('.avatar-visibility-row');
    expect(styles).not.toContain('.avatar-visibility-title');
  });

  it('头像预览等待窗口不再使用 1.2 秒短超时', () => {
    expect(source).toContain('const AVATAR_PREVIEW_DEADLINE_MS = 8_000');
    expect(source).not.toContain('const AVATAR_PREVIEW_DEADLINE_MS = 1_200');
  });

  it('头像预览仅绑定净化后的 preview URL 并提供无障碍名称', () => {
    const preview =
      template.match(/<image\b[^>]*class="avatar\s+avatar-preview"[^>]*\/>/)?.[0] || '';
    expect(preview).toContain('src="{{avatarPreviewUrl}}"');
    expect(preview).toContain('data-url="{{avatarPreviewUrl}}"');
    expect(preview).toContain('aria-label=');
    expect(template).not.toContain('src="{{p.avatarId}}"');
  });

  it('唯一头像主动作有 aria-label 且触控高度至少 88rpx', () => {
    const avatarButtons =
      template.match(/<button\b[^>]*class="[^"]*\bavatar-action\b[^"]*"[^>]*>/g) || [];
    expect(avatarButtons).toHaveLength(1);
    expect(avatarButtons[0]).toContain('aria-label=');
    expect(styles).toMatch(/\.avatar-action\s*\{[^}]*min-height:\s*88rpx/s);
  });

  it('只提供微信授权头像，不提供自定义上传或预设头像', () => {
    expect(template).toContain('open-type="chooseAvatar"');
    expect(template).not.toContain('bindtap="chooseCustomAvatar"');
    expect(source).not.toContain('chooseCustomAvatar');
    expect(template).not.toContain('bindtap="chooseDefaultAvatar"');
    expect(template).not.toContain('CILI 主题头像');
    expect(source).not.toContain('DEFAULT_AVATARS');
    expect(source).not.toContain('materializeDefaultAvatar');
  });

  it('实名性别为男/女单选', () => {
    expect(template).toContain('<radio-group');
    expect(template).toContain('radio value="男"');
    expect(template).toContain('radio value="女"');
    expect(template).not.toContain('data-k="gender"');
  });

  it('背景图提供单张缩略图与大图预览，并明确替换语义', () => {
    expect(template).toContain('个人中心顶部背景');
    expect(template).toContain('最多 1 张');
    expect(template).toContain("p.photos.length ? '更换背景' : '添加背景'");
    expect(template).toContain('class="background-image"');
    expect(template).toContain('bindtap="previewPhoto"');
    expect(template).toContain('选择后可移动和缩放画面，建议使用横向照片');
    expect(source).toMatch(
      /wx\.cropImage\(\{\s*src:\s*image\.path,\s*cropScale:\s*'16:9',\s*success:\s*resolve,\s*fail:\s*reject/s,
    );
    expect(source).not.toContain('aspectRatio');
    expect(template).not.toContain('data-direction=');
    expect(styles).toMatch(/\.background-image\s*\{/);
  });

  it('头像/背景 upload 块均对齐设计稿 .upload 栅格并保留 100% 宽度主动作按钮', () => {
    expect(template).toContain('class="upload upload-avatar"');
    expect(template).toContain('class="upload upload-background"');
    expect(styles).toMatch(
      /\.upload\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:\s*144rpx minmax\(0, 1fr\)/s,
    );
    expect(styles).toMatch(/\.avatar-action\s*\{[^}]*box-sizing:\s*border-box[^}]*width:\s*100%/s);
  });

  it('背景图预览区区分加载与失败状态，并提供自动刷新和手动重试', () => {
    expect(template).toContain('binderror="photoPreviewError"');
    expect(template).toContain('bindtap="retryPhotoPreview"');
    expect(template).toContain("photoItems[0].previewState === 'loading'");
    expect(template).toContain('图片加载失败，点击重试');
    expect(source).toContain('photoPreviewRetryIds');
    expect(source).toContain('this.ensurePhotoUrlCache()?.invalidate([id])');
  });

  it('面向用户的页面和错误文案不出现实现技术词或主体限制', () => {
    expect(template).not.toMatch(/云存储|云端|owner path|fileID|主体限制|个人主体/);
    expect(source).not.toMatch(/当前环境不支持云存储|云端图片校验|同步到云端/);
  });

  it('mediaFailureDetail 返回面向用户的成熟中文，且不包含方括号技术码', () => {
    const stages = [
      { code: 'MEDIA_SELECTION_FAILED', stage: 'selection' },
      { code: 'MEDIA_UPLOAD_PATH_FAILED', stage: 'uploadPath' },
      { code: 'MEDIA_UPLOAD_FAILED', stage: 'upload' },
      { code: 'MEDIA_REGISTER_FAILED', stage: 'register' },
      { code: 'AVATAR_SET_FAILED', stage: 'setAvatar' },
      { code: 'AVATAR_PREVIEW_FAILED', stage: 'preview' },
    ] as const;
    for (const { code, stage } of stages) {
      const detail = (globalThis as any).__mediaFailureDetailForTest?.(stage, code);
      // 若未暴露内部函数，退化为按消息列表核对（主路径通过运行时测试已覆盖）。
      if (typeof detail === 'string') {
        expect(detail, `stage=${stage}`).not.toMatch(/\[[A-Z0-9_]+\]/);
        expect(detail, `stage=${stage}`).not.toContain(code);
      }
    }
    // 直接扫描源码：选择图片阶段用户文案满足“请确认已允许使用相册或相机，也可稍后再试”。
    expect(source).toContain('选择图片失败，请确认已允许使用相册或相机，也可稍后再试');
    // 源码中 user-facing fallback 均不以方括号包裹的技术码开头。
    const stageMessages = source.match(
      /messageByStage:\s*Record<string, string>\s*=\s*\{[\s\S]*?\};/,
    )?.[0];
    expect(stageMessages, 'messageByStage block').toBeTruthy();
    expect(stageMessages).not.toMatch(/\[[A-Z0-9_]+\]/);
    const codeMessages = source.match(
      /messageByCode:\s*Record<string, string>\s*=\s*\{[\s\S]*?\};/,
    )?.[0];
    expect(codeMessages, 'messageByCode block').toBeTruthy();
    expect(codeMessages).not.toMatch(/\[[A-Z0-9_]+\]/);
    // 技术码只走内部诊断（console.warn），不再拼回面向用户的字符串。
    expect(source).not.toMatch(/`\[\$\{code\}\]/);
    expect(source).toContain("console.warn('[profile-edit] media failure'");
  });
});
