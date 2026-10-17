import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const rideService = vi.hoisted(() => ({
  getMyClubApplication: vi.fn(),
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
    rideService.getMyClubApplication.mockResolvedValue(null);
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
});
