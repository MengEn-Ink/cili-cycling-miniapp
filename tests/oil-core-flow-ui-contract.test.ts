// @ts-expect-error Vitest provides the Node runtime used by this repository.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  createOrganizerView,
  createRouteDifficultyHint,
} from '../miniprogram/pages/activity-detail/view-model';
import { createRegistrationStatusView } from '../miniprogram/pages/credential/status-view';

const read = (path: string) => readFileSync(path, 'utf8');

describe('2026-10-21 活动核心链路 UI 契约', () => {
  it('活动发现页以原生事件切换竖向影像和紧凑视图，两种视图都复用真实活动字段', () => {
    const page = read('miniprogram/pages/activities/index.ts');
    const template = read('miniprogram/pages/activities/index.wxml');

    expect(page).toContain("layoutMode: 'card' as 'card' | 'compact'");
    expect(page).toContain("if (mode !== 'card' && mode !== 'compact') return");
    expect(template).toContain('data-mode="card" bindtap="switchLayout"');
    expect(template).toContain('data-mode="compact" bindtap="switchLayout"');
    expect(template).toContain('wx:if="{{layoutMode === \'card\'}}"');
    expect(template).toContain('wx:else class="compact-list"');
    expect(template).toContain('class="activity-story-list"');
    expect(template).toContain('wx:for="{{items}}"');
    expect(template).toContain('data-id="{{item.id}}" bindtap="open"');
    expect(template).toContain('{{item.route.start');
    expect(template).toContain('item.route.distanceKm');
    expect(template).toContain('item.route.elevationM');
  });

  it('紧凑视图有下一页时提供原生加载更多入口', () => {
    const template = read('miniprogram/pages/activities/index.wxml');

    expect(template).toContain('wx:if="{{nextCursor && items.length}}"');
    expect(template).toContain('bindtap="loadMore"');
    expect(template).toContain("refreshError ? '重试加载更多活动' : '加载更多活动'");
  });

  it('组织可信信息只由发布者和活动归属字段生成，并诚实降级', () => {
    expect(
      createOrganizerView({
        publisher: { nickname: '领骑小周', avatarUrl: 'publisher.png' },
        clubIdentity: { name: '此里俱乐部', avatarUrl: 'club.png' },
      }),
    ).toEqual({
      visible: true,
      name: '领骑小周',
      role: '活动发布者',
      clubName: '此里俱乐部',
      avatarUrl: 'publisher.png',
    });
    expect(
      createOrganizerView({
        publisher: { nickname: '领骑小周', avatarUrl: '' },
        clubIdentity: { name: '此里俱乐部', avatarUrl: 'club.png' },
      }),
    ).toMatchObject({
      name: '领骑小周',
      role: '活动发布者',
      avatarUrl: '',
    });
    expect(
      createOrganizerView({ clubIdentity: { name: '此里俱乐部', avatarUrl: 'club.png' } }),
    ).toEqual({
      visible: true,
      name: '此里俱乐部',
      role: '活动归属',
      clubName: '此里俱乐部',
      avatarUrl: 'club.png',
    });
    expect(createOrganizerView({})).toMatchObject({ visible: false, name: '', clubName: '' });
  });

  it('路线难度解释优先展示已有标注和指标，缺字段时不编造', () => {
    expect(createRouteDifficultyHint({ level: '进阶', distanceKm: 68, elevationM: 1200 })).toBe(
      '难度“进阶”由组织者标注，请结合68 km、爬升 1200 m判断是否适合',
    );
    expect(createRouteDifficultyHint({ distanceKm: 30 })).toBe(
      '组织者未标注难度，请结合30 km判断是否适合',
    );
    expect(createRouteDifficultyHint({})).toBe('组织者未标注难度，请结合自身能力判断是否适合');

    const template = read('miniprogram/pages/activity-detail/index.wxml');
    expect(template).toContain('wx:if="{{organizerView.visible}}"');
    expect(template).toContain('路线强度说明');
    expect(template).toContain('wx:if="{{hasRouteDetails}}"');
    expect(template).toContain('完整路线分析');
    expect(template).toContain('bindtap="openRouteAnalysis"');
    expect(template).not.toContain('暂无有效路线轮廓');
    expect(template).not.toContain('暂无有效海拔数据');
  });

  it('报名页绑定禁用、加载、成功和失败反馈', () => {
    const page = read('miniprogram/pages/registration-form/index.ts');
    const template = read('miniprogram/pages/registration-form/index.wxml');

    expect(template).toContain('loading="{{submitting}}"');
    expect(template).toContain('disabled="{{loading || submitting || !!submitBlockedHint}}"');
    expect(template).toContain('{{submitFeedback}}');
    expect(page).toContain("submitFeedback: '正在提交报名，请稍候'");
    expect(page).toContain("submitFeedback: '报名已提交，正在打开报名凭证'");
    expect(page).toContain("wx.showToast?.({ title: '报名已提交', icon: 'success'");
    expect(page).toContain('submitFeedback: `报名提交失败：${message}`');
  });

  it.each([
    ['waiting', '候补排队中', 'warning'],
    ['pending', '组织者审核中', 'warning'],
    ['approved', '报名已通过', 'success'],
    ['checked_in', '签到已完成', 'success'],
    ['rejected', '报名未通过', 'warning'],
    ['cancelled', '报名已取消', 'muted'],
    ['unknown', '报名状态待确认', 'muted'],
  ])('凭证状态 %s 有明确下一步反馈', (status, title, tone) => {
    expect(createRegistrationStatusView(status)).toMatchObject({ title, tone });
    expect(createRegistrationStatusView(status).hint.length).toBeGreaterThan(8);
  });

  it('完整路线页保留分段、关键点与海拔联动，无数据时由详情页降级', () => {
    const routePage = read('miniprogram/pages/route-analysis/index.ts');
    const routeTemplate = read('miniprogram/pages/route-analysis/index.wxml');
    expect(routeTemplate).toContain('bindtap="selectSegment"');
    expect(routeTemplate).toContain('bindtap="selectPoint"');
    expect(routePage).toContain('selectedSegmentId');
    expect(routePage).toContain('...mapState(this.analysis, segment)');
    expect(routeTemplate).toContain('wx:if="{{profileAvailable}}"');
  });

  it('本次视觉仅消费既有语义 token，并保留减弱动态效果', () => {
    for (const path of [
      'miniprogram/pages/activities/index.wxss',
      'miniprogram/pages/activity-detail/index.wxss',
      'miniprogram/pages/credential/index.wxss',
    ]) {
      const styles = read(path);
      expect(styles).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
    }
    const activityCard = read('miniprogram/components/activity-card/index.wxss');
    expect(activityCard).toContain('@media (prefers-reduced-motion: reduce)');
    expect(activityCard).toContain('min-height: 88rpx');
  });
});
