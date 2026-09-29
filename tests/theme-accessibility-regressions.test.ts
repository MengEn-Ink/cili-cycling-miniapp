// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (file: string) => readFileSync(file, 'utf8');

function cssBlocks(source: string, selector: string): string[] {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [...source.matchAll(new RegExp(`(?:^|\\n)\\s*${escaped}\\s*\\{([^}]*)\\}`, 'g'))].map(
    (match) => match[1],
  );
}

function cssBlock(source: string, selector: string): string {
  const blocks = cssBlocks(source, selector);
  expect(blocks, `missing CSS selector ${selector}`).not.toHaveLength(0);
  return blocks[blocks.length - 1] || '';
}

function declaration(block: string, property: string): string {
  const match = block.match(new RegExp(`(?:^|\\n)\\s*${property}\\s*:\\s*([^;]+);`));
  expect(match, `missing CSS declaration ${property}`).not.toBeNull();
  return match?.[1].trim() || '';
}

function rpx(block: string, property: string): number {
  const value = declaration(block, property);
  const match = value.match(/^(\d+(?:\.\d+)?)rpx$/);
  expect(match, `${property} must use an rpx value`).not.toBeNull();
  return Number(match?.[1]);
}

function relativeLuminance(hex: string): number {
  const channels = hex
    .replace('#', '')
    .match(/.{2}/g)!
    .map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(foreground: string, background: string): number {
  const first = relativeLuminance(foreground);
  const second = relativeLuminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

function hexColors(value: string): string[] {
  return value.match(/#[0-9a-f]{6}/gi) || [];
}

describe('theme accessibility regressions', () => {
  it('keeps the global canvas safe for legacy light surfaces and opts dark pages in locally', () => {
    const app = read('miniprogram/app.wxss');
    const globalPage = cssBlock(app, 'page');
    expect(declaration(globalPage, 'background').toLowerCase()).toBe('#f5f7f2');
    expect(declaration(globalPage, 'color').toLowerCase()).toBe('#17231e');

    const darkPages = [
      ['miniprogram/pages/activities/index.wxss', '.activities-page'],
      ['miniprogram/pages/activity-detail/index.wxss', '.detail-page'],
      ['miniprogram/pages/profile/index.wxss', '.profile-page'],
      ['miniprogram/pages/registration-form/index.wxss', '.form-page'],
      ['miniprogram/pages/registrations/index.wxss', '.registrations-page'],
      ['miniprogram/pages/admin/review-detail/index.wxss', '.review-detail-page'],
    ] as const;
    for (const [file, selector] of darkPages) {
      const block = cssBlock(read(file), selector);
      expect(declaration(block, 'background').toLowerCase()).toMatch(/#(?:0b0b0c|090b0f)/);
      expect(declaration(block, 'color').toLowerCase()).toMatch(/^#f[0-9a-f]{5}$/);
    }
  });

  it('keeps shared card and muted primitives readable on legacy light pages', () => {
    const app = read('miniprogram/app.wxss');
    const globalCard = cssBlock(app, '.card');
    const globalMuted = cssBlock(app, '.muted');
    expect(declaration(globalCard, 'background').toLowerCase()).toBe('#fff');
    expect(declaration(globalCard, 'color').toLowerCase()).toBe('#17231e');

    const mutedColor = hexColors(declaration(globalMuted, 'color'))[0];
    expect(contrast(mutedColor, '#ffffff')).toBeGreaterThanOrEqual(4.5);
    expect(contrast(mutedColor, '#f5f7f2')).toBeGreaterThanOrEqual(4.5);

    for (const file of [
      'miniprogram/pages/admin/activity-edit/index.wxml',
      'miniprogram/pages/credential/index.wxml',
      'miniprogram/pages/strava/index.wxml',
      'miniprogram/pages/profile-edit/index.wxml',
    ]) {
      expect(read(file)).toMatch(/class="[^"]*\b(?:card|muted)\b/);
    }

    const activitiesMuted = cssBlock(
      read('miniprogram/pages/activities/index.wxss'),
      '.activities-page .muted',
    );
    expect(
      contrast(hexColors(declaration(activitiesMuted, 'color'))[0], '#0b0b0c'),
    ).toBeGreaterThanOrEqual(4.5);

    const detailStyles = read('miniprogram/pages/activity-detail/index.wxss');
    const detailCard = cssBlock(detailStyles, '.detail-page .card');
    expect(declaration(detailCard, 'background')).toContain('#242427');
    expect(declaration(detailCard, 'color').toLowerCase()).toBe('#f7f7f5');
    const detailMuted = cssBlock(detailStyles, '.detail-page .muted');
    expect(
      contrast(hexColors(declaration(detailMuted, 'color'))[0], '#19191b'),
    ).toBeGreaterThanOrEqual(4.5);

    const formCard = cssBlock(read('miniprogram/pages/registration-form/index.wxss'), '.form-card');
    expect(declaration(formCard, 'background')).toContain('#171b1d');
    expect(declaration(formCard, 'color').toLowerCase()).toBe('#f4f7f2');
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
    expect(registrations).toContain('empty-title="暂无报名"');
    expect(registrations).toContain('empty-copy="完成报名后，行程会在这里出现"');
  });

  it('uses the approved non-health registration note wording', () => {
    const template = read('miniprogram/pages/registration-form/index.wxml');
    expect(template).toContain('placeholder="饮食、集合或其他备注"');
    expect(template).not.toContain('饮食、健康或其他备注');
  });

  it('keeps white primary CTA text at WCAG AA contrast', () => {
    const appButton = cssBlock(read('miniprogram/app.wxss'), '.btn');
    const foreground = hexColors(declaration(appButton, 'color'))[0];
    expect(foreground.toLowerCase()).toBe('#f7f7f5');
    for (const background of hexColors(declaration(appButton, 'background'))) {
      expect(contrast(foreground, background)).toBeGreaterThanOrEqual(4.5);
    }

    const profileButton = cssBlock(read('miniprogram/pages/profile/index.wxss'), '.btn');
    for (const background of hexColors(declaration(profileButton, 'background'))) {
      expect(contrast('#f7f7f5', background)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps activity card and detail metric labels readable', () => {
    const cardStyles = read('miniprogram/components/activity-card/index.wxss');
    const cardLabel = cssBlock(cardStyles, '.metric-unit');
    const cardSurface = cssBlock(cardStyles, '.metric-item');
    expect(rpx(cardLabel, 'font-size')).toBeGreaterThanOrEqual(24);
    expect(
      contrast(
        hexColors(declaration(cardLabel, 'color'))[0],
        hexColors(declaration(cardSurface, 'background'))[0],
      ),
    ).toBeGreaterThanOrEqual(4.5);

    const detailStyles = read('miniprogram/pages/activity-detail/index.wxss');
    const detailMetric = cssBlock(detailStyles, '.detail-metric');
    expect(rpx(detailMetric, 'font-size')).toBeGreaterThanOrEqual(24);
    expect(
      contrast(
        hexColors(declaration(detailMetric, 'color'))[0],
        hexColors(declaration(detailMetric, 'background'))[0],
      ),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps the profile edit action at least 88rpx tall', () => {
    const editButton = cssBlock(read('miniprogram/pages/profile/index.wxss'), '.edit-button');
    expect(rpx(editButton, 'min-height')).toBeGreaterThanOrEqual(88);
  });

  it('keeps registration dates and admin sync metadata at WCAG AA contrast', () => {
    const registrationStyles = read('miniprogram/pages/registrations/index.wxss');
    const date = cssBlock(registrationStyles, '.date');
    expect(contrast(hexColors(declaration(date, 'color'))[0], '#202023')).toBeGreaterThanOrEqual(
      4.5,
    );

    const reviewStyles = read('miniprogram/pages/admin/review-detail/index.wxss');
    const syncMeta = cssBlock(reviewStyles, '.sync-meta');
    expect(
      contrast(hexColors(declaration(syncMeta, 'color'))[0], '#202023'),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it('uses only supported WXML elements for the activities headline', () => {
    const template = read('miniprogram/pages/activities/index.wxml');
    expect(template).not.toMatch(/<br\s*\/?\s*>/i);
    expect(template).toContain('<view>去见风</view>');
    expect(template).toContain('<view>也见同路人</view>');
  });
});
