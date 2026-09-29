import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const template = fs.readFileSync('miniprogram/pages/registration-form/index.wxml', 'utf8');

describe('报名表单受控控件契约', () => {
  it.each([
    `checked="{{gatheringMode === 'self_drive'}}"`,
    `checked="{{gatheringMode === 'support_vehicle'}}"`,
    `checked="{{experience === '新手'}}"`,
    `checked="{{experience === '有一定经验'}}"`,
    `checked="{{experience === '常骑'}}"`,
  ])('radio checked 由页面 data 驱动：%s', (binding) => {
    expect(template).toContain(binding);
  });

  it('集合方式必须由用户主动二选一，且旧字段和旧文案不再出现', () => {
    expect(template).toContain('data-key="gatheringMode"');
    expect(template).toContain('value="self_drive"');
    expect(template).toContain('value="support_vehicle"');
    expect(template).not.toMatch(/bikeMode|bike_mode|用车方式|自带车|租车/);
  });

  it('提交期间禁用资料、Strava、radio 和备注控件', () => {
    expect(template).toMatch(/bindtap="profile"[^>]*disabled="{{submitting}}"/);
    expect(template).toMatch(/bindtap="strava"[^>]*disabled="{{submitting}}"/);
    expect(template.match(/<radio [^>]*disabled="{{submitting}}"/g)).toHaveLength(5);
    expect(template).toMatch(/<textarea [^>]*disabled="{{submitting}}"/);
  });

  it('备注输入框由 remark data 驱动', () => {
    expect(template).toMatch(/<textarea [^>]*value="{{remark}}"/);
  });
});
