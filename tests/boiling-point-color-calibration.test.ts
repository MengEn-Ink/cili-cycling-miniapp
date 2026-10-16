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

describe('核心页面沸点浅色主题配色', () => {
  const appStyles = read('miniprogram/app.wxss');
  const brandStyles = read('miniprogram/components/brand-logo/index.wxss');
  const detailStyles = read('miniprogram/pages/activity-detail/index.wxss');
  const pillStyles = read('miniprogram/components/status-pill/index.wxss');
  const tokens = uiTokens(appStyles);

  it.each([
    ['success', '--color-status-success', '--color-status-success-soft'],
    ['warning', '--color-status-warning', '--color-status-warning-soft'],
  ])('%s 状态使用可读的语义前景、边框和背景', (tone, foreground, background) => {
    const block = effectiveBlock(pillStyles, `.pill--${tone}`);
    expect(declaration(block, 'border')).toContain(`var(${foreground})`);
    expectSemantic(declaration(block, 'color'), foreground);
    expectSemantic(declaration(block, 'background'), background);
    expect(
      contrast(
        resolvedHex(`var(${foreground})`, tokens),
        resolvedHex(`var(${background})`, tokens),
      ),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it.each(['已驳回', '已取消'])('%s 使用品牌红危险语义而不回退旧状态色', (status) => {
    const template = read('miniprogram/components/status-pill/index.wxml');
    const block = effectiveBlock(pillStyles, '.pill--danger');
    expect(template).toContain(`status === '${status}'`);
    expectSemantic(declaration(block, 'color'), '--color-brand-active');
    expect(declaration(block, 'border')).toContain('var(--color-brand)');
    expectSemantic(declaration(block, 'background'), '--color-surface');
    expect(
      contrast(tokens['--color-brand-active'], tokens['--color-surface']),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it('媒体表面保持白字高对比，辅助文字也不低于正文门槛', () => {
    expect(
      contrast(tokens['--color-on-media'], tokens['--color-media-card-bg']),
    ).toBeGreaterThanOrEqual(7);
    expect(
      contrast(tokens['--color-media-muted'], tokens['--color-media-card-bg']),
    ).toBeGreaterThanOrEqual(4.5);
    const generatedCoverStyles = readFileSync(
      'miniprogram/components/generated-activity-cover/index.wxss',
      'utf8',
    );
    expect(generatedCoverStyles).toMatch(
      /\.generated-cover__eyebrow,[\s\S]*?color:\s*var\(--color-media-muted\)/,
    );
  });

  it('品牌软底只承载品牌语义且正文保持可读', () => {
    expect(tokens['--color-brand-soft']).toBe('#fcebea');
    expect(contrast(tokens['--color-text'], tokens['--color-brand-soft'])).toBeGreaterThanOrEqual(
      7,
    );
    expect(tokens['--color-brand']).not.toBe(tokens['--color-status-success']);
    expect(tokens['--color-brand']).not.toBe(tokens['--color-status-warning']);
  });

  it('个人中心品牌标识使用墨黑底牌、白色文字和品牌红终点', () => {
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
      contrast(tokens['--color-logo-foreground'], tokens['--color-logo-background']),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it('集合位置、禁用操作和成功反馈保持语义层级', () => {
    expectSemantic(
      declaration(effectiveBlock(detailStyles, '.meeting-location__label'), 'color'),
      '--color-muted',
    );
    const disabled = effectiveBlock(appStyles, '.btn[disabled]');
    expect(declaration(disabled, 'border-color')).toContain('var(--color-border)');
    expect(declaration(disabled, 'background')).toContain('var(--color-raised)');
    expect(declaration(disabled, 'color')).toContain('var(--color-disabled-text)');
    expect(
      contrast(tokens['--color-disabled-text'], tokens['--color-raised']),
    ).toBeGreaterThanOrEqual(4.5);
    const success = effectiveBlock(detailStyles, '.inline-feedback--success');
    expectSemantic(declaration(success, 'color'), '--color-status-success');
    expectSemantic(declaration(success, 'background'), '--color-status-success-soft');
  });
});
