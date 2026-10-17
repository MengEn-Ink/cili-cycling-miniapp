import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const rideService = vi.hoisted(() => ({
  getProfile: vi.fn(),
  getMyClubApplication: vi.fn(),
  listJoinableClubs: vi.fn(),
  joinPublicClub: vi.fn(),
  saveClubApplicationDraft: vi.fn(),
  submitClubApplication: vi.fn(),
}));
const appStore = vi.hoisted(() => ({
  authStatus: 'authenticated',
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

describe('俱乐部申请页运行时错误恢复', () => {
  let page: any;
  let wxApi: any;

  beforeEach(async () => {
    vi.resetModules();
    Object.values(rideService).forEach((mock) => mock.mockReset());
    appStore.authStatus = 'authenticated';
    appStore.openid = 'test-openid';
    appStore.ensureIdentity.mockReset().mockResolvedValue(undefined);
    rideService.getProfile.mockResolvedValue({ clubs: [] });
    rideService.getMyClubApplication.mockResolvedValue(null);
    rideService.listJoinableClubs.mockResolvedValue([]);
    wxApi = {
      cloud: { uploadFile: vi.fn() },
      chooseMedia: vi.fn(),
      showToast: vi.fn(),
      showModal: vi.fn(),
    };
    vi.stubGlobal('wx', wxApi);
    vi.stubGlobal('Page', (definition: any) => {
      page = definition;
      page.data = {
        ...definition.data,
        form: { ...definition.data.form },
        joinModes: [...definition.data.joinModes],
      };
      page.setData = vi.fn((patch: Record<string, unknown>) => applyPatch(page.data, patch));
    });
    await import('../miniprogram/pages/club-center/index');
  });

  afterEach(() => vi.unstubAllGlobals());

  it('身份初始化拒绝后结束 loading，重试成功并清除加载错误', async () => {
    appStore.ensureIdentity
      .mockImplementationOnce(async () => {
        appStore.authStatus = 'error';
        throw new Error('身份服务暂时不可用');
      })
      .mockImplementationOnce(async () => {
        appStore.authStatus = 'authenticated';
      });

    await page.load();

    expect(page.data.loading).toBe(false);
    expect(page.data.loadError).toBe('身份服务暂时不可用');
    expect(rideService.getMyClubApplication).not.toHaveBeenCalled();

    await page.load();

    expect(page.data.loading).toBe(false);
    expect(page.data.loadError).toBe('');
    expect(rideService.getMyClubApplication).toHaveBeenCalledTimes(1);
  });

  it('申请读取拒绝后结束 loading，重试可恢复', async () => {
    rideService.getMyClubApplication.mockRejectedValueOnce(new Error('申请读取失败'));

    await page.load();

    expect(page.data.loading).toBe(false);
    expect(page.data.loadError).toBe('申请读取失败');

    await page.load();

    expect(page.data.loading).toBe(false);
    expect(page.data.loadError).toBe('');
    expect(rideService.getMyClubApplication).toHaveBeenCalledTimes(2);
  });

  it('封面权限失败保留表单并显示 actionError，后续成功清错', async () => {
    page.data.form = {
      clubName: '山海骑行会',
      city: '深圳',
      introduction: '这是一段已填写且不能因上传失败丢失的俱乐部简介。',
      applicantContact: 'ci-contact',
      joinMode: 'public_apply',
      expectedSize: 20,
      activityTypes: '公路骑行',
      rulesSummary: '遵守交通规则并全程佩戴头盔。',
      coverFileId: '',
    };
    const originalForm = structuredClone(page.data.form);
    wxApi.chooseMedia.mockResolvedValue({
      tempFiles: [{ tempFilePath: 'wxfile://club-cover.jpg', size: 1024 }],
    });
    wxApi.cloud.uploadFile
      .mockRejectedValueOnce(new Error('-503002 storage permission denied'))
      .mockResolvedValueOnce({ fileID: 'cloud://env/club-applications/test-openid/cover.jpg' });

    await page.chooseCover();

    expect(page.data.uploading).toBe(false);
    expect(page.data.form).toEqual(originalForm);
    expect(page.data.actionError).toContain('-503002');

    await page.chooseCover();

    expect(page.data.uploading).toBe(false);
    expect(page.data.actionError).toBe('');
    expect(page.data.form).toEqual({
      ...originalForm,
      coverFileId: 'cloud://env/club-applications/test-openid/cover.jpg',
    });
    expect(page.data.coverPreviewUrl).toBe('wxfile://club-cover.jpg');
  });

  it('无俱乐部无申请时默认发现，并可展开创建表单', async () => {
    const clubs = [
      {
        id: `club_${'a'.repeat(64)}`,
        name: '山海骑行会',
        city: '深圳',
        introduction: '每周组织安全友好的骑行活动',
        avatarUrl: '',
        avatarInitial: '山',
      },
    ];
    rideService.listJoinableClubs.mockResolvedValue(clubs);

    await page.load();

    expect(page.data.discoverMode).toBe(true);
    expect(page.data.createMode).toBe(false);
    expect(page.data.joinableClubs).toEqual(clubs);
    expect(rideService.getProfile).toHaveBeenCalledTimes(1);
    expect(rideService.getMyClubApplication).toHaveBeenCalledTimes(1);
    expect(rideService.listJoinableClubs).toHaveBeenCalledTimes(1);

    page.showCreateForm();
    expect(page.data.discoverMode).toBe(false);
    expect(page.data.createMode).toBe(true);
  });

  it('加入成功后重新 load 并显示已加入结果', async () => {
    const club = {
      id: `club_${'a'.repeat(64)}`,
      name: '山海骑行会',
      city: '深圳',
      introduction: '每周组织安全友好的骑行活动',
      avatarUrl: '',
      avatarInitial: '山',
    };
    rideService.listJoinableClubs.mockResolvedValue([club]);
    rideService.joinPublicClub.mockResolvedValue({ club, role: 'MEMBER', status: 'active' });
    await page.load();

    await page.joinClub({ currentTarget: { dataset: { id: club.id } } });

    expect(rideService.joinPublicClub).toHaveBeenCalledWith(
      club.id,
      expect.stringMatching(/^club_join_/),
    );
    expect(rideService.getProfile).toHaveBeenCalledTimes(2);
    expect(page.data.joinedClubName).toBe('山海骑行会');
    expect(page.data.discoverMode).toBe(false);
    expect(page.data.joiningClubId).toBe('');
  });

  it('旧 load 后返回不能覆盖较新的 load 状态', async () => {
    const oldProfile = deferred<{ clubs: never[] }>();
    rideService.getProfile
      .mockImplementationOnce(() => oldProfile.promise)
      .mockResolvedValueOnce({ clubs: [{ name: '新俱乐部' }] });
    rideService.listJoinableClubs
      .mockResolvedValueOnce([{ id: 'old-club', name: '旧列表' }])
      .mockResolvedValueOnce([]);

    const oldLoad = page.load();
    await vi.waitFor(() => expect(rideService.getProfile).toHaveBeenCalledTimes(1));
    await page.load();
    expect(page.data.joinedClubName).toBe('新俱乐部');
    expect(page.data.discoverMode).toBe(false);

    oldProfile.resolve({ clubs: [] });
    await oldLoad;

    expect(page.data.joinedClubName).toBe('新俱乐部');
    expect(page.data.discoverMode).toBe(false);
    expect(page.data.joinableClubs).toEqual([]);
  });

  it('加入后 reload 的状态不被更早的 load 覆盖', async () => {
    const oldProfile = deferred<{ clubs: never[] }>();
    const oldClub = { id: 'old-club', name: '旧列表' };
    const joinedClub = {
      id: `club_${'a'.repeat(64)}`,
      name: '山海骑行会',
      city: '深圳',
      introduction: '每周组织安全友好的骑行活动',
      avatarUrl: '',
      avatarInitial: '山',
    };
    rideService.getProfile
      .mockImplementationOnce(() => oldProfile.promise)
      .mockResolvedValueOnce({ clubs: [] });
    rideService.listJoinableClubs
      .mockResolvedValueOnce([oldClub])
      .mockResolvedValueOnce([joinedClub]);
    rideService.joinPublicClub.mockResolvedValue({
      club: joinedClub,
      role: 'MEMBER',
      status: 'active',
    });

    const oldLoad = page.load();
    await vi.waitFor(() => expect(rideService.getProfile).toHaveBeenCalledTimes(1));
    await page.joinClub({ currentTarget: { dataset: { id: joinedClub.id } } });
    expect(page.data.joinedClubName).toBe('山海骑行会');
    expect(page.data.joinableClubs).toEqual([joinedClub]);

    oldProfile.resolve({ clubs: [] });
    await oldLoad;

    expect(page.data.joinedClubName).toBe('山海骑行会');
    expect(page.data.joinableClubs).toEqual([joinedClub]);
    expect(page.data.discoverMode).toBe(false);
  });

  it('onUnload 使尚未返回的 load 失效', async () => {
    const oldProfile = deferred<{ clubs: never[] }>();
    rideService.getProfile.mockImplementationOnce(() => oldProfile.promise);
    const oldLoad = page.load();
    await vi.waitFor(() => expect(rideService.getProfile).toHaveBeenCalledTimes(1));
    page.onUnload();
    const updatesAfterUnload = page.setData.mock.calls.length;

    oldProfile.resolve({ clubs: [] });
    await oldLoad;

    expect(page.setData).toHaveBeenCalledTimes(updatesAfterUnload);
  });

  it('加入失败内联报错并保留列表供重试', async () => {
    const club = {
      id: `club_${'a'.repeat(64)}`,
      name: '山海骑行会',
      city: '深圳',
      introduction: '每周组织安全友好的骑行活动',
      avatarUrl: '',
      avatarInitial: '山',
    };
    rideService.listJoinableClubs.mockResolvedValue([club]);
    rideService.joinPublicClub.mockRejectedValue(new Error('该俱乐部暂不可加入'));
    await page.load();

    await page.joinClub({ currentTarget: { dataset: { id: club.id } } });

    expect(page.data.joinError).toBe('该俱乐部暂不可加入');
    expect(page.data.joinableClubs).toEqual([club]);
    expect(page.data.discoverMode).toBe(true);
    expect(page.data.joiningClubId).toBe('');
  });
});
