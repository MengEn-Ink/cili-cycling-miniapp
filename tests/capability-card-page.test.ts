import { describe, expect, it } from 'vitest';
import { loadCapabilityCard } from '../miniprogram/services/capability-card-service';
import type { RideRepository } from '../miniprogram/repositories/types';

const card = (state: any, error: any = null) => ({
  nickname: '骑手',
  avatarId: '',
  photos: [],
  period: { days: 90 as const, label: '90天汇总' },
  metrics: null,
  readiness: { state, error },
});

describe('个人骑行名片页面契约', () => {
  it.each([
    ['disconnected', '去授权 Strava'],
    ['authorizing', '查看授权进度'],
    ['syncing', '刷新状态'],
    ['failed', '去重试'],
    ['ready', '管理 Strava'],
  ])('%s 状态提供明确操作', async (state, action) => {
    const repository = { getCapabilityCard: async () => card(state) } as unknown as RideRepository;
    await expect(loadCapabilityCard(repository)).resolves.toMatchObject({ status: { action } });
  });

  it('失败状态优先显示后端安全错误文案', async () => {
    const repository = {
      getCapabilityCard: async () => card('failed', { message: '请稍后重试', retryable: true }),
    } as unknown as RideRepository;
    await expect(loadCapabilityCard(repository)).resolves.toMatchObject({
      status: { detail: '请稍后重试' },
    });
  });
});
