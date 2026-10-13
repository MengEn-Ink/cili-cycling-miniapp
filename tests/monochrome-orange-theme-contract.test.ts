// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const collectWxss = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap(
    (entry: { name: string; isDirectory: () => boolean }) => {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) return collectWxss(path);
      return entry.name.endsWith('.wxss') ? [path] : [];
    },
  );

const forbiddenThemeColors = [
  /#4fb3a7/i,
  /#ef8072/i,
  /#17665f/i,
  /#983c34/i,
  /#356348/i,
  /#e5f2e9/i,
  /#0b6b4f/i,
  /#c88418/i,
  /rgba\(24,\s*160,\s*88/i,
  /rgba\(200,\s*32,\s*24/i,
  /rgba\(200,\s*132,\s*24/i,
];

describe('黑白橙全局主题契约', () => {
  it('全局语义 token 只以黑白灰和主题橙表达状态', () => {
    const app = readFileSync('miniprogram/app.wxss', 'utf8');
    expect(app).toContain('--color-brand: #e85b32;');
    expect(app).toContain('--color-text: #171717;');
    expect(app).toContain('--color-success: #171717;');
    expect(app).toContain('--color-danger: #171717;');
    expect(app).toContain('--color-warning: #e85b32;');
    expect(app).toContain('--color-on-media-gender-male: #ffffff;');
    expect(app).toContain('--color-on-media-gender-female: #ffffff;');
  });

  it('全部页面和组件不再引入旧的绿蓝红黄状态色', () => {
    for (const file of collectWxss('miniprogram')) {
      const styles = readFileSync(file, 'utf8');
      for (const forbidden of forbiddenThemeColors) {
        expect(styles, `${file} contains ${forbidden}`).not.toMatch(forbidden);
      }
    }
  });

  it('行程、路线查看和审核模块用结构与黑白橙区分状态', () => {
    const trips = readFileSync('miniprogram/pages/registrations/index.wxss', 'utf8');
    const routeView = readFileSync('miniprogram/pages/route-view/index.wxss', 'utf8');
    const reviews = readFileSync('miniprogram/pages/admin/reviews/index.wxss', 'utf8');

    expect(trips).toContain('background: var(--color-text);');
    expect(trips).toContain('border-color: var(--color-brand);');
    expect(routeView).toContain('.route-view-action--primary');
    expect(routeView).toContain('background: var(--color-action);');
    expect(reviews).toContain('border-color: var(--color-brand);');
  });
});
