// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { declaration, effectiveBlock, rpx } from './theme-contract-helpers';

const read = (file: string) => readFileSync(file, 'utf8');

describe('方案 A 编辑式性能布局', () => {
  it('活动列表把首场活动提升为主视觉，其余活动复用紧凑卡片', () => {
    const list = read('miniprogram/pages/activities/index.wxml');
    const component = read('miniprogram/components/activity-card/index.ts');
    const card = read('miniprogram/components/activity-card/index.wxml');
    const styles = read('miniprogram/components/activity-card/index.wxss');

    expect(list).toContain('featured="{{index === 0}}"');
    expect(component).toMatch(/featured:\s*\{\s*type:\s*Boolean,\s*value:\s*false\s*\}/);
    expect(card).toContain("featured ? 'activity-card--featured' : 'activity-card--compact'");
    expect(card).toContain('class="card-identity"');
    expect(styles).toMatch(/\.activity-card--featured \.card-media\s*\{/);
    expect(styles).toMatch(/\.activity-card--compact\s*\{/);
    expect(styles).toMatch(/\.activity-card--compact \.card-media\s*\{/);
  });

  it('活动详情以媒体 Hero 和报名决策摘要建立首屏层级', () => {
    const template = read('miniprogram/pages/activity-detail/index.wxml');
    const styles = read('miniprogram/pages/activity-detail/index.wxss');

    expect(template).toContain('class="detail-decision"');
    expect(template).toContain('{{activityAction.label}}');
    expect(template).toContain("{{deadlineTime || '待公布'}}");
    expect(template.indexOf('class="detail-decision"')).toBeLessThan(
      template.indexOf('class="card time-card"'),
    );
    expect(styles).toMatch(/\.detail-hero--media\s*\{[^}]*min-height:\s*640rpx/s);
    expect(styles).toMatch(/\.detail-decision\s*\{[^}]*border-left:\s*6rpx solid/s);
  });

  it('个人页把照片身份、骑行能力和资料完整度拆成连续层级', () => {
    const template = read('miniprogram/pages/profile/index.wxml');
    const styles = read('miniprogram/pages/profile/index.wxss');

    expect(template).toContain('class="profile-capability-section"');
    expect(template.indexOf('class="profile-capability-section"')).toBeGreaterThan(
      template.indexOf('</view>\n\n  <view class="profile-capability-section"'),
    );
    expect(template).toContain('hero-capability-card {{cardExpanded');
    expect(template).toContain('class="hero-profile-progress"');
    expect(styles).toMatch(/\.profile-capability-section\s*\{/);
    expect(styles).toMatch(/\.profile-capability-section \.hero-capability-card\s*\{/);
    expect(styles).toMatch(/\.profile-hero\.has-bg\s*\{[^}]*min-height:\s*640rpx/s);
  });

  it('活动卡和详情页操作按钮使用统一高度与双轴居中', () => {
    const cardStyles = read('miniprogram/components/activity-card/index.wxss');
    const detailStyles = read('miniprogram/pages/activity-detail/index.wxss');
    const cardCta = effectiveBlock(cardStyles, '.card-cta');

    expect(declaration(cardCta, 'display')).toBe('flex');
    expect(declaration(cardCta, 'align-items')).toBe('center');
    expect(declaration(cardCta, 'justify-content')).toBe('center');
    expect(declaration(cardCta, 'width')).toBe('176rpx');
    expect(declaration(cardCta, 'height')).toBe('88rpx');
    expect(rpx(cardCta, 'min-height')).toBe(88);

    for (const selector of ['.route-actions button', '.route-location-row button']) {
      const button = effectiveBlock(detailStyles, selector);
      expect(declaration(button, 'display'), selector).toBe('flex');
      expect(declaration(button, 'align-items'), selector).toBe('center');
      expect(declaration(button, 'justify-content'), selector).toBe('center');
      expect(rpx(button, 'min-height'), selector).toBeGreaterThanOrEqual(88);
      expect(declaration(button, 'line-height'), selector).toBe('1.3');
    }

    const fixedAction = effectiveBlock(detailStyles, '.detail-action .btn');
    expect(declaration(fixedAction, 'display')).toBe('flex');
    expect(declaration(fixedAction, 'align-items')).toBe('center');
    expect(declaration(fixedAction, 'justify-content')).toBe('center');
    expect(rpx(fixedAction, 'min-height')).toBe(96);

    const closeButton = effectiveBlock(detailStyles, '.rider-card-close');
    expect(declaration(closeButton, 'display')).toBe('flex');
    expect(declaration(closeButton, 'align-items')).toBe('center');
    expect(declaration(closeButton, 'justify-content')).toBe('center');
    expect(declaration(closeButton, 'width')).toBe('var(--control-height)');
    expect(declaration(closeButton, 'height')).toBe('var(--control-height)');
  });
});
