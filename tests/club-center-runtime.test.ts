// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const rideService = vi.hoisted(() => ({
  getSoleClubHome: vi.fn(),
  listActivities: vi.fn(),
}));
const appStore = vi.hoisted(() => ({
  authStatus: 'authenticated',
  role: 'member',
  openid: 'test-openid',
  ensureIdentity: vi.fn(),
}));

vi.mock('../miniprogram/services/ride-service', () => ({ rideService }));
vi.mock('../miniprogram/store/app-store', () => ({ appStore }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function applyPatch(target: Record<string, any>, patch: Record<string, unknown>) {
  for (const [path, value] of Object.entries(patch)) {
    const parts = path.split('.');
    let current = target;
    for (const part of parts.slice(0, -1)) current = current[part];
    current[parts[parts.length - 1]] = value;
  }
}

const soleClub = (overrides: Record<string, unknown> = {}) => ({
  id: `club_${'a'.repeat(64)}`,
  name: '辛庄桥小火车',
  city: '北京',
  introduction: '固定路线晨练与周末骑行活动。',
  avatarUrl: 'https://img.example/avatar.jpg',
  coverUrl: 'https://img.example/cover.jpg',
  role: 'VISITOR',
  roleLabel: '骑友',
  canManage: false,
  ...overrides,
});

const activity = (id: string, startAt: string, overrides: Record<string, unknown> = {}) => ({
  id,
  version: 1,
  title: `骑行活动 ${id}`,
  date: startAt,
  startAt,
  endAt: startAt,
  deadline: startAt,
  status: 'published',
  capacity: 30,
  occupiedCount: 8,
  approvedRegistrationCount: 6,
  description: '',
  route: { start: '辛庄桥', end: '终点', distanceKm: 88, elevationM: 680, level: '进阶' },
  schedule: [],
  notices: [],
  equipment: [],
  fee: '免费',
  registrationState: 'open',
  closedReason: null,
  ...overrides,
});

describe('俱乐部中心 · 俱乐部主页运行时', () => {
  let page: any;
  let wxApi: any;

  beforeEach(async () => {
    vi.resetModules();
    rideService.getSoleClubHome.mockReset();
    rideService.listActivities.mockReset();
    rideService.getSoleClubHome.mockResolvedValue({ exists: true, club: soleClub() });
    rideService.listActivities.mockResolvedValue([]);
    appStore.authStatus = 'authenticated';
    appStore.role = 'member';
    appStore.openid = 'test-openid';
    appStore.ensureIdentity.mockReset().mockResolvedValue(undefined);
    wxApi = {
      switchTab: vi.fn(),
      navigateTo: vi.fn(),
    };
    vi.stubGlobal('wx', wxApi);
    vi.stubGlobal('Page', (definition: any) => {
      page = definition;
      page.data = { ...definition.data };
      page.setData = vi.fn((patch: Record<string, unknown>) => applyPatch(page.data, patch));
    });
    await import('../miniprogram/pages/club/center/index');
  });

  afterEach(() => vi.unstubAllGlobals());

  it('身份初始化拒绝后进入错误态且不请求主页，重试成功后恢复 home', async () => {
    appStore.ensureIdentity
      .mockImplementationOnce(async () => {
        appStore.authStatus = 'error';
        throw new Error('身份服务暂时不可用');
      })
      .mockImplementationOnce(async () => {
        appStore.authStatus = 'authenticated';
      });

    await page.load();

    expect(page.data.mode).toBe('error');
    expect(page.data.loadError).toBe('身份服务暂时不可用');
    expect(rideService.getSoleClubHome).not.toHaveBeenCalled();

    await page.load();

    expect(page.data.mode).toBe('home');
    expect(page.data.loadError).toBe('');
    expect(rideService.getSoleClubHome).toHaveBeenCalledTimes(1);
  });

  it('未登录时进入错误态并提示先登录，不请求云函数', async () => {
    appStore.authStatus = 'unavailable';

    await page.load();

    expect(page.data.mode).toBe('error');
    expect(page.data.loadError).toContain('微信登录');
    expect(rideService.getSoleClubHome).not.toHaveBeenCalled();
  });

  it('主页读取失败进入错误态，重试可恢复', async () => {
    rideService.getSoleClubHome
      .mockRejectedValueOnce(new Error('网络不稳定'))
      .mockResolvedValueOnce({ exists: true, club: soleClub() });

    await page.load();
    expect(page.data.mode).toBe('error');
    expect(page.data.loadError).toBe('网络不稳定');

    await page.retry();
    expect(page.data.mode).toBe('home');
    expect(rideService.getSoleClubHome).toHaveBeenCalledTimes(2);
  });

  it('有俱乐部时渲染 home：资料、中文身份、首字头像与 canManage 入口数据', async () => {
    rideService.getSoleClubHome.mockResolvedValue({
      exists: true,
      club: soleClub({ role: 'OWNER', roleLabel: '负责人', canManage: true }),
    });

    await page.load();

    expect(page.data.mode).toBe('home');
    expect(page.data.club.name).toBe('辛庄桥小火车');
    expect(page.data.club.roleLabel).toBe('负责人');
    expect(page.data.club.canManage).toBe(true);
    expect(page.data.avatarInitial).toBe('辛');
    expect(page.data.avatarFailed).toBe(false);
    expect(page.data.coverFailed).toBe(false);
  });

  it('活动请求挂起时先展示已返回的俱乐部资料', async () => {
    const pendingActivities = deferred<any[]>();
    rideService.listActivities.mockImplementationOnce(() => pendingActivities.promise);

    const loading = page.load();
    await vi.waitFor(() => expect(page.data.mode).toBe('home'));
    expect(page.data.club.name).toBe('辛庄桥小火车');
    expect(page.data.activityMode).toBe('loading');

    pendingActivities.resolve([]);
    await loading;
    expect(page.data.activityMode).toBe('empty');
  });

  it('空库普通骑友进入中性空态且无创建入口，平台管理员显示创建入口', async () => {
    rideService.getSoleClubHome.mockResolvedValue({ exists: false });

    await page.load();
    expect(page.data.mode).toBe('empty');
    expect(page.data.club).toBeNull();
    expect(page.data.isAdmin).toBe(false);

    appStore.role = 'admin';
    await page.load();
    expect(page.data.mode).toBe('empty');
    expect(page.data.isAdmin).toBe(true);
  });

  it('管理员空态创建入口跳到 bootstrap 编辑页，普通骑友调用被拦截', async () => {
    rideService.getSoleClubHome.mockResolvedValue({ exists: false });
    await page.load();
    page.createClub();
    expect(wxApi.navigateTo).not.toHaveBeenCalled();

    page.data.isAdmin = true;
    page.createClub();
    expect(wxApi.navigateTo).toHaveBeenCalledWith({
      url: '/pages/admin/club-application-detail/index?mode=bootstrap',
    });
  });

  it('canManage 时编辑入口跳到 edit 态，普通骑友调用被拦截', async () => {
    await page.load();
    expect(page.data.club.canManage).toBe(false);
    page.editClub();
    expect(wxApi.navigateTo).not.toHaveBeenCalled();

    page.data.club = soleClub({ canManage: true });
    page.editClub();
    expect(wxApi.navigateTo).toHaveBeenCalledWith({
      url: '/pages/admin/club-application-detail/index?mode=edit',
    });
  });

  it('查看全部活动使用 switchTab 进入活动 tab', async () => {
    await page.load();
    page.openActivities();
    expect(wxApi.switchTab).toHaveBeenCalledWith({ url: '/pages/activities/index' });
  });

  it('成功加载近期活动并生成紧凑行展示信息', async () => {
    rideService.listActivities.mockResolvedValue([
      activity('a', '2026-10-25T00:30:00.000Z', { registrationUnlimited: true }),
    ]);
    await page.load();
    expect(rideService.listActivities).toHaveBeenCalledWith('upcoming');
    expect(page.data.activityMode).toBe('ready');
    expect(page.data.activities[0]).toMatchObject({
      id: 'a',
      meetingPlace: '辛庄桥',
      displayDistance: '88 km',
      displayElevation: '680 m',
      registrationSummary: '6 人已报名 · 不限名额',
      displayStatus: '报名中',
    });
  });

  it('没有近期活动时显示自然空态', async () => {
    rideService.listActivities.mockResolvedValue([]);
    await page.load();
    expect(page.data.mode).toBe('home');
    expect(page.data.activityMode).toBe('empty');
    expect(page.data.activities).toEqual([]);
  });

  it('活动失败不影响俱乐部主页，并可单独重试恢复', async () => {
    rideService.listActivities
      .mockRejectedValueOnce(new Error('活动网络错误'))
      .mockResolvedValueOnce([activity('recovered', '2026-10-24T00:00:00.000Z')]);
    await page.load();
    expect(page.data.mode).toBe('home');
    expect(page.data.club.name).toBe('辛庄桥小火车');
    expect(page.data.activityMode).toBe('error');
    await page.retryActivities();
    expect(page.data.mode).toBe('home');
    expect(page.data.activityMode).toBe('ready');
    expect(page.data.activities[0].id).toBe('recovered');
  });

  it('并发活动重试只允许最新请求写入状态', async () => {
    await page.load();
    const slowRetry = deferred<any[]>();
    rideService.listActivities
      .mockImplementationOnce(() => slowRetry.promise)
      .mockResolvedValueOnce([activity('latest', '2026-10-24T00:00:00.000Z')]);

    const oldRetry = page.retryActivities();
    await vi.waitFor(() => expect(rideService.listActivities).toHaveBeenCalledTimes(2));
    await page.retryActivities();
    expect(page.data.activityMode).toBe('ready');
    expect(page.data.activities[0].id).toBe('latest');

    slowRetry.reject(new Error('迟到的失败'));
    await oldRetry;
    expect(page.data.activityMode).toBe('ready');
    expect(page.data.activities[0].id).toBe('latest');
  });

  it('近期活动按 event_start 映射的 startAt 升序排列并截断为 3 条', async () => {
    rideService.listActivities.mockResolvedValue([
      activity('d', '2026-10-28T00:00:00.000Z'),
      activity('b', '2026-10-24T00:00:00.000Z'),
      activity('a', '2026-10-23T00:00:00.000Z'),
      activity('c', '2026-10-26T00:00:00.000Z'),
    ]);
    await page.load();
    expect(page.data.activities.map((item: { id: string }) => item.id)).toEqual(['a', 'b', 'c']);
  });

  it('点击活动整行进入现有活动详情', async () => {
    await page.load();
    page.openActivity({ currentTarget: { dataset: { id: 'activity / 1' } } });
    expect(wxApi.navigateTo).toHaveBeenCalledWith({
      url: '/pages/activity-detail/index?id=activity%20%2F%201',
    });
  });

  it('头像或背景图失败时切换占位，且每次 load 重置失败标记', async () => {
    await page.load();
    page.avatarError();
    page.coverError();
    expect(page.data.avatarFailed).toBe(true);
    expect(page.data.coverFailed).toBe(true);

    await page.load();
    expect(page.data.avatarFailed).toBe(false);
    expect(page.data.coverFailed).toBe(false);
  });

  it('旧 load 后返回不能覆盖较新 load 的主页状态', async () => {
    const slow = deferred<{ exists: false }>();
    rideService.getSoleClubHome
      .mockImplementationOnce(() => slow.promise)
      .mockResolvedValueOnce({
        exists: true,
        club: soleClub({ name: '新唯一俱乐部', roleLabel: '骑友' }),
      });

    const oldLoad = page.load();
    await vi.waitFor(() => expect(rideService.getSoleClubHome).toHaveBeenCalledTimes(1));
    await page.load();
    expect(page.data.mode).toBe('home');
    expect(page.data.club.name).toBe('新唯一俱乐部');

    slow.resolve({ exists: false });
    await oldLoad;

    expect(page.data.mode).toBe('home');
    expect(page.data.club.name).toBe('新唯一俱乐部');
  });

  it('onUnload 使尚未返回的 load 失效，不再 setData', async () => {
    const slow = deferred<{ exists: false }>();
    rideService.getSoleClubHome.mockImplementationOnce(() => slow.promise);
    const oldLoad = page.load();
    await vi.waitFor(() => expect(rideService.getSoleClubHome).toHaveBeenCalledTimes(1));
    page.onUnload();
    const updatesAfterUnload = page.setData.mock.calls.length;

    slow.resolve({ exists: false });
    await oldLoad;

    expect(page.setData).toHaveBeenCalledTimes(updatesAfterUnload);
  });

  it('结构契约：封面与稳定底色身份区分层，活动为可点击紧凑列表且无唯一话术', () => {
    const view = readFileSync('miniprogram/pages/club/center/index.wxml', 'utf8');
    const script = readFileSync('miniprogram/pages/club/center/index.ts', 'utf8');
    const style = readFileSync('miniprogram/pages/club/center/index.wxss', 'utf8');

    expect(view).toContain('club-cover');
    expect(view).toContain('club-identity');
    expect(view).toContain('club-avatar');
    expect(view).toContain('{{club.roleLabel}}');
    expect(view).toContain('近期活动');
    expect(view).toMatch(/class="[^"]*\bactivity-row\b[^"]*"/);
    expect(view).toContain('bindtap="openActivity"');
    expect(view).toContain('bindtap="retryActivities"');
    expect(view).toContain('bindtap="openActivities"');
    expect(view).toContain('bindtap="editClub"');
    expect(view).toContain('bindtap="createClub"');
    expect(view).toContain('binderror="coverError"');
    expect(view).toContain('binderror="avatarError"');
    expect(view).not.toContain('activity-card');
    expect(view).not.toContain('{{club.role}}');
    expect(`${view}\n${script}`).not.toMatch(/全网唯一|全平台唯一|唯一俱乐部/);
    expect(style).toMatch(/\.club-cover-location\s*\{[^}]*top:/s);
    expect(style).toMatch(/\.club-identity\s*\{[^}]*background:/s);
    expect(script).toContain("listActivities('upcoming')");
    expect(script).not.toContain('Promise.allSettled');
    expect(script).toContain('clubPromise');
    expect(script).toContain('activityPromise');
    expect(script).toMatch(/loadToken/);
    expect(script).toContain('isCurrent');
  });
});
