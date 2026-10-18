import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const rideService = vi.hoisted(() => ({
  getProfile: vi.fn(),
  getMyClubApplication: vi.fn(),
  listJoinableClubs: vi.fn(),
  joinPublicClub: vi.fn(),
  getClubDetail: vi.fn(),
  getManagedClub: vi.fn(),
  updateManagedClub: vi.fn(),
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
        managedForm: { ...definition.data.managedForm },
        joinModes: [...definition.data.joinModes],
      };
      page.setData = vi.fn((patch: Record<string, unknown>) => applyPatch(page.data, patch));
    });
    await import('../miniprogram/pages/club/center/index');
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

  it('OWNER 与 ADMIN 进入俱乐部中心时读取管理资料并展示修改入口', async () => {
    const clubId = `club_${'a'.repeat(64)}`;
    const managedClub = {
      id: clubId,
      name: '山海骑行会',
      city: '深圳',
      introduction: '我们每周组织安全友好的公路骑行训练活动。',
      joinMode: 'public_apply',
      avatarFileId: 'cloud://env/club-applications/test-openid/cover.jpg',
      avatarUrl: 'https://temporary.example/cover.jpg',
      memberCount: 12,
      maxMembers: 50,
      updatedAt: '2026-10-18T00:00:00.000Z',
    };
    const secondClub = { ...managedClub, id: `club_${'c'.repeat(64)}`, name: '城市骑行会' };
    rideService.getProfile.mockResolvedValue({
      clubs: [
        { clubId, name: managedClub.name, role: 'ADMIN' },
        { clubId: secondClub.id, name: secondClub.name, role: 'OWNER' },
      ],
    });
    rideService.getManagedClub.mockResolvedValueOnce(managedClub).mockResolvedValueOnce(secondClub);

    await page.load();

    expect(rideService.getManagedClub).toHaveBeenNthCalledWith(1, clubId);
    expect(rideService.getManagedClub).toHaveBeenNthCalledWith(2, secondClub.id);
    expect(page.data.canManageClub).toBe(true);
    expect(page.data.managedClubs).toEqual([managedClub, secondClub]);
    expect(page.data.managedClub).toEqual(managedClub);
    page.selectManagedClub({ detail: { value: 1 } });
    expect(page.data.managedClub).toEqual(secondClub);
    page.showManageForm();
    expect(page.data.manageMode).toBe(true);
    expect(page.data.managedForm.name).toBe('城市骑行会');
  });

  it('单个管理资料读取失败不阻断俱乐部中心其余内容', async () => {
    const clubId = `club_${'e'.repeat(64)}`;
    rideService.getProfile.mockResolvedValue({
      clubs: [{ clubId, name: '山海骑行会', role: 'OWNER' }],
    });
    rideService.getManagedClub.mockRejectedValue(new Error('管理资料读取失败'));

    await page.load();

    expect(page.data.loading).toBe(false);
    expect(page.data.loadError).toBe('');
    expect(page.data.canManageClub).toBe(true);
    expect(page.data.managedClub).toBeNull();
    expect(page.data.manageLoadError).toContain('暂时无法读取');
  });

  it('已加入俱乐部整卡进入详情并可返回，管理员扩容不得低于当前人数', async () => {
    const clubId = `club_${'9'.repeat(64)}`;
    rideService.getProfile.mockResolvedValue({
      clubs: [
        {
          clubId,
          name: '山海骑行会',
          avatarUrl: '',
          role: 'OWNER',
          roleLabel: '负责人',
        },
      ],
    });
    const detail = {
      id: clubId,
      name: '山海骑行会',
      city: '深圳',
      introduction: '我们每周组织安全、友好的公路骑行训练活动。',
      avatarUrl: '',
      avatarInitial: '山',
      memberCount: 12,
      maxMembers: 50,
      joinMode: 'public_apply',
      role: 'OWNER',
      roleLabel: '负责人',
      canManage: true,
    };
    const managed = {
      ...detail,
      avatarFileId: 'cloud://env/club-applications/test-openid/cover.jpg',
      updatedAt: '2026-10-18T00:00:00.000Z',
    };
    rideService.getClubDetail.mockResolvedValue(detail);
    rideService.getManagedClub.mockResolvedValue(managed);
    await page.load();

    await page.openClubDetail({ currentTarget: { dataset: { id: clubId } } });
    expect(rideService.getClubDetail).toHaveBeenCalledWith(clubId);
    expect(page.data.detailMode).toBe(true);
    expect(page.data.selectedClub).toEqual(detail);
    page.closeClubDetail();
    expect(page.data.detailMode).toBe(false);

    page.showManageForm();
    page.managedInput({
      currentTarget: { dataset: { field: 'maxMembers' } },
      detail: { value: '11' },
    });
    expect(page.ensureManagedValid()).toBe(false);
    expect(page.data.fieldError).toContain('不能低于当前 12 名成员');
    page.managedInput({
      currentTarget: { dataset: { field: 'maxMembers' } },
      detail: { value: '50' },
    });
    page.expandCapacity({ currentTarget: { dataset: { value: 100 } } });
    expect(page.data.managedForm.maxMembers).toBe(150);
  });

  it('普通成员不请求管理接口，管理员确认后保存并退出编辑态', async () => {
    const clubId = `club_${'b'.repeat(64)}`;
    rideService.getProfile.mockResolvedValue({
      clubs: [{ clubId, name: '山海骑行会', role: 'MEMBER' }],
    });
    await page.load();
    expect(rideService.getManagedClub).not.toHaveBeenCalled();
    expect(page.data.canManageClub).toBe(false);

    const managedClub = {
      id: clubId,
      name: '山海骑行会',
      city: '深圳',
      introduction: '我们每周组织安全友好的公路骑行训练活动。',
      joinMode: 'public_apply',
      avatarFileId: 'cloud://env/club-applications/test-openid/cover.jpg',
      avatarUrl: 'https://temporary.example/cover.jpg',
      memberCount: 12,
      maxMembers: 50,
      updatedAt: '2026-10-18T00:00:00.000Z',
    };
    rideService.getProfile.mockResolvedValue({
      clubs: [{ clubId, name: managedClub.name, role: 'OWNER' }],
    });
    rideService.getManagedClub.mockResolvedValue(managedClub);
    rideService.updateManagedClub.mockResolvedValue({ ...managedClub, name: '山海骑行俱乐部' });
    await page.load();
    page.showManageForm();
    page.manageRequestId = 'stale-request-id';
    page.managedInput({
      currentTarget: { dataset: { field: 'name' } },
      detail: { value: '山海骑行俱乐部' },
    });
    expect(page.manageRequestId).toBe('');
    wxApi.showModal.mockImplementation(({ success }: any) => success({ confirm: true }));

    await page.saveManagedClub();

    expect(rideService.updateManagedClub).toHaveBeenCalledWith(
      clubId,
      expect.objectContaining({ name: '山海骑行俱乐部' }),
      expect.stringMatching(/^club_update_/),
      managedClub.updatedAt,
    );
    expect(page.data.managedClubs[0]?.name).toBe('山海骑行俱乐部');
    expect(page.data.manageMode).toBe(false);
    expect(page.data.managing).toBe(false);
    expect(wxApi.showToast).toHaveBeenCalledWith({ title: '俱乐部资料已更新' });
  });
});
