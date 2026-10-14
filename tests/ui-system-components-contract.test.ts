// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('UI 重构通用组件契约', () => {
  it('通用组件复用现有圆角、颜色和触控令牌', () => {
    const styles = read('miniprogram/app.wxss');

    for (const token of ['--radius-sm', '--radius-card', '--control-height']) {
      expect(styles).toContain(token);
    }
  });

  it('头像组件在远端图片失败时回退品牌物料并透传事件', () => {
    const template = read('miniprogram/components/cili-avatar/index.wxml');
    const script = read('miniprogram/components/cili-avatar/index.ts');

    expect(template).toContain('wx:if="{{src && !imageFailed}}"');
    expect(template).toContain('src="/assets/brand/logo-circle-144.png"');
    expect(template).toContain('aria-label="{{ariaLabel}}"');
    expect(script).toContain('this.setData({ imageFailed: true })');
    expect(script).toContain("this.triggerEvent('error'");
    expect(script).toContain("this.triggerEvent('tap'");
  });

  it('指标组件只消费展示数据并支持窄屏列数', () => {
    const template = read('miniprogram/components/metric-grid/index.wxml');
    const script = read('miniprogram/components/metric-grid/index.ts');
    const styles = read('miniprogram/components/metric-grid/index.wxss');

    expect(script).toContain('items: { type: Array');
    expect(script).toContain('narrowColumns: { type: Number');
    expect(script).not.toMatch(/Repository|ride-service|wx\.cloud/);
    expect(template).toContain('wx:for="{{items}}"');
    expect(template).toContain('metric-grid--narrow-{{narrowColumns}}');
    expect(styles).toContain('@media (max-width: 340px)');
  });

  it('详情与个人资料页注册并使用通用组件', () => {
    const detailConfig = read('miniprogram/pages/activity-detail/index.json');
    const detailTemplate = read('miniprogram/pages/activity-detail/index.wxml');
    const profileConfig = read('miniprogram/pages/profile/index.json');
    const profileTemplate = read('miniprogram/pages/profile/index.wxml');

    expect(detailConfig).toContain('"metric-grid": "/components/metric-grid/index"');
    expect(detailTemplate).toContain('<metric-grid class="metric-panel"');
    expect(profileConfig).toContain('"cili-avatar": "/components/cili-avatar/index"');
    expect(profileTemplate).toContain('<cili-avatar');
  });
});
