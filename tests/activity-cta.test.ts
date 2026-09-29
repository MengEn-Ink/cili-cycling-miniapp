import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Activity, Registration, RegistrationStatus } from '../miniprogram/models';
import { resolveActivityAction } from '../miniprogram/utils/activity';

type ServerActivity = Activity & {
  registrationState?: 'open' | 'closed';
  closedReason?: 'finished' | 'deadline' | 'full' | 'unavailable';
};

const open: ServerActivity = {
  id: 'a1',
  version: 1,
  title: '环湖骑行',
  date: '2026-10-18',
  startAt: '2026-10-18T00:00:00.000Z',
  endAt: '2026-10-18T08:00:00.000Z',
  deadline: '2026-10-15T12:00:00.000Z',
  status: 'published',
  capacity: 20,
  occupiedCount: 3,
  registrationState: 'open',
  description: '说明',
  route: { start: '起点', end: '终点', distanceKm: 80, elevationM: 600, level: '进阶' },
  schedule: [],
  notices: [],
  equipment: [],
  fee: '免费',
};

function activity(patch: Partial<ServerActivity>): ServerActivity {
  return { ...open, ...patch };
}

function registration(status: RegistrationStatus) {
  return { id: `r-${status}`, status } as Pick<Registration, 'id' | 'status'>;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

describe('活动 CTA 九分支', () => {
  it('pending 或 approved 优先查看当前报名', () => {
    for (const status of ['pending', 'approved'] as const) {
      expect(resolveActivityAction(open, registration(status))).toEqual({
        kind: 'view-registration',
        label: '查看我的报名',
        enabled: true,
        registrationId: `r-${status}`,
      });
    }
  });

  it('rejected 或 cancelled 且活动开放时允许重报', () => {
    for (const status of ['rejected', 'cancelled'] as const) {
      expect(resolveActivityAction(open, registration(status))).toEqual({
        kind: 'resubmit',
        label: '修改后重新报名',
        enabled: true,
        registrationId: `r-${status}`,
      });
    }
  });

  it('有历史报名但活动已结束时只查看历史', () => {
    expect(
      resolveActivityAction(
        activity({ registrationState: 'closed', closedReason: 'finished' }),
        registration('rejected'),
      ),
    ).toMatchObject({ kind: 'view-history', label: '查看报名历史', enabled: true });
  });

  it('有历史报名但已到截止时间时只查看历史', () => {
    expect(
      resolveActivityAction(
        activity({ registrationState: 'closed', closedReason: 'deadline' }),
        registration('cancelled'),
      ),
    ).toMatchObject({ kind: 'view-history', label: '查看报名历史', enabled: true });
  });

  it('有历史报名但名额已满时只查看历史', () => {
    expect(
      resolveActivityAction(
        activity({ registrationState: 'closed', closedReason: 'full' }),
        registration('rejected'),
      ),
    ).toMatchObject({ kind: 'view-history', label: '查看报名历史', enabled: true });
  });

  it('无报名且活动已结束时禁用', () => {
    expect(
      resolveActivityAction(
        activity({ registrationState: 'closed', closedReason: 'finished' }),
        undefined,
      ),
    ).toEqual({
      kind: 'closed',
      label: '活动已结束',
      enabled: false,
    });
  });

  it('无报名且已到截止时间时禁用', () => {
    expect(
      resolveActivityAction(
        activity({ registrationState: 'closed', closedReason: 'deadline' }),
        undefined,
      ),
    ).toEqual({
      kind: 'closed',
      label: '报名已截止',
      enabled: false,
    });
  });

  it('无报名且名额已满时禁用', () => {
    expect(
      resolveActivityAction(
        activity({ registrationState: 'closed', closedReason: 'full' }),
        undefined,
      ),
    ).toEqual({
      kind: 'closed',
      label: '名额已满',
      enabled: false,
    });
  });

  it('无报名且活动开放时立即报名', () => {
    expect(
      resolveActivityAction(
        activity({
          endAt: '2000-01-01T00:00:00.000Z',
          deadline: '2000-01-01T00:00:00.000Z',
        }),
      ),
    ).toEqual({
      kind: 'register',
      label: '立即报名',
      enabled: true,
    });
  });

  it('后端报名状态缺失时 fail closed', () => {
    expect(
      resolveActivityAction(activity({ registrationState: undefined, closedReason: undefined })),
    ).toEqual({ kind: 'closed', label: '活动状态不可用', enabled: false });
  });
});

const rideService = vi.hoisted(() => ({
  getActivity: vi.fn(),
  listRegistrations: vi.fn(),
  getRegistration: vi.fn(),
  cancelRegistration: vi.fn(),
}));

vi.mock('../miniprogram/services/ride-service', () => ({ rideService }));

describe('活动详情 CTA 接线', () => {
  let page: any;

  beforeEach(async () => {
    vi.resetModules();
    for (const value of Object.values(rideService)) value.mockReset();
    vi.stubGlobal('wx', { navigateTo: vi.fn() });
    vi.stubGlobal('Page', (definition: any) => {
      page = definition;
      page.data = { ...definition.data };
      page.setData = (patch: Record<string, unknown>) => Object.assign(page.data, patch);
    });
    await import('../miniprogram/pages/activity-detail/index');
  });

  afterEach(() => vi.unstubAllGlobals());

  it('满员活动的 go handler 不允许导航到报名页', async () => {
    rideService.getActivity.mockResolvedValue(
      activity({ registrationState: 'closed', closedReason: 'full' }),
    );
    rideService.listRegistrations.mockResolvedValue([]);

    await page.load('a1');
    page.go();

    expect(page.data.activityAction).toMatchObject({ kind: 'closed', enabled: false });
    expect(wx.navigateTo).not.toHaveBeenCalled();
  });

  it('本人报名列表读取失败时显示错误且不开放报名', async () => {
    rideService.getActivity.mockResolvedValue(open);
    rideService.listRegistrations.mockRejectedValue(new Error('报名状态加载失败'));

    await page.load('a1');
    page.go();

    expect(page.data.error).toBe('报名状态加载失败');
    expect(page.data.activityAction).toMatchObject({ kind: 'closed', enabled: false });
    expect(wx.navigateTo).not.toHaveBeenCalled();
  });

  it('较慢的旧详情响应不能覆盖较新的活动详情', async () => {
    const oldActivity = deferred<ServerActivity>();
    const newActivity = deferred<ServerActivity>();
    rideService.getActivity
      .mockReturnValueOnce(oldActivity.promise)
      .mockReturnValueOnce(newActivity.promise);
    rideService.listRegistrations.mockResolvedValue([]);

    const staleLoad = page.load('old');
    const latestLoad = page.load('new');

    newActivity.resolve(activity({ id: 'new', title: '新活动' }));
    await latestLoad;
    expect(page.data.item.title).toBe('新活动');

    oldActivity.resolve(
      activity({ id: 'old', title: '旧活动', registrationState: 'closed', closedReason: 'full' }),
    );
    await staleLoad;

    expect(page.data.item.title).toBe('新活动');
    expect(page.data.activityAction).toMatchObject({ kind: 'register', enabled: true });
    expect(rideService.listRegistrations).toHaveBeenCalledTimes(1);
  });
});

describe('凭证页重报接线', () => {
  let page: any;

  beforeEach(async () => {
    vi.resetModules();
    for (const value of Object.values(rideService)) value.mockReset();
    vi.stubGlobal('wx', { redirectTo: vi.fn(), showModal: vi.fn() });
    vi.stubGlobal('Page', (definition: any) => {
      page = definition;
      page.data = { ...definition.data };
      page.setData = (patch: Record<string, unknown>) => Object.assign(page.data, patch);
    });
    await import('../miniprogram/pages/credential/index');
  });

  afterEach(() => vi.unstubAllGlobals());

  it.each(['rejected', 'cancelled'] as const)('%s 在活动关闭后不能重报', async (status) => {
    rideService.getRegistration.mockResolvedValue({
      id: 'r1',
      activityId: 'a1',
      status,
    });
    rideService.getActivity.mockResolvedValue(
      activity({ registrationState: 'closed', closedReason: 'finished' }),
    );

    await page.onLoad({ id: 'r1' });
    page.retry();

    expect(page.data.activityAction).toMatchObject({ kind: 'view-history' });
    expect(wx.redirectTo).not.toHaveBeenCalled();
  });
});
