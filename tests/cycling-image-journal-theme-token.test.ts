// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

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
});
