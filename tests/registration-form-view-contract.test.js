import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const template = fs.readFileSync('miniprogram/pages/registration-form/index.wxml', 'utf8');

describe('报名表单受控控件契约', () => {
  it.each([
    `checked="{{bikeMode === '自带车'}}"`,
    `checked="{{bikeMode === '租车'}}"`,
    `checked="{{experience === '新手'}}"`,
    `checked="{{experience === '有一定经验'}}"`,
    `checked="{{experience === '常骑'}}"`,
  ])('radio checked 由页面 data 驱动：%s', (binding) => {
    expect(template).toContain(binding);
  });

  it('提交期间禁用资料、Strava、radio 和备注控件', () => {
    expect(template).toMatch(/bindtap="profile"[^>]*disabled="{{submitting}}"/);
    expect(template).toMatch(/bindtap="strava"[^>]*disabled="{{submitting}}"/);
    expect(template.match(/<radio [^>]*disabled="{{submitting}}"/g)).toHaveLength(5);
    expect(template).toMatch(/<textarea [^>]*disabled="{{submitting}}"/);
  });
});
