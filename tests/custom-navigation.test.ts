import { afterEach, describe, expect, it, vi } from 'vitest';
import { customNavigationTopPx } from '../miniprogram/utils/custom-navigation';

describe('自定义导航顶部安全区', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('优先使用当前窗口状态栏高度', () => {
    vi.stubGlobal('wx', {
      getWindowInfo: () => ({ statusBarHeight: 44 }),
      getSystemInfoSync: () => ({ statusBarHeight: 20 }),
    });

    expect(customNavigationTopPx()).toBe(88);
  });

  it('旧基础库回退系统信息并保留完整导航行', () => {
    vi.stubGlobal('wx', {
      getSystemInfoSync: () => ({ statusBarHeight: 25 }),
    });

    expect(customNavigationTopPx()).toBe(69);
  });

  it('非微信测试环境使用安全默认值', () => {
    vi.stubGlobal('wx', undefined);

    expect(customNavigationTopPx()).toBe(68);
  });

  it.each([undefined, 0, Number.NaN])('状态栏高度为 %s 时使用安全默认值', (height) => {
    vi.stubGlobal('wx', {
      getWindowInfo: () => ({ statusBarHeight: height }),
    });

    expect(customNavigationTopPx()).toBe(68);
  });
});
