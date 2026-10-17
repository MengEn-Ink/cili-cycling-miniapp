import { describe, expect, it, vi } from 'vitest';
import { createNavigationSingleFlight } from '../miniprogram/utils/navigation-single-flight';

describe('页面导航 single-flight', () => {
  it('双击只发起一次导航，受理回调不会在页面切换前提前释放', () => {
    let options: any;
    const navigate = vi.fn((value) => {
      options = value;
    });
    const lock = createNavigationSingleFlight(navigate);

    expect(lock.run('/pages/activity-detail/index?id=a1')).toBe(true);
    expect(lock.run('/pages/activity-detail/index?id=a1')).toBe(false);
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(options.success).toBeUndefined();
    expect(options.complete).toBeUndefined();

    lock.release();
    expect(lock.run('/pages/activity-detail/index?id=a1')).toBe(true);
    expect(navigate).toHaveBeenCalledTimes(2);
    lock.release();
  });

  it('失败和同步异常都会释放，超时也不会永久锁死', () => {
    vi.useFakeTimers();
    let options: any;
    const navigate = vi.fn((value) => {
      options = value;
    });
    const lock = createNavigationSingleFlight(navigate, 100);

    lock.run('/pages/profile-edit/index');
    options.fail();
    expect(lock.run('/pages/profile-edit/index')).toBe(true);
    vi.advanceTimersByTime(100);
    expect(lock.isPending()).toBe(false);

    const throwing = createNavigationSingleFlight(() => {
      throw new Error('navigation unavailable');
    });
    expect(() => throwing.run('/pages/profile-edit/index')).toThrow('navigation unavailable');
    expect(throwing.isPending()).toBe(false);
    vi.useRealTimers();
  });
});
