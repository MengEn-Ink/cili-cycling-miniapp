import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Profile } from '../miniprogram/models';

const rideService = vi.hoisted(() => ({
  getProfile: vi.fn(),
  updateProfile: vi.fn(),
}));

vi.mock('../miniprogram/services/ride-service', () => ({ rideService }));

const profile: Profile = {
  nickname: '骑手',
  title: '',
  avatarId: 'cloud://avatar',
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
    rideService.updateProfile.mockReset().mockResolvedValue(profile);
    vi.stubGlobal('wx', { showToast: vi.fn() });
    vi.stubGlobal('Page', (definition: any) => {
      page = definition;
      page.data = { ...definition.data, p: profile };
      page.setData = vi.fn((patch: Record<string, unknown>) => Object.assign(page.data, patch));
    });
    await import('../miniprogram/pages/profile-edit/index');
  });

  afterEach(() => vi.unstubAllGlobals());

  it('保存资料时继续提交 avatarFileId', async () => {
    await page.save();

    expect(rideService.updateProfile).toHaveBeenCalledWith(
      expect.objectContaining({ avatarFileId: 'cloud://avatar' }),
    );
  });
});
