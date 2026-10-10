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
    expect(tokens['--color-bg']).toBe('#ffffff');
    expect(tokens['--color-text']).toBe('#10120f');
    expect(tokens['--color-brand']).toBe('#d9ff43');
    expectUiContrast('var(--color-text)', 'var(--color-bg)', 7);
    expectUiContrast('var(--color-on-brand)', 'var(--color-brand)', 7);

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

  it('keeps shared form and status primitives semantic and readable', () => {
    for (const selector of ['.label', '.section-label']) {
      expectSemantic(declaration(effectiveBlock(app, selector), 'color'), '--color-muted');
    }
    expectUiContrast('var(--color-muted)', 'var(--color-surface)');

    const statusTokens = [
      ['.tag', '--color-success-text', '--color-success-soft'],
      ['.warn', '--color-warning-text', '--color-warning-soft'],
      ['.danger', '--color-danger-text', '--color-danger-soft'],
    ] as const;
    for (const [selector, foreground, background] of statusTokens) {
      const block = effectiveBlock(app, selector);
      expectSemantic(declaration(block, 'color'), foreground);
      expectSemantic(declaration(block, 'background'), background);
      expectUiContrast(`var(${foreground})`, `var(${background})`, 4.5);
    }

    const controls = app.match(/\.input,\s*\.textarea\s*\{([^}]*)\}/s)?.[1] || '';
    expectSemantic(declaration(controls, 'background'), '--color-input-bg');
    expectSemantic(declaration(controls, 'color'), '--color-text');
    expectUiContrast('var(--color-text)', 'var(--color-input-bg)');

    const secondary = effectiveBlock(app, '.secondary');
    expectSemantic(declaration(secondary, 'background'), '--color-input-bg');
    expectSemantic(declaration(secondary, 'color'), '--color-text');
    const metric = effectiveBlock(app, '.metric');
    expectSemantic(declaration(metric, 'background'), '--color-input-bg');
    expectSemantic(declaration(metric, 'color'), '--color-muted');
    expectUiContrast('var(--color-muted)', 'var(--color-input-bg)');

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

  it('keeps primary CTA text distinguishable on normal and active brand fills', () => {
    const button = effectiveBlock(app, '.btn');
    expect(declaration(button, 'background')).toBe('var(--color-brand) !important');
    expectSemantic(declaration(button, 'color'), '--color-on-brand');
    const foreground = resolvedHex('var(--color-on-brand)', tokens);
    expect(contrast(foreground, resolvedHex('var(--color-brand)', tokens))).toBeGreaterThanOrEqual(
      7,
    );
    expect(
      contrast(foreground, resolvedHex('var(--color-brand-active)', tokens)),
    ).toBeGreaterThanOrEqual(7);
  });

  it('keeps photographic hero copy white on dark media overlays', () => {
    const profileStyles = read('miniprogram/pages/profile/index.wxss');
    const profileHero = effectiveBlock(profileStyles, '.profile-hero');
    expect(declaration(profileHero, 'color')).toBe('#f7f7f5');

    const reviewStyles = read('miniprogram/pages/admin/review-detail/index.wxss');
    const reviewHero = effectiveBlock(reviewStyles, '.capability-hero .hero-content');
    expect(declaration(reviewHero, 'color')).toBe('#f7f7f5');
    expect(contrast('#f7f7f5', '#1c1c1e')).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps activity card and detail metric labels readable', () => {
    const cardStyles = read('miniprogram/components/activity-card/index.wxss');
    const cardLabel = effectiveBlock(cardStyles, '.metric-unit');
    const cardSurface = effectiveBlock(cardStyles, '.metric-item');
    expect(rpx(cardLabel, 'font-size')).toBeGreaterThanOrEqual(24);
    expectSemantic(declaration(cardLabel, 'color'), '--color-muted');
    expectSemantic(declaration(cardSurface, 'background'), '--color-raised');
    expectUiContrast('var(--color-muted)', 'var(--color-raised)');

    const detailStyles = read('miniprogram/pages/activity-detail/index.wxss');
    const detailMetric = effectiveBlock(detailStyles, '.detail-metric');
    expect(rpx(detailMetric, 'font-size')).toBeGreaterThanOrEqual(24);
    expectSemantic(declaration(detailMetric, 'color'), '--color-muted');
    expectSemantic(declaration(detailMetric, 'background'), '--color-surface');
    expectUiContrast('var(--color-muted)', 'var(--color-surface)');
  });

  it('keeps the profile edit action at least 88rpx tall', () => {
    const editButton = effectiveBlock(read('miniprogram/pages/profile/index.wxss'), '.edit-button');
    expect(rpx(editButton, 'min-height')).toBeGreaterThanOrEqual(88);
  });

  it('keeps registration metadata readable without using brand as body text', () => {
    const registrationStyles = read('miniprogram/pages/registrations/index.wxss');
    expectSemantic(
      declaration(effectiveBlock(registrationStyles, '.date'), 'color'),
      '--color-text',
    );
    const reviewStyles = read('miniprogram/pages/admin/review-detail/index.wxss');
    expectSemantic(
      declaration(effectiveBlock(reviewStyles, '.sync-meta'), 'color'),
      '--color-muted',
    );
    expectUiContrast('var(--color-muted)', 'var(--color-surface)');
  });

  it('uses only supported WXML elements for the activities headline', () => {
    const template = read('miniprogram/pages/activities/index.wxml');
    expect(template).not.toMatch(/<br\s*\/?\s*>/i);
    expect(template).toContain('<view>发现活动</view>');
    expect(template).toContain('<view>报名出发</view>');
  });

  it('shares a 48px control height, 40px segments, and stable page gutters', () => {
    expect(declaration(effectiveBlock(app, 'page'), '--control-height')).toBe('96rpx');
    expect(declaration(effectiveBlock(app, 'page'), '--page-gutter')).toBe('32rpx');
    expect(declaration(effectiveBlock(app, 'page'), '--page-gutter-narrow')).toBe('24rpx');

    const profileEdit = read('miniprogram/pages/profile-edit/index.wxss');
    expect(declaration(effectiveBlock(profileEdit, '.form-card .input'), 'min-height')).toBe(
      'var(--control-height)',
    );
    expect(profileEdit).toMatch(
      /@media \(max-width: 320px\)[\s\S]*?\.gender-options\s*\{[^}]*grid-template-columns:\s*1fr/s,
    );

    const activityEdit = read('miniprogram/pages/admin/activity-edit/index.wxss');
    expect(declaration(effectiveBlock(activityEdit, '.field input'), 'min-height')).toBe(
      'var(--control-height)',
    );

    const registrations = read('miniprogram/pages/registrations/index.wxss');
    expect(registrations).toMatch(
      /\.page\.registrations-page\s*\{[^}]*padding-right:\s*var\(--page-gutter\);[^}]*padding-left:\s*var\(--page-gutter\)/s,
    );
    expect(registrations).toMatch(
      /@media \(max-width: 320px\)[\s\S]*?\.page\.registrations-page\s*\{[^}]*padding-right:\s*var\(--page-gutter-narrow\)/s,
    );

    const reviews = read('miniprogram/pages/admin/reviews/index.wxss');
    expect(declaration(effectiveBlock(reviews, '.hero-title'), 'font-size')).toBe('46rpx');

    const activityTimeline = read('miniprogram/pages/activities/index.wxss');
    expect(declaration(effectiveBlock(activityTimeline, '.timeline-tab'), 'min-height')).toBe(
      'var(--segment-height)',
    );
    expectSemantic(
      declaration(effectiveBlock(activityTimeline, '.timeline-tab.is-active'), 'background'),
      '--color-brand',
    );
    expect(activityTimeline).toMatch(
      /@media \(max-width: 320px\)[\s\S]*?\.timeline-tabs\s*\{[^}]*width:\s*100%/s,
    );
  });

  it('keeps dense metrics and progress rails readable on narrow screens', () => {
    const detail = read('miniprogram/pages/activity-detail/index.wxss');
    expect(detail).toMatch(
      /@media \(max-width: 350px\)[\s\S]*?\.metric-number\s*\{[^}]*font-size:\s*30rpx/s,
    );
    expect(detail).not.toMatch(/\.metric-number\s*\{[^}]*text-overflow:\s*ellipsis/s);
    expect(declaration(effectiveBlock(detail, '.metric-value'), 'flex-wrap')).toBe('wrap');
    expect(declaration(effectiveBlock(detail, '.metric-number'), 'overflow-wrap')).toBe('anywhere');

    const registration = read('miniprogram/pages/registration-form/index.wxss');
    expect(declaration(effectiveBlock(registration, '.step-rule'), 'max-width')).toBe('64rpx');
  });

  it('keeps admin filters and clone actions touchable at 320px', () => {
    const reviews = read('miniprogram/pages/admin/reviews/index.wxss');
    const tabs = effectiveBlock(reviews, '.filter-tabs');
    const tab = effectiveBlock(reviews, '.filter-tab');
    expect(declaration(tabs, 'overflow-x')).toBe('auto');
    expect(declaration(tab, 'min-width')).toBe('112rpx');
    expect(declaration(tab, 'min-height')).toBe('var(--control-height)');

    const activities = read('miniprogram/pages/admin/activity-list/index.wxss');
    expect(activities).toMatch(
      /@media \(max-width: 340px\)[\s\S]*?\.clone-actions\s*\{[^}]*grid-template-columns:\s*1fr/s,
    );
  });
});
