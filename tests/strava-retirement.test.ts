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

  it('活动编辑页提供连接、导入、复制授权链接与手工 GPX 降级入口', () => {
    const template = read('miniprogram/pages/admin/activity-edit/index.wxml');
    const source = read('miniprogram/pages/admin/activity-edit/index.ts');
    expect(template).toContain('连接 Strava');
    expect(template).toContain('复制授权链接');
    expect(template).toContain('从 Strava 导入');
    expect(template).toContain('上传 GPX');
    expect(source).toContain('getStravaRouteReadiness');
    expect(source).toContain('startStravaRouteAuthorization');
    expect(source).toContain('importStravaRoute');
    expect(source).not.toMatch(/access_token|refresh_token|CLIENT_SECRET/);
  });
});
