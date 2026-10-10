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
  themeTokens,
} from './theme-contract-helpers';

const app = read('miniprogram/app.wxss');
const dark = themeTokens(app, 'dark');
const light = themeTokens(app, 'light');

function expectLightContrast(foreground: string, background: string, minimum = 4.5): void {
  expect(
    contrast(resolvedHex(foreground, light), resolvedHex(background, light)),
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

describe('HP-20261009-06 浅色主题全页对比度契约', () => {
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
    ] as const) {
      expectLightContrast(`var(${foreground})`, `var(${background})`, minimum);
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
    const edit = effectiveBlock(profile, '.theme-light .edit-button');
    expectSemantic(declaration(edit, 'background'), '--color-text');
    expectSemantic(declaration(edit, 'color'), '--color-bg');

    const form = read('miniprogram/pages/profile-edit/index.wxss');
    expectPair(
      'miniprogram/pages/profile-edit/index.wxss',
      '.profile-form-page .form-card',
      '--color-text',
      '--color-surface',
    );
    expectSemantic(
      declaration(effectiveBlock(form, '.profile-form-page .form-error'), 'color'),
      '--color-danger-text',
    );
    expectPair(
      'miniprogram/pages/profile-edit/index.wxss',
      '.photo-preview-button',
      '--color-text',
      '--color-media-placeholder-bg',
    );
    expectSemantic(
      declaration(effectiveBlock(form, '.photo-placeholder'), 'color'),
      '--color-media-muted',
    );
    const disabled = effectiveBlock(form, '.theme-light .avatar-action[disabled]');
    expectSemantic(declaration(disabled, 'background'), '--color-raised');
    expectSemantic(declaration(disabled, 'color'), '--color-muted');
  });

  it('registrations 与 activity-card 的卡片正文、辅助信息和 CTA 可读', () => {
    expectPair(
      'miniprogram/pages/registrations/index.wxss',
      '.registration-card',
      '--color-text',
      '--color-surface',
    );
    const registrations = read('miniprogram/pages/registrations/index.wxss');
    for (const selector of [
      '.heading-count',
      '.refresh-note',
      '.card-index',
      '.registration-meta',
      '.updated-at',
    ]) {
      expectSemantic(
        declaration(effectiveBlock(registrations, selector), 'color'),
        '--color-muted',
      );
    }

    const card = read('miniprogram/components/activity-card/index.wxss');
    expectPair(
      'miniprogram/components/activity-card/index.wxss',
      '.activity-card',
      '--color-text',
      '--color-surface',
    );
    expectSemantic(declaration(effectiveBlock(card, '.metric-unit'), 'color'), '--color-muted');
    expectSemantic(declaration(effectiveBlock(card, '.card-cta'), 'color'), '--color-on-brand');
  });

  it('activity-detail 的无图 Hero、费用和骑友徽标使用可读语义色', () => {
    const detail = read('miniprogram/pages/activity-detail/index.wxss');
    expectSemantic(
      declaration(
        effectiveBlock(detail, '.detail-hero:not(.detail-hero--media) .hero-route'),
        'color',
      ),
      '--color-muted',
    );
    expectSemantic(
      declaration(effectiveBlock(detail, '.fee-included'), 'color'),
      '--color-success-text',
    );
    expectSemantic(
      declaration(effectiveBlock(detail, '.fee-excluded'), 'color'),
      '--color-danger-text',
    );
    expectSemantic(
      declaration(effectiveBlock(detail, '.rider-card .gender-pill.gender-male'), 'color'),
      '--color-gender-male',
    );
    expectSemantic(
      declaration(effectiveBlock(detail, '.rider-card .gender-pill.gender-female'), 'color'),
      '--color-gender-female',
    );
  });

  it('扫描出的活动编辑、报名表单和凭证页风险均接入语义状态色', () => {
    expectPair(
      'miniprogram/pages/admin/activity-edit/index.wxss',
      '.error-summary',
      '--color-danger-text',
      '--color-danger-soft',
    );
    const activityEdit = read('miniprogram/pages/admin/activity-edit/index.wxss');
    expectSemantic(
      declaration(effectiveBlock(activityEdit, '.field-error-copy'), 'color'),
      '--color-danger-text',
    );
    expectSemantic(
      declaration(effectiveBlock(activityEdit, '.required'), 'color'),
      '--color-danger-text',
    );

    expectPair(
      'miniprogram/pages/registration-form/index.wxss',
      '.error-card',
      '--color-danger-text',
      '--color-danger-soft',
    );
    const registration = read('miniprogram/pages/registration-form/index.wxss');
    expect(
      declaration(effectiveBlock(registration, '.form-page button[disabled]'), 'opacity'),
    ).toBe('1');
    expectPair(
      'miniprogram/pages/registration-form/index.wxss',
      '.status-ready .readiness-badge',
      '--color-success-text',
      '--color-success-soft',
    );

    const credential = read('miniprogram/pages/credential/index.wxss');
    const waiting = effectiveBlock(credential, '.status-waiting');
    expectSemantic(declaration(waiting, 'background'), '--color-warning-soft');
    expectSemantic(declaration(waiting, 'border-color'), '--color-warning');
  });

  it('共享状态与跨页性别徽标不再依赖浅色背景上的硬编码亮色', () => {
    for (const [selector, foreground, background] of [
      ['.pill--success', '--color-success-text', '--color-success-soft'],
      ['.pill--warning', '--color-warning-text', '--color-warning-soft'],
      ['.pill--danger', '--color-danger-text', '--color-danger-soft'],
    ] as const) {
      expectPair('miniprogram/components/status-pill/index.wxss', selector, foreground, background);
    }

    const review = read('miniprogram/pages/admin/review-detail/index.wxss');
    expectSemantic(
      declaration(
        effectiveBlock(review, '.capability-card.gender-male .fact:first-child strong'),
        'color',
      ),
      '--color-gender-male',
    );
    expectSemantic(
      declaration(
        effectiveBlock(review, '.capability-card.gender-female .fact:first-child strong'),
        'color',
      ),
      '--color-gender-female',
    );

    const capability = read('miniprogram/pages/capability-card/index.wxss');
    expectSemantic(
      declaration(effectiveBlock(capability, '.rider-card'), 'background'),
      '--color-media-card-bg',
    );
    for (const [tone, token] of [
      ['male', '--color-on-media-gender-male'],
      ['female', '--color-on-media-gender-female'],
      ['unknown', '--color-on-media-gender-unknown'],
    ] as const) {
      expectSemantic(
        declaration(effectiveBlock(capability, `.rider-card.gender-${tone} .gender-pill`), 'color'),
        token,
      );
      expectSemantic(
        declaration(
          effectiveBlock(capability, `.rider-card.gender-${tone} .alpine-fallback .fallback-mark`),
          'color',
        ),
        token,
      );
    }

    expect(dark['--color-on-media-gender-male']).toBe('#4fb3a7');
    expect(dark['--color-on-media-gender-female']).toBe('#ef8072');
    expect(dark['--color-on-media-gender-unknown']).toBe('#e9743f');
  });
});
