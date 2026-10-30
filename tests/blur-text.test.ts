// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// blur-text 在五维审计下零生产渲染，行为锁定用例已由统一死守卫接管；此处只守删除事实。
// 完整守卫见 tests/components-dead-guard.test.ts（目录缺失 / 无注册 / 无标签 / 存活组件可解析）。
describe('blur-text 死组件已从生产移除', () => {
  it('组件目录与四个源文件不再存在', () => {
    expect(existsSync('miniprogram/components/blur-text')).toBe(false);
  });
});
