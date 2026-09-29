// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { readFileSync, readdirSync } from 'node:fs';
// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

function liveRegionTag(source: string, politeness: 'polite' | 'assertive'): string {
  return source.match(new RegExp(`<view\\b(?=[^>]*aria-live="${politeness}")[^>]*>`))?.[0] || '';
}

function wxmlFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(
    (entry: { name: string; isDirectory(): boolean }) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return wxmlFiles(path);
      return entry.name.endsWith('.wxml') ? [path] : [];
    },
  );
}

describe('StateView single contract', () => {
  const componentSource = read('miniprogram/components/state-view/index.ts');
  const template = read('miniprogram/components/state-view/index.wxml');
  const styles = read('miniprogram/components/state-view/index.wxss');
  const appStyles = read('miniprogram/app.wxss');
  const allConsumers = wxmlFiles('miniprogram/pages')
    .map(read)
    .flatMap((source) => source.match(/<state-view\b[^>]*>/g) ?? [])
    .join('\n');

  it('uses only boolean state properties across every consumer', () => {
    expect(allConsumers).not.toMatch(/<state-view[^>]+\b(?:type|text)=/);
    expect(componentSource).toContain('loadingTitle:');
    expect(componentSource).toContain('loadingCopy:');
    expect(componentSource).toContain('retryable:');
  });

  it('renders loading, error, empty, then content in strict priority order', () => {
    const loading = template.indexOf('wx:if="{{loading}}"');
    const error = template.indexOf('wx:elif="{{error}}"');
    const empty = template.indexOf('wx:elif="{{empty}}"');
    const content = template.indexOf('<slot');

    expect(loading).toBeGreaterThanOrEqual(0);
    expect(error).toBeGreaterThan(loading);
    expect(empty).toBeGreaterThan(error);
    expect(content).toBeGreaterThan(empty);
    expect(template).toContain('{{loadingTitle}}');
    expect(template).toContain('{{loadingCopy}}');
  });

  it('shows retry only when allowed and animates loading accessibly', () => {
    expect(template).toContain('wx:if="{{retryable}}"');
    expect(styles).toMatch(/\.state-mark\s*\{[^}]*animation:/s);
    expect(styles).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  });

  it('keeps atomic polite and assertive live regions mounted without duplicate visual speech', () => {
    const polite = liveRegionTag(template, 'polite');
    const assertive = liveRegionTag(template, 'assertive');

    expect(polite).toContain('role="status"');
    expect(polite).toContain('class="a11y-live-region"');
    expect(polite).toContain('aria-atomic="true"');
    expect(polite).not.toMatch(/wx:(?:if|elif|else)/);
    expect(assertive).toContain('role="alert"');
    expect(assertive).toContain('class="a11y-live-region"');
    expect(assertive).toContain('aria-atomic="true"');
    expect(assertive).not.toMatch(/wx:(?:if|elif|else)/);
    expect(template.indexOf(polite)).toBeLessThan(template.indexOf('wx:if="{{loading}}"'));
    expect(template.indexOf(assertive)).toBeLessThan(template.indexOf('wx:if="{{loading}}"'));
    expect(template.match(/class="state-title" aria-hidden="true"/g)).toHaveLength(3);
    expect(template.match(/class="state-copy" aria-hidden="true"/g)).toHaveLength(3);
    for (const stylesheet of [styles, appStyles]) {
      expect(stylesheet).toMatch(/\.a11y-live-region\s*\{[^}]*position:\s*absolute/s);
      expect(stylesheet).toMatch(/\.a11y-live-region\s*\{[^}]*overflow:\s*hidden/s);
    }
  });
});

describe('StateView live announcements', () => {
  afterEach(() => vi.unstubAllGlobals());

  async function definition(): Promise<any> {
    let captured: any;
    vi.resetModules();
    vi.stubGlobal('Component', (value: any) => {
      captured = value;
    });
    // @ts-expect-error StateView registers through the Mini Program Component global.
    await import('../miniprogram/components/state-view/index');
    return captured;
  }

  it('announces loading then ready through the same polite region', async () => {
    const component = await definition();
    const observer = Object.values(component.observers)[0] as (...args: unknown[]) => void;
    const context = { setData: vi.fn() };

    observer.call(context, true, '', false, '正在加载活动', '请稍候', '暂无活动', '');
    expect(context.setData).toHaveBeenLastCalledWith({
      politeAnnouncement: '正在加载活动。请稍候',
      assertiveAnnouncement: '',
    });

    observer.call(context, false, '', false, '正在加载活动', '请稍候', '暂无活动', '');
    expect(context.setData).toHaveBeenLastCalledWith({
      politeAnnouncement: '内容已就绪',
      assertiveAnnouncement: '',
    });
  });

  it('announces a no-data load error assertively instead of reporting ready', async () => {
    const component = await definition();
    const observer = Object.values(component.observers)[0] as (...args: unknown[]) => void;
    const context = { setData: vi.fn() };

    observer.call(context, false, '活动加载失败', false, '正在加载', '请稍候', '暂无活动', '');

    expect(context.setData).toHaveBeenLastCalledWith({
      politeAnnouncement: '',
      assertiveAnnouncement: '加载失败。活动加载失败',
    });
  });
});
