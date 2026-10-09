import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const rideService = vi.hoisted(() => ({
  listActivities: vi.fn(),
  listRegistrations: vi.fn(),
}));

vi.mock('../miniprogram/services/ride-service', () => ({ rideService }));

type PageKind = 'activities' | 'registrations';

const activity = (id: string) => ({
  id,
  title: id,
  date: '2026-09-30T23:00:00.000Z',
  capacity: 20,
  occupiedCount: 2,
});

const registration = (id: string, activityId: string) => ({
  id,
  activityId,
  status: 'approved',
  updatedAt: '2026-09-30T10:00:00.000Z',
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function loadPage(kind: PageKind): Promise<any> {
  let page: any;
  vi.stubGlobal('Page', (definition: any) => {
    page = definition;
    page.data = { ...definition.data };
    page.setData = vi.fn((patch: Record<string, unknown>) => Object.assign(page.data, patch));
  });
  if (kind === 'activities') {
    await import('../miniprogram/pages/activities/index');
  } else {
    await import('../miniprogram/pages/registrations/index');
  }
  return page;
}

function primeServices(kind: PageKind, id: string): void {
  if (kind === 'activities') {
    rideService.listActivities.mockResolvedValue([activity(id)]);
    return;
  }
  rideService.listRegistrations.mockResolvedValue([registration(id, `activity-${id}`)]);
  rideService.listActivities.mockResolvedValue([activity(`activity-${id}`)]);
}

describe.each(['activities', 'registrations'] as const)('%s tab page refresh', (kind) => {
  beforeEach(() => {
    vi.resetModules();
    rideService.listActivities.mockReset();
    rideService.listRegistrations.mockReset();
  });

  afterEach(() => vi.unstubAllGlobals());

  it('a newer load wins when an older request resolves last', async () => {
    const page = await loadPage(kind);
    const first = deferred<any[]>();
    const second = deferred<any[]>();
    if (kind === 'activities') {
      rideService.listActivities
        .mockReturnValueOnce(first.promise)
        .mockReturnValueOnce(second.promise);
    } else {
      rideService.listRegistrations
        .mockReturnValueOnce(first.promise)
        .mockReturnValueOnce(second.promise);
      rideService.listActivities.mockResolvedValue([
        activity('activity-old'),
        activity('activity-new'),
      ]);
    }

    const olderLoad = page.load();
    const newerLoad = page.load();
    second.resolve(
      kind === 'activities' ? [activity('new')] : [registration('new', 'activity-new')],
    );
    await newerLoad;
    first.resolve(
      kind === 'activities' ? [activity('old')] : [registration('old', 'activity-old')],
    );
    await olderLoad;

    expect(page.data.items.map((item: any) => item.id)).toEqual(['new']);
    if (kind === 'registrations') {
      expect(page.data.items[0].activity).toMatchObject({
        date: '2026-09-30T23:00:00.000Z',
        displayDate: '10月1日 周四',
      });
    }
  });

  it.each(['onHide', 'onUnload'] as const)(
    '%s invalidates an outstanding load',
    async (lifecycle) => {
      const page = await loadPage(kind);
      expect(page[lifecycle]).toBeTypeOf('function');
      const pending = deferred<any[]>();
      if (kind === 'activities') {
        rideService.listActivities.mockReturnValue(pending.promise);
      } else {
        rideService.listRegistrations.mockReturnValue(pending.promise);
        rideService.listActivities.mockResolvedValue([activity('activity-late')]);
      }

      const load = page.load();
      page[lifecycle]();
      page.setData.mockClear();
      pending.resolve(
        kind === 'activities' ? [activity('late')] : [registration('late', 'activity-late')],
      );
      await load;

      expect(page.setData).not.toHaveBeenCalled();
    },
  );

  it('keeps existing items visible during a background refresh', async () => {
    const page = await loadPage(kind);
    primeServices(kind, 'cached');
    await page.load();
    const pending = deferred<any[]>();
    if (kind === 'activities') {
      rideService.listActivities.mockReturnValueOnce(pending.promise);
    } else {
      rideService.listRegistrations.mockReturnValueOnce(pending.promise);
      rideService.listActivities.mockResolvedValueOnce([activity('activity-fresh')]);
    }

    const refresh = page.load();

    expect(page.data.items.map((item: any) => item.id)).toEqual(['cached']);
    expect(page.data).toMatchObject({ loading: false, refreshing: true, error: '' });

    pending.resolve(
      kind === 'activities' ? [activity('fresh')] : [registration('fresh', 'activity-fresh')],
    );
    await refresh;

    expect(page.data.items.map((item: any) => item.id)).toEqual(['fresh']);
    expect(page.data).toMatchObject({ loading: false, refreshing: false, refreshError: '' });
  });

  it('keeps old items and exposes a non-blocking error when refresh fails', async () => {
    const page = await loadPage(kind);
    primeServices(kind, 'cached');
    await page.load();
    if (kind === 'activities') {
      rideService.listActivities.mockRejectedValueOnce(new Error('活动刷新失败'));
    } else {
      rideService.listRegistrations.mockRejectedValueOnce(new Error('报名刷新失败'));
      rideService.listActivities.mockResolvedValueOnce([activity('activity-cached')]);
    }

    await page.load();

    expect(page.data.items.map((item: any) => item.id)).toEqual(['cached']);
    expect(page.data).toMatchObject({
      loading: false,
      refreshing: false,
      error: '',
      refreshError: kind === 'activities' ? '活动刷新失败' : '报名刷新失败',
    });
  });

  it('uses the blocking error state when the first load fails', async () => {
    const page = await loadPage(kind);
    if (kind === 'activities') {
      rideService.listActivities.mockRejectedValueOnce(new Error('活动首次失败'));
    } else {
      rideService.listRegistrations.mockRejectedValueOnce(new Error('报名首次失败'));
      rideService.listActivities.mockResolvedValueOnce([]);
    }

    await page.load();

    expect(page.data).toMatchObject({
      items: [],
      loading: false,
      refreshing: false,
      error: kind === 'activities' ? '活动首次失败' : '报名首次失败',
      refreshError: '',
    });
  });
});

describe('activities time filter', () => {
  beforeEach(() => {
    vi.resetModules();
    rideService.listActivities.mockReset();
    rideService.listRegistrations.mockReset();
  });

  afterEach(() => vi.unstubAllGlobals());

  it('defaults to future activities and switches to history with matching empty-state copy', async () => {
    const page = await loadPage('activities');
    rideService.listActivities
      .mockResolvedValueOnce([activity('future')])
      .mockResolvedValueOnce([]);

    await page.load();
    expect(rideService.listActivities).toHaveBeenNthCalledWith(1, 'upcoming');
    expect(page.data).toMatchObject({
      filter: 'upcoming',
      sectionTitle: '下一场',
      emptyTitle: '暂无未来活动',
    });

    page.selectFilter({ currentTarget: { dataset: { filter: 'history' } } });
    await vi.waitFor(() =>
      expect(rideService.listActivities).toHaveBeenNthCalledWith(2, 'history'),
    );
    await vi.waitFor(() =>
      expect(page.data).toMatchObject({
        filter: 'history',
        loading: false,
        items: [],
        sectionEyebrow: 'RIDE ARCHIVE',
        sectionTitle: '历史活动',
        emptyTitle: '暂无历史活动',
        emptyCopy: '完成的骑行会收录在这里',
      }),
    );
  });

  it('ignores repeated or unknown filters without issuing duplicate requests', async () => {
    const page = await loadPage('activities');
    rideService.listActivities.mockResolvedValue([]);

    await page.load();
    page.selectFilter({ currentTarget: { dataset: { filter: 'upcoming' } } });
    page.selectFilter({ currentTarget: { dataset: { filter: 'all' } } });

    expect(rideService.listActivities).toHaveBeenCalledTimes(1);
  });
});

describe('registrations status presentation', () => {
  beforeEach(() => {
    vi.resetModules();
    rideService.listActivities.mockReset();
    rideService.listRegistrations.mockReset();
  });

  afterEach(() => vi.unstubAllGlobals());

  it('maps every status label while retaining bound trip fields', async () => {
    const page = await loadPage('registrations');
    const statuses = ['pending', 'approved', 'checked_in', 'rejected', 'cancelled'] as const;
    rideService.listRegistrations.mockResolvedValue(
      statuses.map((status, index) => ({
        ...registration(`r${index}`, 'activity-shared'),
        status,
        gatheringMode: index % 2 ? '需要后援车' : '自驾',
      })),
    );
    rideService.listActivities.mockResolvedValue([
      { ...activity('activity-shared'), date: '2026-10-18' },
    ]);

    await page.load();

    expect(page.data.items.map((item: any) => item.statusText)).toEqual([
      '待审核',
      '已通过',
      '已签到',
      '已驳回',
      '已取消',
    ]);
    expect(page.data.items.map((item: any) => item.gatheringMode)).toEqual([
      '自驾',
      '需要后援车',
      '自驾',
      '需要后援车',
      '自驾',
    ]);
    expect(page.data.items.every((item: any) => item.activity.date === '2026-10-18')).toBe(true);
  });
});

describe('tab page refresh view contract', () => {
  it.each(['activities', 'registrations'])(
    '%s keeps refresh announcements mounted outside state-view',
    async (page) => {
      // @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
      const { readFileSync } = await import('node:fs');
      const template = readFileSync(`miniprogram/pages/${page}/index.wxml`, 'utf8');
      const stateView = template.match(/<state-view[\s\S]*?<\/state-view>/)?.[0] || '';

      const polite =
        template.match(/<view\b(?=[^>]*aria-live="polite")(?=[^>]*role="status")[^>]*>/)?.[0] || '';
      const assertive =
        template.match(/<view\b(?=[^>]*aria-live="assertive")(?=[^>]*role="alert")[^>]*>/)?.[0] ||
        '';
      const refreshingVisual =
        template.match(
          /<view\b(?=[^>]*wx:if="{{refreshing}}")(?=[^>]*aria-hidden="true")[^>]*>/,
        )?.[0] || '';
      const refreshErrorVisual =
        template.match(
          /<view\b(?=[^>]*wx:if="{{refreshError}}")(?=[^>]*aria-hidden="true")[^>]*>/,
        )?.[0] || '';

      expect(polite).toContain('aria-atomic="true"');
      expect(polite).not.toMatch(/wx:(?:if|elif|else)/);
      expect(assertive).toContain('aria-atomic="true"');
      expect(assertive).not.toMatch(/wx:(?:if|elif|else)/);
      expect(template).toContain('{{refreshing ?');
      expect(template).toContain('{{refreshError}}');
      expect(refreshingVisual).not.toBe('');
      expect(refreshErrorVisual).not.toBe('');
      expect(stateView).toContain('loading="{{loading}}"');
      expect(stateView).toContain('error="{{error}}"');
      expect(stateView).toContain('retryable="{{true}}"');
      expect(stateView).toContain('bind:retry="load"');
      expect(stateView).not.toContain('refreshError');
    },
  );
});
