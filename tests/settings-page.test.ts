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

  it('只展示当前版本的 App 更新卡片，不展示历史日志', () => {
    // RELEASE_NOTES 仍保留最新一条，供 scripts/check-release-notes.mjs 发布门禁识别。
    expect(page.data.releaseNotes).toHaveLength(1);
    expect(page.data.releaseNotes[0]).toMatchObject({
      version: CLIENT_RELEASE_VERSION,
      date: '2026-10-17',
      latest: true,
      title: '俱乐部归属更清楚，路线分享更可靠',
    });
    expect(page.data.currentRelease).toBe(page.data.releaseNotes[0]);
    expect(page.data.releaseNotes.filter((note: { latest: boolean }) => note.latest)).toHaveLength(
      1,
    );
    expect(page.onShow).toBeUndefined();
    expect(page.loadStravaStatus).toBeUndefined();
    expect(page.openStrava).toBeUndefined();
    expect(readiness).not.toHaveBeenCalled();
  });

  it('版本号与日期对齐 2026.10.17.82', () => {
    expect(CLIENT_RELEASE_VERSION).toBe('2026.10.17.82');
    expect(page.data.currentRelease.version).toBe('2026.10.17.82');
    expect(page.data.currentRelease.date).toBe('2026-10-17');
  });

  it('设置页模板只渲染当前版本卡片，不出现历史时间线容器', () => {
    const template = readFileSync('miniprogram/pages/settings/index.wxml', 'utf8');
    expect(template).toContain('App 更新');
    expect(template).toContain('{{currentRelease.version}}');
    expect(template).toContain('wx:if="{{currentRelease}}"');
    expect(template).not.toContain('wx:for="{{releaseNotes}}"');
    expect(template).not.toContain('release-rail');
    expect(template).not.toContain('release-dot');
  });

  it('面向用户的设置页模板中不出现门禁、接口、令牌、OpenID、FileID 等技术词', () => {
    const template = readFileSync('miniprogram/pages/settings/index.wxml', 'utf8');
    expect(template).not.toMatch(
      /门禁|接口|令牌|token|OpenID|openid|fileID|FileID|云开发|云存储|云端(?!更新)/,
    );
    // 用户可见数据来源于 TS 中的 RELEASE_NOTES[0]，验证其面向用户的字段不含技术词。
    const script = readFileSync('miniprogram/pages/settings/index.ts', 'utf8');
    const releaseNotesBlock = script.match(/const RELEASE_NOTES[\s\S]*?\]\s*as const;/)?.[0] || '';
    expect(releaseNotesBlock).not.toMatch(
      /门禁|接口|令牌|token|OpenID|openid|fileID|FileID|云开发|云存储|云端(?!更新)/,
    );
  });

  it('模板不再包含第三方授权区或 Strava 页面跳转', () => {
    const template = readFileSync('miniprogram/pages/settings/index.wxml', 'utf8');
    const script = readFileSync('miniprogram/pages/settings/index.ts', 'utf8');
    expect(template).not.toContain('第三方授权');
    expect(template).not.toContain('loadStravaStatus');
    expect(script).not.toContain('/pages/strava/index');
    expect(script).not.toContain('getStravaReadiness');
  });

  it('小程序清单隐藏 OAuth 页面并只声明实际使用的位置能力', () => {
    const config = JSON.parse(readFileSync('miniprogram/app.json', 'utf8'));
    expect(config.pages).not.toContain('pages/strava/index');
    expect(config.requiredPrivateInfos).toEqual(['chooseLocation']);
    expect(config.permission).toBeUndefined();
  });
});
