// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('Oil UI 交互与布局收敛', () => {
  it('保留三栏底部导航并统一全局交互 token', () => {
    const appJson = JSON.parse(read('miniprogram/app.json'));
    expect(appJson.tabBar.list.map((item: { text: string }) => item.text)).toEqual([
      '活动',
      '行程',
      '我的',
    ]);
    const appStyle = read('miniprogram/app.wxss');
    expect(appStyle).toContain('--motion-duration-fast');
    expect(appStyle).toContain('transform: scale(0.985)');
    expect(appStyle).toContain('.rowbutton:active');
  });

  it('活动详情使用异步状态卡并将费用前置到路线之前', () => {
    const detail = read('miniprogram/pages/activity-detail/index.wxml');
    expect(detail).toContain('<async-status-card');
    expect(detail.indexOf('<!-- 费用与名额前置')).toBeLessThan(detail.indexOf('<!-- 山路有迹可循'));
    const component = read(
      'miniprogram/pages/activity-detail/components/async-status-card/index.wxml',
    );
    expect(component).toContain('aria-live="polite"');
  });

  it('报名错误具备可定位锚点', () => {
    const form = read('miniprogram/pages/registration-form/index.wxml');
    const logic = read('miniprogram/pages/registration-form/index.ts');
    expect(form).toContain('id="registration-errors"');
    expect(logic).toContain("selector: '#registration-errors'");
  });
});
