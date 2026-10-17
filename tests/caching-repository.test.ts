import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CachingRepository,
  REPOSITORY_CACHE_CAPACITY,
  TtlCache,
} from '../miniprogram/repositories/cached';
import type { RideRepository } from '../miniprogram/repositories/types';

/** 构造只包含被测路径方法的假仓储，避免依赖 wx 或真实网络。 */
function makeInner() {
  return {
    listActivities: vi.fn(),
    listActivityPage: vi.fn(),
    getActivity: vi.fn(),
    listRegistrations: vi.fn(),
    getProfile: vi.fn(),
    getPersonalCapabilityCard: vi.fn(),
    getPhoneNumber: vi.fn(),
    joinPublicClub: vi.fn(),
    updateManagedClub: vi.fn(),
    saveActivity: vi.fn(),
    cloneActivity: vi.fn(),
    deleteActivity: vi.fn(),
    saveRegistration: vi.fn(),
    updateRegistration: vi.fn(),
    cancelRegistration: vi.fn(),
    reviewRegistration: vi.fn(),
    checkInRegistration: vi.fn(),
    registerProfileMedia: vi.fn(),
    setAvatar: vi.fn(),
    updateProfile: vi.fn(),
  } as unknown as RideRepository;
}

const capabilityCard = {
  generatedAt: '2026-10-13T08:00:00.000Z',
  profile: { displayName: '骑手', gender: '' },
  backgrounds: [],
};

describe('TtlCache', () => {
  it('写入后可读取，未命中返回 undefined', () => {
    const cache = new TtlCache<string>(1000, 5, () => 0);
    expect(cache.get('a')).toBeUndefined();
    cache.set('a', 'v');
    expect(cache.get('a')).toBe('v');
  });

  it('超过 TTL 后过期并回源', () => {
    let now = 100;
    const cache = new TtlCache<string>(50, 5, () => now);
    cache.set('a', 'v');
    now = 149;
    expect(cache.get('a')).toBe('v');
    now = 150;
    expect(cache.get('a')).toBeUndefined();
  });

  it('达到容量上限时淘汰最早写入项', () => {
    const cache = new TtlCache<string>(1000, 2, () => 0);
    cache.set('a', '1');
    cache.set('b', '2');
    cache.set('c', '3');
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe('2');
    expect(cache.get('c')).toBe('3');
  });

  it('重复写入同一 key 会刷新其淘汰顺序', () => {
    const cache = new TtlCache<string>(1000, 2, () => 0);
    cache.set('a', '1');
    cache.set('b', '2');
    cache.set('a', '1-updated');
    cache.set('c', '3');
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toBe('1-updated');
    expect(cache.get('c')).toBe('3');
  });

  it('clearPrefix 只清理指定命名空间', () => {
    const cache = new TtlCache<string>(1000, REPOSITORY_CACHE_CAPACITY, () => 0);
    cache.set('act:1', 'a');
    cache.set('profile:1', 'p');
    cache.clearPrefix('act:');
    expect(cache.get('act:1')).toBeUndefined();
    expect(cache.get('profile:1')).toBe('p');
    cache.clear();
    expect(cache.size).toBe(0);
  });
});

describe('CachingRepository 只读缓存', () => {
  let inner: ReturnType<typeof makeInner>;
  let repo: CachingRepository;

  beforeEach(() => {
    inner = makeInner();
    repo = new CachingRepository(inner);
  });

  it('read-through：TTL 内相同读取只回源一次', async () => {
    vi.mocked(inner.listActivityPage).mockResolvedValue({
      items: [{ id: 'a1' }],
      nextCursor: null,
      asOf: 'now',
    } as Awaited<ReturnType<RideRepository['listActivityPage']>>);
    const first = await repo.listActivityPage('future');
    const second = await repo.listActivityPage('future');
    expect(inner.listActivityPage).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
  });

  it('不同 view 或 cursor 使用独立缓存键', async () => {
    vi.mocked(inner.listActivityPage).mockResolvedValue({
      items: [],
      nextCursor: null,
      asOf: 'now',
    } as Awaited<ReturnType<RideRepository['listActivityPage']>>);
    await repo.listActivityPage('future');
    await repo.listActivityPage('history');
    await repo.listActivityPage('future', 'cursor-1');
    expect(inner.listActivityPage).toHaveBeenCalledTimes(3);
    expect(inner.listActivityPage).toHaveBeenNthCalledWith(1, 'future', undefined);
    expect(inner.listActivityPage).toHaveBeenNthCalledWith(2, 'history', undefined);
    expect(inner.listActivityPage).toHaveBeenNthCalledWith(3, 'future', 'cursor-1');
  });

  it('listActivities 按 filter 分别缓存', async () => {
    vi.mocked(inner.listActivities).mockResolvedValue([{ id: 'a' }] as Awaited<
      ReturnType<RideRepository['listActivities']>
    >);
    await repo.listActivities('upcoming');
    await repo.listActivities('upcoming');
    await repo.listActivities('history');
    expect(inner.listActivities).toHaveBeenCalledTimes(2);
  });

  it('getActivity 按 id 分别缓存', async () => {
    vi.mocked(inner.getActivity)
      .mockResolvedValueOnce({ id: 'a' } as Awaited<ReturnType<RideRepository['getActivity']>>)
      .mockResolvedValueOnce({ id: 'b' } as Awaited<ReturnType<RideRepository['getActivity']>>);
    await repo.getActivity('a');
    await repo.getActivity('a');
    await repo.getActivity('b');
    expect(inner.getActivity).toHaveBeenCalledTimes(2);
  });

  it('并发的相同读取复用同一请求，只回源一次', async () => {
    let resolveRequest!: (value: unknown) => void;
    const pending = new Promise<unknown>((resolve) => {
      resolveRequest = resolve;
    });
    vi.mocked(inner.getActivity).mockImplementation(
      () => pending as ReturnType<RideRepository['getActivity']>,
    );
    const first = repo.getActivity('same');
    const second = repo.getActivity('same');
    expect(inner.getActivity).toHaveBeenCalledTimes(1);
    resolveRequest({ id: 'same' });
    const [a, b] = await Promise.all([first, second]);
    expect(a).toEqual({ id: 'same' });
    expect(b).toBe(a);
    // 完成后命中缓存，仍只回源一次。
    await repo.getActivity('same');
    expect(inner.getActivity).toHaveBeenCalledTimes(1);
  });

  it('读取失败不写缓存，允许后续重新回源', async () => {
    vi.mocked(inner.getActivity)
      .mockRejectedValueOnce(new Error('网络失败'))
      .mockResolvedValueOnce({ id: 'retry' } as Awaited<ReturnType<RideRepository['getActivity']>>);
    await expect(repo.getActivity('retry')).rejects.toThrow('网络失败');
    const value = await repo.getActivity('retry');
    expect(value).toEqual({ id: 'retry' });
    expect(inner.getActivity).toHaveBeenCalledTimes(2);
  });

  it('回源同步抛出时转为拒绝，且清理并发标记后可重读', async () => {
    vi.mocked(inner.getActivity).mockImplementation(() => {
      throw new Error('同步错误');
    });
    await expect(repo.getActivity('boom')).rejects.toThrow('同步错误');
    vi.mocked(inner.getActivity).mockResolvedValue({ id: 'ok' } as Awaited<
      ReturnType<RideRepository['getActivity']>
    >);
    const value = await repo.getActivity('boom');
    expect(value).toEqual({ id: 'ok' });
    expect(inner.getActivity).toHaveBeenCalledTimes(2);
  });

  it('个人资料、能力卡与我的报名使用短 TTL，权限判断保持直通', async () => {
    vi.mocked(inner.getProfile).mockResolvedValue({ nickname: '骑手' } as Awaited<
      ReturnType<RideRepository['getProfile']>
    >);
    vi.mocked(inner.getPersonalCapabilityCard).mockResolvedValue(
      capabilityCard as Awaited<ReturnType<RideRepository['getPersonalCapabilityCard']>>,
    );
    vi.mocked(inner.listRegistrations).mockResolvedValue([]);
    vi.mocked(inner.getPhoneNumber).mockResolvedValue({ nickname: '骑手' } as Awaited<
      ReturnType<RideRepository['getPhoneNumber']>
    >);

    await repo.getProfile();
    await repo.getProfile();
    await repo.getPersonalCapabilityCard();
    await repo.getPersonalCapabilityCard();
    await repo.listRegistrations();
    await repo.listRegistrations();
    await repo.getPhoneNumber('code');
    await repo.getPhoneNumber('code');

    expect(inner.getProfile).toHaveBeenCalledOnce();
    expect(inner.getPersonalCapabilityCard).toHaveBeenCalledOnce();
    expect(inner.listRegistrations).toHaveBeenCalledOnce();
    expect(inner.getPhoneNumber).toHaveBeenCalledTimes(2);
  });
});

describe('CachingRepository 写后失效', () => {
  let inner: ReturnType<typeof makeInner>;
  let repo: CachingRepository;

  beforeEach(() => {
    inner = makeInner();
    repo = new CachingRepository(inner);
    // 写方法默认成功。
    vi.mocked(inner.saveActivity).mockResolvedValue({ id: 'a' } as Awaited<
      ReturnType<RideRepository['saveActivity']>
    >);
    vi.mocked(inner.cloneActivity).mockResolvedValue({ id: 'c' } as Awaited<
      ReturnType<RideRepository['cloneActivity']>
    >);
    vi.mocked(inner.deleteActivity).mockResolvedValue(undefined);
    vi.mocked(inner.saveRegistration).mockResolvedValue({ id: 'r' } as Awaited<
      ReturnType<RideRepository['saveRegistration']>
    >);
    vi.mocked(inner.updateRegistration).mockResolvedValue({ id: 'u' } as Awaited<
      ReturnType<RideRepository['updateRegistration']>
    >);
    vi.mocked(inner.cancelRegistration).mockResolvedValue({ id: 'c' } as Awaited<
      ReturnType<RideRepository['cancelRegistration']>
    >);
    vi.mocked(inner.reviewRegistration).mockResolvedValue({ id: 'rv' } as Awaited<
      ReturnType<RideRepository['reviewRegistration']>
    >);
    vi.mocked(inner.checkInRegistration).mockResolvedValue({ id: 'ci' } as Awaited<
      ReturnType<RideRepository['checkInRegistration']>
    >);
  });

  it('活动或报名写入后失效活动缓存，下次读取重新回源', async () => {
    vi.mocked(inner.getActivity).mockResolvedValue({ id: 'a' } as Awaited<
      ReturnType<RideRepository['getActivity']>
    >);
    await repo.getActivity('a');
    expect(inner.getActivity).toHaveBeenCalledTimes(1);

    const activityWrites: Array<() => Promise<unknown>> = [
      () => repo.saveActivity({} as Parameters<RideRepository['saveActivity']>[0]),
      () =>
        repo.cloneActivity({
          sourceActivityId: 'a',
          requestId: 'r',
        } as Parameters<RideRepository['cloneActivity']>[0]),
      () => repo.deleteActivity('a', '清理草稿'),
      () =>
        repo.saveRegistration({
          activityId: 'a',
          gatheringMode: 'self_drive',
          experience: 'new',
        } as Parameters<RideRepository['saveRegistration']>[0]),
      () => repo.updateRegistration('r', 'approved'),
      () => repo.cancelRegistration('r'),
      () => repo.reviewRegistration('r', 'rejected', '原因'),
      () => repo.checkInRegistration('r'),
    ];
    for (const write of activityWrites) {
      await write();
      await repo.getActivity('a');
    }
    // 1 次初始读取 + 每次写后 1 次回源。
    expect(inner.getActivity).toHaveBeenCalledTimes(1 + activityWrites.length);
  });

  it('资料写入只失效资料缓存，报名写入精确失效报名与活动缓存', async () => {
    vi.mocked(inner.getProfile).mockResolvedValue({ nickname: '骑手' } as Awaited<
      ReturnType<RideRepository['getProfile']>
    >);
    vi.mocked(inner.getPersonalCapabilityCard).mockResolvedValue(
      capabilityCard as Awaited<ReturnType<RideRepository['getPersonalCapabilityCard']>>,
    );
    vi.mocked(inner.listRegistrations).mockResolvedValue([]);
    vi.mocked(inner.getActivity).mockResolvedValue({ id: 'a' } as Awaited<
      ReturnType<RideRepository['getActivity']>
    >);
    vi.mocked(inner.updateProfile).mockResolvedValue({ nickname: '新骑手' } as Awaited<
      ReturnType<RideRepository['updateProfile']>
    >);

    await Promise.all([
      repo.getProfile(),
      repo.getPersonalCapabilityCard(),
      repo.listRegistrations(),
      repo.getActivity('a'),
    ]);
    await repo.updateProfile({ nickname: '新骑手' });
    await Promise.all([
      repo.getProfile(),
      repo.getPersonalCapabilityCard(),
      repo.listRegistrations(),
      repo.getActivity('a'),
    ]);
    expect(inner.getProfile).toHaveBeenCalledTimes(2);
    expect(inner.getPersonalCapabilityCard).toHaveBeenCalledTimes(2);
    expect(inner.listRegistrations).toHaveBeenCalledOnce();
    expect(inner.getActivity).toHaveBeenCalledOnce();

    await repo.saveRegistration({ activityId: 'a' } as Parameters<
      RideRepository['saveRegistration']
    >[0]);
    await Promise.all([repo.getProfile(), repo.listRegistrations(), repo.getActivity('a')]);
    expect(inner.getProfile).toHaveBeenCalledTimes(2);
    expect(inner.listRegistrations).toHaveBeenCalledTimes(2);
    expect(inner.getActivity).toHaveBeenCalledTimes(2);
  });

  it('公开加入成功后失效 profile 缓存并立即回源新 membership', async () => {
    vi.mocked(inner.getProfile)
      .mockResolvedValueOnce({ nickname: '骑手', clubs: [] } as unknown as Awaited<
        ReturnType<RideRepository['getProfile']>
      >)
      .mockResolvedValueOnce({ nickname: '骑手', clubs: [{ clubId: 'club-1' }] } as Awaited<
        ReturnType<RideRepository['getProfile']>
      >);
    vi.mocked(inner.joinPublicClub).mockResolvedValue({
      club: {
        id: 'club-1',
        name: '山海骑行会',
        city: '深圳',
        introduction: '每周组织安全友好的骑行活动',
        avatarUrl: '',
        avatarInitial: '山',
      },
      role: 'MEMBER',
      status: 'active',
    });

    await repo.getProfile();
    await repo.getProfile();
    expect(inner.getProfile).toHaveBeenCalledOnce();

    await repo.joinPublicClub('club-1', 'join-request-0001');
    const fresh = await repo.getProfile();

    expect(inner.getProfile).toHaveBeenCalledTimes(2);
    expect(fresh.clubs).toHaveLength(1);
  });

  it('公开加入失败时不清理 profile 缓存', async () => {
    const cachedProfile = { nickname: '骑手', clubs: [] } as unknown as Awaited<
      ReturnType<RideRepository['getProfile']>
    >;
    vi.mocked(inner.getProfile).mockResolvedValue(cachedProfile);
    vi.mocked(inner.joinPublicClub).mockRejectedValue(new Error('加入失败'));

    await repo.getProfile();
    await expect(repo.joinPublicClub('club-1', 'join-request-0001')).rejects.toThrow('加入失败');
    await expect(repo.getProfile()).resolves.toBe(cachedProfile);

    expect(inner.getProfile).toHaveBeenCalledOnce();
  });

  it('俱乐部资料更新成功后失效 profile 缓存', async () => {
    vi.mocked(inner.getProfile)
      .mockResolvedValueOnce({ nickname: '骑手', clubs: [{ name: '旧名称' }] } as Awaited<
        ReturnType<RideRepository['getProfile']>
      >)
      .mockResolvedValueOnce({ nickname: '骑手', clubs: [{ name: '新名称' }] } as Awaited<
        ReturnType<RideRepository['getProfile']>
      >);
    vi.mocked(inner.updateManagedClub).mockResolvedValue({
      id: 'club-1',
      name: '新名称',
      city: '深圳',
      introduction: '这是修改后的俱乐部介绍，清晰说明定位和日常活动安排。',
      joinMode: 'public_apply',
      avatarFileId: 'cloud://env/club-applications/user/cover.jpg',
      avatarUrl: '',
      updatedAt: '2026-10-18T00:00:00.000Z',
    });

    await repo.getProfile();
    await repo.getProfile();
    await repo.updateManagedClub(
      'club-1',
      {
        name: '新名称',
        city: '深圳',
        introduction: '这是修改后的俱乐部介绍，清晰说明定位和日常活动安排。',
        joinMode: 'public_apply',
        avatarFileId: 'cloud://env/club-applications/user/cover.jpg',
      },
      'club-update-0001',
      '2026-10-17T00:00:00.000Z',
    );
    const fresh = await repo.getProfile();

    expect(inner.getProfile).toHaveBeenCalledTimes(2);
    expect(fresh.clubs[0]?.name).toBe('新名称');
  });

  it('写入失效后晚到的旧读取不会重新污染资料缓存', async () => {
    let resolveOld!: (value: Awaited<ReturnType<RideRepository['getProfile']>>) => void;
    const old = new Promise<Awaited<ReturnType<RideRepository['getProfile']>>>((resolve) => {
      resolveOld = resolve;
    });
    vi.mocked(inner.getProfile)
      .mockReturnValueOnce(old)
      .mockResolvedValue({ nickname: '新资料' } as Awaited<
        ReturnType<RideRepository['getProfile']>
      >);
    vi.mocked(inner.updateProfile).mockResolvedValue({ nickname: '已保存' } as Awaited<
      ReturnType<RideRepository['updateProfile']>
    >);

    const staleRead = repo.getProfile();
    await repo.updateProfile({ nickname: '已保存' });
    const fresh = await repo.getProfile();
    resolveOld({ nickname: '旧资料' } as Awaited<ReturnType<RideRepository['getProfile']>>);
    await staleRead;

    expect(fresh).toMatchObject({ nickname: '新资料' });
    await expect(repo.getProfile()).resolves.toMatchObject({ nickname: '新资料' });
    expect(inner.getProfile).toHaveBeenCalledTimes(2);
  });

  it('cacheControl.clear 清空全部缓存', async () => {
    vi.mocked(inner.getActivity).mockResolvedValue({ id: 'a' } as Awaited<
      ReturnType<RideRepository['getActivity']>
    >);
    await repo.getActivity('a');
    repo.cacheControl.clear();
    await repo.getActivity('a');
    expect(inner.getActivity).toHaveBeenCalledTimes(2);
  });
});
