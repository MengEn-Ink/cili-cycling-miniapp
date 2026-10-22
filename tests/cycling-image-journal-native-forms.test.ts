// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

const pages = {
  profile: 'miniprogram/pages/profile-edit',
  registration: 'miniprogram/pages/registration-form',
  credential: 'miniprogram/pages/credential',
  settings: 'miniprogram/pages/settings',
  activityList: 'miniprogram/pages/admin/activity-list',
  activityEdit: 'miniprogram/pages/admin/activity-edit',
  reviews: 'miniprogram/pages/admin/reviews',
  reviewDetail: 'miniprogram/pages/admin/review-detail',
  clubManagement: 'miniprogram/pages/admin/club-applications',
  clubProfile: 'miniprogram/pages/admin/club-application-detail',
};

describe('骑行影像志原生表单与管理页面', () => {
  it.each(Object.entries(pages))('%s 使用影像志编辑式页头与暖纸长屏', (_, root) => {
    const template = read(`${root}/index.wxml`);
    const styles = read(`${root}/index.wxss`);

    expect(template).toContain('journal-heading');
    expect(styles).toContain('.journal-heading');
    expect(styles).toContain('background: var(--color-bg)');
  });

  it('个人资料保持七项就绪、头像即时保存和整表媒体锁', () => {
    const template = read(`${pages.profile}/index.wxml`);
    const styles = read(`${pages.profile}/index.wxss`);

    expect(template).toContain('保存前请确认 7 项报名资料完整');
    expect(template).toContain('选择后立即保存');
    expect(template).toContain('disabled="{{saving || photoBusy || avatarBusy}}"');
    expect(styles).toMatch(/\.save-action\s*\{[^}]*min-height:\s*96rpx/s);
    expect(styles).toMatch(/\.avatar-action\s*\{[^}]*min-height:\s*88rpx/s);
    expect(styles).toMatch(/\.photo-action,\s*\.photo-remove\s*\{[^}]*min-height:\s*88rpx/s);
    expect(template).not.toMatch(/个人介绍|骑行成绩|国际电话/);
  });

  it('报名保持三档经验、实际交通选项和公开审核候补语义', () => {
    const template = read(`${pages.registration}/index.wxml`);
    const source = read(`${pages.registration}/index.ts`);
    const styles = read(`${pages.registration}/index.wxss`);

    expect(template.match(/class="segment \{\{/g)).toHaveLength(3);
    expect(template).toContain('value="self_drive"');
    expect(template).toContain('value="support_vehicle"');
    expect(source).toContain("gatheringMode: 'self_drive'");
    expect(source).toContain("url: '/pages/credential/index?id=");
    expect(styles).toMatch(/\.submit-button\s*\{[^}]*min-height:\s*96rpx/s);
    expect(styles).toMatch(/\.back-button\s*\{[^}]*min-height:\s*88rpx/s);
  });

  it('凭证只提供活动分享，不提供条码或保存图片', () => {
    const template = read(`${pages.credential}/index.wxml`);
    const source = read(`${pages.credential}/index.ts`);

    expect(template).toContain('open-type="share"');
    expect(template).toContain('分享活动');
    expect(template).toContain('{{item.profile.emergencyName');
    expect(template).toContain('{{item.profile.emergencyPhone');
    expect(source).toContain('onShareAppMessage()');
    expect(template).not.toContain('compact-rider-card');
    expect(template).not.toMatch(/条码|二维码核销|保存图片|保存凭证/);
  });

  it('设置保持按次订阅、微信隐私、安全缓存及管理员 Strava 真状态', () => {
    const template = read(`${pages.settings}/index.wxml`);
    const source = read(`${pages.settings}/index.ts`);

    expect(template).toContain('每次选择以微信授权结果为准');
    expect(template).toContain('打开微信隐私管理');
    expect(template).toContain('可安全重建的缓存');
    expect(template).toContain('wx:if="{{isAdmin}}"');
    for (const state of ['connected', 'disconnected', 'pending', 'error']) {
      expect(source).toContain(`${state}:`);
    }
  });

  it('管理审核固定六项 3×2，详情严格按状态开放动作', () => {
    const reviews = read(`${pages.reviews}/index.wxml`);
    const reviewStyles = read(`${pages.reviews}/index.wxss`);
    const detail = read(`${pages.reviewDetail}/index.wxml`);

    expect(reviews.match(/class="filter-tab /g)).toHaveLength(6);
    expect(reviewStyles).toMatch(
      /\.filter-tabs\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/s,
    );
    expect(detail).toContain(`wx:if="{{x.status === 'pending'}}"`);
    expect(detail).toContain(`wx:elif="{{x.status === 'approved'}}"`);
    expect(detail).toContain('通过报名');
    expect(detail).toContain('确认签到');
  });

  it('活动编辑继续保留自动截止、三张封面、可选群码及双路线来源锁', () => {
    const template = read(`${pages.activityEdit}/index.wxml`);
    const source = read(`${pages.activityEdit}/index.ts`);

    expect(template).toContain('最多 3 张，第一张作为封面');
    expect(template).toContain('报名截止自动设为活动开始日当地 00:00');
    expect(template).toContain('活动群二维码');
    expect(template).toContain('Strava 线路地址');
    expect(template).toContain('上传本地路线文件');
    expect(source).toMatch(
      /this\.data\.saving\s*\|\|\s*this\.data\.uploading\s*\|\|\s*this\.data\.uploadingRoute/,
    );
    expect(source).toContain('this.data.pendingImages.length');
    expect(source).toContain('this.data.pendingRouteUpload');
    expect(source).toContain('routePreview');
  });
});
