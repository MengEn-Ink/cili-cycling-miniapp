// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('个人中心权限卡视觉对齐', () => {
  it('在个人中心持续展示资料权限状态和使用范围', () => {
    const template = read('miniprogram/pages/profile/index.wxml');
    expect(template).toContain('资料展示权限');
    expect(template).toContain("profile.avatarVisibility === 'public'");
    expect(template).toContain('公开身份用于活动页展示');
    expect(template).toContain('查看与调整');
  });

  it('权限卡、身份与列表信息在窄屏保持单行省略', () => {
    const style = read('miniprogram/pages/profile/index.wxss');
    expect(style).toContain('.profile-permission');
    expect(style).toContain('.profile-permission--active .profile-permission-badge');
    expect(style).toContain('.rowtext-title');
    expect(style).toContain('text-overflow: ellipsis');
    expect(style).toContain('white-space: nowrap');
  });

  it('背景与俱乐部图片提供渐进加载反馈', () => {
    const template = read('miniprogram/pages/profile/index.wxml');
    expect(template).toContain('class="profile-background-image"');
    expect(template).toContain('fade-in="{{true}}"');
    expect(template).toContain('lazy-load="{{true}}" fade-in="{{true}}"');
  });
});
