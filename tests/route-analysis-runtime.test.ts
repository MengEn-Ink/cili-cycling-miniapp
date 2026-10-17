import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getActivity: vi.fn() }));
vi.mock('../miniprogram/services/ride-service', () => ({
  rideService: { getActivity: mocks.getActivity },
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function pageInstance() {
  let definition: any;
  (globalThis as any).Page = (value: any) => {
    definition = value;
  };
  (globalThis as any).wx = {
    createSelectorQuery: vi.fn(),
    getWindowInfo: () => ({ pixelRatio: 2 }),
  };
  vi.resetModules();
  await import('../miniprogram/pages/route-analysis/index');
  const page = {
    ...definition,
    data: structuredClone(definition.data),
    setData(patch: Record<string, unknown>, callback?: () => void) {
      Object.assign(this.data, patch);
      callback?.();
    },
  };
  return page;
}

const activity = (title: string) => ({
  id: title,
  title,
  route: { start: '起点', end: '终点', distanceKm: 10 },
});

describe('路线分析页运行时可靠性', () => {
  beforeEach(() => mocks.getActivity.mockReset());

  it('重复加载合并，卸载后的响应不再 setData', async () => {
    const pending = deferred<any>();
    mocks.getActivity.mockReturnValue(pending.promise);
    const page = await pageInstance();
    const setData = vi.spyOn(page, 'setData');

    page.onLoad({ id: 'a1' });
    const same = page.load();
    expect(mocks.getActivity).toHaveBeenCalledTimes(1);
    page.onUnload();
    pending.resolve(activity('旧活动'));
    await same;

    expect(page.analysis).toBeNull();
    expect(setData.mock.calls.some(([patch]) => (patch as any).activityTitle === '旧活动')).toBe(
      false,
    );
  });

  it('隐藏后旧响应不能覆盖恢复后的新请求', async () => {
    const first = deferred<any>();
    const second = deferred<any>();
    mocks.getActivity.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const page = await pageInstance();

    page.onLoad({ id: 'a1' });
    page.onHide();
    page.onShow();
    second.resolve(activity('新活动'));
    await page.loadPromise;
    first.resolve(activity('旧活动'));
    await Promise.resolve();

    expect(page.data.activityTitle).toBe('新活动');
    expect(page.analysis).not.toBeNull();
  });

  it('GPX 轮廓统一纠偏，同时保留微信选点生成的起点 marker 与地图中心', async () => {
    const latitude = 39 + 0.908823;
    const longitude = 116 + 0.39747;
    mocks.getActivity.mockResolvedValue({
      ...activity('GPX 活动'),
      route: {
        start: '起点',
        end: '终点',
        distanceKm: 10,
        gpxFileId: 'cloud://env/activity-routes/owner/source.gpx',
        startLocation: { name: '起点', address: '', latitude, longitude },
        routeOutline: [
          { latitude, longitude },
          { latitude: 39.91, longitude: 116.4 },
        ],
      },
    });
    const page = await pageInstance();
    page.activityId = 'gpx-1';
    await page.load();

    const firstLinePoint = page.data.polylines[0].points[0];
    expect(firstLinePoint).toEqual(page.data.mapPoints[0]);
    expect(firstLinePoint).not.toEqual({ latitude, longitude });
    expect(page.data.markers[0]).toMatchObject({ latitude, longitude });
    expect(page.data).toMatchObject({
      mapLatitude: latitude,
      mapLongitude: longitude,
    });
  });

  it('地图失败只降级地图并可轻量恢复', async () => {
    const page = await pageInstance();
    page.analysis = { outline: [{}, {}] };
    page.data.mapAvailable = true;
    page.data.error = '';

    page.mapError();
    expect(page.data).toMatchObject({ mapAvailable: false, mapFailed: true, error: '' });
    page.retryMap();
    expect(page.data).toMatchObject({ mapAvailable: true, mapFailed: false, mapRenderKey: 1 });
  });
});
