// @ts-expect-error Repository intentionally omits Node typings.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('profile/activity/club 统一媒体上传接线', () => {
  it('三个业务页面均复用统一模块且不直接调用原生上传', () => {
    const pages = [
      'miniprogram/pages/profile-edit/index.ts',
      'miniprogram/pages/admin/activity-edit/index.ts',
      'miniprogram/pages/club/center/index.ts',
    ].map(read);
    for (const source of pages) {
      expect(source).toMatch(/utils\/media-upload/);
      expect(source).not.toMatch(/\bwx\.cloud!?\.uploadFile\s*\(/);
    }
    expect(pages[0]).toContain("'profile-avatar'");
    expect(pages[0]).toContain("'profile-background'");
    expect(pages[1]).toContain("'activity-image'");
    expect(pages[1]).toContain("'activity-group-qr'");
    expect(pages[2]).toContain("'club-avatar'");
    expect(pages[2]).toContain("'club-cover'");
  });

  it('原生 uploadFile 只存在于统一 transport', () => {
    expect(read('miniprogram/utils/media-upload.ts')).toMatch(/cloud\.uploadFile\s*\(/);
  });
});
