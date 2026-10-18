// @ts-expect-error Node typings are intentionally omitted from the application build.
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { CloudRepository } from '../miniprogram/repositories/cloud';

const success = (data: unknown) => ({ result: { ok: true, data } });
const dto = {
  id: 'clubapp-1',
  status: 'pending_review',
  review_version: 1,
  club_name: '山海骑行会',
  city: '深圳',
  introduction: '我们每周组织安全友好的公路骑行训练活动。',
  applicant_contact: 'wx:rider',
  join_mode: 'public_apply',
  expected_size: 30,
  activity_types: '公路骑行',
  rules_summary: '遵守交通规则并全程佩戴头盔。',
  cover_file_id: 'cloud://env/club-applications/user/cover.jpg',
  cover_url: 'https://temporary.example/club-cover.jpg',
  rejection_reason: '',
  club_id: '',
  created_at: '2026-10-17T10:00:00.000Z',
  updated_at: '2026-10-17T10:00:00.000Z',
  submitted_at: '2026-10-17T10:00:00.000Z',
  reviewed_at: '',
};
const form = {
  clubName: '山海骑行会',
  city: '深圳',
  introduction: '我们每周组织安全友好的公路骑行训练活动。',
  applicantContact: 'wx:rider',
  joinMode: 'public_apply' as const,
  expectedSize: 30,
  activityTypes: '公路骑行',
  rulesSummary: '遵守交通规则并全程佩戴头盔。',
  coverFileId: 'cloud://env/club-applications/user/cover.jpg',
};

describe('俱乐部创建申请生产闭环', () => {
  it('本人读取与提交只通过 club-application 云函数，不信任客户端审批状态', async () => {
    const callFunction = vi
      .fn()
      .mockResolvedValueOnce(success(null))
      .mockResolvedValueOnce(success(dto));
    const repository = new CloudRepository({ callFunction });
    await expect(repository.getMyClubApplication()).resolves.toBeNull();
    await expect(repository.submitClubApplication(form, 'submit_12345678')).resolves.toMatchObject({
      status: 'pending_review',
      reviewVersion: 1,
      clubName: '山海骑行会',
      coverUrl: 'https://temporary.example/club-cover.jpg',
    });
    expect(callFunction.mock.calls[1][0]).toMatchObject({
      name: 'club-application',
      data: { action: 'submit', requestId: 'submit_12345678' },
    });
    expect(callFunction.mock.calls[1][0].data.application).not.toHaveProperty('status');
    expect(callFunction.mock.calls[1][0].data.application).not.toHaveProperty('applicant_openid');
  });

  it('管理员审批只发送决定、原因和幂等请求 ID', async () => {
    const callFunction = vi
      .fn()
      .mockResolvedValue(success({ ...dto, status: 'approved', club_id: 'club-1' }));
    const repository = new CloudRepository({ callFunction });
    await repository.reviewClubApplication('clubapp-1', 'approved', '', 'review_12345678');
    expect(callFunction).toHaveBeenCalledWith({
      name: 'club-application',
      data: {
        action: 'review',
        applicationId: 'clubapp-1',
        decision: 'approved',
        reason: '',
        requestId: 'review_12345678',
      },
    });
  });

  it('路由、用户状态、管理员入口、隐私和失败恢复均有静态契约', () => {
    const app = readFileSync('miniprogram/app.json', 'utf8');
    const profile = readFileSync('miniprogram/pages/profile/index.wxml', 'utf8');
    const center = readFileSync('miniprogram/pages/club/center/index.wxml', 'utf8');
    const adminList = readFileSync('miniprogram/pages/admin/club-applications/index.wxml', 'utf8');
    const adminDetailView = readFileSync(
      'miniprogram/pages/admin/club-application-detail/index.wxml',
      'utf8',
    );
    const cloudFunction = readFileSync('cloudfunctions/club-application/index.js', 'utf8');
    const admin = readFileSync('miniprogram/pages/admin/club-application-detail/index.ts', 'utf8');
    expect(app).toContain('"root": "pages/club"');
    expect(app).toContain('"center/index"');
    expect(app).toContain('club-applications/index');
    expect(profile).toContain('可申请创建或查看申请进度');
    for (const copy of ['草稿待提交', '平台审批中', '申请已驳回，可修改重提', '申请已通过'])
      expect(center).toContain(copy);
    expect(center).toContain('申请资料仅你本人和平台管理员可见');
    expect(center).toMatch(/club-page-head[\s\S]*create-mini[\s\S]*＋ 新建/);
    expect(center).toContain('class="joined-card"');
    expect(center).toContain('bindtap="openClubDetail"');
    expect(center).toContain('推荐俱乐部');
    expect(center).toContain('人数待同步');
    expect(center).toContain('item.capacityInitialized && item.memberCount >= item.maxMembers');
    expect(center).toContain('待补俱乐部头像');
    expect(center).toContain('必填，支持相册或拍照');
    expect(center).toContain('data-field="maxMembers"');
    expect(center).toContain('data-value="500"');
    for (const view of [center, adminList, adminDetailView]) {
      expect(view).toContain('coverUrl');
      expect(view).not.toMatch(/src="\{\{(?:application\.|item\.|form\.)?coverFileId\}\}"/);
    }
    expect(center).toContain('coverPreviewUrl');
    expect(cloudFunction).toMatch(
      /action === 'mine'[\s\S]*resolveApplicationCover\(cloud, project\(value\), openid\)/,
    );
    expect(cloudFunction).toMatch(
      /action === 'adminList'[\s\S]*resolveApplicationCovers\(cloud, projected\)/,
    );
    expect(cloudFunction).toMatch(
      /action === 'adminDetail'[\s\S]*resolveApplicationCover\(cloud, project\(value, true\)\)/,
    );
    expect(center).toContain('actionError');
    expect(center).toContain('loadError');
    expect(center).not.toMatch(/loadError[^\n]*actionError/);
    expect(admin).toContain('通过后将立即创建俱乐部');
  });
});
