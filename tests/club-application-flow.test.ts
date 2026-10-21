// @ts-expect-error Node typings are intentionally omitted from the application build.
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { CloudRepository } from '../miniprogram/repositories/cloud';
import { MockRepository } from './support/mock-repository';

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
  avatar_file_id: 'cloud://env/club-applications/user/avatar.jpg',
  avatar_url: 'https://temporary.example/club-avatar.jpg',
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
  avatarFileId: 'cloud://env/club-applications/user/avatar.jpg',
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

  it('撤回发送稳定请求 ID 与期望审核版本，并映射 draft 响应', async () => {
    const callFunction = vi.fn().mockResolvedValue(success({ ...dto, status: 'draft' }));
    const repository = new CloudRepository({ callFunction });
    await expect(repository.withdrawClubApplication('withdraw_12345678', 1)).resolves.toMatchObject(
      {
        status: 'draft',
        reviewVersion: 1,
      },
    );
    expect(callFunction).toHaveBeenCalledWith({
      name: 'club-application',
      data: {
        action: 'withdraw',
        requestId: 'withdraw_12345678',
        expectedReviewVersion: 1,
      },
    });
    await expect(repository.withdrawClubApplication('withdraw_87654321', 0)).rejects.toMatchObject({
      code: 'VERSION_CONFLICT',
    });
  });

  it('MockRepository 与云端保持撤回幂等、版本冲突和重提递增语义', async () => {
    const repository = new MockRepository();
    const pending = await repository.submitClubApplication(form, 'mock-submit-0001');
    await expect(repository.withdrawClubApplication('mock-withdraw-1', 2)).rejects.toMatchObject({
      code: 'VERSION_CONFLICT',
    });
    const draft = await repository.withdrawClubApplication(
      'mock-withdraw-1',
      pending.reviewVersion,
    );
    await expect(
      repository.withdrawClubApplication('mock-withdraw-1', pending.reviewVersion),
    ).resolves.toBe(draft);
    await expect(
      repository.withdrawClubApplication('mock-withdraw-2', pending.reviewVersion),
    ).rejects.toMatchObject({ code: 'INVALID_STATE' });
    const resubmitted = await repository.submitClubApplication(form, 'mock-submit-0002');
    expect(resubmitted.reviewVersion).toBe(pending.reviewVersion + 1);
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

  it('用户端俱乐部只读主页与 #321 管理端入口同时保留', () => {
    const app = readFileSync('miniprogram/app.json', 'utf8');
    const profile = readFileSync('miniprogram/pages/profile/index.wxml', 'utf8');
    const center = readFileSync('miniprogram/pages/club/center/index.wxml', 'utf8');
    const centerScript = readFileSync('miniprogram/pages/club/center/index.ts', 'utf8');
    const cloudFunction = readFileSync('cloudfunctions/club-application/index.js', 'utf8');
    const core = readFileSync('cloudfunctions/club-application/core.js', 'utf8');
    const adminList = readFileSync('miniprogram/pages/admin/club-applications/index.wxml', 'utf8');
    const adminDetail = readFileSync(
      'miniprogram/pages/admin/club-application-detail/index.wxml',
      'utf8',
    );

    expect(app).toContain('"root": "pages/club"');
    expect(profile).toContain('暂未加入俱乐部');
    expect(profile).not.toContain('全平台唯一俱乐部');
    expect(profile).not.toContain('club-avatar-stack');
    expect(center).toContain('{{club.roleLabel}}');
    expect(center).toContain('查看全部活动');
    expect(center).toContain('wx:if="{{club.canManage}}"');
    expect(centerScript).toContain('getSoleClubHome');
    expect(centerScript).not.toContain('listJoinableClubs');

    expect(adminList).toContain('data-club-admin-overview');
    expect(adminList).toContain('创建唯一俱乐部');
    expect(adminDetail).toContain('创建并立即生效');
    expect(adminDetail).toContain('保存资料');

    for (const action of [
      'mine',
      'listJoinable',
      'joinPublicClub',
      'saveDraft',
      'submit',
      'withdraw',
      'review',
      'getSoleClubHome',
      'adminGetSoleClub',
      'adminCreateSoleClub',
      'adminUpdateSoleClub',
    ])
      expect(cloudFunction).toContain(`action === '${action}'`);
    expect(core).toContain('const canManage = isPlatformAdmin');
    expect(cloudFunction).toContain('DATA_MIGRATION_REQUIRED');
  });
});

describe('单俱乐部管理端读写闭环', () => {
  const soleClubId = `club_${'a'.repeat(64)}`;
  const soleClubDto = {
    id: soleClubId,
    name: '辛庄桥小火车',
    city: '北京',
    introduction: '全平台唯一俱乐部，固定在出城路线起点集合，欢迎稳定骑行的骑友。',
    avatar_file_id: 'cloud://env/profile-canonical/admin/club-avatar/avatar.jpg',
    avatar_url: 'https://temporary.example/sole-avatar.jpg',
    cover_file_id: '',
    cover_url: '',
    join_mode: 'public_apply',
    member_count: 0,
    max_members: 50,
    updated_at: '2026-10-20T08:00:00.000Z',
  };
  const soleForm = {
    name: '辛庄桥小火车',
    city: '北京',
    introduction: soleClubDto.introduction,
    avatarFileId: soleClubDto.avatar_file_id,
    coverFileId: '',
  };

  it('管理端概览：空库映射 exists:false，有俱乐部映射可信资料', async () => {
    const callFunction = vi
      .fn()
      .mockResolvedValueOnce(success({ exists: false }))
      .mockResolvedValueOnce(success({ exists: true, club: soleClubDto }));
    const repository = new CloudRepository({ callFunction });
    await expect(repository.getSoleClub()).resolves.toEqual({ exists: false });
    await expect(repository.getSoleClub()).resolves.toEqual({
      exists: true,
      club: {
        id: soleClubId,
        name: '辛庄桥小火车',
        city: '北京',
        introduction: soleClubDto.introduction,
        avatarFileId: soleClubDto.avatar_file_id,
        avatarUrl: 'https://temporary.example/sole-avatar.jpg',
        coverFileId: '',
        coverUrl: '',
        updatedAt: '2026-10-20T08:00:00.000Z',
      },
    });
    expect(callFunction.mock.calls[0][0]).toEqual({
      name: 'club-application',
      data: { action: 'adminGetSoleClub' },
    });
  });

  it('首次创建与资料更新只发送白名单字段、幂等请求 ID 与乐观锁版本', async () => {
    const callFunction = vi
      .fn()
      .mockResolvedValueOnce(success({ exists: true, club: soleClubDto }))
      .mockResolvedValueOnce(
        success({
          exists: true,
          club: { ...soleClubDto, name: '辛庄桥快车', updated_at: '2026-10-20T09:00:00.000Z' },
        }),
      );
    const repository = new CloudRepository({ callFunction });
    await repository.createSoleClub(soleForm, 'sole_create_1');
    expect(callFunction.mock.calls[0][0]).toMatchObject({
      name: 'club-application',
      data: { action: 'adminCreateSoleClub', requestId: 'sole_create_1' },
    });
    expect(callFunction.mock.calls[0][0].data.club).toEqual({
      name: '辛庄桥小火车',
      city: '北京',
      introduction: soleClubDto.introduction,
      avatar_file_id: soleClubDto.avatar_file_id,
      cover_file_id: '',
    });
    expect(callFunction.mock.calls[0][0].data.club).not.toHaveProperty('join_mode');
    await repository.updateSoleClub(
      { ...soleForm, name: '辛庄桥快车' },
      'sole_update_1',
      soleClubDto.updated_at,
    );
    expect(callFunction.mock.calls[1][0].data).toMatchObject({
      action: 'adminUpdateSoleClub',
      requestId: 'sole_update_1',
      expectedUpdatedAt: soleClubDto.updated_at,
    });
  });

  it('MockRepository 保持空库 bootstrap、唯一创建与乐观锁语义', async () => {
    const repository = new MockRepository();
    await expect(repository.getSoleClub()).resolves.toEqual({ exists: false });
    const created = await repository.createSoleClub(soleForm, 'mock-sole-create-1');
    expect(created.name).toBe('辛庄桥小火车');
    // 同 requestId 重试幂等；新 requestId 不能创建第二个。
    await expect(repository.createSoleClub(soleForm, 'mock-sole-create-1')).resolves.toMatchObject({
      name: '辛庄桥小火车',
    });
    await expect(repository.createSoleClub(soleForm, 'mock-sole-create-2')).rejects.toMatchObject({
      code: 'CLUB_ALREADY_EXISTS',
    });
    await expect(
      repository.updateSoleClub(soleForm, 'mock-sole-update-1', 'stale-version'),
    ).rejects.toMatchObject({ code: 'CLUB_PROFILE_CONFLICT' });
    const updated = await repository.updateSoleClub(
      { ...soleForm, city: '上海' },
      'mock-sole-update-2',
      created.updatedAt,
    );
    expect(updated.city).toBe('上海');
    await expect(repository.getSoleClub()).resolves.toMatchObject({
      exists: true,
      club: { city: '上海' },
    });
  });
});
