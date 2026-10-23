// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { CloudRepository } from '../miniprogram/repositories/cloud';

const activityDto = {
  _id: 'activity-1',
  version: 1,
  title: '周末骑行',
  status: 'published',
  event_start: '2026-10-18T00:00:00.000Z',
  event_end: '2026-10-18T04:00:00.000Z',
  signup_deadline: '2026-10-17T12:00:00.000Z',
  capacity: 20,
  description: '',
  route: { start: '集合点', end: '', distance_km: 30, elevation_m: 100, level: '休闲' },
  schedule: [],
  notices: [],
  equipment: [],
  fee: '',
  registration_state: 'open',
  closed_reason: null,
  server_now: '2026-10-17T00:00:00.000Z',
};

const success = (data: unknown) => ({ result: { ok: true, data } });

describe('M0 俱乐部前端映射与交互契约', () => {
  it('映射活动可信快照，公开活动使用无 ID 的中性身份', async () => {
    const callFunction = vi
      .fn()
      .mockResolvedValueOnce(
        success({
          ...activityDto,
          club_id: 'club-1',
          club_identity: {
            id: 'club-1',
            name: '山海骑行会',
            avatar_url: 'https://img.example/club.jpg',
          },
        }),
      )
      .mockResolvedValueOnce(success(activityDto));
    const repository = new CloudRepository({ callFunction });

    await expect(repository.getActivity('activity-1')).resolves.toMatchObject({
      clubId: 'club-1',
      clubIdentity: {
        clubId: 'club-1',
        name: '山海骑行会',
        avatarUrl: 'https://img.example/club.jpg',
      },
    });
    const publicActivity = await repository.getActivity('activity-1');
    expect(publicActivity.clubIdentity).toEqual({ name: '此里公开活动', avatarUrl: '' });
    expect(publicActivity.clubIdentity).not.toHaveProperty('clubId');
  });

  it('映射 profile.club_memberships，并且保存只发送 club_id', async () => {
    const callFunction = vi
      .fn()
      .mockResolvedValueOnce(
        success({
          nickname: '骑手',
          completeness: 100,
          club_memberships: [
            {
              club_id: 'club-1',
              role: 'admin',
              role_label: '管理员',
              club_identity: { name: '山海骑行会', avatar_url: 'https://img.example/club.jpg' },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(success({ ...activityDto, club_id: 'club-1' }));
    const repository = new CloudRepository({ callFunction });

    await expect(repository.getProfile()).resolves.toMatchObject({
      clubs: [
        {
          clubId: 'club-1',
          name: '山海骑行会',
          avatarUrl: 'https://img.example/club.jpg',
          role: 'admin',
          roleLabel: '管理员',
        },
      ],
    });
    await repository.saveActivity({
      clubId: 'club-1',
      title: '周末骑行',
      status: 'published',
      description: '',
      startAt: activityDto.event_start,
      endAt: activityDto.event_end,
      deadline: activityDto.signup_deadline,
      capacity: 20,
      route: { start: '集合点', end: '', distanceKm: 30, elevationM: 100, level: '休闲' },
      schedule: [],
      notices: [],
      equipment: [],
      fee: '',
    });
    const payload = callFunction.mock.calls[1][0].data.activity;
    expect(payload.club_id).toBe('club-1');
    expect(payload).not.toHaveProperty('club_identity');
  });

  it('复用俱乐部身份规则解析会员关系中的嵌套 ID', async () => {
    const callFunction = vi.fn().mockResolvedValue(
      success({
        nickname: '骑手',
        completeness: 100,
        club_memberships: [
          {
            role: 'member',
            club_identity: { id: 'club-from-id', name: '远山骑行会', avatar_url: '' },
          },
          {
            role: 'organizer',
            club_identity: {
              club_id: 'club-from-club-id',
              name: '江畔骑行会',
              avatar_url: '',
            },
          },
        ],
      }),
    );
    const repository = new CloudRepository({ callFunction });

    await expect(repository.getProfile()).resolves.toMatchObject({
      clubs: [
        { clubId: 'club-from-id', name: '远山骑行会' },
        { clubId: 'club-from-club-id', name: '江畔骑行会' },
      ],
    });
  });

  it('单俱乐部收口后个人中心直接展示俱乐部名称与品牌文字占位', () => {
    const profileLogic = readFileSync('miniprogram/pages/profile/index.ts', 'utf8');
    const profileView = readFileSync('miniprogram/pages/profile/index.wxml', 'utf8');
    const editorLogic = readFileSync('miniprogram/pages/admin/activity-edit/index.ts', 'utf8');
    expect(profileLogic).toContain('clubAvatarFailed');
    expect(profileLogic).not.toContain('clubs.slice(0, 4)');
    expect(profileView).toContain('{{profile.clubs[0].name}}');
    expect(profileView).not.toContain('全平台唯一俱乐部');
    expect(profileView).toContain('binderror="clubAvatarError"');
    // 新设计：俱乐部入口以 row.rowlink.row-club 承载，头像兜底以 rowicon-text “俱” 文字占位
    expect(profileView).toMatch(/class="row rowlink rowbutton row-club"/);
    expect(profileView).toContain('class="rowicon-text">俱</text>');
    expect(profileView).toContain('暂未加入俱乐部');
    expect(profileView).not.toContain('club-avatar-stack');
    expect(profileView).not.toContain('clubOverflowCount');
    expect(profileView).not.toContain('可申请创建或查看申请进度');
    expect(editorLogic).toContain('clubOptionChange');
    expect(editorLogic).toContain(
      'clubId: this.data.clubOptions[this.data.clubOptionIndex]?.clubId',
    );
  });
});
