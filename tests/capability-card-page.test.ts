import { beforeEach, describe, expect, it, vi } from 'vitest';

const getPersonalCapabilityCard = vi.hoisted(() => vi.fn());
vi.mock('../miniprogram/services/ride-service', () => ({
  rideService: { getPersonalCapabilityCard },
}));

describe('历史骑行名片入口', () => {
  let definition: any;
  let context: any;
  const switchTab = vi.fn();

  beforeEach(async () => {
    vi.resetModules();
    getPersonalCapabilityCard.mockReset();
    switchTab.mockReset();
    vi.stubGlobal('wx', { switchTab });
    vi.stubGlobal('Page', (value: any) => {
      definition = value;
    });
    await import('../miniprogram/pages/capability-card/index');
    context = {
      ...definition,
      data: { ...definition.data },
      setData(patch: Record<string, unknown>) {
        Object.assign(this.data, patch);
      },
    };
  });

  it('旧地址进入我的页，不发起独立名片请求', async () => {
    await definition.onShow.call(context);
    expect(switchTab).toHaveBeenCalledWith(
      expect.objectContaining({ url: '/pages/profile/index' }),
    );
    expect(getPersonalCapabilityCard).not.toHaveBeenCalled();
  });

  it('转跳失败提供持久重试，重试成功清除错误', async () => {
    switchTab.mockImplementationOnce(({ fail }) => fail());
    await definition.onShow.call(context);
    expect(context.data.error).toBe('暂时无法打开我的页面，请重试');
    switchTab.mockImplementationOnce(({ success }) => success());
    definition.openProfile.call(context);
    expect(switchTab).toHaveBeenCalledTimes(2);
    expect(context.data.error).toBe('');
  });
});
