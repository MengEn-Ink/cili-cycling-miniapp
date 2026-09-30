import { describe, expect, it } from 'vitest';
import {
  contrast,
  effectiveBlock,
  declaration,
  expectSemantic,
  read,
  resolvedHex,
  rpx,
  themeTokens,
} from './theme-contract-helpers';

const app = read('miniprogram/app.wxss');
const dark = themeTokens(app, 'dark');
const light = themeTokens(app, 'light');
const themes = [
  ['dark', dark],
  ['light', light],
] as const;

function expectThemeContrast(foreground: string, background: string, minimum = 4.5): void {
  for (const [name, tokens] of themes) {
    expect(
      contrast(resolvedHex(foreground, tokens), resolvedHex(background, tokens)),
      `${name} theme contrast for ${foreground} on ${background}`,
    ).toBeGreaterThanOrEqual(minimum);
  }
}

describe('theme accessibility regressions', () => {
  it('uses default dark tokens, a light override, and semantic page surfaces', () => {
    expect(dark['--color-bg']).toBe('#0b0b0c');
    expect(dark['--color-text']).toBe('#f7f7f5');
    expect(light['--color-bg']).toBe('#f4f2ed');
    expect(light['--color-text']).toBe('#151515');
    expect(contrast(light['--color-brand'], light['--color-bg'])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(light['--color-brand'], light['--color-surface'])).toBeGreaterThanOrEqual(4.5);

    const globalPage = effectiveBlock(app, 'page');
    expectSemantic(declaration(globalPage, 'background'), '--color-bg');
    expectSemantic(declaration(globalPage, 'color'), '--color-text');

    for (const [file, selector] of [
      ['miniprogram/pages/activities/index.wxss', '.activities-page'],
      ['miniprogram/pages/activity-detail/index.wxss', '.detail-page'],
      ['miniprogram/pages/profile/index.wxss', '.page.profile-page'],
      ['miniprogram/pages/registration-form/index.wxss', '.form-page'],
      ['miniprogram/pages/registrations/index.wxss', '.page.registrations-page'],
      ['miniprogram/pages/admin/review-detail/index.wxss', '.review-detail-page'],
    ] as const) {
      const block = effectiveBlock(read(file), selector);
      expectSemantic(declaration(block, 'background'), '--color-bg');
      expectSemantic(declaration(block, 'color'), '--color-text');
    }
  });

  it('keeps shared cards and muted copy readable in both themes', () => {
    const card = effectiveBlock(app, '.card');
    const muted = effectiveBlock(app, '.muted');
    expectSemantic(declaration(card, 'background'), '--color-surface');
    expectSemantic(declaration(card, 'color'), '--color-text');
    expectSemantic(declaration(muted, 'color'), '--color-muted');
    expectThemeContrast('var(--color-text)', 'var(--color-surface)');
    expectThemeContrast('var(--color-muted)', 'var(--color-bg)');
    expectThemeContrast('var(--color-muted)', 'var(--color-surface)');

    for (const file of [
      'miniprogram/pages/admin/activity-edit/index.wxml',
      'miniprogram/pages/credential/index.wxml',
      'miniprogram/pages/strava/index.wxml',
      'miniprogram/pages/profile-edit/index.wxml',
    ]) {
      expect(read(file)).toMatch(/class="[^"]*\b(?:card|muted)\b/);
    }

    const detail = read('miniprogram/pages/activity-detail/index.wxss');
    expectSemantic(
      declaration(effectiveBlock(detail, '.detail-page .card'), 'background'),
      '--color-surface',
    );
    expectSemantic(
      declaration(effectiveBlock(app, '.detail-page .muted'), 'color'),
      '--color-muted',
    );
    const form = read('miniprogram/pages/registration-form/index.wxss');
    expectSemantic(
      declaration(effectiveBlock(form, '.form-card'), 'background'),
      '--color-surface',
    );
    expectSemantic(declaration(effectiveBlock(form, '.form-card'), 'color'), '--color-text');
  });

  it('keeps shared form and status primitives semantic and readable in both themes', () => {
    for (const selector of ['.label', '.section-label']) {
      expectSemantic(declaration(effectiveBlock(app, selector), 'color'), '--color-muted');
    }
    expectThemeContrast('var(--color-muted)', 'var(--color-surface)');

    const statusTokens = [
      ['.tag', '--color-success-text', '--color-success-soft'],
      ['.warn', '--color-warning-text', '--color-warning-soft'],
      ['.danger', '--color-danger-text', '--color-danger-soft'],
    ] as const;
    for (const [selector, foreground, background] of statusTokens) {
      const block = effectiveBlock(app, selector);
      expectSemantic(declaration(block, 'color'), foreground);
      expectSemantic(declaration(block, 'background'), background);
      expectThemeContrast(`var(${foreground})`, 'var(--color-surface)', 4.5);
    }

    const controls = app.match(/\.input,\s*\.textarea\s*\{([^}]*)\}/s)?.[1] || '';
    expectSemantic(declaration(controls, 'background'), '--color-input-bg');
    expectSemantic(declaration(controls, 'color'), '--color-text');
    expectThemeContrast('var(--color-text)', 'var(--color-input-bg)');

    const secondary = effectiveBlock(app, '.secondary');
    expectSemantic(declaration(secondary, 'background'), '--color-input-bg');
    expectSemantic(declaration(secondary, 'color'), '--color-text');
    const metric = effectiveBlock(app, '.metric');
    expectSemantic(declaration(metric, 'background'), '--color-input-bg');
    expectSemantic(declaration(metric, 'color'), '--color-muted');
    expectThemeContrast('var(--color-muted)', 'var(--color-input-bg)');
    expectThemeContrast('var(--color-brand)', 'var(--color-input-bg)', 3);

    expect(read('miniprogram/pages/profile-edit/index.wxml')).toMatch(
      /class="(?:label|danger form-error)"/,
    );
    expect(read('miniprogram/pages/strava/index.wxml')).toContain(
      'class="section-label inner-label"',
    );
    expect(read('miniprogram/pages/admin/activity-list/index.wxml')).toContain('class="tag"');
    expect(read('miniprogram/pages/admin/activity-edit/index.wxml')).toContain(
      'class="card danger"',
    );
  });

  it('keeps themed consumers on semantic fixed, surface, and text tokens', () => {
    for (const [file, selector] of [
      ['miniprogram/pages/activity-detail/index.wxss', '.fixed'],
      ['miniprogram/pages/registration-form/index.wxss', '.form-page .fixed'],
    ] as const) {
      expectSemantic(
        declaration(effectiveBlock(read(file), selector), 'background'),
        '--color-fixed-bar',
      );
    }

    const reviewStyles = read('miniprogram/pages/admin/review-detail/index.wxss');
    const reviewMetric = effectiveBlock(reviewStyles, '.review-detail-page .metric');
    expectSemantic(declaration(reviewMetric, 'background'), '--color-surface');
    expectSemantic(declaration(reviewMetric, 'color'), '--color-text');
    expectThemeContrast('var(--color-text)', 'var(--color-surface)');
  });

  it('lets each page provide empty-state copy and hides decorative state glyphs', () => {
    const source = read('miniprogram/components/state-view/index.ts');
    const template = read('miniprogram/components/state-view/index.wxml');
    const activities = read('miniprogram/pages/activities/index.wxml');
    const registrations = read('miniprogram/pages/registrations/index.wxml');
    expect(source).toMatch(/emptyTitle:\s*\{\s*type:\s*String/);
    expect(source).toMatch(/emptyCopy:\s*\{\s*type:\s*String/);
    expect(template).toContain('{{emptyTitle}}');
    expect(template).toContain('{{emptyCopy}}');
    expect(template.match(/class="state-code" aria-hidden="true"/g)).toHaveLength(2);
    expect(activities).toContain('empty-title="暂无活动"');
    expect(activities).toContain('empty-copy="下一场骑行正在路上"');
    expect(registrations).toContain('empty-title="暂无行程"');
    expect(registrations).toContain('empty-copy="去发现一场活动，报名后可在这里查看进度"');
  });

  it('uses the approved non-health registration note wording', () => {
    const template = read('miniprogram/pages/registration-form/index.wxml');
    expect(template).toContain('placeholder="饮食、集合或其他备注"');
    expect(template).not.toContain('饮食、健康或其他备注');
  });

  it('keeps primary CTA text and brand treatment distinguishable in dark and light themes', () => {
    const button = effectiveBlock(app, '.btn');
    expect(declaration(button, 'background')).toContain('var(--color-brand)');
    expect(declaration(button, 'background')).toContain('var(--color-brand-active)');
    expectSemantic(declaration(button, 'color'), '--color-on-brand');
    for (const [name, tokens] of themes) {
      const foreground = resolvedHex('var(--color-on-brand)', tokens);
      expect(
        contrast(foreground, resolvedHex('var(--color-brand)', tokens)),
        `${name} CTA`,
      ).toBeGreaterThanOrEqual(3);
      expect(
        contrast(foreground, resolvedHex('var(--color-brand-active)', tokens)),
        `${name} active CTA`,
      ).toBeGreaterThanOrEqual(3);
    }
  });

  it('keeps photographic hero copy white in both themes', () => {
    const profileStyles = read('miniprogram/pages/profile/index.wxss');
    const profileHero = effectiveBlock(profileStyles, '.profile-hero');
    expect(declaration(profileHero, 'color')).toBe('#f7f7f5');

    const reviewStyles = read('miniprogram/pages/admin/review-detail/index.wxss');
    const reviewHero = effectiveBlock(reviewStyles, '.capability-hero .hero-content');
    expect(declaration(reviewHero, 'color')).toBe('#f7f7f5');
    expect(contrast('#f7f7f5', '#1c1c1e')).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps activity card and detail metric labels readable in both themes', () => {
    const cardStyles = read('miniprogram/components/activity-card/index.wxss');
    const cardLabel = effectiveBlock(cardStyles, '.metric-unit');
    const cardSurface = effectiveBlock(cardStyles, '.metric-item');
    expect(rpx(cardLabel, 'font-size')).toBeGreaterThanOrEqual(24);
    expectSemantic(declaration(cardLabel, 'color'), '--color-muted');
    expectSemantic(declaration(cardSurface, 'background'), '--color-raised');
    expectThemeContrast('var(--color-muted)', 'var(--color-raised)');

    const detailStyles = read('miniprogram/pages/activity-detail/index.wxss');
    const detailMetric = effectiveBlock(detailStyles, '.detail-metric');
    expect(rpx(detailMetric, 'font-size')).toBeGreaterThanOrEqual(24);
    expectSemantic(declaration(detailMetric, 'color'), '--color-muted');
    expectSemantic(declaration(detailMetric, 'background'), '--color-surface');
    expectThemeContrast('var(--color-muted)', 'var(--color-surface)');
  });

  it('keeps the profile edit action at least 88rpx tall', () => {
    const editButton = effectiveBlock(read('miniprogram/pages/profile/index.wxss'), '.edit-button');
    expect(rpx(editButton, 'min-height')).toBeGreaterThanOrEqual(88);
  });

  it('keeps registration dates and admin sync metadata readable in both themes', () => {
    const registrationStyles = read('miniprogram/pages/registrations/index.wxss');
    expectSemantic(
      declaration(effectiveBlock(registrationStyles, '.date'), 'color'),
      '--color-brand',
    );
    const reviewStyles = read('miniprogram/pages/admin/review-detail/index.wxss');
    expectSemantic(
      declaration(effectiveBlock(reviewStyles, '.sync-meta'), 'color'),
      '--color-muted',
    );
    expectThemeContrast('var(--color-brand)', 'var(--color-surface)', 3);
    expectThemeContrast('var(--color-muted)', 'var(--color-surface)');
  });

  it('uses only supported WXML elements for the activities headline', () => {
    const template = read('miniprogram/pages/activities/index.wxml');
    expect(template).not.toMatch(/<br\s*\/?\s*>/i);
    expect(template).toContain('<view>发现活动</view>');
    expect(template).toContain('<view>报名出发</view>');
  });
});
