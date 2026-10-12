import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Strava ready 视图契约', () => {
  it('渲染 coverage 与同步时间', () => {
    const template = fs.readFileSync('miniprogram/pages/strava/index.wxml', 'utf8');

    expect(template).toContain('{{snapshotMeta.coverageText}}');
    expect(template).toContain('{{snapshotMeta.syncedAtText}}');
  });

  it('使用官方品牌素材并把 10 人额度说明收敛到授权场景', () => {
    const template = fs.readFileSync('miniprogram/pages/strava/index.wxml', 'utf8');

    expect(template).toContain('/assets/strava/connect-with-strava.svg');
    expect(template).toContain('仅在创建活动并同步 Strava 路线时使用');
    expect(template).toContain('Strava 默认仅提供 10 个共享授权名额');
    expect(template).not.toContain('当前开放 10 个运动达人连接名额');
  });
});
