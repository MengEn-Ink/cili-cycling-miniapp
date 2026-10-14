// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  contrast,
  declaration,
  effectiveBlock,
  expectSemantic,
  read,
  resolvedHex,
  uiTokens,
} from './theme-contract-helpers';

const app = read('miniprogram/app.wxss');
const tokens = uiTokens(app);

function expectUiContrast(foreground: string, background: string, minimum = 4.5): void {
  expect(
    contrast(resolvedHex(foreground, tokens), resolvedHex(background, tokens)),
    `${foreground} on ${background}`,
  ).toBeGreaterThanOrEqual(minimum);
}

function expectPair(file: string, selector: string, foreground: string, background: string): void {
  const block = effectiveBlock(read(file), selector);
  expectSemantic(declaration(block, 'color'), foreground);
  expectSemantic(declaration(block, 'background'), background);
}

function wxmlFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(
    (entry: { name: string; isDirectory(): boolean; isFile(): boolean }) => {
      const path = `${directory}/${entry.name}`;
      if (entry.isDirectory()) return wxmlFiles(path);
      return entry.isFile() && entry.name.endsWith('.wxml') ? [path] : [];
    },
  );
}

describe('HP-20261010-02 统一明亮 UI 全页对比度契约', () => {
  it('语义 token 覆盖正文、占位符、禁用态、状态与性别徽标', () => {
    for (const [foreground, background, minimum] of [
      ['--color-text', '--color-bg', 4.5],
      ['--color-muted', '--color-surface', 4.5],
      ['--color-placeholder', '--color-input-bg', 4.5],
      ['--color-disabled-text', '--color-raised', 4.5],
      ['--color-danger-text', '--color-danger-soft', 4.5],
      ['--color-success-text', '--color-success-soft', 4.5],
      ['--color-warning-text', '--color-warning-soft', 4.5],
      ['--color-gender-male', '--color-surface', 4.5],
      ['--color-gender-female', '--color-surface', 4.5],
      ['--color-gender-unknown', '--color-surface', 4.5],
      ['--color-media-muted', '--color-media-placeholder-bg', 4.5],
      ['--color-on-media-gender-male', '--color-media-card-bg', 4.5],
      ['--color-on-media-gender-female', '--color-media-card-bg', 4.5],
      ['--color-on-media-gender-unknown', '--color-media-card-bg', 4.5],
      ['--color-on-brand', '--color-brand', 3],
      ['--color-on-action', '--color-action', 7],
    ] as const) {
      expectUiContrast(`var(${foreground})`, `var(${background})`, minimum);
    }
  });

  it('所有真实输入占位符显式接入高对比 placeholder class', () => {
    const files = wxmlFiles('miniprogram').sort();
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      for (const tag of read(file).match(
        /<(?:input|textarea)\b[^>]*\bplaceholder="[^"]*"[^>]*>/g,
      ) || []) {
        expect(tag, `${file}: ${tag}`).toContain('placeholder-class="input-placeholder"');
      }
    }
    expectSemantic(
      declaration(effectiveBlock(app, '.input-placeholder'), 'color'),
      '--color-placeholder',
    );
  });

  it('全局按钮禁用态不以透明度牺牲可读性', () => {
    const disabled = effectiveBlock(app, 'button[disabled]');
    expectSemantic(declaration(disabled, 'background'), '--color-raised');
    expectSemantic(declaration(disabled, 'color'), '--color-disabled-text');
    expect(declaration(disabled, 'opacity')).toBe('1');
  });

  it('profile 与 profile-edit 的操作、辅助文案、错误和禁用态保持语义色', () => {
    const profile = read('miniprogram/pages/profile/index.wxss');
    const profileMenu = effectiveBlock(profile, '.menu-card');
    expectSemantic(declaration(profileMenu, 'background'), '--color-surface');
    expectSemantic(declaration(profileMenu, 'color'), '--color-text');
    expectSemantic(declaration(effectiveBlock(app, '.muted'), 'color'), '--color-muted');

    const form = read('miniprogram/pages/profile-edit/index.wxss');
    const formCard = effectiveBlock(app, '.form-card');
    expectSemantic(declaration(formCard, 'color'), '--color-text');
    expectSemantic(declaration(formCard, 'background'), '--color-surface');
    expectSemantic(
      declaration(effectiveBlock(form, '.form-error'), 'color'),
      '--color-brand-active',
    );
    expectSemantic(
      declaration(effectiveBlock(form, '.photo-preview-button'), 'background'),
      '--color-raised',
    );
    expectSemantic(
      declaration(effectiveBlock(form, '.photo-placeholder'), 'color'),
      '--color-muted',
    );
    expectSemantic(
      declaration(effectiveBlock(app, 'button[disabled]'), 'background'),
      '--color-raised',
    );
    expectSemantic(
      declaration(effectiveBlock(app, 'button[disabled]'), 'color'),
      '--color-disabled-text',
    );
  });

  it('registrations 与 activity-card 的卡片正文、辅助信息和 CTA 可读', () => {
    const sharedCard = effectiveBlock(app, '.registration-card');
    expectSemantic(declaration(sharedCard, 'color'), '--color-text');
    expectSemantic(declaration(sharedCard, 'background'), '--color-surface');
    const registrations = read('miniprogram/pages/registrations/index.wxss');
    expectSemantic(
      declaration(effectiveBlock(registrations, '.heading-copy'), 'color'),
      '--color-muted',
    );
    expectSemantic(
      declaration(effectiveBlock(registrations, '.card-index'), 'color'),
      '--color-muted',
    );
    expectSemantic(
      declaration(effectiveBlock(registrations, '.meeting-label'), 'color'),
      '--color-media-muted',
    );

    const card = read('miniprogram/components/activity-card/index.wxss');
    expectSemantic(
      declaration(effectiveBlock(card, '.activity-card'), 'background'),
      '--color-surface',
    );
    expectSemantic(declaration(effectiveBlock(app, '.metric-unit'), 'color'), '--color-muted');
    expect(declaration(effectiveBlock(card, '.metrics'), 'grid-template-columns')).toBe(
      'repeat(3, minmax(0, 1fr))',
    );
    const template = read('miniprogram/components/activity-card/index.wxml');
    expect(template).not.toContain('RIDE DATE');
    expect(template).toContain('bindtap="open"');
    expect(template).toContain('card-action');
  });

  it('activity-detail 的集合、费用和骑友名片使用可读语义色', () => {
    const detail = read('miniprogram/pages/activity-detail/index.wxss');
    expectSemantic(
      declaration(effectiveBlock(detail, '.meeting-location__label'), 'color'),
      '--color-muted',
    );
    expectSemantic(
      declaration(effectiveBlock(detail, '.check'), 'color'),
      '--color-status-success',
    );
    expectSemantic(
      declaration(effectiveBlock(detail, '.rider-card-photo__identity'), 'color'),
      '--color-on-media',
    );
  });

  it('活动编辑、报名表单和凭证页风险均接入 V4 语义状态色', () => {
    const activityEdit = read('miniprogram/pages/admin/activity-edit/index.wxml');
    expect(activityEdit).toContain('class="card danger"');
    expectSemantic(declaration(effectiveBlock(app, '.danger'), 'color'), '--color-brand-active');
    expect(declaration(effectiveBlock(app, '.required'), 'border')).toBe(
      '4rpx solid var(--color-brand)',
    );

    const registration = read('miniprogram/pages/registration-form/index.wxss');
    expect(declaration(effectiveBlock(registration, '.error-card'), 'border')).toBe(
      '4rpx solid var(--color-brand)',
    );
    expect(
      declaration(effectiveBlock(registration, '.form-page button[disabled]'), 'opacity'),
    ).toBe('1');
    const credential = read('miniprogram/pages/credential/index.wxml');
    expect(credential).toContain('class="status-label">{{statusText}}');
    expect(credential).toContain("item.status === 'approved' || item.status === 'checked_in'");
  });

  it('共享状态与跨页性别徽标使用统一语义色', () => {
    for (const [selector, foreground, background] of [
      ['.pill--success', '--color-status-success', '--color-status-success-soft'],
      ['.pill--warning', '--color-status-warning', '--color-status-warning-soft'],
      ['.pill--danger', '--color-brand-active', '--color-surface'],
    ] as const) {
      expectPair('miniprogram/components/status-pill/index.wxss', selector, foreground, background);
    }

    expect(tokens['--color-gender-male']).toBe('var(--color-text)');
    expect(tokens['--color-gender-female']).toBe('var(--color-text)');

    const capability = read('miniprogram/pages/capability-card/index.wxss');
    expectSemantic(
      declaration(effectiveBlock(capability, '.card-visual'), 'background'),
      '--color-media-card-bg',
    );
    expect(declaration(effectiveBlock(capability, '.gender-pill'), 'border')).toBe(
      '2rpx solid var(--color-border-strong)',
    );
    expect(capability).toMatch(/\.fallback-logo\s*\{[^}]*position:\s*absolute/s);
    expect(tokens['--color-on-media-gender-male']).toBe('var(--color-on-media)');
    expect(tokens['--color-on-media-gender-female']).toBe('var(--color-on-media)');
    expect(tokens['--color-on-media-gender-unknown']).toBe('var(--color-on-media)');
  });

  it('开发者工具运行态暴露的活动管理标题与骑行名片指标保持高对比', () => {
    expectSemantic(declaration(effectiveBlock(app, 'page'), 'color'), '--color-text');

    const capability = read('miniprogram/pages/capability-card/index.wxss');
    expectSemantic(
      declaration(effectiveBlock(capability, '.card-visual'), 'background'),
      '--color-media-card-bg',
    );
    expectSemantic(
      declaration(effectiveBlock(capability, '.card-label'), 'color'),
      '--color-on-media',
    );
    expectSemantic(
      declaration(effectiveBlock(capability, '.card-caption'), 'color'),
      '--color-muted',
    );
    expectUiContrast('var(--color-on-media-gender-unknown)', 'var(--color-media-card-bg)', 4.5);
  });
});
