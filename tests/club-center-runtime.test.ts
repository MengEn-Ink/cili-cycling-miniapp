// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const rideService = vi.hoisted(() => ({
  getSoleClubHome: vi.fn(),
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
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
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
  introduction: '全平台唯一俱乐部，固定路线晨练与周末骑行活动。',
  avatarUrl: 'https://img.example/avatar.jpg',
  coverUrl: 'https://img.example/cover.jpg',
  role: 'VISITOR',
  roleLabel: '骑友',
  canManage: false,
  ...overrides,
});

describe('俱乐部中心 · 唯一俱乐部只读主页运行时', () => {
  let page: any;
  let wxApi: any;

  beforeEach(async () => {
    vi.resetModules();
    rideService.getSoleClubHome.mockReset();
    rideService.getSoleClubHome.mockResolvedValue({ exists: true, club: soleClub() });
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

  it('结构契约：只读主页包含封面/头像/身份/资料/活动/编辑入口，且无多俱乐部交互', () => {
    const view = readFileSync('miniprogram/pages/club/center/index.wxml', 'utf8');
    const script = readFileSync('miniprogram/pages/club/center/index.ts', 'utf8');

    // 原型结构：16:9 背景、叠放头像、名称地区、身份行、01 资料、02 活动、中性说明。
    expect(view).toContain('club-cover');
    expect(view).toContain('club-avatar');
    expect(view).toContain('全平台唯一俱乐部');
    expect(view).toContain('{{club.roleLabel}}');
    expect(view).toContain('查看全部活动');
    expect(view).toContain('编辑俱乐部资料');
    expect(view).toContain('bindtap="openActivities"');
    expect(view).toContain('bindtap="editClub"');
    expect(view).toContain('bindtap="createClub"');
    expect(view).toContain('创建唯一俱乐部');
    expect(view).toContain('binderror="coverError"');
    expect(view).toContain('binderror="avatarError"');
    expect(view).toContain('club-avatar-placeholder');
    expect(view).toContain('club-cover-placeholder');

    // 身份行渲染中文 roleLabel，不直出英文角色令牌。
    expect(view).not.toContain('{{club.role}}');

    // 多俱乐部交互全部移除。
    for (const removed of [
      '推荐俱乐部',
      '申请加入',
      'joinClub',
      'listJoinableClubs',
      'withdrawApplication',
      'saveDraft',
      'submit',
      'createMode',
      '容量',
      '人数上限',
      'joined-card',
      '申请进度',
      'chooseAvatar',
      'chooseCover',
    ])
      expect(view).not.toContain(removed);
    for (const removedCall of [
      'listJoinableClubs',
      'joinPublicClub',
      'getMyClubApplication',
      'getManagedClub',
      'updateManagedClub',
      'uploadMedia',
    ])
      expect(script).not.toContain(removedCall);

    // 弱网/迟到响应防护。
    expect(script).toMatch(/loadToken/);
    expect(script).toContain('isCurrent');
  });
});
