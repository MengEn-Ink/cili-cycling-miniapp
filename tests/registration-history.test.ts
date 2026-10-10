import { describe, expect, it, vi } from 'vitest';
import { CloudRepository } from '../miniprogram/repositories/cloud';

const registration = {
  _id: 'r-history',
  activity_id: 'a-history',
  status: 'checked_in',
  profile_snapshot: {},
  updated_at: '2026-01-02T00:00:00.000Z',
};

function activity(id: string, title: string, patch: Record<string, unknown> = {}) {
  return {
    _id: id,
    title,
    status: 'finished',
    event_start: '2026-01-01T00:00:00.000Z',
    event_end: '2026-01-01T08:00:00.000Z',
    registration_state: 'closed',
    closed_reason: 'finished',
    server_now: '2026-10-09T15:00:00.000Z',
    ...patch,
  };
}

function repositoryWith(dto: unknown) {
  return new CloudRepository({
    callFunction: vi.fn(async ({ data }: { data?: { action?: string } }) => ({
      result: {
        ok: true,
        data:
          data?.action === 'minePage' && Array.isArray(dto)
            ? { items: dto, next_cursor: null }
            : dto,
      },
    })),
  });
}

describe('报名历史活动投影', () => {
  it('我的行程保留已完成活动', async () => {
    const [result] = await repositoryWith([
      { ...registration, activity: activity('a-history', '已完成骑行') },
    ]).listRegistrations();
    expect(result.activity).toMatchObject({ title: '已完成骑行', status: 'finished' });
  });

  it('我的行程保留下架活动的 owner-bound 投影', async () => {
    const [result] = await repositoryWith([
      { ...registration, activity: activity('a-history', '已下架骑行') },
    ]).listRegistrations();
    expect(result.activity?.title).toBe('已下架骑行');
    expect(result.activity?.closedReason).toBe('finished');
  });

  it('活动实体缺失时接受报名快照生成的合理降级详情', async () => {
    const result = await repositoryWith({
      ...registration,
      activity: activity('a-history', '历史活动', {
        event_start: registration.updated_at,
        event_end: registration.updated_at,
      }),
    }).getRegistration('r-history');
    expect(result.activity).toMatchObject({
      id: 'a-history',
      title: '历史活动',
      status: 'finished',
    });
  });
});
