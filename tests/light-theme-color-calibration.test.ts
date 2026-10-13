// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  contrast,
  declaration,
  effectiveBlock,
  expectSemantic,
  resolvedHex,
  uiTokens,
} from './theme-contract-helpers';

const read = (file: string) => readFileSync(file, 'utf8');

describe('核心页面统一明亮主题配色', () => {
  const appStyles = read('miniprogram/app.wxss');
  const profileStyles = read('miniprogram/pages/profile/index.wxss');
  const brandStyles = read('miniprogram/components/brand-logo/index.wxss');
  const detailStyles = read('miniprogram/pages/activity-detail/index.wxss');
  const tokens = uiTokens(appStyles);

  it.each([
    ['verified', '--color-success-text', '--color-success', '--color-success-soft'],
    ['partial', '--color-warning-text', '--color-warning', '--color-warning-soft'],
    ['syncing', '--color-warning-text', '--color-warning', '--color-warning-soft'],
    ['repair', '--color-danger-text', '--color-danger', '--color-danger-soft'],
  ])('%s 状态使用可读的语义前景、边框和背景', (tone, text, border, background) => {
    const block = effectiveBlock(
      profileStyles,
      `.profile-capability-section .hero-capability-status.status-${tone}`,
    );

    expectSemantic(declaration(block, 'color'), text);
    expectSemantic(declaration(block, 'border-color'), border);
    expectSemantic(declaration(block, 'background'), background);
    expect(
      contrast(resolvedHex(`var(${text})`, tokens), resolvedHex(`var(${background})`, tokens)),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it('个人中心品牌标识使用石墨黑底牌、暖灰白文字和橙色终点', () => {
    expect(read('miniprogram/pages/profile/index.wxml')).toContain(
      '<brand-logo compact="{{true}}"',
    );
    expectSemantic(
      declaration(effectiveBlock(brandStyles, '.brand-logo__wordmark'), 'background'),
      '--color-logo-background',
    );
    expectSemantic(
      declaration(effectiveBlock(brandStyles, '.brand-logo__wordmark'), 'color'),
      '--color-logo-foreground',
    );
    expect(brandStyles).toContain('border: 4rpx solid var(--color-logo-accent)');
    expect(
      contrast(
        resolvedHex('var(--color-logo-foreground)', tokens),
        resolvedHex('var(--color-logo-background)', tokens),
      ),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it('无媒体详情 Hero、集合位置与禁用操作保持语义层级', () => {
    expectSemantic(
      declaration(
        effectiveBlock(detailStyles, '.detail-hero:not(.detail-hero--media) .hero-kicker'),
        'color',
      ),
      '--color-brand',
    );
    expectSemantic(
      declaration(effectiveBlock(detailStyles, '.meeting-location__label'), 'color'),
      '--color-media-muted',
    );
    const disabled = effectiveBlock(detailStyles, '.detail-action .btn[disabled]');
    expectSemantic(declaration(disabled, 'border-color'), '--color-border');
    expectSemantic(declaration(disabled, 'background'), '--color-raised');
    expectSemantic(declaration(disabled, 'color'), '--color-muted');
    expect(
      contrast(
        resolvedHex('var(--color-muted)', tokens),
        resolvedHex('var(--color-raised)', tokens),
      ),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it('白底热门爬坡标签使用近黑文字和品牌软底', () => {
    const block = effectiveBlock(detailStyles, '.climb-popularity');
    expect(declaration(block, 'border')).toContain('var(--color-brand)');
    expectSemantic(declaration(block, 'background'), '--color-brand-soft');
    expectSemantic(declaration(block, 'color'), '--color-text');
  });

  it('媒体面骑友状态使用白色高对比描边', () => {
    const block = effectiveBlock(detailStyles, '.rider-status');
    expect(declaration(block, 'border')).toContain('currentColor');
    expectSemantic(declaration(block, 'color'), '--color-on-media');
  });
});
