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
  it('全局语义 token 使用黑白灰、品牌橙及 V4 成功/提醒色', () => {
    const app = readFileSync('miniprogram/app.wxss', 'utf8');
    expect(app).toContain('--color-brand: #e85b32;');
    expect(app).toContain('--color-text: #171717;');
    expect(app).toContain('--color-status-success: #1d7a3e;');
    expect(app).toContain('--color-status-warning: #7a5c00;');
    expect(app).toContain('--color-danger: var(--color-text);');
    expect(app).toContain('--color-warning: var(--color-brand);');
    expect(app).toContain('--color-on-media-gender-male: var(--color-on-media);');
    expect(app).toContain('--color-on-media-gender-female: var(--color-on-media);');
  });

  it('全部页面和组件不再引入旧的绿蓝红黄状态色', () => {
    for (const file of collectWxss('miniprogram')) {
      const styles = readFileSync(file, 'utf8');
      for (const forbidden of forbiddenThemeColors) {
        expect(styles, `${file} contains ${forbidden}`).not.toMatch(forbidden);
      }
    }
  });

  it('行程和审核模块通过结构与 V4 语义状态色区分状态', () => {
    const app = readFileSync('miniprogram/app.wxss', 'utf8');
    const trips = readFileSync('miniprogram/pages/registrations/index.wxml', 'utf8');
    const reviews = readFileSync('miniprogram/pages/admin/reviews/index.wxml', 'utf8');

    expect(app).toContain('background: var(--color-status-success-soft);');
    expect(app).toContain('border: 2rpx solid var(--color-status-warning);');
    expect(trips).toContain('status-pill status="{{item.displayStatusText}}"');
    expect(reviews).toContain('class="status-tag status-{{item.status}}"');
  });
});
