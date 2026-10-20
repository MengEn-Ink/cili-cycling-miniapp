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
    // RELEASE_NOTES 顶部为当前版本并保留历史版本，设置页仍只渲染 RELEASE_NOTES[0]。
    expect(page.data.releaseNotes).toHaveLength(15);
    expect(page.data.releaseNotes[0]).toMatchObject({
      version: CLIENT_RELEASE_VERSION,
      date: '2026-10-20',
      latest: true,
      title: '俱乐部管理更清晰',
    });
    expect(page.data.currentRelease).toBe(page.data.releaseNotes[0]);
    expect(page.data.releaseNotes[1]).toMatchObject({
      version: '2026.10.20.4',
      date: '2026-10-20',
      latest: false,
      title: '骑行名片、个人中心与路线分析修复',
    });
    expect(page.data.releaseNotes[2]).toMatchObject({
      version: '2026.10.20.3',
      date: '2026-10-20',
      latest: false,
      title: '管理端审核与活动安全修复',
    });
    expect(page.data.releaseNotes[3]).toMatchObject({
      version: '2026.10.20.2',
      date: '2026-10-20',
      latest: false,
      title: '报名凭证与活动详情更可靠',
    });
    expect(page.data.releaseNotes[4]).toMatchObject({
      version: '2026.10.19.5',
      latest: false,
      title: '俱乐部图片上传更稳定',
    });
    expect(page.data.releaseNotes[5]).toMatchObject({
      version: '2026.10.19.4',
      latest: false,
      title: '图片清理更可靠',
    });
    expect(page.data.releaseNotes[6]).toMatchObject({
      version: '2026.10.19.3',
      latest: false,
      title: '创建申请可撤回修改',
    });
    expect(page.data.releaseNotes[7]).toMatchObject({
      version: '2026.10.19.2',
      latest: false,
      title: '俱乐部活动投稿与审核',
    });
    expect(page.data.releaseNotes[8]).toMatchObject({
      version: '2026.10.19.1',
      latest: false,
      title: '图片上传链路全面统一',
    });
    expect(page.data.releaseNotes[9]).toMatchObject({
      version: '2026.10.18.8',
      latest: false,
      title: '界面风格统一',
    });
    expect(page.data.releaseNotes[10]).toMatchObject({
      version: '2026.10.18.7',
      latest: false,
      title: '图片上传稳定性升级',
    });
    expect(page.data.releaseNotes[11]).toMatchObject({
      version: '2026.10.18.6',
      latest: false,
      title: '俱乐部图片上传兼容性修复',
    });
    expect(page.data.releaseNotes[12]).toMatchObject({
      version: '2026.10.18.5',
      latest: false,
      title: '俱乐部推荐与图片体验修复',
    });
    expect(page.data.releaseNotes[13]).toMatchObject({
      version: '2026.10.18.4',
      latest: false,
      title: '俱乐部首页与人数上限',
    });
    expect(page.data.releaseNotes[14]).toMatchObject({
      version: '2026.10.18.3',
      latest: false,
      title: '俱乐部资料保存稳定性修复',
    });
    expect(page.data.releaseNotes.filter((note: { latest: boolean }) => note.latest)).toHaveLength(
      1,
    );
    expect(page.onShow).toBeUndefined();
    expect(page.loadStravaStatus).toBeUndefined();
    expect(page.openStrava).toBeUndefined();
    expect(readiness).not.toHaveBeenCalled();
  });

  it('版本号与日期对齐 2026.10.20.5', () => {
    expect(CLIENT_RELEASE_VERSION).toBe('2026.10.20.5');
    expect(page.data.currentRelease.version).toBe('2026.10.20.5');
    expect(page.data.currentRelease.date).toBe('2026-10-20');
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
