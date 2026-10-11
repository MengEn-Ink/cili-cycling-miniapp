// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');
const html = read('docs/index.html');
const css = read('docs/styles.css');
const script = read('docs/app.js');

describe('GitHub Pages 高保真演示门禁', () => {
  it('四个核心页面均有真实业务内容与交互入口', () => {
    for (const screen of ['activities', 'detail', 'trips', 'profile']) {
      expect(html).toContain(`data-screen-panel="${screen}"`);
      expect(script).toContain(`${screen}: [`);
    }
    expect(html).toContain('周末晨骑 · 温榆河绿道');
    expect(html).toContain('路线、时间、集合点，一眼看清');
    expect(html).toContain('查看报名凭证');
    expect(html).toContain('Strava 授权');
    expect(html).toContain('一起骑，去更远的地方');
    expect(html).not.toContain('<small>个人资料</small>');
    expect(css).toMatch(/\.logo-word\{[^}]*background:var\(--text\)/);
    expect(css).toMatch(/\.brand-lockup\{[^}]*justify-content:flex-start/);
  });

  it('网站与小程序共享三色品牌规范且不引入深海蓝或渐变', () => {
    const hexColors = [...css.matchAll(/#[0-9a-f]{6}\b/gi)].map(([color]) => color.toLowerCase());
    expect(new Set(hexColors)).toEqual(new Set(['#f2f3ef', '#20241f', '#e85b32']));
    expect(css).not.toMatch(/navy|blue|linear-gradient|radial-gradient/i);
    expect(css).toContain('--bg:#f2f3ef');
    expect(css).toContain('--text:#20241f');
    expect(css).toContain('--brand:#e85b32');
  });

  it('GitHub Pages 使用 docs 根目录的相对静态资源', () => {
    expect(html).toContain('href="./styles.css"');
    expect(html).toContain('src="./app.js"');
    expect(html).not.toMatch(/href="\/(styles|app)|src="\/(styles|app)/);
  });
});
