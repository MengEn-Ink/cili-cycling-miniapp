// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { expandAppRoutes, type MiniProgramAppConfig } from './helpers/app-routes';
import { APPEARANCE_TOKENS } from '../miniprogram/config/appearance';
import { contrast, hexColor } from './theme-contract-helpers';

const read = (path: string) => readFileSync(path, 'utf8');
const appConfig = JSON.parse(read('miniprogram/app.json')) as MiniProgramAppConfig;

describe('AI Hero 全局浅暗接线', () => {
  it('17 页通过公共接缝与 page-meta 更新 page 上的变量，组件和固定层共同继承', () => {
    const routes = expandAppRoutes(appConfig);
    expect(routes).toHaveLength(17);
    for (const route of routes) {
      expect(read(`miniprogram/${route}.ts`), route).toContain('themedPage({');
      const template = read(`miniprogram/${route}.wxml`);
      expect(template, route).toContain('page-style="{{appearanceStyle}}"');
      expect(template, route).toContain('aihero-page');
      expect(template, route).not.toMatch(/Tweaks|身份切换/);
    }
  });
  it('设置为唯一生产选择入口，不增添原型身份/状态面板', () => {
    const template = read('miniprogram/pages/settings/index.wxml');
    const script = read('miniprogram/pages/settings/index.ts');
    expect(read('miniprogram/pages/profile/index.wxml')).toContain('bindtap="openSettings"');
    expect(template).toContain('aria-label="显示主题"');
    expect(template).toContain('data-mode="light"');
    expect(template).toContain('data-mode="dark"');
    expect(template).toContain('aria-checked="{{appearanceMode');
    expect(script).toContain('setAppearance(value)');
    expect(template).toContain('bindtap="manageNotifications"');
    expect(template).toContain('bindtap="managePrivacy"');
    expect(template).toContain('bindtap="clearSafeCache"');
  });
  it('两套正文、次级、占位、禁用和状态色在对应表面达到 4.5:1', () => {
    for (const tokens of Object.values(APPEARANCE_TOKENS)) {
      for (const surface of ['--color-bg', '--color-surface', '--color-raised'] as const) {
        for (const text of [
          '--color-text',
          '--color-muted',
          '--color-placeholder',
          '--color-disabled-text',
        ] as const) {
          expect(
            contrast(hexColor(tokens[text]), hexColor(tokens[surface])),
            `${text}/${surface}`,
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
      for (const [text, surface] of [
        ['--color-status-success', '--color-status-success-soft'],
        ['--color-status-warning', '--color-status-warning-soft'],
        ['--color-danger-text', '--color-danger-soft'],
      ] as const) {
        expect(contrast(hexColor(tokens[text]), hexColor(tokens[surface]))).toBeGreaterThanOrEqual(
          4.5,
        );
      }
      expect(tokens['--border-width-hairline']).toBe('1px');
    }
  });
  it('Pages 浅暗语义覆盖与生产同值，媒体/二维码不被改成随主题反色', () => {
    const css = read('docs/styles.css');
    for (const mode of ['light', 'dark'] as const) {
      const block = css.match(
        new RegExp(String.raw`:root\[data-appearance='${mode}'\]\s*\{([^}]+)\}`),
      )?.[1];
      expect(block, mode).toBeDefined();
      const values = Object.fromEntries(
        [...block!.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((match) => [
          match[1],
          match[2].trim().replace(/\s/g, ''),
        ]),
      );
      for (const [name, value] of Object.entries(APPEARANCE_TOKENS[mode])) {
        if (name.startsWith('--color-') && name !== '--color-shadow') {
          expect(values[name], `${mode}/${name}`).toBe(value.replace(/\s/g, ''));
        }
      }
      expect(block).not.toContain('--color-on-media:');
      expect(block).not.toContain('--color-qr-');
    }
  });
  it('当前功能日志置顶且只有一个 latest，Pages 当前版本一致', () => {
    const script = read('miniprogram/pages/settings/index.ts');
    expect(script.match(/latest:\s*true/g)).toHaveLength(1);
    expect(script).toContain("date: '2026-11-01'");
    expect(read('docs/schema.js')).toContain('2026.11.01.1');
  });
});
