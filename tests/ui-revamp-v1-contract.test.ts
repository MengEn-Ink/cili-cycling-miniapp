// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');
const appJson = JSON.parse(read('miniprogram/app.json')) as {
  pages: string[];
  subpackages: Array<{ root: string; pages: string[] }>;
};
const routes = [
  ...appJson.pages,
  ...appJson.subpackages.flatMap(({ root, pages }) => pages.map((page) => `${root}/${page}`)),
];

describe('UI 改版 V1 原生契约', () => {
  it('保持 17 条路由且 capability-card 仍为 switchTab redirect', () => {
    expect(routes).toHaveLength(17);
    expect(new Set(routes).size).toBe(17);
    expect(read('miniprogram/pages/capability-card/index.ts')).toContain(
      "url: '/pages/profile/index'",
    );
    expect(read('miniprogram/pages/capability-card/index.ts')).toContain('wx.switchTab');
  });

  it('17 个路由都声明内容先行布局，不引入后端调用', () => {
    for (const route of routes) {
      expect(read(`miniprogram/${route}.wxml`), route).toContain('data-v1-layout=');
    }
    const changedPresentation = routes.map((route) => read(`miniprogram/${route}.wxml`)).join('\n');
    expect(changedPresentation).not.toMatch(/wx\.cloud|callFunction|repository|rideService/);
  });

  it('首页保留 CTA 与首图 eager 策略，电影暗色版维持首屏信息密度与连续暗场', () => {
    const home = read('miniprogram/pages/activities/index.wxml');
    const homeStyle = read('miniprogram/pages/activities/index.wxss');
    const detailStyle = read('miniprogram/pages/activity-detail/index.wxss');
    expect(home).toContain('查看活动');
    expect(home).toContain('lazy-load="{{index !== 0}}"');
    expect(read('miniprogram/pages/activities/index.ts')).toContain(
      '每一次转弯，都有值得记住的风景。',
    );
    expect(homeStyle).toContain('padding-top: 60%');
    expect(detailStyle).toContain('aspect-ratio: 5 / 4');
    expect(detailStyle).toContain('margin: 0');
    expect(detailStyle).toContain('border-radius: 0');
    expect(detailStyle).toContain('box-shadow: none');
  });

  it('仅消费全局设计 token，并维持 44px 触控基线', () => {
    const appStyle = read('miniprogram/app.wxss');
    expect(appStyle).toContain('--control-height: 96rpx');
    expect(appStyle).toContain('--scrim-cover-strong:');
    expect(appStyle).toContain('--surface-sheet:');
    for (const route of routes) {
      const style = read(`miniprogram/${route}.wxss`);
      expect(style, route).not.toMatch(/#[\da-f]{3,8}\b|rgba?\(/i);
    }
  });
});
