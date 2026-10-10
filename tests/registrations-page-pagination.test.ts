import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listRegistrationPage: vi.fn(),
  listActivities: vi.fn(),
}));

vi.mock('../miniprogram/repositories/index', () => ({
  repository: {
    listRegistrationPage: mocks.listRegistrationPage,
    listActivities: mocks.listActivities,
  },
}));

type RegOptions = {
  id: string;
  title?: string;
  status?: string;
};

function registration({ id, title, status = 'approved' }: RegOptions) {
  return {
    id: `reg-${id}`,
    activityId: `act-${id}`,
    status,
    updatedAt: '2026-09-01T00:00:00.000Z',
    profile: {},
    gatheringMode: '',
    experience: '',
    remark: '',
    strava: {
      status: 'disconnected',
      years: null,
      rides90d: null,
      longestKm: null,
      elevationM: null,
      speedKmh: null,
    },
    activity: {
      id: `act-${id}`,
      title: title ?? `活动 ${id}`,
      date: '2026-09-05T00:00:00.000Z',
      status: 'published',
    },
  };
}

describe('我的行程分页', () => {
  let page: any;

  beforeEach(async () => {
    vi.resetModules();
    mocks.listRegistrationPage.mockReset();
    mocks.listActivities.mockReset().mockResolvedValue([]);
    vi.stubGlobal('wx', {
      navigateTo: vi.fn(),
    });
    vi.stubGlobal('Page', (definition: any) => {
      page = definition;
      page.data = structuredClone(definition.data);
      page.setData = vi.fn((patch: Record<string, unknown>) => Object.assign(page.data, patch));
    });
    await import('../miniprogram/pages/registrations/index');
  });

  it('首屏渲染一页报名并携带下一页游标，条目完成状态映射', async () => {
    mocks.listRegistrationPage.mockResolvedValue({
      items: [registration({ id: '01' }), registration({ id: '02', status: 'checked_in' })],
      nextCursor: 'cursor-1',
    });
    page.onShow();
    await vi.waitFor(() => expect(page.data.loading).toBe(false));

    expect(page.data.items).toHaveLength(2);
    expect(page.data.nextCursor).toBe('cursor-1');
    expect(page.data.items[0]).toMatchObject({
      statusText: '已通过',
      activity: { title: '活动 01', displayDate: '9月5日 周六' },
    });
    expect(page.data.items[1].statusText).toBe('已签到');
  });

  it('加载更多在尾部追加且不重复，最后一页后按钮文案变为没有更多', async () => {
    mocks.listRegistrationPage
      .mockResolvedValueOnce({
        items: [registration({ id: '01' })],
        nextCursor: 'cursor-1',
      })
      .mockResolvedValueOnce({
        items: [registration({ id: '02' })],
        nextCursor: null,
      });
    page.onShow();
    await vi.waitFor(() => expect(page.data.loading).toBe(false));

    await page.loadMore();
    expect(mocks.listRegistrationPage).toHaveBeenLastCalledWith('cursor-1');
    expect(page.data.items).toHaveLength(2);
    expect(page.data.nextCursor).toBeNull();
    expect(new Set(page.data.items.map((item: any) => item.id)).size).toBe(2);
  });

  it('公开活动列表读取失败时我的行程仍正常渲染', async () => {
    mocks.listActivities.mockRejectedValue(new Error('公开服务不可用'));
    mocks.listRegistrationPage.mockResolvedValue({
      items: [registration({ id: '01' })],
      nextCursor: null,
    });
    page.onShow();
    await vi.waitFor(() => expect(page.data.loading).toBe(false));

    expect(page.data.items).toHaveLength(1);
    expect(page.data.error).toBe('');
  });

  it('行程服务首屏失败且无旧数据时进入错误态，有旧数据时只提示刷新错误', async () => {
    mocks.listRegistrationPage.mockRejectedValue(new Error('报名服务不可用'));
    page.onShow();
    await vi.waitFor(() => expect(page.data.loading).toBe(false));
    expect(page.data.error).toBe('报名服务不可用');

    mocks.listRegistrationPage.mockRejectedValue(new Error('再次失败'));
    page.data.items = [registration({ id: 'old' })];
    page.load();
    await vi.waitFor(() => expect(page.data.refreshing).toBe(false));
    expect(page.data.refreshError).toBe('再次失败');
    expect(page.data.items).toHaveLength(1);
  });

  it('加载更多失败时保留已加载内容并展示错误，可再次重试', async () => {
    mocks.listRegistrationPage
      .mockResolvedValueOnce({ items: [registration({ id: '01' })], nextCursor: 'cursor-1' })
      .mockRejectedValueOnce(new Error('网络异常'));
    page.onShow();
    await vi.waitFor(() => expect(page.data.loading).toBe(false));
    await page.loadMore();

    expect(page.data.items).toHaveLength(1);
    expect(page.data.loadMoreError).toBe('网络异常');
    expect(page.data.nextCursor).toBe('cursor-1');
  });
});
