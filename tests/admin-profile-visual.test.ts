// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('管理端与个人资料视觉契约', () => {
  it('活动管理卡展示三格真实指标，缺失值明确显示为破折号', () => {
    const source = read('miniprogram/pages/admin/activity-list/index.ts');
    const template = read('miniprogram/pages/admin/activity-list/index.wxml');
    const styles = read('miniprogram/pages/admin/activity-list/index.wxss');

    expect(template).toMatch(/class="management-metrics[^"]*"/);
    expect(template).toContain('{{item.registrationMetric}}');
    expect(template).toContain('{{item.pendingMetric}}');
    expect(template).toContain('{{item.approvedMetric}}');
    expect(template).toContain('<text class="meta">报名</text>');
    expect(template).toContain('<text class="meta">待审核</text>');
    expect(template).toContain('<text class="meta">已通过</text>');
    expect(source).toContain('displayDate: formatActivityDateTime(item.startAt || item.date)');
    expect(template).toContain("{{item.displayDate || '活动时间待公布'}}");
    expect(template).not.toContain('{{item.displayDate || item.startAt}}');
    expect(source).toContain("return value === undefined ? '—' : String(value)");
    expect(source).toContain('registrationMetric: metricValue(item.occupiedCount)');
    expect(source).toContain('approvedRegistrationCount');
    expect(source).not.toMatch(/registrationMetric:\s*0|pendingMetric:\s*0|approvedMetric:\s*0/);
    expect(styles).toMatch(/\.management-metrics[^{]*\{[^}]*grid-template-columns:\s*repeat\(3,/s);
  });

  it('地图选点和公开路线解析使用次按钮，图片操作热区不少于 88rpx', () => {
    const template = read('miniprogram/pages/admin/activity-edit/index.wxml');
    const styles = read('miniprogram/pages/admin/activity-edit/index.wxss');

    expect(template).toMatch(/class="map-button map-button--secondary"[^>]*>地图选点<\/button>/);
    expect(template).toMatch(
      /class="map-button map-button--secondary"[^>]*bindtap="addOfficialRoute"/,
    );
    expect(styles).toMatch(/\.image-action\s*\{[^}]*min-height:\s*88rpx/s);
    expect(styles).toMatch(
      /\.group-qr-card \.image-action--danger\s*\{[^}]*background:\s*var\(--color-danger-soft\)(?:\s*!important)?;[^}]*color:\s*var\(--color-danger-text\)/s,
    );
    expect(styles).toMatch(
      /\.activity-editor\s*\{[^}]*padding-bottom:\s*calc\(var\(--fixed-action-reserve\) \+ var\(--card-gap\) \+ env\(safe-area-inset-bottom\)\)/s,
    );
    expect(styles).toMatch(/\.page-shell\.activity-editor\s*\{[^}]*padding:\s*0;/s);
    expect(styles).toMatch(/\.content\.tight\s*\{[^}]*padding:\s*0 var\(--page-gutter\) 120rpx;/s);
  });

  it('审批列表使用现有头像字段并提供昵称首字回退', () => {
    const source = read('miniprogram/pages/admin/reviews/index.ts');
    const template = read('miniprogram/pages/admin/reviews/index.wxml');
    const styles = read('miniprogram/pages/admin/reviews/index.wxss');

    expect(source).toContain('item.profile?.avatarUrl || item.profile?.avatarId');
    expect(source).toContain("avatarInitial: nickname.slice(0, 1) || '骑'");
    expect(template).toContain('class="reviewitem-avatar"');
    expect(template).toContain('wx:if="{{item.avatarUrl}}"');
    expect(template).toContain('aria-label="{{item.profile.nickname || \'骑友\'}}头像"');
    expect(template).toContain('<text wx:else>{{item.avatarInitial}}</text>');
    expect(styles).toMatch(/\.reviewitem-avatar\s*\{[^}]*width:\s*88rpx;[^}]*height:\s*88rpx/s);
    expect(source).not.toContain('已入队');
  });

  it('背景图删除复用资料保存能力，性别仍由原 radio-group 业务绑定驱动', () => {
    const source = read('miniprogram/pages/profile-edit/index.ts');
    const template = read('miniprogram/pages/profile-edit/index.wxml');
    const styles = read('miniprogram/pages/profile-edit/index.wxss');

    expect(template).toContain('bindtap="removeBackgroundPhoto"');
    expect(source).toContain('removeBackgroundPhoto()');
    expect(source).toContain('this.data.p.backgroundPhoto = null');
    expect(source).toContain('backgroundPhoto:');
    expect(template).toContain('<radio-group class="gender-options" bindchange="selectGender">');
    expect(template).toContain("p.gender === '男' ? 'is-selected' : ''");
    expect(template).toContain("p.gender === '女' ? 'is-selected' : ''");
    expect(styles).toMatch(
      /\.gender-option\.is-selected\s*\{[^}]*background:\s*var\(--color-action\);[^}]*color:\s*var\(--color-on-action\)/s,
    );
    expect(template).toContain('背景图加载中…');
    expect(template).toContain('图片加载失败，点击重试');
    expect(styles).toMatch(/\.photo-remove\s*\{[^}]*min-height:\s*88rpx/s);
    expect(styles).toMatch(
      /\.photo-remove\s*\{[^}]*background:\s*var\(--color-danger-soft\)(?:\s*!important)?;[^}]*color:\s*var\(--color-danger-text\)/s,
    );
    expect(styles).toContain('animation: photo-loading-spin 0.9s linear infinite');
  });

  it('静态媒体就绪文案不会触发开发者工具全屏播报遮罩', () => {
    const appStyles = read('miniprogram/app.wxss');
    const profileTemplate = read('miniprogram/pages/profile-edit/index.wxml');
    const clubTemplate = read('miniprogram/pages/admin/club-application-detail/index.wxml');
    const profileStatusTags =
      profileTemplate.match(/<view\b[^>]*class="[^"]*upload-status[^"]*"[^>]*>/g) || [];
    const clubStatusTags =
      clubTemplate.match(/<view\b[^>]*class="[^"]*upload-status[^"]*"[^>]*>/g) || [];

    expect(profileStatusTags).toHaveLength(2);
    expect(profileStatusTags.every((tag: string) => !tag.includes('role="status"'))).toBe(true);
    expect(clubStatusTags.every((tag: string) => !tag.includes('role="status"'))).toBe(true);
    expect(profileTemplate).toMatch(
      /wx:if="{{avatarBusy \|\| photoBusy}}"[^>]*class="a11y-live-region"[^>]*role="status"/,
    );
    expect(clubTemplate).toMatch(
      /wx:if="{{uploading}}"[^>]*class="a11y-live-region"[^>]*role="status"/,
    );
    expect(appStyles).toContain('.image-item > .upload-status {');
    expect(appStyles).not.toMatch(/(?:^|\n)\.upload-status\s*\{/);
  });

  it('俱乐部资料根容器不与页面内容重复叠加左右页边距', () => {
    const styles = read('miniprogram/pages/admin/club-application-detail/index.wxss');
    expect(styles).toMatch(/\.club-profile-page\s*\{[^}]*padding:\s*0 0 calc\(/s);
    expect(styles).toMatch(/\.content\s*\{[^}]*padding:\s*0 var\(--page-gutter\)/s);
  });
});
