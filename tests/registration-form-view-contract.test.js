import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const template = fs.readFileSync('miniprogram/pages/registration-form/index.wxml', 'utf8');
const styles = fs.readFileSync('miniprogram/pages/registration-form/index.wxss', 'utf8');

describe('报名表单受控控件与视觉契约', () => {
  it.each([
    `checked="{{gatheringMode === 'self_drive'}}"`,
    `checked="{{gatheringMode === 'support_vehicle'}}"`,
    `checked="{{experience === '新手'}}"`,
    `checked="{{experience === '有一定经验'}}"`,
    `checked="{{experience === '常骑'}}"`,
  ])('radio checked 由页面 data 驱动：%s', (binding) => {
    expect(template).toContain(binding);
  });

  it('集合方式使用新字段并展示分类容量与剩余名额', () => {
    expect(template).toContain('data-key="gatheringMode"');
    expect(template).toContain('value="self_drive"');
    expect(template).toContain('value="support_vehicle"');
    expect(template).toContain('activity.selfDriveCapacity');
    expect(template).toContain('activity.selfDriveRemaining');
    expect(template).toContain('activity.supportVehicleCapacity');
    expect(template).toContain('activity.supportVehicleRemaining');
    expect(template).not.toMatch(/bikeMode|bike_mode|用车方式|自带车|租车/);
  });

  it('顶部展示步骤、活动上下文和审核说明', () => {
    expect(template).toContain('STEP 1 填写');
    expect(template).toContain('CURRENT ACTIVITY');
    expect(template).toContain('{{activity.title');
    expect(template).toContain('提交后将进入审核');
  });

  it('提交期间禁用资料、Strava、全部 radio、备注与次按钮', () => {
    expect(template).toMatch(/bindtap="profile"[^>]*disabled="{{submitting}}"/);
    expect(template).toMatch(/bindtap="strava"[^>]*disabled="{{submitting}}"/);
    expect(template.match(/<radio [^>]*disabled="{{[^}]*submitting[^}]*}}"/g)).toHaveLength(5);
    expect(template).toMatch(/<textarea [^>]*disabled="{{submitting}}"/);
    expect(template).toMatch(/class="secondary back-button"[^>]*disabled="{{submitting}}"/);
    expect(template).toContain("{{submitting ? '正在提交' : '提交审核'}}");
  });

  it('备注、错误和 disabled 状态有明确层级', () => {
    expect(template).toMatch(/<textarea [^>]*value="{{remark}}"/);
    expect(template).toContain('role="alert"');
    expect(template).toContain('disabled-hint');
    expect(styles).toContain('.error-card');
    expect(styles).toContain('.form-page button[disabled]');
  });

  it('保持纯色 CILI 深色主题且小屏布局不溢出', () => {
    expect(styles).toContain('background: var(--color-bg)');
    expect(styles).toContain('@media (max-width: 340px)');
    expect(styles).toContain('grid-template-columns: 1fr');
    expect(styles).toContain('overflow-x: hidden');
    expect(styles).not.toContain('linear-gradient');
    expect(template).not.toMatch(/<image|background-image/);
  });
});
