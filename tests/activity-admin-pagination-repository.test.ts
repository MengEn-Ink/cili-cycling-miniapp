import { describe, expect, it, vi } from 'vitest';
import { CloudRepository, CloudRepositoryError } from '../miniprogram/repositories/cloud';

const activityDto = {
  _id: 'activity-1',
  version: 3,
  title: '分页活动',
  event_start: '2030-01-01T08:00:00.000Z',
  event_end: '2030-01-01T12:00:00.000Z',
  signup_deadline: '2029-12-31T08:00:00.000Z',
  status: 'draft',
  description: '',
  route: { start: '甲', end: '乙', distance_km: 80, elevation_m: 500, level: '进阶' },
  schedule: [],
  notices: [],
  equipment: [],
};

function cloudResult(data: unknown) {
  const callFunction = vi.fn(async () => ({ result: { ok: true, data } }));
  return { cloud: { callFunction }, callFunction };
}

function pageMethod(repository: CloudRepository) {
  return (
    repository as CloudRepository & {
      listAdminActivitiesPage(input: {
        pageSize: number;
        cursor?: string;
        statusFilter?: 'all' | 'draft' | 'published' | 'finished';
      }): Promise<{ items: Array<{ id: string }>; nextCursor: string | null }>;
    }
  ).listAdminActivitiesPage.bind(repository);
}

describe('CloudRepository 管理活动分页契约', () => {
  it('发送 page_size/cursor，严格映射 items/next_cursor', async () => {
    const { cloud, callFunction } = cloudResult({
      items: [activityDto],
      next_cursor: 'opaque_cursor-1',
    });
    const repository = new CloudRepository(cloud);

    const page = await pageMethod(repository)({ pageSize: 25, cursor: 'opaque_cursor-0' });

    expect(page.items).toHaveLength(1);
    expect(page.items[0].id).toBe('activity-1');
    expect(page.nextCursor).toBe('opaque_cursor-1');
    expect(callFunction).toHaveBeenCalledWith({
      name: 'activity-admin',
      data: { action: 'list', page_size: 25, cursor: 'opaque_cursor-0' },
    });
  });

  it('首屏不发送 cursor，并接受 next_cursor=null', async () => {
    const { cloud, callFunction } = cloudResult({ items: [activityDto], next_cursor: null });
    const repository = new CloudRepository(cloud);

    const page = await pageMethod(repository)({ pageSize: 50 });

    expect(page.nextCursor).toBeNull();
    expect(callFunction).toHaveBeenCalledWith({
      name: 'activity-admin',
      data: { action: 'list', page_size: 50 },
    });
  });

  it('状态筛选映射为 status_filter 并保留 cursor', async () => {
    const { cloud, callFunction } = cloudResult({ items: [activityDto], next_cursor: null });
    const repository = new CloudRepository(cloud);

    await pageMethod(repository)({
      pageSize: 20,
      cursor: 'opaque_cursor-0',
      statusFilter: 'published',
    });

    expect(callFunction).toHaveBeenCalledWith({
      name: 'activity-admin',
      data: {
        action: 'list',
        page_size: 20,
        status_filter: 'published',
        cursor: 'opaque_cursor-0',
      },
    });
  });

  it.each([
    ['裸数组', [activityDto]],
    ['缺少 items', { next_cursor: null }],
    ['items 非数组', { items: {}, next_cursor: null }],
    ['items 含非对象', { items: [activityDto, null], next_cursor: null }],
    ['缺少 next_cursor', { items: [activityDto] }],
    ['next_cursor 为空串', { items: [activityDto], next_cursor: '' }],
    ['next_cursor 非字符串', { items: [activityDto], next_cursor: 1 }],
  ])('拒绝非法分页响应：%s', async (_label, value) => {
    const { cloud } = cloudResult(value);
    const repository = new CloudRepository(cloud);

    await expect(pageMethod(repository)({ pageSize: 50 })).rejects.toMatchObject<
      Partial<CloudRepositoryError>
    >({ code: 'INVALID_RESPONSE' });
  });

  it('旧 listAdminActivities 继续调用裸数组协议', async () => {
    const { cloud, callFunction } = cloudResult([activityDto]);
    const repository = new CloudRepository(cloud);

    const items = await repository.listAdminActivities();

    expect(items[0].id).toBe('activity-1');
    expect(callFunction).toHaveBeenCalledWith({
      name: 'activity-admin',
      data: { action: 'list' },
    });
  });
});
