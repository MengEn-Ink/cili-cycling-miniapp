// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (file: string) => readFileSync(file, 'utf8');

describe('移动端视觉排版约束', () => {
  it('活动卡在组件样式隔离下仍完整定义三列指标与按钮，不依赖 app.wxss 穿透', () => {
    const styles = read('miniprogram/components/activity-card/index.wxss');

    expect(styles).toMatch(
      /\.metrics\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/s,
    );
    expect(styles).toMatch(/\.metric-item\s*\{[^}]*min-width:\s*0;[^}]*text-align:\s*center;/s);
    expect(styles).toMatch(
      /\.metric-value\s*\{[^}]*font-variant-numeric:\s*tabular-nums;[^}]*white-space:\s*nowrap;/s,
    );
    expect(styles).toMatch(
      /\.card-action\s*\{[^}]*display:\s*flex;[^}]*justify-content:\s*center;[^}]*box-sizing:\s*border-box;[^}]*white-space:\s*nowrap;/s,
    );
  });

  it('活动卡核心标题与集合地点优先保持单行，空间不足时使用省略号', () => {
    const styles = read('miniprogram/components/activity-card/index.wxss');

    expect(styles).toMatch(
      /\.activity-title\s*\{[^}]*text-overflow:\s*ellipsis;[^}]*white-space:\s*nowrap;/s,
    );
    expect(styles).toMatch(
      /\.route-line\s*\{[^}]*text-overflow:\s*ellipsis;[^}]*white-space:\s*nowrap;/s,
    );
    expect(styles).not.toMatch(/\.activity-title\s*\{[^}]*min-height:\s*104rpx/s);
  });

  it('日期入口与路线核心数据采用居中对齐，数值和单位不被拆行', () => {
    const activities = read('miniprogram/pages/activities/index.wxss');
    const detail = read('miniprogram/pages/activity-detail/index.wxss');

    expect(activities).toMatch(
      /\.day-chip\s*\{[^}]*align-items:\s*center;[^}]*text-align:\s*center;/s,
    );
    expect(detail).toMatch(/\.route-native-metrics > view\s*\{[^}]*text-align:\s*center;/s);
    expect(detail).toMatch(
      /\.route-native-metrics > view > text:first-child\s*\{[^}]*overflow:\s*hidden;[^}]*text-overflow:\s*ellipsis;[^}]*white-space:\s*nowrap;/s,
    );
    expect(detail).toMatch(
      /\.route-estimate text:last-child\s*\{[^}]*min-width:\s*0;[^}]*overflow:\s*hidden;[^}]*text-overflow:\s*ellipsis;[^}]*white-space:\s*nowrap;/s,
    );
  });

  it('隐私说明作为独立信息卡展示，不打断常用服务操作列表', () => {
    const template = read('miniprogram/pages/profile/index.wxml');
    expect(template).toContain('</button>\n  </view>\n  <view class="privacy-note">');
    expect(template.indexOf('class="privacy-note"')).toBeGreaterThan(
      template.indexOf('bindtap="openSettings"'),
    );
  });
});
