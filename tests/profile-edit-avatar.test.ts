import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Profile } from '../miniprogram/models';

const rideService = vi.hoisted(() => ({
  getProfile: vi.fn(),
  getProfileMediaUploadPath: vi.fn(),
  registerProfileMedia: vi.fn(),
  reportProfileMediaOrphan: vi.fn(),
  updateProfile: vi.fn(),
}));

vi.mock('../miniprogram/services/ride-service', () => ({ rideService }));

const profile: Profile = {
  nickname: '骑手',
  title: '',
  avatarId: 'cloud://avatar',
  avatarSource: 'wechat',
  realName: '曹**',
  phone: '138****5678',
  gender: '',
  emergencyName: '联系人',
  emergencyPhone: '139****0000',
  photos: [],
};

describe('资料编辑头像回写', () => {
  let page: any;

  beforeEach(async () => {
    vi.resetModules();
    rideService.getProfile.mockReset();
    rideService.getProfileMediaUploadPath.mockReset();
    rideService.registerProfileMedia.mockReset().mockResolvedValue(undefined);
    rideService.reportProfileMediaOrphan.mockReset().mockResolvedValue(undefined);
    rideService.updateProfile.mockReset().mockResolvedValue(profile);
    vi.stubGlobal('wx', {
      showToast: vi.fn(),
      getStorageSync: vi.fn(() => []),
      setStorageSync: vi.fn(),
      removeStorageSync: vi.fn(),
    });
    vi.stubGlobal('Page', (definition: any) => {
      page = definition;
      page.data = { ...definition.data, p: { ...profile, photos: [] } };
      page.setData = vi.fn((patch: Record<string, unknown>) => Object.assign(page.data, patch));
    });
    await import('../miniprogram/pages/profile-edit/index');
  });

  afterEach(() => vi.unstubAllGlobals());

  it('保存资料时继续提交 avatarFileId 和头像来源', async () => {
    await page.save();

    expect(rideService.updateProfile).toHaveBeenCalledWith(
      expect.objectContaining({ avatarFileId: 'cloud://avatar', avatarSource: 'wechat' }),
    );
  });

  it('可切换为 Strava 头像来源并持久化选择', async () => {
    page.setAvatarSource({ detail: { value: 1 } });
    await page.save();

    expect(page.data.p.avatarSource).toBe('strava');
    expect(rideService.updateProfile).toHaveBeenCalledWith(
      expect.objectContaining({ avatarSource: 'strava' }),
    );
  });

  it('选择微信头像后复用 owner-bound 上传链路并等待保存生效', async () => {
    const uploadFile = vi
      .fn()
      .mockResolvedValue({ fileID: 'cloud://env/profiles/owner/wechat-avatar.jpg' });
    rideService.getProfileMediaUploadPath.mockResolvedValue(
      'profiles/0123456789abcdef0123456789abcdef/123e4567-e89b-42d3-a456-426614174000.jpg',
    );
    Object.assign(wx, { cloud: { uploadFile } });

    await page.chooseAvatar({ detail: { avatarUrl: '/private/tmp/avatar.jpg' } });

    expect(uploadFile).toHaveBeenCalledWith({
      cloudPath:
        'profiles/0123456789abcdef0123456789abcdef/123e4567-e89b-42d3-a456-426614174000.jpg',
      filePath: '/private/tmp/avatar.jpg',
    });
    expect(rideService.registerProfileMedia).toHaveBeenCalledWith(
      'cloud://env/profiles/owner/wechat-avatar.jpg',
      'other',
    );
    expect(page.data.p.avatarId).toBe('cloud://env/profiles/owner/wechat-avatar.jpg');
    expect(page.data.p.avatarSource).toBe('wechat');
    expect(wx.showToast).toHaveBeenCalledWith({ title: '头像已选择，保存后生效' });
  });

  it('选择照片后先请求 owner-bound path 再上传并写入 photos', async () => {
    const uploadFile = vi
      .fn()
      .mockResolvedValue({ fileID: 'cloud://env/profiles/owner/photo.jpg' });
    const chooseMedia = vi.fn().mockResolvedValue({
      tempFiles: [{ tempFilePath: '/private/tmp/photo.jpg' }],
    });
    rideService.getProfileMediaUploadPath.mockResolvedValue(
      'profiles/0123456789abcdef0123456789abcdef/123e4567-e89b-42d3-a456-426614174000.jpg',
    );
    Object.assign(wx, { chooseMedia, cloud: { uploadFile } });

    await page.addPhoto();

    expect(rideService.getProfileMediaUploadPath).toHaveBeenCalledOnce();
    expect(uploadFile).toHaveBeenCalledWith({
      cloudPath:
        'profiles/0123456789abcdef0123456789abcdef/123e4567-e89b-42d3-a456-426614174000.jpg',
      filePath: '/private/tmp/photo.jpg',
    });
    expect(rideService.getProfileMediaUploadPath.mock.invocationCallOrder[0]).toBeLessThan(
      uploadFile.mock.invocationCallOrder[0],
    );
    expect(rideService.registerProfileMedia).toHaveBeenCalledWith(
      'cloud://env/profiles/owner/photo.jpg',
      'other',
    );
    expect(uploadFile.mock.invocationCallOrder[0]).toBeLessThan(
      rideService.registerProfileMedia.mock.invocationCallOrder[0],
    );
    expect(page.data.p.photos).toEqual([
      { id: 'cloud://env/profiles/owner/photo.jpg', category: 'other' },
    ]);
  });

  it('owner-bound path 请求失败时不上传也不写 photos', async () => {
    const uploadFile = vi.fn();
    rideService.getProfileMediaUploadPath.mockRejectedValue(new Error('path unavailable'));
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
  });

  it('registerMedia 失败时不写 photos 并尽力删除刚上传文件', async () => {
    const deleteFile = vi.fn().mockResolvedValue({
      fileList: [
        {
          fileID: 'cloud://env/profiles/owner/photo.jpg',
          status: -1,
          errMsg: 'delete failed',
        },
      ],
    });
    const uploadFile = vi
      .fn()
      .mockResolvedValue({ fileID: 'cloud://env/profiles/owner/photo.jpg' });
    rideService.getProfileMediaUploadPath.mockResolvedValue(
      'profiles/0123456789abcdef0123456789abcdef/123e4567-e89b-42d3-a456-426614174000.jpg',
    );
    rideService.registerProfileMedia.mockRejectedValue(new Error('register failed'));
    rideService.reportProfileMediaOrphan.mockRejectedValue(new Error('report unavailable'));
    Object.assign(wx, {
      chooseMedia: vi.fn().mockResolvedValue({
        tempFiles: [{ tempFilePath: '/private/tmp/photo.jpg' }],
      }),
      cloud: { uploadFile, deleteFile },
    });

    await page.addPhoto();

    expect(deleteFile).toHaveBeenCalledWith({
      fileList: ['cloud://env/profiles/owner/photo.jpg'],
    });
    expect(rideService.reportProfileMediaOrphan).toHaveBeenCalledWith(
      'cloud://env/profiles/owner/photo.jpg',
      'other',
    );
    expect(wx.setStorageSync).toHaveBeenCalledWith('profile-media-orphans-v1', [
      { fileId: 'cloud://env/profiles/owner/photo.jpg', category: 'other' },
    ]);
    expect(page.data.p.photos).toEqual([]);
  });

  it('再次进入资料页会重试 durable orphan ledger 并在成功后清除', async () => {
    rideService.getProfile.mockResolvedValue(profile);
    vi.mocked(wx.getStorageSync).mockReturnValue([
      { fileId: 'cloud://env/profiles/owner/orphan.jpg', category: 'other' },
    ]);

    await page.onLoad();

    expect(rideService.reportProfileMediaOrphan).toHaveBeenCalledWith(
      'cloud://env/profiles/owner/orphan.jpg',
      'other',
    );
    expect(wx.removeStorageSync).toHaveBeenCalledWith('profile-media-orphans-v1');
  });
});
