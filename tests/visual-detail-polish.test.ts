// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('视觉细节收口', () => {
  it('个人头像统一为圆形媒体本体，不再叠加圆角方框', () => {
    const profile = read('miniprogram/pages/profile/index.wxss');
    const profileEdit = read('miniprogram/pages/profile-edit/index.wxss');
    const reviewDetail = read('miniprogram/pages/admin/review-detail/index.wxss');

    expect(profile).toMatch(/\.avatar-trigger\s*\{[^}]*border:\s*0;[^}]*border-radius:\s*50%/s);
    expect(profile).toMatch(/\.avatar-trigger \.avatar\s*\{[^}]*border-radius:\s*50%/s);
    expect(profileEdit).toMatch(
      /\.upload-media-avatar\s*\{[^}]*border-radius:\s*50%;[^}]*background:\s*var\(--color-raised\)/s,
    );
    expect(reviewDetail).toMatch(/\.person-avatar\s*\{[^}]*border-radius:\s*50%/s);
  });

  it('短状态与关键身份值保持单行，长文本不再按字符生硬断开', () => {
    const pill = read('miniprogram/components/status-pill/index.wxss');
    const credential = read('miniprogram/pages/credential/index.wxss');
    const reviewDetail = read('miniprogram/pages/admin/review-detail/index.wxss');

    expect(pill).toMatch(/\.pill\s*\{[^}]*text-overflow:\s*ellipsis;[^}]*white-space:\s*nowrap/s);
    expect(credential).toContain('.detailrow-desc--nowrap');
    expect(credential).not.toContain('word-break: break-all');
    expect(reviewDetail).toContain('.detailrow .dd--nowrap');
    expect(reviewDetail).not.toContain('word-break: break-all');
  });

  it('活动二维码仅保留二维码白底与轻量投影，避免多层套框', () => {
    const detailTemplate = read('miniprogram/pages/activity-detail/index.wxml');
    const detailStyles = read('miniprogram/pages/activity-detail/index.wxss');
    const editTemplate = read('miniprogram/pages/admin/activity-edit/index.wxml');
    const editStyles = read('miniprogram/pages/admin/activity-edit/index.wxss');

    expect(detailTemplate).toContain('class="group-qr-frame"');
    expect(detailStyles).toMatch(
      /\.group-qr-frame\s*\{[^}]*max-width:\s*472rpx;[^}]*margin:\s*4rpx auto 0;[^}]*\}/s,
    );
    expect(detailStyles).not.toMatch(/\.group-qr-frame\s*\{[^}]*padding:/s);
    expect(detailStyles).toMatch(
      /\.group-qr-image\s*\{[^}]*background:\s*var\(--color-surface\);[^}]*box-shadow:/s,
    );
    expect(editTemplate).toContain('class="group-qr-media"');
    expect(editStyles).toMatch(/\.group-qr-card\s*\{[^}]*background:\s*var\(--color-raised\)/s);
    expect(editStyles).toMatch(
      /\.group-qr-media\s*\{[^}]*padding:\s*20rpx;[^}]*background:\s*var\(--color-surface\)/s,
    );
  });
});
