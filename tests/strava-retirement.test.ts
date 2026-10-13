// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const collectFiles = (directory: string, extensions: Set<string>): string[] => {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap(
    (entry: { name: string; isDirectory: () => boolean }) => {
      if (entry.name === 'node_modules') return [];
      if (entry.name.includes('.test.') || entry.name.includes('.node-test.')) return [];
      const path = `${directory}/${entry.name}`;
      if (entry.isDirectory()) return collectFiles(path, extensions);
      const extension = entry.name.includes('.')
        ? entry.name.slice(entry.name.lastIndexOf('.'))
        : '';
      return extensions.has(extension) ? [path] : [];
    },
  );
};

const readFiles = (files: string[]) =>
  files.map((file) => `\n--- ${file} ---\n${readFileSync(file, 'utf8')}`).join('');

describe('Strava 账号能力退役契约', () => {
  it('不再包含 OAuth 云函数、账号页面、轮询服务或授权素材', () => {
    const retiredPaths = [
      'cloudfunctions/strava-auth',
      'cloudfunctions/strava-callback',
      'cloudfunctions/strava-shared',
      'miniprogram/pages/strava',
      'miniprogram/services/strava-readiness-service.ts',
      'miniprogram/assets/strava/connect-with-strava.svg',
    ];
    expect(retiredPaths.filter(existsSync)).toEqual([]);

    const cloudbase = readFileSync('cloudbaserc.json', 'utf8');
    const packageConfig = readFileSync('package.json', 'utf8');
    expect(`${cloudbase}\n${packageConfig}`).not.toMatch(
      /strava-auth|strava-callback|\/strava\/(?:callback|success|failure)/,
    );
  });

  it('运行时代码不再读取凭证、账号快照或调用旧账号仓储方法', () => {
    const runtimeSources = readFiles([
      ...collectFiles('miniprogram', new Set(['.ts', '.js', '.json', '.wxml'])),
      ...collectFiles('cloudfunctions', new Set(['.js', '.json'])),
      ...collectFiles('scripts', new Set(['.js', '.mjs', '.cjs'])),
    ]);

    expect(runtimeSources).not.toMatch(
      /oauth_states|oauth_attempts|strava_credentials|strava_snapshots|STRAVA_TOKEN_KEY/,
    );
    expect(runtimeSources).not.toMatch(
      /importStravaAvatar|getStravaReadiness|ensureStravaReady|startStrava|cancelStravaAuthorization|syncStrava|disconnectStrava|previewPublicStravaRoute|previewStravaRoute|getStravaRouteGpx|exportActivityGpx/,
    );
  });

  it('用户可见页面只保留官方路线品牌，不再提供账号授权、同步或主页入口', () => {
    const visibleSources = readFiles([
      ...collectFiles('miniprogram/pages', new Set(['.ts', '.wxml'])),
      ...collectFiles('miniprogram/components', new Set(['.ts', '.wxml'])),
    ]);
    expect(visibleSources).not.toMatch(
      /授权 Strava|绑定 Strava|连接 Strava|解绑 Strava|同步(?:最新 )?Strava|Strava 数据|Strava 状态|Strava 主页/,
    );

    const appConfig = JSON.parse(readFileSync('miniprogram/app.json', 'utf8')) as {
      pages: string[];
    };
    expect(appConfig.pages).not.toContain('pages/strava/index');
  });
});
