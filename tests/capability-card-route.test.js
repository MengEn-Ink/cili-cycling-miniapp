import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('个人骑行名片路由与导入', () => {
  it('注册页面并从个人中心进入', () => {
    const app = JSON.parse(fs.readFileSync('miniprogram/app.json', 'utf8'));
    expect(app.pages).toContain('pages/capability-card/index');
    expect(fs.readFileSync('miniprogram/pages/profile/index.wxml', 'utf8')).toContain(
      'bindtap="capabilityCard"',
    );
    const source = fs.readFileSync('miniprogram/pages/capability-card/index.ts', 'utf8');
    expect(source).toContain('../../services/capability-card-service');
    expect(source).toContain('../../repositories/index');
  });
});
