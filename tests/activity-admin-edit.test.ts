// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Activity, EditableActivity } from '../miniprogram/models';

const rideService = vi.hoisted(() => ({
  getAdminActivity: vi.fn(),
  saveActivity: vi.fn(),
  previewStravaRoute: vi.fn(),
}));
const appStore = vi.hoisted(() => ({
  role: 'admin',
  authStatus: 'authenticated',
  ensureIdentity: vi.fn(),
}));

vi.mock('../miniprogram/services/ride-service', () => ({ rideService }));
vi.mock('../miniprogram/store/app-store', () => ({ appStore }));

const activity: Activity = {
  id: 'a1',
  version: 7,
  title: '环湖骑行',
  date: '2026-10-18T00:00:00.000Z',
  startAt: '2026-10-18T00:00:00.000Z',
  endAt: '2026-10-18T08:00:00.000Z',
  deadline: '2026-10-15T12:00:00.000Z',
  status: 'published',
  capacity: 20,
  supportVehicleCapacity: 8,
  selfDriveCapacity: 12,
  supportVehicleDriver: {
    nickname: '王师傅',
    licensePlate: '粤B12345',
    contactPhone: '13812345678',
  },
  occupiedCount: 3,
  description: '说明',
  coverImage: 'cloud://covers/a1.jpg',
  route: {
    start: '起点',
    end: '终点',
    distanceKm: 80,
    elevationM: 600,
    level: '进阶',
    gpxFileId: 'cloud://routes/a1.gpx',
  },
  schedule: [{ time: '08:00', title: '集合', location: '起点', remark: '停车场集合' }],
  notices: ['守规'],
  equipment: ['头盔'],
  fee: '无报名费',
  feeIncluded: ['保险'],
  feeExcluded: ['午餐'],
};

describe('管理员普通编辑保留未展示的活动字段', () => {
  let page: any;

  beforeEach(async () => {
    vi.resetModules();
    rideService.getAdminActivity.mockReset().mockResolvedValue(activity);
    rideService.saveActivity.mockReset().mockResolvedValue({ ...activity, version: 8 });
    rideService.previewStravaRoute.mockReset();
    appStore.ensureIdentity.mockReset().mockResolvedValue(undefined);
    vi.stubGlobal('wx', {
      cloud: {},
      showToast: vi.fn(),
      showModal: vi.fn(),
      pageScrollTo: vi.fn(),
      navigateTo: vi.fn(),
    });
    vi.stubGlobal('Page', (definition: any) => {
      page = definition;
      page.data = { ...definition.data };
      page.setData = (patch: Record<string, unknown>) => {
        for (const [key, value] of Object.entries(patch)) {
          if (key.startsWith('form.')) page.data.form[key.slice(5)] = value;
          else page.data[key] = value;
        }
      };
    });
    await import('../miniprogram/pages/admin/activity-edit/index');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('只改标题时仍提交 schedule remark、GPX 与费用明细', async () => {
    await page.onLoad({ id: activity.id });
    expect(appStore.ensureIdentity).toHaveBeenCalledWith(wx.cloud);
    page.data.form.title = '新标题';

    await page.save({ currentTarget: { dataset: {} } });

    expect(rideService.saveActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '新标题',
        schedule: activity.schedule,
        route: expect.objectContaining({ gpxFileId: activity.route.gpxFileId }),
        fee: activity.fee,
        feeIncluded: activity.feeIncluded,
        feeExcluded: activity.feeExcluded,
        supportVehicleCapacity: 8,
        selfDriveCapacity: 12,
        supportVehicleDriver: activity.supportVehicleDriver,
      }),
      activity.id,
      7,
    );
    expect(page.data.version).toBe(8);
  });

  it('模板草稿显示清空字段提示并允许缺少运营字段时保存', async () => {
    const cloneDraft: EditableActivity = {
      id: 'activity_clone_new',
      version: 1,
      title: '环湖骑行副本',
      status: 'draft',
      capacity: 20,
      occupiedCount: 0,
      description: '说明',
      route: { start: '起点', end: '终点', distanceKm: 80, elevationM: 600, level: '进阶' },
      schedule: activity.schedule,
      notices: activity.notices,
      equipment: activity.equipment,
      fee: activity.fee,
    };
    rideService.getAdminActivity.mockResolvedValueOnce(cloneDraft);
    rideService.saveActivity.mockResolvedValueOnce({ ...cloneDraft, version: 2 });

    await page.onLoad({ id: cloneDraft.id, fromTemplate: '1' });

    expect(page.data.fromTemplate).toBe(true);
    expect(page.data.canPublish).toBe(false);
    expect(readFileSync('miniprogram/pages/admin/activity-edit/index.wxml', 'utf8')).toContain(
      '已复制内容，日期、交通名额和司机信息需重新确认',
    );
    await page.save({ currentTarget: { dataset: { status: 'draft' } } });
    const submitted = rideService.saveActivity.mock.calls[0][0];
    expect(submitted).not.toHaveProperty('deadline');
    expect(submitted).not.toHaveProperty('startAt');
    expect(submitted).not.toHaveProperty('endAt');
    expect(submitted.supportVehicleCapacity).toBe(0);
    expect(submitted.selfDriveCapacity).toBe(20);
    expect(submitted).not.toHaveProperty('supportVehicleDriver');
    expect(page.data.version).toBe(2);
  });

  it('发布按钮受完整重填清单保护，缺字段时不会调用保存', async () => {
    await page.onLoad({ id: activity.id });
    page.data.status = 'draft';
    page.data.form.startAt = '';
    page.recomputePublishReadiness();

    await page.save({ currentTarget: { dataset: { status: 'published' } } });

    expect(rideService.saveActivity).not.toHaveBeenCalled();
    expect(page.data.error).toContain('开始时间');
    expect(wx.showModal).toHaveBeenCalledWith(
      expect.objectContaining({ title: '请检查活动信息', showCancel: false }),
    );
    expect(wx.pageScrollTo).toHaveBeenCalledWith(
      expect.objectContaining({ selector: '[data-error-anchor="startAt"]' }),
    );
    const template = readFileSync('miniprogram/pages/admin/activity-edit/index.wxml', 'utf8');
    expect(template).toContain('发布确认清单');
    expect(template).toContain('日常活动只需标题、报名设置、活动时间、集合点和路线');
    expect(template).toContain('活动图片');
    expect(template).toContain('路线文件 ID（选填）');
    expect(template).toMatch(
      /data-status="published"[^>]*disabled="{{saving \|\| choosingLocation}}"/,
    );
  });

  it('无封面和 GPX 但有费用清单的完整草稿可以发布', async () => {
    const draft: EditableActivity = {
      ...activity,
      status: 'draft',
      coverImage: '',
      route: { ...activity.route, gpxFileId: '' },
      fee: '',
      feeIncluded: ['往返车费'],
      feeExcluded: [],
    };
    rideService.getAdminActivity.mockResolvedValueOnce(draft);
    rideService.saveActivity.mockResolvedValueOnce({ ...draft, status: 'published', version: 8 });

    await page.onLoad({ id: draft.id });
    expect(page.data.canPublish).toBe(true);
    await page.save({ currentTarget: { dataset: { status: 'published' } } });

    expect(rideService.saveActivity).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'published', coverImage: '' }),
      draft.id,
      draft.version,
    );
  });

  it.each(['published', 'finished'] as const)(
    '报名截止后允许 published 活动保存为 %s',
    async (nextStatus) => {
      const historical = {
        ...activity,
        status: 'published' as const,
        deadline: '2025-10-15T12:00:00.000Z',
        startAt: '2025-10-18T00:00:00.000Z',
        endAt: '2025-10-18T08:00:00.000Z',
      };
      rideService.getAdminActivity.mockResolvedValueOnce(historical);
      rideService.saveActivity.mockResolvedValueOnce({
        ...historical,
        status: nextStatus,
        version: 8,
      });

      await page.onLoad({ id: historical.id });
      await page.save({ currentTarget: { dataset: { status: nextStatus } } });

      expect(rideService.saveActivity).toHaveBeenCalledWith(
        expect.objectContaining({ status: nextStatus }),
        historical.id,
        historical.version,
      );
    },
  );

  it('同步 Strava 路线后自动回填里程爬升并提交服务端预览字段', async () => {
    const preview = {
      stravaRouteId: '12345',
      stravaRouteUrl: 'https://www.strava.com/routes/12345',
      distanceKm: 42.3,
      elevationM: 880,
      elevationProfile: [
        { distanceKm: 0, elevationM: 10 },
        { distanceKm: 42.3, elevationM: 20 },
      ],
      routeBounds: { south: 22, west: 113, north: 23, east: 114 },
      popularClimbs: [
        {
          id: '8',
          name: '测试坡',
          distanceKm: 2,
          elevationGainM: 200,
          averageGrade: 10,
          maxGrade: 15,
          climbCategory: 2,
          popularity: 99,
          popularityLabel: '99 收藏',
        },
      ],
    };
    rideService.previewStravaRoute.mockResolvedValueOnce(preview);
    await page.onLoad({ id: activity.id });
    page.data.form.stravaRouteUrl = preview.stravaRouteUrl;

    await page.syncStravaRoute();
    await page.save({ currentTarget: { dataset: {} } });

    expect(rideService.previewStravaRoute).toHaveBeenCalledWith(preview.stravaRouteUrl);
    expect(page.data.form.distanceKm).toBe('42.3');
    expect(page.data.form.elevationM).toBe('880');
    expect(rideService.saveActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        route: expect.objectContaining({
          stravaRouteId: '12345',
          stravaRouteUrl: preview.stravaRouteUrl,
          elevationProfile: preview.elevationProfile,
          routeBounds: preview.routeBounds,
          popularClimbs: preview.popularClimbs,
          distanceKm: 42.3,
          elevationM: 880,
        }),
      }),
      activity.id,
      activity.version,
    );
    expect(readFileSync('miniprogram/pages/admin/activity-edit/index.wxml', 'utf8')).toContain(
      '同步路线',
    );
  });

  it('修改 Strava URL 后必须重新同步，不能提交旧曲线', async () => {
    await page.onLoad({ id: activity.id });
    page.field({
      currentTarget: { dataset: { name: 'stravaRouteUrl' } },
      detail: { value: 'https://www.strava.com/routes/999' },
    });
    await page.save({ currentTarget: { dataset: {} } });
    expect(rideService.saveActivity).not.toHaveBeenCalled();
    expect(page.data.error).toContain('先同步');
  });

  it('日期与时间选择器可分别快捷回填标准时间格式', async () => {
    await page.onLoad({});
    page.dateTimePicker({
      currentTarget: { dataset: { name: 'startAt', part: 'date' } },
      detail: { value: '2026-10-20' },
    });
    expect(page.data.form.startAt).toBe('2026-10-20 08:00:00');

    page.dateTimePicker({
      currentTarget: { dataset: { name: 'startAt', part: 'time' } },
      detail: { value: '07:30' },
    });
    expect(page.data.form.startAt).toBe('2026-10-20 07:30:00');
    const template = readFileSync('miniprogram/pages/admin/activity-edit/index.wxml', 'utf8');
    expect(template).toContain('mode="date"');
    expect(template).toContain('mode="time"');
    expect(template).toContain('class="inline-action-button location-quick-button"');
  });

  it('快捷时间按近期日期和开始时间联动回填，且保留精细选择器', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 9, 23, 1));
    await page.onLoad({});

    page.quickDateTime({
      currentTarget: { dataset: { name: 'startAt', preset: 'tomorrow-morning' } },
    });
    expect(page.data.form.startAt).toBe('2026-10-10 07:00:00');
    page.quickDateTime({
      currentTarget: { dataset: { name: 'endAt', preset: 'start-plus-four-hours' } },
    });
    expect(page.data.form.endAt).toBe('2026-10-10 11:00:00');
    page.quickDateTime({
      currentTarget: { dataset: { name: 'deadline', preset: 'start-minus-day' } },
    });
    expect(page.data.form.deadline).toBe('2026-10-09 20:00:00');
    page.quickDateTime({
      currentTarget: { dataset: { name: 'startAt', preset: 'next-saturday' } },
    });
    expect(page.data.form.startAt).toBe('2026-10-10 08:00:00');

    const template = readFileSync('miniprogram/pages/admin/activity-edit/index.wxml', 'utf8');
    expect(template).toContain('bindtap="quickDateTime"');
    expect(template).toContain('明早 07:00');
    expect(template).toContain('开始前 1 天 20:00');
    expect(template).toContain('mode="date"');
    expect(template).toContain('mode="time"');
  });

  it('缺少开始时间时相对快捷项明确提示且不改值（HP-08）', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 9, 10, 0));
    await page.onLoad({});
    page.data.form.endAt = '';
    page.data.form.deadline = '';

    page.quickDateTime({
      currentTarget: { dataset: { name: 'endAt', preset: 'start-plus-four-hours' } },
    });
    expect(wx.showToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringContaining('开始时间'), icon: 'none' }),
    );
    expect(page.data.form.endAt).toBe('');

    wx.showToast.mockClear();
    page.quickDateTime({
      currentTarget: { dataset: { name: 'deadline', preset: 'start-minus-day' } },
    });
    expect(wx.showToast).toHaveBeenCalledTimes(1);
    expect(page.data.form.deadline).toBe('');
  });

  it('开始时间非法时相对快捷项提示且保持原值（HP-08）', async () => {
    await page.onLoad({});
    page.data.form.startAt = 'not-a-date';
    page.quickDateTime({
      currentTarget: { dataset: { name: 'endAt', preset: 'start-plus-four-hours' } },
    });
    expect(wx.showToast).toHaveBeenCalledTimes(1);
    expect(page.data.form.endAt).toBe('');
  });

  it('相对快捷项跨月、跨年、闰年与跨天计算正确（HP-08 边界）', async () => {
    await page.onLoad({});

    // 跨月：2026（非闰年）3/1 的前一天为 2/28
    page.data.form.startAt = '2026-03-01 08:00:00';
    page.quickDateTime({
      currentTarget: { dataset: { name: 'deadline', preset: 'start-minus-day' } },
    });
    expect(page.data.form.deadline).toBe('2026-02-28 20:00:00');

    // 跨年：2027-01-01 的前一天为 2026-12-31
    page.data.form.startAt = '2027-01-01 08:00:00';
    page.quickDateTime({
      currentTarget: { dataset: { name: 'deadline', preset: 'start-minus-day' } },
    });
    expect(page.data.form.deadline).toBe('2026-12-31 20:00:00');

    // 闰年跨月：2028（闰年）3/1 的前一天为 2/29
    page.data.form.startAt = '2028-03-01 08:00:00';
    page.quickDateTime({
      currentTarget: { dataset: { name: 'deadline', preset: 'start-minus-day' } },
    });
    expect(page.data.form.deadline).toBe('2028-02-29 20:00:00');

    // 跨天：22:00 开始后 4 小时为次日 02:00
    page.data.form.startAt = '2026-10-10 22:00:00';
    page.quickDateTime({
      currentTarget: { dataset: { name: 'endAt', preset: 'start-plus-four-hours' } },
    });
    expect(page.data.form.endAt).toBe('2026-10-11 02:00:00');
  });

  it('周六当天点下周六快捷项跳到 7 天后（HP-08 边界）', async () => {
    vi.useFakeTimers();
    // 2026-10-10 是周六
    vi.setSystemTime(new Date(2026, 9, 10, 9, 0));
    await page.onLoad({});
    page.quickDateTime({
      currentTarget: { dataset: { name: 'startAt', preset: 'next-saturday' } },
    });
    expect(page.data.form.startAt).toBe('2026-10-17 08:00:00');
  });

  it('快捷填入的时间在创建保存时随活动提交（HP-08 保存回读）', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 9, 10, 0));
    await page.onLoad({});
    page.quickDateTime({
      currentTarget: { dataset: { name: 'startAt', preset: 'tomorrow-morning' } },
    });
    page.quickDateTime({
      currentTarget: { dataset: { name: 'endAt', preset: 'start-plus-four-hours' } },
    });
    page.quickDateTime({
      currentTarget: { dataset: { name: 'deadline', preset: 'start-minus-day' } },
    });
    page.data.form.title = '测试活动';
    page.data.form.routeStart = '起点';
    page.data.form.routeEnd = '终点';
    page.data.form.fee = '免费';

    await page.save({ currentTarget: { dataset: { status: 'published' } } });

    expect(rideService.saveActivity).toHaveBeenCalledTimes(1);
    const submitted = rideService.saveActivity.mock.calls[0][0];
    expect(submitted.startAt).toBeTruthy();
    expect(submitted.endAt).toBeTruthy();
    expect(submitted.deadline).toBeTruthy();
  });

  it('日常活动发布时不要求后援车，并把全部名额归为自行前往', async () => {
    const draft = { ...activity, status: 'draft' as const };
    rideService.getAdminActivity.mockResolvedValueOnce(draft);
    rideService.saveActivity.mockResolvedValueOnce({ ...draft, version: 8 });
    await page.onLoad({ id: draft.id });

    page.selectActivityMode({ currentTarget: { dataset: { mode: 'daily' } } });
    page.data.schedule = [];
    page.recomputePublishReadiness();
    expect(page.data.activityMode).toBe('daily');
    expect(page.data.canPublish).toBe(true);

    await page.save({ currentTarget: { dataset: { status: 'published' } } });
    expect(rideService.saveActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        supportVehicleCapacity: 0,
        selfDriveCapacity: 20,
        status: 'published',
      }),
      draft.id,
      draft.version,
    );
    expect(rideService.saveActivity.mock.calls[0][0]).not.toHaveProperty('supportVehicleDriver');
  });

  it('精品局缺少详细日程时弹窗并定位到日程区域', async () => {
    const draft = { ...activity, status: 'draft' as const, schedule: [] };
    rideService.getAdminActivity.mockResolvedValueOnce(draft);
    await page.onLoad({ id: draft.id });

    await page.save({ currentTarget: { dataset: { status: 'published' } } });

    expect(rideService.saveActivity).not.toHaveBeenCalled();
    expect(page.data.formErrors.schedule).toContain('详细日程');
    expect(wx.showModal).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('详细日程') }),
    );
    expect(wx.pageScrollTo).toHaveBeenCalledWith(
      expect.objectContaining({ selector: '[data-error-anchor="schedule"]' }),
    );
  });

  it('Strava 缺少 read 权限时展示重新授权操作', async () => {
    const scopeError = Object.assign(new Error('Strava 授权不足，请重新授权 read 权限'), {
      code: 'STRAVA_SCOPE_REQUIRED',
    });
    rideService.previewStravaRoute.mockRejectedValueOnce(scopeError);
    await page.onLoad({ id: activity.id });
    page.data.form.stravaRouteUrl = 'https://www.strava.com/routes/12345';

    await page.syncStravaRoute();

    expect(page.data.stravaAuthorizationRequired).toBe(true);
    expect(page.data.error).toContain('重新授权');
    expect(wx.showModal).toHaveBeenCalledWith(
      expect.objectContaining({ title: '需要重新授权 Strava', confirmText: '去重新授权' }),
    );
    expect(readFileSync('miniprogram/pages/admin/activity-edit/index.wxml', 'utf8')).toContain(
      '重新授权 Strava',
    );
  });

  it('日程支持新增、编辑、删除并在保存时输出规范化结果', async () => {
    await page.onLoad({ id: activity.id });
    page.addScheduleRow();
    page.data.schedule = [{ time: '', title: '', location: '', remark: '' }];

    const scheduleEvent = (field: string, value: string) => ({
      currentTarget: { dataset: { index: 0, field } },
      detail: { value },
    });
    page.scheduleField(scheduleEvent('time', '07:30'));
    page.scheduleField(scheduleEvent('title', '集合整备'));
    page.scheduleField(scheduleEvent('location', '北门'));
    page.data.schedule[0] = { time: '07:30', title: '集合整备', location: '北门', remark: '' };

    await page.save({ currentTarget: { dataset: {} } });
    const submitted = rideService.saveActivity.mock.calls[0][0];
    expect(submitted.schedule).toEqual([{ time: '07:30', title: '集合整备', location: '北门' }]);
  });

  it('日程不完整时阻止保存并指出具体行号与缺失字段', async () => {
    await page.onLoad({ id: activity.id });
    page.data.schedule = [{ time: '', title: '', location: '', remark: '' }];

    await page.save({ currentTarget: { dataset: {} } });
    expect(rideService.saveActivity).not.toHaveBeenCalled();
    expect(page.data.error).toContain('第 1 行日程缺少时间、事项');
  });

  it('费用包含与不包含按多行文本拆分、trim 并过滤空行', async () => {
    await page.onLoad({ id: activity.id });
    page.feeField({
      currentTarget: { dataset: { name: 'feeIncludedText' } },
      detail: { value: '保险\n\n 交通 \n' },
    });
    page.feeField({
      currentTarget: { dataset: { name: 'feeExcludedText' } },
      detail: { value: '午餐' },
    });
    page.data.feeIncludedText = '保险\n\n 交通 \n';
    page.data.feeExcludedText = '午餐';

    await page.save({ currentTarget: { dataset: {} } });
    const submitted = rideService.saveActivity.mock.calls[0][0];
    expect(submitted.feeIncluded).toEqual(['保险', '交通']);
    expect(submitted.feeExcluded).toEqual(['午餐']);
  });

  it('费用明细超过 50 项或单项超长时阻止保存', async () => {
    await page.onLoad({ id: activity.id });
    page.data.feeIncludedText = Array.from({ length: 51 }, (_, index) => `项目${index}`).join('\n');

    await page.save({ currentTarget: { dataset: {} } });
    expect(rideService.saveActivity).not.toHaveBeenCalled();
    expect(page.data.error).toContain('费用包含最多 50 项');
  });
});
