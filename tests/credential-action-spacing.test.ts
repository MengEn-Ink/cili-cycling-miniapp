// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('报名详情操作区间距', () => {
  it('两个操作按钮使用纵向布局并保持至少 16rpx 间距', () => {
    const style = readFileSync('miniprogram/pages/credential/index.wxss', 'utf8');
    expect(style).toMatch(
      /\.action-stack\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;[^}]*gap:\s*(?:1[6-9]|[2-9]\d)rpx;/s,
    );
  });
});
