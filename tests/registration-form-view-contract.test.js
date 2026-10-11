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

  it('日常活动默认自行前往并隐藏集合方式选择，同时不提供自行组队入口', () => {
    expect(template).toContain('wx:if="{{showGatheringChoice}}"');
    expect(template).toContain('日常活动默认自行前往，无需额外选择');
    expect(styles).toMatch(/\.gathering-default\s*\{[^}]*display:\s*flex/);
    expect(styles).toMatch(/\.default-choice-badge\s*\{[^}]*flex:\s*0 0 auto/);
    expect(template).not.toContain('组队报名');
    expect(template).not.toContain('填写队名后成为队长');
    expect(template).not.toContain('队伍与备注都会保留');
  });

  it('顶部展示步骤、活动上下文和审核说明', () => {
    expect(template).toContain('确认报名信息');
    expect(template).toContain('当前活动');
    expect(template).toContain('{{activity.title');
    expect(template).toContain('提交后将进入审核');
  });

  it('提交期间禁用资料、Strava、全部 radio、备注与次按钮', () => {
    expect(template).toMatch(/bindtap="profile"[^>]*disabled="{{submitting}}"/);
    expect(template).toMatch(/bindtap="strava"[^>]*disabled="{{submitting}}"/);
    expect(template.match(/<radio [^>]*disabled="{{[^}]*submitting[^}]*}}"/g)).toHaveLength(5);
    expect(template).toMatch(/<textarea [^>]*disabled="{{submitting}}"/);
    expect(template).toMatch(/class="secondary back-button"[^>]*disabled="{{submitting}}"/);
    expect(template).toContain("{{submitting ? '正在提交' : '提交报名'}}");
  });

  it('备注、错误和 disabled 状态有明确层级', () => {
    expect(template).toMatch(/<textarea [^>]*value="{{remark}}"/);
    expect(template).toContain('role="alert"');
    expect(template).toContain('disabled-hint');
    expect(styles).toContain('.error-card');
    expect(styles).toContain('.form-page button[disabled]');
  });

  it('资料缺失时汇总问题并引导完善，且说明返回后保留已填内容', () => {
    expect(template).toContain('profileErrors.length');
    expect(template).toContain('还需完善 {{profileErrors.length}} 项资料');
    expect(template).toContain('去完善个人资料');
    expect(template).toContain('骑行经验与备注都会保留');
    expect(template).toContain('微信昵称');
    expect(template).toContain('联系电话');
    expect(template).not.toMatch(/真实姓名|个人照片|未填写实名/);
    expect(styles).toContain('.profile-alert');
  });

  it('保持 CILI 浅色主题、资料栅格对齐且小屏布局不溢出', () => {
    expect(template).toContain('class="identity-grid"');
    expect(template).toContain(
      'class="context-status">{{activityCanSubmit ? \'报名开放\' : activityAction.label}}',
    );
    expect(template).toContain('提交报名');
    expect(template).toContain('请先完成必填项并确认 Strava 数据已就绪');
    expect(styles).toContain('background: var(--color-bg)');
    expect(styles).toContain('.identity-grid');
    expect(styles).toContain('grid-template-columns: minmax(0, 1fr) 0.62fr minmax(0, 1.35fr)');
    expect(styles).toContain('@media (max-width: 340px)');
    expect(styles).toContain('grid-template-columns: 1fr');
    expect(styles).toContain('overflow-x: hidden');
    expect(styles).not.toContain('linear-gradient');
    expect(styles).not.toMatch(/background:\s*#(?:0d0d0e|111113|29292b)/i);
    expect(styles).not.toContain('border-left: 6rpx');
    expect(template).not.toMatch(/<image|background-image/);
  });
});
