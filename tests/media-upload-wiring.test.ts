// @ts-expect-error Repository intentionally omits Node typings.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('profile/activity/club 统一媒体上传接线', () => {
  it('profile/activity 直接复用统一模块，club 经共享 helper 接入且业务页不调用原生上传', () => {
    const profile = read('miniprogram/pages/profile-edit/index.ts');
    const activity = read('miniprogram/pages/admin/activity-edit/index.ts');
    const club = read('miniprogram/pages/club/center/index.ts');
    const clubMedia = read('miniprogram/utils/club-media.ts');

    for (const source of [profile, activity]) {
      expect(source).toMatch(/utils\/media-upload/);
    }
    expect(club).toMatch(/utils\/club-media/);
    expect(clubMedia).toMatch(/\.\/media-upload/);

    for (const source of [profile, activity, club]) {
      expect(source).not.toMatch(/\bwx\.cloud!?\.uploadFile\s*\(/);
    }
    expect(profile).toContain("'profile-avatar'");
    expect(profile).toContain("'profile-background'");
    expect(activity).toContain("'activity-image'");
    expect(activity).toContain("'activity-group-qr'");
    expect(clubMedia).toContain("'club-avatar'");
    expect(clubMedia).toContain("'club-cover'");
  });

  it('原生 uploadFile 只存在于统一 transport', () => {
    expect(read('miniprogram/utils/media-upload.ts')).toMatch(/cloud\.uploadFile\s*\(/);
  });
});
