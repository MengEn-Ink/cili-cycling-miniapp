// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const profileTemplate = readFileSync('miniprogram/pages/profile-edit/index.wxml', 'utf8');
const profileSource = readFileSync('miniprogram/pages/profile-edit/index.ts', 'utf8');
const reviewTemplate = readFileSync('miniprogram/pages/admin/review-detail/index.wxml', 'utf8');

describe('资料授权与骑行卡片契约', () => {
  it('头像只保留微信选择能力并移除自定义头像上传', () => {
    expect(profileTemplate).toContain('open-type="chooseAvatar"');
    expect(profileTemplate).toContain('bindchooseavatar="chooseWechatAvatar"');
    expect(profileTemplate).not.toContain('chooseCustomAvatar');
    expect(profileTemplate).not.toContain('选择并裁剪图片');
    expect(profileSource).not.toContain('chooseCustomAvatar');
    expect(profileSource).not.toContain('cropSquare');
  });

  it('本人手机号可直接填写并随资料保存', () => {
    expect(profileTemplate).toContain('data-k="phone"');
    expect(profileTemplate).toContain('placeholder="请输入本人手机号"');
    expect(profileTemplate).toContain('可直接填写或更换');
    expect(profileTemplate).not.toContain('open-type="getPhoneNumber"');
    expect(profileTemplate).not.toContain('bindgetphonenumber="onGetPhoneNumber"');
    expect(profileSource).toContain("phone: p.phone.includes('*') ? undefined : p.phone");
    expect(profileSource).not.toContain('rideService.getPhoneNumber(code)');
  });

  it('报名详情只展示本人维护的资料、照片和报名信息', () => {
    expect(reviewTemplate).toContain('资料与照片由骑友本人维护');
    expect(reviewTemplate).toContain('{{card.experience}}');
    expect(reviewTemplate).toContain('{{phone}}');
    expect(reviewTemplate).not.toMatch(/lifetimeMetrics|recentMetrics|累计骑行|近 90 天/);
  });
});
