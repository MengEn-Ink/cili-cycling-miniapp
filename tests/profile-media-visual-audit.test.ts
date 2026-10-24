// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('资料媒体与权限状态核查', () => {
  it('背景照片参与完整公开状态判断', () => {
    const edit = read('miniprogram/pages/profile-edit/index.wxml');
    expect(edit).toContain('p.backgroundPhoto || p.photos.length');
    expect(edit).toContain('头像与背景已公开');
  });

  it('隐私说明使用精简一致的用户语言', () => {
    const profile = read('miniprogram/pages/profile/index.wxml');
    const edit = read('miniprogram/pages/profile-edit/index.wxml');
    expect(profile).toContain('实名与电话仅本人和审核人员可见；骑友只见已公开资料。');
    expect(edit).toContain('活动页：昵称与已授权头像、背景');
    expect(edit).toContain('报名审核：实名与联系方式仅审核人员可见');
  });

  it('资料编辑和个人名片图片提供渐进显示', () => {
    const profile = read('miniprogram/pages/profile/index.wxml');
    const edit = read('miniprogram/pages/profile-edit/index.wxml');
    expect(profile).toContain('profile-background-fallback');
    expect(profile).toContain('fade-in="{{true}}"');
    expect(edit).toContain('class="avatar avatar-preview"');
    expect(edit).toContain('lazy-load="{{true}}" fade-in="{{true}}"');
  });
});
