// @ts-expect-error 仓库有意不引入 Node 类型；Vitest 运行时提供文件读取能力。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('Oil UI 全页面高信息密度交互方案', () => {
  it('从研发交付中心提供唯一入口并覆盖 17 个页面', () => {
    const center = read('docs/delivery-center.js');
    const prototype = read('docs/designs/2026-10-22-oil-ui-high-density/app.js');

    expect(center).toContain("id: 'oil-ui-high-density'");
    expect(center).toContain("href: './designs/2026-10-22-oil-ui-high-density/index.html'");
    expect(prototype.match(/\{g:/g)).toHaveLength(17);
    expect(prototype).toContain("r:'pages/admin/club-application-detail/index'");
  });

  it('沿用沸点布局并把密度调整限制在间距层', () => {
    const appStyles = read('miniprogram/app.wxss');
    const contract = JSON.parse(read('docs/design-contract.json')) as {
      tokens: Record<string, unknown>;
    };
    const prototypeStyles = read('docs/designs/2026-10-22-oil-ui-high-density/styles.css');

    expect(appStyles).toContain('--page-gutter: 28rpx;');
    expect(appStyles).toContain('--card-gap: 20rpx;');
    expect(appStyles).toContain('--card-padding: var(--space-4);');
    expect(appStyles).toContain('--control-height: 96rpx;');
    expect(contract.tokens['--page-gutter']).toEqual({ miniapp: '28rpx', pages: '14px' });
    expect(contract.tokens['--card-gap']).toEqual({ miniapp: '20rpx', pages: '10px' });
    expect(prototypeStyles).toContain('布局基线：原沸点稿 · 变体：高信息密度');
  });

  it('原型包含必要状态与可恢复失败路径', () => {
    const prototype = read('docs/designs/2026-10-22-oil-ui-high-density/app.js');

    for (const state of ['加载', '空', '失败', '弱网']) {
      expect(prototype).toContain(state);
    }
    expect(prototype).toContain('已保留当前页面和已填写内容，请检查网络后重试');
    expect(prototype).toContain('重新加载');
  });
});
