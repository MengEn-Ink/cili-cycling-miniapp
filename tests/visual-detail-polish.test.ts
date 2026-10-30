// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('视觉细节收口', () => {
  it('我的头像统一为小圆角方形，编辑和审核页面保持原样', () => {
    const profile = read('miniprogram/pages/profile/index.wxss');
    const profileEdit = read('miniprogram/pages/profile-edit/index.wxss');
    const reviewDetail = read('miniprogram/pages/admin/review-detail/index.wxss');

    expect(profile).toMatch(/\.avatar-trigger\s*\{[^}]*border:\s*0;[^}]*border-radius:\s*12rpx/s);
    expect(profile).toMatch(/\.avatar-trigger \.avatar\s*\{[^}]*border-radius:\s*12rpx/s);
    expect(profileEdit).toMatch(
      /\.upload-media-avatar\s*\{[^}]*border-radius:\s*50%;[^}]*background:\s*var\(--color-raised\)/s,
    );
    expect(reviewDetail).toMatch(/\.person-avatar\s*\{[^}]*border-radius:\s*50%/s);
  });

  it('头像尺寸、裁切、兜底与事件不变，仅目标页面采用 12rpx 圆角', () => {
    const profile = read('miniprogram/pages/profile/index.wxss');
    const component = read('miniprogram/components/cili-avatar/index.wxss');
    const detail = read('miniprogram/pages/activity-detail/index.wxss');
    const template = read('miniprogram/pages/activity-detail/index.wxml');
    expect(profile).toMatch(
      /\.avatar-trigger\s*\{[^}]*width:\s*96rpx;[^}]*height:\s*96rpx;[^}]*border-radius:\s*12rpx/s,
    );
    expect(component).toMatch(/\.avatar\s*\{[^}]*border-radius:\s*50%/s);
    expect(component).toMatch(/\.avatar--rounded-square\s*\{[^}]*border-radius:\s*12rpx/s);
    expect(read('miniprogram/components/cili-avatar/index.ts')).toContain(
      'roundedSquare: { type: Boolean, value: false }',
    );
    expect(read('miniprogram/components/cili-avatar/index.wxml')).toContain(
      "roundedSquare ? 'avatar--rounded-square' : ''",
    );
    expect(read('miniprogram/pages/profile/index.wxml')).toContain('rounded-square="{{true}}"');
    expect(component).toContain('overflow: hidden;');
    expect(component).toMatch(/\.avatar--lg\s*\{[^}]*width:\s*132rpx;[^}]*height:\s*132rpx/s);
    expect(detail).toMatch(
      /\.avatar\s*\{[^}]*width:\s*96rpx;[^}]*height:\s*96rpx;[^}]*border-radius:\s*12rpx/s,
    );
    expect(detail).toMatch(
      /\.rider-dialog-avatar\s*\{[^}]*width:\s*128rpx;[^}]*height:\s*128rpx;[^}]*border-radius:\s*12rpx/s,
    );
    expect(template).toContain('class="avatar initialavatar"');
    expect(template).toContain('class="rider-dialog-avatar rider-dialog-avatar--placeholder"');
    for (const name of ['avatar', 'rider-dialog-avatar']) {
      expect(template).toMatch(
        new RegExp(
          `<image[^>]*class="${name} [^>]*mode="aspectFill"[^>]*bindload="attendeeAvatarLoad"[^>]*binderror="attendeeAvatarError"`,
        ),
      );
    }
    expect(detail).toMatch(/\.club-avatar\s*\{[^}]*border-radius:\s*50%/s);
    expect(read('miniprogram/pages/profile/index.wxml')).toContain(
      'bindtap="previewAvatar" binderror="heroAvatarError"',
    );
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
