// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('Strava 路线 OAuth 最小恢复契约', () => {
  it('只恢复路线导入云函数，不恢复账号主页、指标快照和报名耦合', () => {
    expect(existsSync('cloudfunctions/strava-bridge')).toBe(true);
    expect(existsSync('cloudfunctions/strava-callback')).toBe(true);
    expect(existsSync('miniprogram/pages/strava')).toBe(false);
    expect(existsSync('miniprogram/services/strava-readiness-service.ts')).toBe(false);

    const profile = read('cloudfunctions/profile/index.js');
    const registration = read('cloudfunctions/registration/index.js');
    expect(`${profile}\n${registration}`).not.toMatch(
      /strava_credentials|strava_snapshots|syncStrava|disconnectStrava|importStravaAvatar/,
    );
  });

  it('凭证与 state 使用独立全拒绝集合且不会被旧退役清理删除', () => {
    const bootstrap = read('scripts/bootstrap-cloudbase.mjs');
    const maintenance = read('cloudfunctions/route-maintenance/index.js');
    expect(bootstrap).toContain("'strava_credentials'");
    expect(bootstrap).toContain("'oauth_states'");
    expect(bootstrap).toContain('DENY_RULE = { read: false, write: false }');
    const retired = maintenance.slice(
      maintenance.indexOf('const RETIRED_COLLECTIONS'),
      maintenance.indexOf('const MIGRATION_COLLECTIONS'),
    );
    expect(retired).not.toContain("'strava_credentials'");
    expect(retired).not.toContain("'oauth_states'");
  });

  it('环境、网关与部署包包含最小 Strava 配置', () => {
    const combined = [
      read('cloudfunctions/.env.example'),
      read('cloudbaserc.json'),
      read('scripts/cloudbase-function-env.mjs'),
      read('scripts/verify-cloud-packages.mjs'),
    ].join('\n');
    for (const name of [
      'STRAVA_CLIENT_ID',
      'STRAVA_CLIENT_SECRET',
      'STRAVA_TOKEN_ENCRYPTION_KEY',
      'STRAVA_CALLBACK_URL',
    ])
      expect(combined).toContain(name);
    expect(combined).toContain('/strava/callback');
    expect(combined).toContain('strava-bridge');
    expect(combined).toContain('strava-callback');
  });

  it('活动编辑页收敛为 Strava 线路地址，连接管理归入设置页', () => {
    const template = read('miniprogram/pages/admin/activity-edit/index.wxml');
    const source = read('miniprogram/pages/admin/activity-edit/index.ts');
    // 活动编辑页不再显示连接 / 复制授权链接按钮
    expect(template).not.toContain('连接 Strava');
    expect(template).not.toContain('复制授权链接');
    // 保留 Strava 线路地址输入 + 解析能力
    expect(template).toContain('Strava 线路地址');
    expect(template).toContain('粘贴 Strava 线路链接');
    expect(template).toContain('解析线路');
    // + 隐藏入口承载本地路线补充
    expect(template).toContain('route-link-plus');
    expect(template).toContain('route-boost-sheet');
    expect(template).toContain('补充本地路线文件');
    // 默认交互不暴露 GPX 文案
    expect(template).not.toContain('上传 GPX');
    expect(template).not.toContain('GPX 路线详情');
    // 现有后端能力继续复用（授权发起已迁入设置页）
    expect(source).toContain('getStravaRouteReadiness');
    expect(source).toContain('importStravaRoute');
    expect(source).not.toContain('startStravaRouteAuthorization');
    expect(source).toContain("wx.navigateTo({ url: '/pages/settings/index' })");
    expect(source).not.toMatch(/access_token|refresh_token|CLIENT_SECRET/);
  });

  it('设置页承载管理员专属的 Strava 线路同步入口', () => {
    const template = read('miniprogram/pages/settings/index.wxml');
    const source = read('miniprogram/pages/settings/index.ts');
    expect(template).toContain('同步 Strava 线路信息');
    expect(template).toContain('bindtap="openStravaSync"');
    expect(template).toContain('wx:if="{{isAdmin}}"');
    expect(source).toContain('getStravaRouteReadiness');
    expect(source).toContain('startStravaRouteAuthorization');
    // 面向用户的 Strava 文案不含 GPX / OAuth / token / 令牌
    const stravaCopy = source.match(/const STRAVA_COPY[\s\S]*?};/)?.[0] || '';
    expect(stravaCopy).not.toMatch(/GPX|OAuth|token|令牌/i);
  });
});
