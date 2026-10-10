import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const rideService = vi.hoisted(() => ({
  getAdminActivity: vi.fn(),
  saveActivity: vi.fn(),
}));
const appStore = vi.hoisted(() => ({
  ensureIdentity: vi.fn(),
}));

vi.mock('../miniprogram/services/ride-service', () => ({ rideService }));
vi.mock('../miniprogram/store/app-store', () => ({ appStore }));

type GetFileBehavior = string | undefined | 'ERROR';

function setupWx(digestMap: Map<string, GetFileBehavior>) {
  const cloudPathsReceived: string[] = [];
  let failOnce = false;
  const wx: any = {
    _cloudPathsReceived: cloudPathsReceived,
    getFileInfo: vi.fn(async ({ filePath }: { filePath: string }) => {
      const behavior = digestMap.get(filePath);
      if (behavior === 'ERROR') throw new Error('当前基础库不支持摘要');
      if (behavior === undefined) return {};
      return { digest: behavior };
    }),
    chooseMedia: vi.fn(),
    showToast: vi.fn(),
    showModal: vi.fn(),
    pageScrollTo: vi.fn(),
    cloud: {
      uploadFile: vi.fn(async ({ cloudPath }: { cloudPath: string }) => {
        cloudPathsReceived.push(cloudPath);
        if (failOnce && cloudPathsReceived.length === 1) {
          throw new Error('网络中断');
        }
        return { fileID: `cloud://env-id.appid/${cloudPath}` };
      }),
    },
    _failFirstUpload() {
      failOnce = true;
    },
  };
  return wx;
}

describe('活动图片内容指纹与重复上传治理', () => {
  let page: any;
  let wx: any;

  beforeEach(async () => {
    vi.resetModules();
    rideService.getAdminActivity.mockReset().mockResolvedValue(undefined);
    rideService.saveActivity.mockReset();
    appStore.ensureIdentity.mockReset().mockResolvedValue(undefined);
  });

  async function mount(digestMap: Map<string, GetFileBehavior>) {
    wx = setupWx(digestMap);
    vi.stubGlobal('wx', wx);
    vi.stubGlobal('Page', (definition: any) => {
      page = definition;
      page.data = { ...definition.data, form: { ...definition.data.form } };
      page.setData = (patch: Record<string, unknown>) => {
        for (const [key, value] of Object.entries(patch)) {
          if (key.startsWith('form.')) page.data.form[key.slice(5)] = value;
          else page.data[key] = value;
        }
      };
    });
    await import('../miniprogram/pages/admin/activity-edit/index');
    await page.onLoad({});
    return { page, wx };
  }

  afterEach(() => vi.unstubAllGlobals());

  it('再次选择已提交的同一图片时跳过，不重复上传并提示', async () => {
    const digests = new Map([['http://tmp/a.jpg', 'digest-a']]);
    await mount(digests);
    wx.chooseMedia.mockResolvedValue({ tempFiles: [{ tempFilePath: 'http://tmp/a.jpg' }] });

    await page.chooseImages();
    expect(wx.cloud.uploadFile).toHaveBeenCalledTimes(1);
    expect(page.data.images).toEqual(['cloud://env-id.appid/profiles/activity-media/digest-a.jpg']);

    await page.chooseImages();
    expect(wx.cloud.uploadFile).toHaveBeenCalledTimes(1);
    expect(wx.showToast).toHaveBeenCalledWith({ title: '图片已存在', icon: 'none' });
  });

  it('同一次选择中包含内容相同的图片只上传一张', async () => {
    // 两个临时路径但内容指纹相同（同一图片的两份副本）。
    const digests = new Map([
      ['http://tmp/a.jpg', 'digest-same'],
      ['http://tmp/b.jpg', 'digest-same'],
    ]);
    await mount(digests);
    wx.chooseMedia.mockResolvedValue({
      tempFiles: [{ tempFilePath: 'http://tmp/a.jpg' }, { tempFilePath: 'http://tmp/b.jpg' }],
    });

    await page.chooseImages();
    expect(wx.cloud.uploadFile).toHaveBeenCalledTimes(1);
    expect(page.data.images).toEqual([
      'cloud://env-id.appid/profiles/activity-media/digest-same.jpg',
    ]);
  });

  it('内容不同的图片各自上传，cloudPath 含各自指纹', async () => {
    const digests = new Map([
      ['http://tmp/a.jpg', 'digest-a'],
      ['http://tmp/b.jpg', 'digest-b'],
    ]);
    await mount(digests);
    wx.chooseMedia.mockResolvedValue({
      tempFiles: [{ tempFilePath: 'http://tmp/a.jpg' }, { tempFilePath: 'http://tmp/b.jpg' }],
    });

    await page.chooseImages();
    expect(wx.cloud.uploadFile).toHaveBeenCalledTimes(2);
    expect(wx._cloudPathsReceived).toEqual([
      'profiles/activity-media/digest-a.jpg',
      'profiles/activity-media/digest-b.jpg',
    ]);
  });

  it('失败重试复用同一 cloudPath，不产生第二个对象', async () => {
    const digests = new Map([['http://tmp/a.jpg', 'digest-a']]);
    await mount(digests);
    wx._failFirstUpload();
    wx.chooseMedia.mockResolvedValue({ tempFiles: [{ tempFilePath: 'http://tmp/a.jpg' }] });

    await page.chooseImages();
    expect(page.data.pendingImages[0].status).toBe('failed');
    expect(wx._cloudPathsReceived).toEqual(['profiles/activity-media/digest-a.jpg']);

    const pendingId = page.data.pendingImages[0].id;
    await page.retryImage({ currentTarget: { dataset: { id: pendingId } } });
    expect(wx.cloud.uploadFile).toHaveBeenCalledTimes(2);
    // 两次上传目标完全一致，即便首次实际成功但响应丢失，重试也只是覆盖同一对象。
    expect(wx._cloudPathsReceived).toEqual([
      'profiles/activity-media/digest-a.jpg',
      'profiles/activity-media/digest-a.jpg',
    ]);
    expect(page.data.images).toEqual(['cloud://env-id.appid/profiles/activity-media/digest-a.jpg']);
  });

  it('读取不到内容指纹时降级随机路径，上传仍可用', async () => {
    // getFileInfo 直接报错（旧基础库）：降级为随机命名，不阻断上传。
    const digests = new Map([['http://tmp/a.jpg', 'ERROR' satisfies GetFileBehavior]]);
    await mount(digests);
    wx.chooseMedia.mockResolvedValue({ tempFiles: [{ tempFilePath: 'http://tmp/a.jpg' }] });

    await page.chooseImages();
    expect(wx.cloud.uploadFile).toHaveBeenCalledTimes(1);
    expect(wx._cloudPathsReceived[0]).toMatch(/^profiles\/activity-media\/\d+-[a-z0-9]+\.jpg$/);
  });
});
