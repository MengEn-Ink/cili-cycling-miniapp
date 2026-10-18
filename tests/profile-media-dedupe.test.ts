import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Profile } from '../miniprogram/models';

const rideService = vi.hoisted(() => ({
  getProfile: vi.fn(),
  getProfileMediaUploadPath: vi.fn(),
  issueMediaUploadPath: vi.fn(),
  getPersonalCapabilityCard: vi.fn(),
  registerProfileMedia: vi.fn(),
  finalizeMediaUpload: vi.fn(),
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
  clubs: [],
  realName: '曹蒙恩',
  phone: '13812345678',
  gender: '',
  emergencyName: '联系人',
  emergencyPhone: '13912340000',
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

// 路径与内容指纹的对应关系，模拟同一文件内容不变、不同文件指纹不同。
const DIGEST_BY_PATH: Record<string, string> = {
  '/private/tmp/a.jpg': 'a'.repeat(32),
  '/private/tmp/b.jpg': 'b'.repeat(32),
  '/private/tmp/face.jpg': 'f'.repeat(32),
  '/private/tmp/shared.jpg': 's'.repeat(32),
};
const FILE_ID_BY_PATH: Record<string, string> = {
  '/private/tmp/a.jpg': 'cloud://env/profiles/owner/a.jpg',
  '/private/tmp/b.jpg': 'cloud://env/profiles/owner/b.jpg',
  '/private/tmp/face.jpg': 'cloud://env/profiles/owner/face.jpg',
  '/private/tmp/shared.jpg': 'cloud://env/profiles/owner/shared.jpg',
};

describe('资料图片内容指纹会话内去重', () => {
  let page: any;
  let uploadFile: ReturnType<typeof vi.fn>;
  let digestResult: { digest?: string } | null;

  beforeEach(async () => {
    vi.resetModules();
    Object.values(rideService).forEach((mock) => mock.mockReset());
    rideService.getProfile.mockResolvedValue(profile);
    rideService.getProfileMediaUploadPath.mockResolvedValue(
      'profiles/0123456789abcdef0123456789abcdef/123e4567-e89b-42d3-a456-426614174000.jpg',
    );
    rideService.issueMediaUploadPath.mockImplementation(
      async (_category: string, _requestId: string) => rideService.getProfileMediaUploadPath(),
    );
    rideService.getPersonalCapabilityCard.mockResolvedValue(capabilityCard());
    rideService.registerProfileMedia.mockResolvedValue(undefined);
    rideService.finalizeMediaUpload.mockImplementation(
      async (fileId: string, category: string, _requestId: string, origin?: string) => {
        await rideService.registerProfileMedia(fileId, category, origin);
        return { canonicalFileId: fileId };
      },
    );
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

    digestResult = null;
    uploadFile = vi.fn((options: { filePath: string }) =>
      Promise.resolve({ fileID: FILE_ID_BY_PATH[options.filePath] }),
    );

    vi.stubGlobal('wx', {
      env: { USER_DATA_PATH: 'wxfile://usr' },
      showToast: vi.fn(),
      navigateTo: vi.fn(),
      getStorageSync: vi.fn(() => []),
      setStorageSync: vi.fn(),
      removeStorageSync: vi.fn(),
      // md5 调用返回内容指纹（可用 digestResult 模拟取不到指纹）；取 size 调用返回固定大小。
      getFileInfo: vi.fn((options: { filePath: string; digestAlgorithm?: string }) => {
        if (options.digestAlgorithm === 'md5') {
          if (digestResult) return Promise.resolve(digestResult);
          return Promise.resolve({ digest: DIGEST_BY_PATH[options.filePath] });
        }
        return Promise.resolve({ size: 1024 });
      }),
      cloud: { uploadFile, deleteFile: vi.fn() },
    });
    vi.stubGlobal('Page', (definition: any) => {
      page = definition;
      page.data = {
        ...definition.data,
        p: { ...profile, gender: '男', photos: [] },
        canEditDetails: true,
        avatarPreviewUrl: 'https://temporary.example/old-avatar.jpg',
      };
      page.setData = vi.fn((patch: Record<string, unknown>) => {
        for (const [key, value] of Object.entries(patch)) {
          const parts = key.split('.');
          if (parts.length === 1) page.data[key] = value;
          else page.data[parts[0]][parts[1]] = value;
        }
      });
    });
    await import('../miniprogram/pages/profile-edit/index');
  });

  afterEach(() => vi.unstubAllGlobals());

  it('背景照重复选择同一内容时不再申请路径、上传或注册，直接复用已有 fileId', async () => {
    const chooseMedia = vi
      .fn()
      .mockResolvedValueOnce({ tempFiles: [{ tempFilePath: '/private/tmp/a.jpg' }] })
      .mockResolvedValueOnce({ tempFiles: [{ tempFilePath: '/private/tmp/a.jpg' }] });
    Object.assign(wx, { chooseMedia });

    await page.addPhoto();
    expect(uploadFile).toHaveBeenCalledTimes(1);
    expect(rideService.registerProfileMedia).toHaveBeenCalledTimes(1);

    await page.addPhoto();
    expect(rideService.getProfileMediaUploadPath).toHaveBeenCalledTimes(1);
    expect(uploadFile).toHaveBeenCalledTimes(1);
    expect(rideService.registerProfileMedia).toHaveBeenCalledTimes(1);
    expect(page.data.p.photos).toEqual([
      { id: 'cloud://env/profiles/owner/a.jpg', category: 'ride' },
    ]);
    expect(page.data.p.backgroundPhoto).toEqual({
      id: 'cloud://env/profiles/owner/a.jpg',
      category: 'ride',
    });
  });

  it('背景照选择不同内容时各自正常上传，互不影响', async () => {
    const chooseMedia = vi
      .fn()
      .mockResolvedValueOnce({ tempFiles: [{ tempFilePath: '/private/tmp/a.jpg' }] })
      .mockResolvedValueOnce({ tempFiles: [{ tempFilePath: '/private/tmp/b.jpg' }] });
    Object.assign(wx, { chooseMedia });

    await page.addPhoto();
    await page.addPhoto();

    expect(uploadFile).toHaveBeenCalledTimes(2);
    expect(rideService.registerProfileMedia).toHaveBeenCalledTimes(2);
    expect(page.data.p.photos).toEqual([
      { id: 'cloud://env/profiles/owner/b.jpg', category: 'ride' },
    ]);
  });

  it('微信头像重复选择同一内容时不重复上传，但每次都重新 setAvatar 指向该 fileId', async () => {
    await page.chooseWechatAvatar({ detail: { avatarUrl: '/private/tmp/face.jpg' } });
    await page.chooseWechatAvatar({ detail: { avatarUrl: '/private/tmp/face.jpg' } });

    expect(rideService.getProfileMediaUploadPath).toHaveBeenCalledTimes(1);
    expect(uploadFile).toHaveBeenCalledTimes(1);
    expect(rideService.registerProfileMedia).toHaveBeenCalledTimes(1);
    expect(rideService.setAvatar).toHaveBeenCalledTimes(2);
    expect(rideService.setAvatar).toHaveBeenLastCalledWith(
      'wechat',
      'cloud://env/profiles/owner/face.jpg',
    );
    expect(page.data.p.avatarId).toBe('cloud://env/profiles/owner/face.jpg');
  });

  it('头像与背景照内容相同仍按不同 category 各自上传，禁止跨用途复用', async () => {
    const chooseMedia = vi
      .fn()
      .mockResolvedValueOnce({ tempFiles: [{ tempFilePath: '/private/tmp/shared.jpg' }] });
    Object.assign(wx, { chooseMedia });
    rideService.issueMediaUploadPath.mockImplementation(
      async (category: string) => `profiles/owner/${category}/shared.jpg`,
    );
    uploadFile.mockImplementation(async ({ cloudPath }: { cloudPath: string }) => ({
      fileID: `cloud://env/${cloudPath}`,
    }));

    await page.chooseWechatAvatar({ detail: { avatarUrl: '/private/tmp/shared.jpg' } });
    await page.addPhoto();

    expect(uploadFile).toHaveBeenCalledTimes(2);
    expect(rideService.finalizeMediaUpload).toHaveBeenNthCalledWith(
      1,
      'cloud://env/profiles/owner/profile-avatar/shared.jpg',
      'profile-avatar',
      expect.any(String),
      'wechat',
    );
    expect(rideService.finalizeMediaUpload).toHaveBeenNthCalledWith(
      2,
      'cloud://env/profiles/owner/profile-background/shared.jpg',
      'profile-background',
      expect.any(String),
    );
    expect(page.data.p.photos).toEqual([
      { id: 'cloud://env/profiles/owner/profile-background/shared.jpg', category: 'ride' },
    ]);
  });

  it('取不到内容指纹时安全回退完整上传链路，重复选择仍各自上传', async () => {
    digestResult = {};
    const chooseMedia = vi
      .fn()
      .mockResolvedValueOnce({ tempFiles: [{ tempFilePath: '/private/tmp/a.jpg' }] })
      .mockResolvedValueOnce({ tempFiles: [{ tempFilePath: '/private/tmp/a.jpg' }] });
    Object.assign(wx, { chooseMedia });

    await page.addPhoto();
    await page.addPhoto();

    expect(uploadFile).toHaveBeenCalledTimes(2);
    expect(rideService.registerProfileMedia).toHaveBeenCalledTimes(2);
  });
});
