// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const profileTemplate = readFileSync('miniprogram/pages/profile-edit/index.wxml', 'utf8');
const profileSource = readFileSync('miniprogram/pages/profile-edit/index.ts', 'utf8');
const reviewTemplate = readFileSync('miniprogram/pages/admin/review-detail/index.wxml', 'utf8');

describe('资料授权与完整骑行卡片契约', () => {
  it('头像只保留微信选择能力并移除自定义头像上传', () => {
    expect(profileTemplate).toContain('open-type="chooseAvatar"');
    expect(profileTemplate).toContain('bindchooseavatar="chooseWechatAvatar"');
    expect(profileTemplate).not.toContain('chooseCustomAvatar');
    expect(profileTemplate).not.toContain('选择并裁剪图片');
    expect(profileSource).not.toContain('chooseCustomAvatar');
    expect(profileSource).not.toContain('cropSquare');
  });

  it('本人手机号通过微信授权更新并默认完整展示', () => {
    expect(profileTemplate).toContain('open-type="getPhoneNumber"');
    expect(profileTemplate).toContain('bindgetphonenumber="onGetPhoneNumber"');
    expect(profileTemplate).toContain("{{p.phone || '尚未授权'}}");
    expect(profileTemplate).toContain('授权后将完整显示本人手机号');
    expect(profileTemplate).not.toContain('data-k="phone"');
    expect(profileSource).toContain('rideService.getPhoneNumber(code)');
  });

  it('报名详情保留累计与近 90 天两组完整骑行指标', () => {
    expect(reviewTemplate).toContain('wx:for="{{card.lifetimeMetrics}}"');
    expect(reviewTemplate).toContain('wx:for="{{card.recentMetrics}}"');
    expect(reviewTemplate).toContain('累计骑行');
    expect(reviewTemplate).toContain('近 90 天');
  });
});
