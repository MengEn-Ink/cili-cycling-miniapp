import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Strava ready 视图契约', () => {
  it('渲染 coverage 与同步时间', () => {
    const template = fs.readFileSync('miniprogram/pages/strava/index.wxml', 'utf8');

    expect(template).toContain('{{snapshotMeta.coverageText}}');
    expect(template).toContain('{{snapshotMeta.syncedAtText}}');
  });
});
