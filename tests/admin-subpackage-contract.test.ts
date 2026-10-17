// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { expandAppRoutes, type MiniProgramAppConfig } from './helpers/app-routes';

const appConfig = JSON.parse(readFileSync('miniprogram/app.json', 'utf8')) as MiniProgramAppConfig;
const adminRoutes = [
  'pages/admin/activity-list/index',
  'pages/admin/activity-edit/index',
  'pages/admin/reviews/index',
  'pages/admin/review-detail/index',
];

describe('管理员页面分包契约', () => {
  it('管理员页面只在 pages/admin 分包中以相对路径声明', () => {
    expect(appConfig.pages).not.toEqual(expect.arrayContaining(adminRoutes));
    expect(appConfig.subpackages).toEqual([
      {
        root: 'pages/admin',
        pages: [
          'activity-list/index',
          'activity-edit/index',
          'reviews/index',
          'review-detail/index',
        ],
      },
    ]);
  });

  it('展开分包后仍保留全部 14 个真实跳转路径', () => {
    const routes = expandAppRoutes(appConfig);
    expect(routes).toHaveLength(14);
    expect(routes).toEqual(expect.arrayContaining(adminRoutes));
    expect(new Set(routes).size).toBe(routes.length);
  });
});
