// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { expandAppRoutes, type MiniProgramAppConfig } from './helpers/app-routes';
// @ts-expect-error Node ESM script is exercised directly by Vitest.
import * as packageSize from '../scripts/check-main-package-size.mjs';

const {
  MAIN_PACKAGE_BASELINE_BYTES,
  MINIMUM_REDUCTION_BYTES,
  assertMainPackageBudget,
  mainPackageFiles,
} = packageSize;

const appConfig = JSON.parse(readFileSync('miniprogram/app.json', 'utf8')) as MiniProgramAppConfig;

const expectedPackages = [
  { root: 'pages/activity-detail', pages: ['index'] },
  { root: 'pages/route-analysis', pages: ['index'] },
  { root: 'pages/profile-edit', pages: ['index'] },
  { root: 'pages/club', pages: ['center/index'] },
  {
    root: 'pages/admin',
    pages: [
      'activity-list/index',
      'activity-edit/index',
      'reviews/index',
      'review-detail/index',
      'club-applications/index',
      'club-application-detail/index',
    ],
  },
];

describe('按需分包与主包字节契约', () => {
  it('五个低频功能均按需加载且完整路由仍为 17 个', () => {
    expect(appConfig.subpackages).toEqual(expectedPackages);
    const routes = expandAppRoutes(appConfig);
    expect(routes).toHaveLength(17);
    expect(routes).toEqual(
      expect.arrayContaining([
        'pages/route-analysis/index',
        'pages/profile-edit/index',
        'pages/club/center/index',
        'pages/admin/activity-list/index',
      ]),
    );
  });

  it('路线分析专属实现不驻留主包，静态资源计入上传口径', () => {
    const mainFiles = mainPackageFiles();
    expect(mainFiles).toContain('miniprogram/assets/brand/logo-circle-144.png');
    expect(
      mainFiles.some((file: string) => file.startsWith('miniprogram/utils/route-analysis')),
    ).toBe(false);
    expect(
      mainFiles.some((file: string) => file.startsWith('miniprogram/pages/route-analysis/')),
    ).toBe(false);
    expect(
      mainFiles.some((file: string) => file.startsWith('miniprogram/pages/profile-edit/')),
    ).toBe(false);
    expect(mainFiles.some((file: string) => file.startsWith('miniprogram/pages/club/'))).toBe(
      false,
    );
  });

  it('以微信实际上传文件集合锁定主包至少减少 80 KiB', () => {
    const result = assertMainPackageBudget();
    expect(result.baselineBytes).toBe(MAIN_PACKAGE_BASELINE_BYTES);
    expect(result.reduction).toBeGreaterThanOrEqual(MINIMUM_REDUCTION_BYTES);
  });
});
