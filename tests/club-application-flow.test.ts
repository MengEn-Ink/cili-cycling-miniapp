// @ts-expect-error Node typings are intentionally omitted from the application build.
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { CloudRepository } from '../miniprogram/repositories/cloud';
import { MockRepository } from '../miniprogram/repositories/mock';

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
    const adminListLogic = readFileSync(
      'miniprogram/pages/admin/club-applications/index.ts',
      'utf8',
    );
    const adminListJson = readFileSync(
      'miniprogram/pages/admin/club-applications/index.json',
      'utf8',
    );
    const adminDetailJson = readFileSync(
      'miniprogram/pages/admin/club-application-detail/index.json',
      'utf8',
    );
    expect(app).toContain('"root": "pages/club"');
    expect(app).toContain('"center/index"');
    expect(app).toContain('club-applications/index');
    expect(profile).toContain('可申请创建或查看申请进度');
    // 管理员入口改名为“俱乐部管理”，不再出现审批口径。
    expect(profile).toContain('俱乐部管理');
    expect(profile).not.toContain('俱乐部创建审批');
    for (const copy of ['草稿待提交', '平台审批中', '申请已驳回，可修改重提', '申请已通过'])
      expect(center).toContain(copy);
    expect(center).toContain('申请资料仅你本人和平台管理员可见');
    expect(center).toContain('bindtap="withdrawApplication"');
    expect(center).toContain('正在撤回');
    expect(center).toContain('申请仍在审核中');
    expect(center).toMatch(/club-page-head[\s\S]*create-mini[\s\S]*＋ 新建/);
    expect(center).toContain('class="joined-card"');
    expect(center).toContain('bindtap="openClubDetail"');
    expect(center).toContain('推荐俱乐部');
    expect(center).toContain('人数待同步');
    expect(center).toContain('item.capacityInitialized && item.memberCount >= item.maxMembers');
    expect(center).toContain('待补俱乐部头像');
    expect(center).toContain('俱乐部头像（必填）· 1:1');
    expect(center).toContain('背景照片（可选）· 16:9');
    expect(center.match(/bindtap="chooseAvatar"/g)).toHaveLength(2);
    expect(center.match(/bindtap="chooseCover"/g)).toHaveLength(2);
    expect(center).toContain('src="{{selectedClub.coverUrl}}"');
    expect(center).not.toContain('src="{{selectedClub.avatarUrl}}" class="detail-cover');
    expect(center).toContain('data-field="maxMembers"');
    expect(center).toContain('data-value="500"');
    expect(center).toContain('coverUrl');
    expect(center).toContain('coverPreviewUrl');
    expect(center).not.toMatch(/src="\{\{(?:application\.|item\.|form\.)?coverFileId\}\}"/);
    // 管理概览页：唯一俱乐部概览 + bootstrap 空库首次创建，不再有列表与筛选。
    expect(adminList).toContain('俱乐部管理');
    expect(adminList).toContain('data-club-admin-overview');
    expect(adminList).toContain('全平台唯一');
    expect(adminList).toContain('ACTIVE');
    expect(adminList).toContain('编辑俱乐部资料');
    expect(adminList).toContain('创建唯一俱乐部');
    expect(adminList).toContain('尚未创建俱乐部');
    expect(adminList).toContain('binderror="avatarError"');
    expect(adminList).not.toContain('filter-tab');
    expect(adminList).not.toContain('待审批');
    expect(adminListJson).toContain('"navigationBarTitleText": "俱乐部管理"');
    // 管理资料页：01 头像 1:1 / 02 背景 16:9 / 03 基本资料，含创建与编辑两态。
    for (const heading of ['01 俱乐部头像', '02 俱乐部背景图', '03 基本资料'])
      expect(adminDetailView).toContain(heading);
    expect(adminDetailView).toContain('1:1');
    expect(adminDetailView).toContain('16:9');
    expect(adminDetailView).toContain('创建并立即生效');
    expect(adminDetailView).toContain('保存资料');
    expect(adminDetailView).toContain('不能创建第二个俱乐部');
    expect(adminDetailView).toContain('binderror="avatarError"');
    expect(adminDetailView).toContain('binderror="coverError"');
    expect(adminDetailView).toContain('canvas-id="clubMediaCanvas"');
    for (const removed of ['审核意见', '申请人联络', '通过并创建', '加入方式', '预计成员', '驳回'])
      expect(adminDetailView).not.toContain(removed);
    expect(adminDetailView).not.toMatch(/src="\{\{[^}]*FileId[^}]*\}\}"/);
    expect(adminDetailJson).toContain('"navigationBarTitleText": "俱乐部资料"');
    expect(cloudFunction).toMatch(
      /action === 'mine'[\s\S]*resolveApplicationCover\(cloud, project\(value\), openid\)/,
    );
    expect(cloudFunction).toMatch(
      /action === 'withdraw'[\s\S]*withdrawApplication[\s\S]*expectedReviewVersion/,
    );
    expect(cloudFunction).toMatch(
      /action === 'adminList'[\s\S]*resolveApplicationCovers\(cloud, projected\)/,
    );
    expect(cloudFunction).toMatch(
      /action === 'adminDetail'[\s\S]*resolveApplicationCover\(cloud, project\(value, true\)\)/,
    );
    // 单俱乐部管理动作接线：空库返回 exists:false、首次创建与资料更新。
    expect(cloudFunction).toContain("action === 'adminGetSoleClub'");
    expect(cloudFunction).toContain("action === 'adminCreateSoleClub'");
    expect(cloudFunction).toContain("action === 'adminUpdateSoleClub'");
    expect(cloudFunction).toContain('全平台只允许存在一个俱乐部，不能创建第二个');
    expect(cloudFunction).not.toContain("action === 'adminDeleteSoleClub'");
    expect(adminListLogic).toContain('rideService.getSoleClub()');
    expect(adminListLogic).not.toContain('listClubApplications');
    expect(admin).toContain('getSoleClub');
    expect(admin).toContain('createSoleClub');
    expect(admin).toContain('updateSoleClub');
    expect(admin).toContain('CLUB_PROFILE_CONFLICT');
    expect(admin).not.toContain('reviewClubApplication');
    expect(center).toContain('actionError');
    expect(center).toContain('loadError');
    expect(center).not.toMatch(/loadError[^\n]*actionError/);
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
