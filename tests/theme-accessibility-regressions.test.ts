import { describe, expect, it } from 'vitest';
import {
  contrast,
  effectiveBlock,
  declaration,
  expectSemantic,
  read,
  resolvedHex,
  rpx,
  uiTokens,
} from './theme-contract-helpers';

const app = read('miniprogram/app.wxss');
const tokens = uiTokens(app);

function expectUiContrast(foreground: string, background: string, minimum = 4.5): void {
  expect(
    contrast(resolvedHex(foreground, tokens), resolvedHex(background, tokens)),
    `contrast for ${foreground} on ${background}`,
  ).toBeGreaterThanOrEqual(minimum);
}

describe('unified UI accessibility regressions', () => {
  it('uses one bright token set and semantic page surfaces', () => {
    expect(tokens['--color-bg']).toBe('#f3f3f1');
    expect(tokens['--color-text']).toBe('#171717');
    expect(tokens['--color-brand']).toBe('#e85b32');
    expect(tokens['--color-action']).toBe('#171717');
    expect(tokens['--color-on-action']).toBe('#ffffff');
    expectUiContrast('var(--color-text)', 'var(--color-bg)', 7);
    expectUiContrast('var(--color-on-brand)', 'var(--color-brand)', 4.5);
    expectUiContrast('var(--color-on-action)', 'var(--color-action)', 7);

    const globalPage = effectiveBlock(app, 'page');
    expectSemantic(declaration(globalPage, 'background'), '--color-bg');
    expectSemantic(declaration(globalPage, 'color'), '--color-text');

    for (const [file, selector] of [
      ['miniprogram/pages/activities/index.wxss', '.activities-page'],
      ['miniprogram/pages/activity-detail/index.wxss', '.detail-page'],
      ['miniprogram/pages/profile/index.wxss', '.profile-page'],
      ['miniprogram/pages/registration-form/index.wxss', '.form-page'],
      ['miniprogram/pages/registrations/index.wxss', '.registrations-page'],
      ['miniprogram/pages/admin/review-detail/index.wxss', '.review-detail-page'],
    ] as const) {
      const source = read(file);
      const block = effectiveBlock(source, selector);
      expectSemantic(declaration(block, 'background'), '--color-bg');
      expect(source).not.toMatch(/color:\s*#(?:fff|ffffff|000|000000)\b/i);
    }
  });

  it('keeps shared cards and muted copy readable', () => {
    const card = effectiveBlock(app, '.card');
    const muted = effectiveBlock(app, '.muted');
    expectSemantic(declaration(card, 'background'), '--color-surface');
    expectSemantic(declaration(card, 'color'), '--color-text');
    expectSemantic(declaration(muted, 'color'), '--color-muted');
    expectUiContrast('var(--color-text)', 'var(--color-surface)');
    expectUiContrast('var(--color-muted)', 'var(--color-bg)');
    expectUiContrast('var(--color-muted)', 'var(--color-surface)');

    for (const file of [
      'miniprogram/pages/admin/activity-edit/index.wxml',
      'miniprogram/pages/credential/index.wxml',
      'miniprogram/pages/capability-card/index.wxml',
      'miniprogram/pages/profile-edit/index.wxml',
    ]) {
      expect(read(file)).toMatch(/class="[^"]*\b(?:card|muted)\b/);
    }

    const detailCard = effectiveBlock(app, '.card');
    expectSemantic(declaration(detailCard, 'background'), '--color-surface');
    expectSemantic(declaration(detailCard, 'color'), '--color-text');
    expectSemantic(declaration(effectiveBlock(app, '.muted'), 'color'), '--color-muted');
    const formCard = effectiveBlock(app, '.form-card');
    expectSemantic(declaration(formCard, 'background'), '--color-surface');
    expectSemantic(declaration(formCard, 'color'), '--color-text');
  });

  it('keeps shared form and status primitives semantic and readable', () => {
    expectSemantic(declaration(effectiveBlock(app, '.label'), 'color'), '--color-text');
    expectSemantic(declaration(effectiveBlock(app, '.section-label'), 'color'), '--color-muted');
    expectUiContrast('var(--color-text)', 'var(--color-surface)');

    const statusStyles = read('miniprogram/components/status-pill/index.wxss');
    const statusTokens = [
      ['.pill--success', '--color-status-success', '--color-status-success-soft'],
      ['.pill--warning', '--color-status-warning', '--color-status-warning-soft'],
      ['.pill--danger', '--color-brand-active', '--color-surface'],
    ] as const;
    for (const [selector, foreground, background] of statusTokens) {
      const block = effectiveBlock(statusStyles, selector);
      expectSemantic(declaration(block, 'color'), foreground);
      expectSemantic(declaration(block, 'background'), background);
      expectUiContrast(`var(${foreground})`, `var(${background})`, 4.5);
    }

    const controls = effectiveBlock(app, '.input');
    expectSemantic(declaration(controls, 'background'), '--color-input-bg');
    expectSemantic(declaration(controls, 'color'), '--color-text');
    expectUiContrast('var(--color-text)', 'var(--color-input-bg)');

    const secondary = effectiveBlock(app, '.secondary');
    expectSemantic(declaration(secondary, 'background'), '--color-surface');
    expectSemantic(declaration(secondary, 'color'), '--color-text');
    const metric = effectiveBlock(app, '.metric-item');
    expectSemantic(declaration(metric, 'background'), '--color-surface');
    expectSemantic(declaration(effectiveBlock(app, '.metric-label'), 'color'), '--color-muted');
    expectUiContrast('var(--color-muted)', 'var(--color-surface)');

    expect(read('miniprogram/pages/profile-edit/index.wxml')).toMatch(
      /class="(?:label|danger form-error)"/,
    );
    expect(read('miniprogram/pages/capability-card/index.wxml')).toContain('class="privacy-note"');
    expect(read('miniprogram/pages/admin/activity-list/index.wxml')).toContain('class="tag ');
    expect(read('miniprogram/pages/admin/activity-edit/index.wxml')).toContain(
      'class="card danger"',
    );
  });

  it('keeps themed consumers on semantic fixed, surface, and text tokens', () => {
    expectSemantic(declaration(effectiveBlock(app, '.fixed'), 'background'), '--color-fixed-bar');
    expectSemantic(
      declaration(effectiveBlock(app, '.action-bar'), 'background'),
      '--color-fixed-bar',
    );

    const reviewMetric = effectiveBlock(app, '.detail-metric');
    expectSemantic(declaration(reviewMetric, 'background'), '--color-surface');
    expectSemantic(declaration(effectiveBlock(app, '.metric-number'), 'color'), '--color-text');
    expectUiContrast('var(--color-text)', 'var(--color-surface)');
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
    expect(activities).toContain('empty-title="{{emptyTitle}}"');
    expect(activities).toContain('empty-copy="{{emptyCopy}}"');
    expect(activities).toContain('role="tablist"');
    expect(activities.match(/role="tab"/g)).toHaveLength(2);
    expect(activities).toContain('aria-selected="{{activeView === \'future\'}}"');
    expect(activities.match(/aria-controls="activity-list-panel"/g)).toHaveLength(2);
    expect(activities).toContain('role="tabpanel"');
    expect(registrations).toContain('empty-title="暂无行程"');
    expect(registrations).toContain('empty-copy="去发现一场活动，报名后可在这里查看进度"');
  });

  it('uses the approved non-health registration note wording', () => {
    const template = read('miniprogram/pages/registration-form/index.wxml');
    expect(template).toContain('placeholder="饮食、集合或其他备注"');
    expect(template).not.toContain('饮食、健康或其他备注');
  });

  it('keeps primary CTA text distinguishable on normal and active action fills', () => {
    const button = effectiveBlock(app, '.btn');
    expect(declaration(button, 'background')).toBe('var(--color-action) !important');
    expectSemantic(declaration(button, 'color'), '--color-on-action');
    const foreground = resolvedHex('var(--color-on-action)', tokens);
    expect(contrast(foreground, resolvedHex('var(--color-action)', tokens))).toBeGreaterThanOrEqual(
      7,
    );
    expect(
      contrast(foreground, resolvedHex('var(--color-action-active)', tokens)),
    ).toBeGreaterThanOrEqual(7);
  });

  it('keeps photographic hero copy white on dark media overlays', () => {
    const profileStyles = read('miniprogram/pages/profile/index.wxss');
    const profileHero = effectiveBlock(profileStyles, '.hero-identity');
    expectSemantic(declaration(profileHero, 'color'), '--color-on-media');

    const reviewHero = effectiveBlock(app, '.info-bar');
    expectSemantic(declaration(reviewHero, 'color'), '--color-on-media');
    expectUiContrast('var(--color-on-media)', 'var(--color-action)', 7);
  });

  it('keeps activity card and detail metric labels readable', () => {
    const cardLabel = effectiveBlock(app, '.metric-unit');
    const cardSurface = effectiveBlock(app, '.metric-item');
    expect(rpx(cardLabel, 'font-size')).toBeGreaterThanOrEqual(24);
    expectSemantic(declaration(cardLabel, 'color'), '--color-muted');
    expectSemantic(declaration(cardSurface, 'background'), '--color-surface');
    expectUiContrast('var(--color-muted)', 'var(--color-surface)');

    const detailMetric = effectiveBlock(app, '.detail-metric');
    expect(rpx(effectiveBlock(app, '.metric-label'), 'font-size')).toBeGreaterThanOrEqual(24);
    expectSemantic(declaration(effectiveBlock(app, '.metric-label'), 'color'), '--color-muted');
    expectSemantic(declaration(detailMetric, 'background'), '--color-surface');
    expectUiContrast('var(--color-muted)', 'var(--color-surface)');
  });

  it('keeps the profile service actions at least 88rpx tall', () => {
    const menuCard = effectiveBlock(read('miniprogram/pages/profile/index.wxss'), '.menu-card');
    expect(rpx(menuCard, 'min-height')).toBeGreaterThanOrEqual(88);
  });

  it('keeps registration metadata readable without using brand as body text', () => {
    const registrationStyles = read('miniprogram/pages/registrations/index.wxss');
    expectSemantic(
      declaration(effectiveBlock(registrationStyles, '.meeting-value'), 'color'),
      '--color-on-media',
    );
    const reviewStyles = read('miniprogram/pages/admin/review-detail/index.wxss');
    expectSemantic(
      declaration(effectiveBlock(reviewStyles, '.status-explain'), 'color'),
      '--color-media-muted',
    );
    expectUiContrast('var(--color-media-muted)', 'var(--color-action)');
  });

  it('uses only supported WXML elements for the activities headline', () => {
    const template = read('miniprogram/pages/activities/index.wxml');
    expect(template).not.toMatch(/<br\s*\/?\s*>/i);
    expect(template).toContain('选一场骑行，一起出发');
    expect(template).toContain('路线、时间、集合点，一眼看清');
  });

  it('shares a 44px control height, 40px segments, and stable page gutters', () => {
    expect(tokens['--control-height']).toBe('88rpx');
    expect(tokens['--page-gutter']).toBe('48rpx');
    expect(tokens['--page-gutter-narrow']).toBe('32rpx');

    const profileEdit = read('miniprogram/pages/profile-edit/index.wxss');
    expect(declaration(effectiveBlock(app, '.input'), 'min-height')).toBe('var(--control-height)');
    expect(profileEdit).toMatch(
      /@media \(max-width: 340px\)[\s\S]*?\.avatar-editor\s*\{[^}]*grid-template-columns:\s*1fr/s,
    );
    expect(declaration(effectiveBlock(profileEdit, '.gender-option'), 'min-height')).toBe(
      'var(--segment-height)',
    );

    expect(declaration(effectiveBlock(app, '.field input'), 'min-height')).toBe(
      'var(--control-height)',
    );

    expect(app).toContain('padding: 32rpx var(--page-gutter);');
    expect(app).toMatch(
      /@media \(max-width: 340px\)[\s\S]*?page\s*\{[^}]*--page-gutter:\s*var\(--page-gutter-narrow\)/s,
    );

    expect(declaration(effectiveBlock(app, '.hero-title'), 'font-size')).toBe('48rpx');

    const activityTimeline = read('miniprogram/pages/activities/index.wxss');
    expect(declaration(effectiveBlock(app, '.timeline-tab'), 'min-height')).toBe(
      'var(--segment-height)',
    );
    expectSemantic(
      declaration(effectiveBlock(app, '.timeline-tab.is-active'), 'background'),
      '--color-action',
    );
    expect(
      declaration(effectiveBlock(activityTimeline, '.timeline-tabs'), 'grid-template-columns'),
    ).toBe('1fr 1fr');
    expect(app).toMatch(
      /@media \(max-width: 340px\)[\s\S]*?page\s*\{[^}]*--page-gutter:\s*var\(--page-gutter-narrow\)/s,
    );
  });

  it('keeps dense metrics and progress rails readable on narrow screens', () => {
    expect(rpx(effectiveBlock(app, '.metric-number'), 'font-size')).toBeGreaterThanOrEqual(30);
    expect(declaration(effectiveBlock(app, '.metric-number'), 'font-variant-numeric')).toBe(
      'tabular-nums',
    );
    expect(app).toMatch(
      /@media \(max-width: 340px\)[\s\S]*?\.metric-panel,[\s\S]*?grid-template-columns:\s*1fr/s,
    );

    const registration = read('miniprogram/pages/registration-form/index.wxss');
    const steps = effectiveBlock(registration, '.step-line');
    expect(declaration(steps, 'grid-template-columns')).toBe('repeat(3, minmax(0, 1fr))');
    expect(declaration(effectiveBlock(registration, '.step'), 'white-space')).toBe('nowrap');
  });

  it('keeps admin filters and clone actions touchable at 320px', () => {
    const reviews = read('miniprogram/pages/admin/reviews/index.wxss');
    const tabs = effectiveBlock(reviews, '.filter-tabs');
    const tab = effectiveBlock(app, '.filter-tab');
    expect(declaration(tabs, 'grid-template-columns')).toBe('repeat(3, 1fr)');
    expect(declaration(tab, 'min-height')).toBe('var(--segment-height)');

    const activities = read('miniprogram/pages/admin/activity-list/index.wxss');
    expect(activities).toMatch(
      /@media \(max-width: 340px\)[\s\S]*?\.clone-actions\s*\{[^}]*grid-template-columns:\s*1fr/s,
    );
  });
});
