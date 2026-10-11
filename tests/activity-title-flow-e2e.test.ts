import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Activity } from '../miniprogram/models';
import { formatLocalDateTime } from '../miniprogram/utils/date-time';

const rideService = vi.hoisted(() => ({
  getActivity: vi.fn(),
  getAdminActivity: vi.fn(),
  listRegistrations: vi.fn(),
  saveActivity: vi.fn(),
}));
const appStore = vi.hoisted(() => ({
  role: 'admin',
  authStatus: 'authenticated',
  ensureIdentity: vi.fn(),
}));

vi.mock('../miniprogram/services/ride-service', () => ({ rideService }));
vi.mock('../miniprogram/store/app-store', () => ({ appStore }));

function pageContext(definition: any) {
  return {
    ...definition,
    data: {
      ...definition.data,
      form: definition.data.form ? { ...definition.data.form } : undefined,
    },
    setData(patch: Record<string, unknown>, callback?: () => void) {
      for (const [key, value] of Object.entries(patch)) {
        if (key.startsWith('form.')) this.data.form[key.slice(5)] = value;
        else this.data[key] = value;
      }
      callback?.();
    },
  };
}

describe('活动标题核心创建到详情再编辑闭环', () => {
  let current: Activity | undefined;
  let definitions: any[];
  let statuses: string[];

  beforeEach(() => {
    definitions = [];
    current = undefined;
    statuses = [];
    vi.resetModules();
    vi.stubGlobal('Page', (definition: any) => definitions.push(definition));
    vi.stubGlobal('wx', {
      cloud: {},
      showModal: vi.fn(),
      showToast: vi.fn(),
      showShareMenu: vi.fn(),
      pageScrollTo: vi.fn(),
    });
    appStore.ensureIdentity.mockReset().mockResolvedValue(undefined);
    rideService.listRegistrations.mockReset().mockResolvedValue([]);
    rideService.getActivity.mockReset().mockImplementation(async () => current);
    rideService.getAdminActivity.mockReset().mockImplementation(async () => current);
    rideService.saveActivity
      .mockReset()
      .mockImplementation(async (input: any, id?: string, expectedVersion?: number) => {
        statuses.push(input.status);
        if (!current && input.status !== 'draft')
          throw new Error('INVALID_TRANSITION / 新活动必须先保存为草稿');
        if (current) {
          expect(id).toBe(current.id);
          expect(expectedVersion).toBe(current.version);
        } else {
          expect(id).toBeUndefined();
          expect(expectedVersion).toBeUndefined();
        }
        current = {
          ...input,
          id: current?.id || 'activity-title-e2e',
          version: (current?.version || 0) + 1,
          date: input.startAt,
          occupiedCount: current?.occupiedCount || 0,
        } as Activity;
        return current;
      });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('按真实状态机创建发布，详情可见，重开编辑后标题和时间一致', async () => {
    await import('../miniprogram/pages/admin/activity-edit/index');
    const editor = pageContext(definitions.shift());
    await editor.onLoad({});

    editor.data.form.title = '  周末环湖长距离训练  ';
    editor.data.form.startDate = '2026-10-25';
    editor.data.form.startTime = '07:15';
    editor.data.form.routeStart = '东岸公园南门集合点';
    editor.data.images = ['cloud://env/activity-cover.jpg'];
    editor.data.imagesTouched = true;
    await editor.save({ currentTarget: { dataset: { status: 'published' } } });

    expect(statuses).toEqual(['draft', 'published']);
    expect(current).toMatchObject({
      title: '周末环湖长距离训练',
      status: 'published',
      coverImage: 'cloud://env/activity-cover.jpg',
      schedule: [],
      route: { start: '东岸公园南门集合点' },
    });
    expect(formatLocalDateTime(current!.startAt)).toBe('2026-10-25 07:15:00');

    vi.resetModules();
    await import('../miniprogram/pages/activity-detail/index');
    const detail = pageContext(definitions.shift());
    await detail.load(current!.id);
    expect(detail.data.item).toMatchObject({
      title: '周末环湖长距离训练',
      coverImage: 'cloud://env/activity-cover.jpg',
      route: { start: '东岸公园南门集合点' },
    });

    const originalSchedule = current!.schedule;
    const reopened = pageContext(editor);
    await reopened.onLoad({ id: current!.id });
    expect(reopened.data.form).toMatchObject({
      title: '周末环湖长距离训练',
      startDate: '2026-10-25',
      startTime: '07:15',
    });

    reopened.data.form.title = '周末环湖进阶训练';
    reopened.data.form.startTime = '07:45';
    await reopened.save({ currentTarget: { dataset: { status: 'published' } } });

    expect(statuses).toEqual(['draft', 'published', 'published']);
    expect(current?.title).toBe('周末环湖进阶训练');
    expect(formatLocalDateTime(current!.startAt)).toBe('2026-10-25 07:45:00');
    expect(current?.schedule).toEqual(originalSchedule);

    await detail.load(current!.id);
    expect(detail.data.item.title).toBe('周末环湖进阶训练');
    expect(formatLocalDateTime(detail.data.item.startAt)).toBe('2026-10-25 07:45:00');
  });
});
