// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { expandAppRoutes, type MiniProgramAppConfig } from './helpers/app-routes';
// @ts-expect-error Node ESM script is exercised directly by Vitest.
import * as packageSize from '../scripts/check-main-package-size.mjs';

const {
  MAIN_PACKAGE_BASELINE_BYTES,
  MAIN_PACKAGE_HARD_LIMIT_BYTES,
  MAIN_PACKAGE_WARNING_BYTES,
  MINIMUM_REDUCTION_BYTES,
  assessMainPackageBytes,
  assertMainPackageBudget,
  mainPackageFiles,
} = packageSize;

const appConfig = JSON.parse(readFileSync('miniprogram/app.json', 'utf8')) as MiniProgramAppConfig;

const expectedPackages = [
  { root: 'pages/settings', pages: ['index'] },
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
  it('六个低频功能均按需加载且完整路由仍为 17 个', () => {
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

  it('分包页面只依赖自身分包或公共模块，避免真机加载空白', () => {
    const activityEditor = readFileSync('miniprogram/pages/admin/activity-edit/index.ts', 'utf8');

    expect(activityEditor).not.toContain("from '../../activity-detail/");
    expect(activityEditor).toContain("from '../../../utils/route-visual'");
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
    expect(mainFiles.some((file: string) => file.endsWith('/.DS_Store'))).toBe(false);
    expect(mainFiles).not.toContain('miniprogram/repositories/mock.ts');
    expect(mainFiles.some((file: string) => file.startsWith('miniprogram/mock/'))).toBe(false);
  });

  it('退役组件和测试替身不回流生产源码或页面注册', () => {
    const retiredPaths = [
      'miniprogram/components/activity-card/index.wxml',
      'miniprogram/components/blur-text/index.wxml',
      'miniprogram/components/metric-grid/index.wxml',
      'miniprogram/utils/registration.ts',
    ];
    for (const path of retiredPaths) expect(existsSync(path), path).toBe(false);

    const pageConfigs = expandAppRoutes(appConfig)
      .map((route) => readFileSync(`miniprogram/${route}.json`, 'utf8'))
      .join('\n');
    expect(pageConfigs).not.toMatch(/activity-card|blur-text|metric-grid/);
    expect(readFileSync('miniprogram/repositories/persistent.ts', 'utf8')).not.toContain(
      'MemoryCacheStorage',
    );
  });

  it('保留 80 KiB 减量硬门禁，并在接近限额时给出余量预警', () => {
    const result = assertMainPackageBudget();
    expect(result.baselineBytes).toBe(MAIN_PACKAGE_BASELINE_BYTES);
    expect(result.reduction).toBeGreaterThanOrEqual(MINIMUM_REDUCTION_BYTES);
    expect(result.hardLimitBytes).toBe(MAIN_PACKAGE_BASELINE_BYTES - MINIMUM_REDUCTION_BYTES);
    expect(result.remainingBytes).toBe(MAIN_PACKAGE_HARD_LIMIT_BYTES - result.bytes);

    const warning = assessMainPackageBytes(MAIN_PACKAGE_WARNING_BYTES);
    expect(warning.warning).toBe(true);
    expect(warning.remainingBytes).toBe(MAIN_PACKAGE_HARD_LIMIT_BYTES - MAIN_PACKAGE_WARNING_BYTES);
    expect(() => assessMainPackageBytes(MAIN_PACKAGE_HARD_LIMIT_BYTES + 1)).toThrow(/硬限额/);
  });
});
