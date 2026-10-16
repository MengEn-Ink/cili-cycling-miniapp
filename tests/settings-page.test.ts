// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CLIENT_RELEASE_VERSION } from '../miniprogram/config/release';

const readiness = vi.hoisted(() => vi.fn());
vi.mock('../miniprogram/repositories/index', () => ({
  repository: { getStravaReadiness: readiness },
}));

describe('设置页', () => {
  let page: any;

  beforeEach(async () => {
    vi.resetModules();
    readiness.mockReset();
    vi.stubGlobal('Page', (definition: any) => {
      page = definition;
      page.data = { ...definition.data };
    });
    await import('../miniprogram/pages/settings/index');
  });

  it('只加载当前版本日志，不注册第三方账号生命周期或入口', () => {
    expect(page.data.releaseNotes).toHaveLength(5);
    expect(page.data.releaseNotes[0]).toMatchObject({
      version: CLIENT_RELEASE_VERSION,
      latest: true,
      title: '沸点主题全站统一与行程页精确对齐',
    });
    expect(page.data.releaseNotes.filter((note: { latest: boolean }) => note.latest)).toHaveLength(
      1,
    );
    expect(page.data.releaseNotes.slice(1).every((note: { latest: boolean }) => !note.latest)).toBe(
      true,
    );
    const versions = page.data.releaseNotes.map((note: { version: string }) => note.version);
    expect(versions).toEqual([
      CLIENT_RELEASE_VERSION,
      '2026.10.16.72',
      '2026.10.16.70',
      '2026.10.16.68',
      '2026.10.15.67',
    ]);
    expect(page.onShow).toBeUndefined();
    expect(page.loadStravaStatus).toBeUndefined();
    expect(page.openStrava).toBeUndefined();
    expect(readiness).not.toHaveBeenCalled();
  });

  it('模板不再包含第三方授权区或 Strava 页面跳转', () => {
    const template = readFileSync('miniprogram/pages/settings/index.wxml', 'utf8');
    const script = readFileSync('miniprogram/pages/settings/index.ts', 'utf8');
    expect(template).not.toContain('第三方授权');
    expect(template).not.toContain('loadStravaStatus');
    expect(script).not.toContain('/pages/strava/index');
    expect(script).not.toContain('getStravaReadiness');
  });

  it('小程序清单隐藏 OAuth 页面并将相册权限限定为活动群二维码', () => {
    const config = JSON.parse(readFileSync('miniprogram/app.json', 'utf8'));
    expect(config.pages).not.toContain('pages/strava/index');
    expect(config.permission['scope.writePhotosAlbum'].desc).toBe('仅用于保存活动群二维码到相册');
  });
});
