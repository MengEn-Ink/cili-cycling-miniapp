// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('资料授权、骑友媒体与加载体验优化', () => {
  it('资料填写前展示用途说明并保留稍后再说闭环', () => {
    const template = read('miniprogram/pages/profile-edit/index.wxml');
    const source = read('miniprogram/pages/profile-edit/index.ts');
    expect(template).toContain('这些资料会用在哪里？');
    expect(template).toContain('确认并继续填写');
    expect(template).toContain('稍后再说');
    expect(source).toContain('PROFILE_CONSENT_STORAGE_KEY');
    expect(source).toContain('acknowledgeConsent');
  });

  it('资料页持续展示可展开的权限状态卡', () => {
    const template = read('miniprogram/pages/profile-edit/index.wxml');
    expect(template).toContain('资料展示权限');
    expect(template).toContain("p.avatarVisibility === 'public'");
    expect(template).toContain('重新查看授权说明');
  });

  it('活动指标保持单行并为骑友媒体提供明确降级', () => {
    const template = read('miniprogram/pages/activity-detail/index.wxml');
    const style = read('miniprogram/pages/activity-detail/index.wxss');
    const source = read('miniprogram/pages/activity-detail/index.ts');
    expect(source).toContain('`${hours}h ${minutes}min`');
    expect(style).toContain('white-space: nowrap');
    expect(template).toContain('尚未公开头像');
    expect(template).toContain('rider-dialog-photo--fallback');
  });

  it('共享头像启用延迟加载与渐进显示', () => {
    const avatar = read('miniprogram/components/cili-avatar/index.wxml');
    expect(avatar).toContain('lazy-load="{{true}}"');
    expect(avatar).toContain('fade-in="{{true}}"');
  });
});
