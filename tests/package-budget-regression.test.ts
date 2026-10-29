// 主包预算与消冗回归：固定“删除真实冗余后行为等价、不得挪包冒充、字节同口径低于预警线”的契约。
// 不修改 scripts/check-main-package-size.mjs 的算法与常量；本文件只新增断言。
// @ts-expect-error 仓库按运行时能力使用 Node 内置模块，未额外引入 @types/node。
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
// @ts-expect-error 同上。
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import * as dateTime from '../miniprogram/utils/date-time';
import { CachingRepository } from '../miniprogram/repositories/cached';
import type { RideRepository } from '../miniprogram/repositories/types';

// 显式仓库根：测试由 npm 脚本在仓库根启动；计量调用统一显式传入 ROOT，
// 不使用 check-main-package-size.mjs 的默认 process.cwd() 参数（tsconfig 为 commonjs，不可用 import.meta URL 推导）。
// @ts-expect-error 仓库未安装 @types/node；运行时由 Node/Vitest 提供 process 全局。
const ROOT = process.cwd();

function walk(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap(
    (entry: { name: string; isDirectory(): boolean }) => {
      const fullPath = path.join(directory, entry.name);
      return entry.isDirectory() ? walk(fullPath) : [fullPath];
    },
  );
}

/** 只含被测写路径的假仓储，避免依赖 wx 与真实网络。 */
function makeInner(overrides: Partial<Record<string, unknown>> = {}): RideRepository {
  return {
    listActivityPage: vi.fn(),
    saveRegistration: vi.fn(),
    joinPublicClub: vi.fn(),
    setAvatar: vi.fn(),
    saveActivity: vi.fn(),
    ...overrides,
  } as unknown as RideRepository;
}

describe('消冗目标：无调用方的生产导出被移除', () => {
  it('date-time 不再导出零引用的 formatChinaDate / formatChinaDateOnly', () => {
    const namespace = dateTime as Record<string, unknown>;
    expect(namespace.formatChinaDate).toBeUndefined();
    expect(namespace.formatChinaDateOnly).toBeUndefined();
    // 仍在使用的格式化助手必须保留，避免误删在用能力。
    expect(typeof namespace.formatChinaDateTime).toBe('function');
    expect(typeof namespace.formatActivityDate).toBe('function');
    expect(typeof namespace.describeActivityDay).toBe('function');
  });

  it('测试专用 MemoryCacheStorage 不留在生产 repositories 模块', async () => {
    const persistent = await import('../miniprogram/repositories/persistent');
    expect((persistent as Record<string, unknown>).MemoryCacheStorage).toBeUndefined();
  });

  it('报名状态机助手只存在于 tests/support，生产 utils 不再携带测试代码', () => {
    expect(existsSync(path.join(ROOT, 'miniprogram/utils/registration.ts'))).toBe(false);
  });

  it('零引用 metric-grid 组件整体移出主包（无 json 登记、无 wxml 使用、无测试引用）', () => {
    const componentDir = path.join(ROOT, 'miniprogram/components/metric-grid');
    expect(existsSync(componentDir)).toBe(false);
  });
});

describe('缓存写方法行为等价：参数透传、结果返回、失败不吞错', () => {
  it('saveRegistration 透传参数并原样返回成功结果', async () => {
    const inner = makeInner();
    vi.mocked(inner.saveRegistration).mockResolvedValue({ id: 'r-1' } as never);
    const repo = new CachingRepository(inner);
    const payload = { activityId: 'a-1' } as never;
    const result = await repo.saveRegistration(payload);
    expect(inner.saveRegistration).toHaveBeenCalledTimes(1);
    expect(inner.saveRegistration).toHaveBeenCalledWith(payload);
    expect(result).toEqual({ id: 'r-1' });
  });

  it('joinPublicClub 拒绝时原样向外抛出，不做静默兜底', async () => {
    const inner = makeInner();
    const boom = new Error('network unavailable');
    vi.mocked(inner.joinPublicClub).mockRejectedValue(boom);
    const repo = new CachingRepository(inner);
    await expect(repo.joinPublicClub('club-1', 'req-1')).rejects.toBe(boom);
    expect(inner.joinPublicClub).toHaveBeenCalledTimes(1);
  });

  it('setAvatar 成功后正常返回内部结果', async () => {
    const inner = makeInner();
    vi.mocked(inner.setAvatar).mockResolvedValue({ fileId: 'f-1' } as never);
    const repo = new CachingRepository(inner);
    const result = await repo.setAvatar({ source: 'avatar' } as never, 'f-1');
    expect(inner.setAvatar).toHaveBeenCalledWith({ source: 'avatar' }, 'f-1');
    expect(result).toEqual({ fileId: 'f-1' });
  });

  it('写方法失败时保留已缓存的活动列表，不触发任何失效（弱网兜底不被清空）', async () => {
    const inner = makeInner();
    vi.mocked(inner.listActivityPage).mockResolvedValue({
      items: [{ id: 'a-1' }],
      nextCursor: null,
    } as never);
    const repo = new CachingRepository(inner);
    await repo.listActivityPage('future');
    expect(repo.cacheControl.peekActivityPage('future')).toBeTruthy();

    const boom = new Error('offline');
    vi.mocked(inner.saveRegistration).mockRejectedValue(boom);
    await expect(repo.saveRegistration({ activityId: 'a-1' } as never)).rejects.toBe(boom);
    // 失败路径不得失效：缓存条目仍可同步命中。
    expect(repo.cacheControl.peekActivityPage('future')).toBeTruthy();
  });

  it('报名写方法成功后活动列表缓存被失效，下次读取需重新回源', async () => {
    const inner = makeInner();
    vi.mocked(inner.listActivityPage).mockResolvedValue({
      items: [{ id: 'a-1' }],
      nextCursor: null,
    } as never);
    vi.mocked(inner.saveRegistration).mockResolvedValue({ id: 'r-1' } as never);
    const repo = new CachingRepository(inner);
    await repo.listActivityPage('future');
    await repo.saveRegistration({ activityId: 'a-1' } as never);
    expect(repo.cacheControl.peekActivityPage('future')).toBeUndefined();
  });
});

describe('反作弊：减重不得通过挪入分包或新增资产实现', () => {
  it('被移除的生产文件不以同名形式出现在 miniprogram 任意位置（含分包目录）', () => {
    const all = walk(path.join(ROOT, 'miniprogram'));
    const relocated = all.filter(
      (file) => file.endsWith('utils/registration.ts') || file.includes('components/metric-grid/'),
    );
    expect(relocated).toEqual([]);
  });

  it('生产 miniprogram 源码中不再定义 MemoryCacheStorage 类', () => {
    const sources = walk(path.join(ROOT, 'miniprogram')).filter((file) => file.endsWith('.ts'));
    const leaked = sources.filter((file) => {
      if (statSync(file).size === 0) return false;
      return readFileSync(file, 'utf8').includes('class MemoryCacheStorage');
    });
    expect(leaked).toEqual([]);
  });
});

describe('主包预算：同口径字节严格低于预警线（复用项目脚本导出计量函数与常量，不放宽阈值）', () => {
  it('mainPackageBytes() < MAIN_PACKAGE_WARNING_BYTES', async () => {
    // @ts-expect-error 限额脚本为 .mjs，类型侧不参与 tsc；运行时仅消费其导出，并显式传入测试推导的仓库根。
    const size = await import('../scripts/check-main-package-size.mjs');
    const bytes = size.mainPackageBytes(ROOT);
    const warning = size.MAIN_PACKAGE_WARNING_BYTES;
    expect(bytes).toBeLessThan(warning);
  });
});
