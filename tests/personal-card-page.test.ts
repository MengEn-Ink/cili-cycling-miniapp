// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (file: string) => readFileSync(file, 'utf8');

describe('本人名片合入我的页面', () => {
  it('历史地址继续注册，菜单不提供独立名片入口', () => {
    const app = JSON.parse(read('miniprogram/app.json'));
    const script = read('miniprogram/pages/capability-card/index.ts');
    const profile = read('miniprogram/pages/profile/index.wxml');
    expect(app.pages).toContain('pages/capability-card/index');
    expect(script).toContain('wx.switchTab');
    expect(script).toContain("url: '/pages/profile/index'");
    expect(script).not.toContain('getPersonalCapabilityCard');
    expect(profile).not.toMatch(/bindtap="(?:capability|openCard|personalCard)"/);
  });

  it('头像与本人背景分别预览，失效事件保留恢复路径', () => {
    const template = read('miniprogram/pages/profile/index.wxml');
    expect(template).toContain('bindtap="previewHeroImage"');
    expect(template).toContain('bindtap="previewAvatar"');
    expect(template).toContain('binderror="heroBackgroundError"');
    expect(template).toContain('binderror="heroAvatarError"');
    expect(template).not.toContain('heroBackgroundAvatarUrl');
    expect(template).toContain('heroFallbackImageUrl');
  });

  it('七项资料未完善时才显示进度与完善动作，背景不是必填项', () => {
    const template = read('miniprogram/pages/profile/index.wxml');
    expect(template).toContain('wx:if="{{profile && profile.completeness < 100}}"');
    expect(template).toContain('profile.missing');
    expect(template).toContain('class="profile-progress-action"');
    expect(template).not.toMatch(/请上传个人照片|骑行成绩|累计公里|能力评分/);
  });

  it('昵称和媒体身份只使用实际字段，不把实名或电话放进摄影身份区', () => {
    const template = read('miniprogram/pages/profile/index.wxml');
    const identityStart = template.indexOf('<view class="profile-identity">');
    const identityEnd = template.indexOf('</section>', identityStart);
    expect(identityStart).toBeGreaterThan(-1);
    expect(identityEnd).toBeGreaterThan(identityStart);
    const hero = template.slice(identityStart, identityEnd);
    expect(hero).toContain('profile.nickname');
    expect(hero).toContain('heroAvatarUrl');
    expect(hero).not.toMatch(/realName|real_name|emergency|\.phone/);
  });

  it('兼容转跳失败以状态组件提供可操作重试', () => {
    const template = read('miniprogram/pages/capability-card/index.wxml');
    expect(template).toContain('error="{{error}}"');
    expect(template).toContain('retryable="{{true}}"');
    expect(template).toContain('bind:retry="openProfile"');
    expect(template).not.toMatch(/swiper|card\\.backgrounds|card\\.avatarUrl/);
  });
});
