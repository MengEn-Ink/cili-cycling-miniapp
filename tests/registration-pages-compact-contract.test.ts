// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (file: string) => readFileSync(file, 'utf8');

const form = read('miniprogram/pages/registration-form/index.wxml');
const formStyles = read('miniprogram/pages/registration-form/index.wxss');
const profileStyles = read('miniprogram/pages/profile/index.wxss');
const stravaStyles = read('miniprogram/pages/strava/index.wxss');
const registrations = read('miniprogram/pages/registrations/index.wxml');
const registrationStyles = read('miniprogram/pages/registrations/index.wxss');
const credential = read('miniprogram/pages/credential/index.wxml');
const credentialStyles = read('miniprogram/pages/credential/index.wxss');

describe('报名、行程与凭证紧凑交互契约', () => {
  it('首屏按步骤、活动、实名和集合方式组织，经验使用三段控件', () => {
    expect(form.indexOf('class="step-line"')).toBeLessThan(
      form.indexOf('class="activity-context"'),
    );
    expect(form.indexOf('class="activity-context"')).toBeLessThan(form.indexOf('实名信息'));
    expect(form.indexOf('<view>实名信息</view>')).toBeLessThan(
      form.indexOf('<view>集合方式</view>'),
    );
    expect(form).toContain('class="experience-segment"');
    expect(form.match(/class="segment \{\{/g)).toHaveLength(3);
    expect(form).toContain('value="有一定经验"');
    expect(form).toContain('checked="{{experience === \'有一定经验\'}}"');
    expect(form).not.toContain('value="有经验"');
    expect(form).not.toMatch(/用车方式|自带车|租车/);
  });

  it('明确绑定 Strava 准备状态，并在提交期间锁定所有入口', () => {
    expect(form).toContain('status-{{readiness.state}}');
    expect(form).toContain("readiness.state === 'ready' ? '数据可用'");
    expect(form).toContain("readiness.state === 'syncing' ? '同步中'");
    expect(form).toContain("readiness.state === 'disconnected' ? '未连接'");
    expect(form).toContain("{{submitting ? '正在提交' : '提交审核'}}");
    expect(form.match(/disabled="{{[^}]*submitting[^}]*}}"/g)?.length).toBeGreaterThanOrEqual(8);
    expect(formStyles).toContain('.experience-segment');
    expect(formStyles).toMatch(/\.segment\s*\{[^}]*min-height:\s*104rpx/s);
    for (const status of ['ready', 'syncing', 'authorizing', 'failed', 'disconnected']) {
      expect(formStyles).toContain(`status-${status}`);
    }
    expect(profileStyles).toContain('.hero-capability-status.status-verified');
    expect(stravaStyles).toMatch(/\.status-failed,\s*\.status-disconnected\s*\{/);
  });

  it('行程卡由报名字段驱动，四种状态都有可读视觉标记', () => {
    expect(registrations).toContain('status-{{item.status}}');
    expect(registrations).toContain('{{item.statusText}}');
    expect(registrations).toContain('{{item.activity.title}}');
    expect(registrations).toContain('{{item.activity.displayDate}}');
    expect(registrations).not.toContain('{{item.activity.date}}');
    expect(registrations).toContain('{{item.updatedAt}}');
    expect(registrations).toContain('{{item.gatheringMode}}');
    for (const status of ['pending', 'approved', 'checked_in', 'rejected', 'cancelled']) {
      expect(registrationStyles).toContain(`status-${status}`);
    }
  });

  it('凭证在 approved 和 checked_in 展示，签到后不提供取消', () => {
    expect(credential).toContain(
      `wx:if="{{item.status === 'approved' || item.status === 'checked_in'}}" class="credential-card"`,
    );
    expect(credential).toContain("item.status === 'pending' || item.status === 'approved'");
    expect(credential).toContain("item.status === 'checked_in' ? 'CHECKED IN'");
    expect(credential).toContain("item.status === 'checked_in' ? '已签到' : '已通过'");
    expect(credential).toContain("activityAction.kind === 'resubmit'");
    expect(credential).toContain("activityAction.kind === 'view-history'");
    expect(credential).toContain('{{item.serialNo}}');
    expect(credential).toContain('{{activity.schedule[0].location}}');
    expect(credential).toContain('最近更新 {{item.updatedAt}}');
    expect(credential).not.toContain('<view>已提交报名</view>');
  });

  it('长文案和窄屏具有收缩、换行与统一安全边距保护', () => {
    expect(formStyles).toContain('overflow-x: hidden');
    expect(formStyles).toContain('padding-right: var(--page-gutter);');
    expect(formStyles).toContain('padding-left: var(--page-gutter);');
    expect(formStyles).toContain('padding-right: var(--page-gutter-narrow);');
    expect(formStyles).toContain('padding-left: var(--page-gutter-narrow);');
    expect(formStyles).toContain('background: var(--color-brand);');
    expect(formStyles).toMatch(
      /@media \(max-width: 320px\)[\s\S]*?\.experience-segment\s*\{[^}]*box-sizing:\s*border-box[^}]*width:\s*100%/,
    );
    expect(registrationStyles).toContain('overflow-x: hidden');
    expect(credentialStyles).toContain('overflow-x: hidden');
    expect(`${formStyles}\n${registrationStyles}\n${credentialStyles}`).toContain(
      '@media (max-width: 340px)',
    );
    expect(registrationStyles).toContain('-webkit-line-clamp: 2');
    expect(credentialStyles).toContain('overflow-wrap: anywhere');
  });
});
