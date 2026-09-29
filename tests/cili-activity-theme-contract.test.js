import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path) => fs.readFileSync(path, 'utf8');
const activities = read('miniprogram/pages/activities/index.wxml');
const detail = read('miniprogram/pages/activity-detail/index.wxml');
const themeSources = [
  read('miniprogram/app.wxss'),
  read('miniprogram/components/activity-card/index.wxss'),
  read('miniprogram/components/status-pill/index.wxss'),
  read('miniprogram/components/state-view/index.wxss'),
  read('miniprogram/pages/activities/index.wxss'),
  read('miniprogram/pages/activity-detail/index.wxss'),
].join('\n');

describe('CILI 活动页静态契约', () => {
  it('展示 CILI 文字标与 CSS 图形标', () => {
    expect(activities).toContain('class="cili-symbol"');
    expect(activities).toContain('class="brand-word">CILI');
    expect(activities).toContain('class="brand-cn">此里');
    expect(themeSources).toContain('.cili-symbol');
  });

  it('活动列表和详情继续渲染现有关键字段', () => {
    expect(activities).toContain('item="{{item}}"');
    expect(detail).toContain('{{item.title}}');
    expect(detail).toContain('{{item.date}}');
    expect(detail).toContain('{{item.route.distanceKm}}');
    expect(detail).toContain('{{item.route.elevationM}}');
    expect(detail).toContain('{{item.capacity}}');
    expect(detail).toContain('{{activityAction.label}}');
  });

  it('使用极黑与赛事橙红且不包含粉色主题', () => {
    expect(themeSources).toContain('#0b0b0c');
    expect(themeSources).toContain('#d55b1f');
    expect(themeSources).toContain('#c82018');
    expect(themeSources).not.toMatch(/pink|#ff69b4|#ffc0cb|#e91e63|#ec4899/i);
  });
});
