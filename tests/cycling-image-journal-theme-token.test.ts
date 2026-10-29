// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contrast, hexColor, resolveValue } from './theme-contract-helpers';

const read = (path: string) => readFileSync(path, 'utf8');
const tokens = (source: string) =>
  Object.fromEntries(
    [...source.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((match) => [match[1], match[2].trim()]),
  );
const resolvedToken = (source: string, name: string) => {
  const values = tokens(source);
  return hexColor(resolveValue(values[name], values));
};

const editorialTitleViews = [
  'miniprogram/pages/registration-form/index.wxml',
  'miniprogram/pages/profile-edit/index.wxml',
  'miniprogram/pages/settings/index.wxml',
  'miniprogram/pages/credential/index.wxml',
  'miniprogram/pages/admin/activity-list/index.wxml',
  'miniprogram/pages/admin/activity-edit/index.wxml',
  'miniprogram/pages/admin/reviews/index.wxml',
  'miniprogram/pages/admin/review-detail/index.wxml',
  'miniprogram/pages/admin/club-applications/index.wxml',
  'miniprogram/pages/admin/club-application-detail/index.wxml',
];

const tokenizedEditorialStyles = [
  'miniprogram/pages/activities/index.wxss',
  'miniprogram/pages/activity-detail/index.wxss',
  'miniprogram/pages/route-analysis/index.wxss',
  'miniprogram/pages/registrations/index.wxss',
  'miniprogram/pages/club/center/index.wxss',
];

describe('骑行影像志逐页主题令牌', () => {
  it('小程序、正式 Pages 与 16 页设计源共享同一组字体令牌', () => {
    const miniapp = read('miniprogram/app.wxss');
    const pages = read('docs/styles.css');
    const design = read('docs/designs/2026-10-22-cycling-image-journal/shared.css');

    for (const token of ['--font-family-body', '--font-family-editorial', '--font-family-mono']) {
      expect(miniapp).toContain(`${token}:`);
      expect(pages).toContain(`${token}:`);
      expect(design).toContain(`${token}:`);
    }
    expect(miniapp).toContain('font-family: var(--font-family-body);');
    expect(miniapp).toContain('font-family: var(--font-family-editorial);');
    expect(design).toContain('.editorial{font-family:var(--font-family-editorial)');
  });

  it('表单与管理页标题显式使用设计稿的 editorial 语义', () => {
    for (const path of editorialTitleViews) {
      expect(read(path), path).toMatch(/class="[^"]*\beditorial\b[^"]*"/);
    }
  });

  it('摄影首页、详情、路线、行程与俱乐部标题不再硬编码字体栈', () => {
    for (const path of tokenizedEditorialStyles) {
      const styles = read(path);
      expect(styles, path).toContain('font-family: var(--font-family-editorial);');
      expect(styles, path).not.toContain("font-family: 'Songti SC', STSong, serif;");
    }
  });

  it('v6 个人中心使用正文无衬线令牌且不硬编码字体栈', () => {
    const styles = read('miniprogram/pages/profile/index.wxss');
    expect(styles).toContain('font-family: var(--font-family-body);');
    expect(styles).not.toContain("font-family: 'Songti SC', STSong, serif;");
  });

  it('活动编辑旧语义名映射到当前骑行影像志色板', () => {
    const miniapp = read('miniprogram/app.wxss');
    const aliases = {
      '--color-paper': 'var(--color-surface)',
      '--color-ink': 'var(--color-text)',
      '--color-ink-muted': 'var(--color-muted)',
      '--color-rule': 'var(--color-border-strong)',
      '--color-accent': 'var(--color-action)',
    };

    for (const [name, value] of Object.entries(aliases)) {
      expect(miniapp).toContain(`${name}: ${value};`);
    }
  });

  it('Pages、小程序与设计源共享 primitive → semantic → component 三层主题', () => {
    const sources = [
      read('docs/styles.css'),
      read('miniprogram/app.wxss'),
      read('docs/designs/2026-10-22-cycling-image-journal/shared.css'),
    ];
    const expected = {
      '--color-bg': '#0b0a0c',
      '--color-surface': '#121116',
      '--color-raised': '#1a1820',
      '--color-floating': '#24212b',
      '--color-text': '#f7f4f2',
      '--color-muted': '#b8b3ba',
      '--color-placeholder': '#8c858f',
      '--color-brand': '#e54242',
      '--color-brand-fill': '#d93636',
      '--color-action': '#d93636',
      '--color-action-active': '#b72c2c',
      '--color-border': '#4b454f',
      '--color-border-strong': '#766f7a',
    };

    for (const source of sources) {
      for (const [name, value] of Object.entries(expected)) {
        expect(resolvedToken(source, name), name).toBe(value);
      }
      for (const component of [
        '--button-bg',
        '--card-bg',
        '--input-bg',
        '--cinema-title-duration',
        '--cinema-reveal-duration',
      ]) {
        expect(tokens(source)[component], component).toContain('var(--');
      }
    }
  });

  it('亮红只做焦点、深红承载白字，并满足正文、按钮与控件边界对比', () => {
    const source = read('miniprogram/app.wxss');
    const values = tokens(source);
    const color = (name: string) => hexColor(resolveValue(values[name], values));

    expect(contrast(color('--color-text'), color('--color-bg'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(color('--color-muted'), color('--color-bg'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(color('--color-placeholder'), color('--color-bg'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(color('--color-brand'), color('--color-bg'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(color('--color-on-action'), color('--color-action'))).toBeGreaterThanOrEqual(
      4.5,
    );
    expect(
      contrast(color('--color-border-strong'), color('--color-raised')),
    ).toBeGreaterThanOrEqual(3);
    expect(source).toContain('--color-logo-accent: #e13b2b;');
  });

  it('双端电影动效只消费共享时长、延迟和 easing 令牌', () => {
    const pages = read('docs/styles.css');
    const miniapp = read('miniprogram/app.wxss');
    for (const source of [pages, miniapp]) {
      for (const token of [
        '--motion-duration-instant: 100ms',
        '--motion-duration-fast: 150ms',
        '--motion-duration-base: 220ms',
        '--motion-duration-reveal: 420ms',
        '--motion-duration-emphasis: 560ms',
        '--motion-duration-hero: 680ms',
        '--motion-easing-out: cubic-bezier(0.25, 1, 0.5, 1)',
        '--motion-easing-in-out: cubic-bezier(0.65, 0, 0.35, 1)',
      ]) {
        expect(source).toContain(token);
      }
      expect(source).toContain('var(--cinema-title-duration)');
      expect(source).toContain('var(--cinema-hero-duration)');
      expect(source).toContain('var(--motion-easing-out)');
    }
    expect(pages).toContain('@media (prefers-reduced-motion: reduce)');
  });
});
