# PR341 Cache Invalidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 闭合当前仓储和个人页的失效边界，阻止迟到读取、失效前离线兜底与卡片图片重新进入缓存。

**Architecture:** 保留仓储成功分支已有的请求身份保护，在失败分支使用同一身份判断限制离线兜底。个人页缓存使用独立的本地 revision，读取开始、图片保存和缓存提交共用该 revision；失效清理磁盘卡片及下载文件。只修改当前消费者，不引入权益、同意或服务端 generation。

**Tech Stack:** TypeScript、Vitest 5.0.5、现有 MemoryCacheStorage 与 wx 图片/存储 API、ESLint、Prettier、TypeScript build。

---

## 授权与边界

- 工作树：`/tmp/cili-pr341-cache`。
- 分支：`fix/pr341-cache-invalidation-20261026`。
- 基线：`3fd6abfd6acdb872b87ced8404c7219c4e32b1a8`，开始时干净。
- 已读 `AGENTS.md`、`docs/high-priority-issues.md`、批准拆合 spec `docs/superpowers/specs/2026-10-26-pr341-latest-main-split.md`、`/tmp/cili-pr341-implementation/rights-port-plan.md` Task3 与 Consumer Closure Checklist。
- 本计划直接执行，用户已批准 Task3 的独立缓存收益部分。
- 不复制未合并 privacy，不接权益端点、同意 contract/UI、删除入口、公开门槛或媒体审核；不改根高优清单，不 commit/push/PR/deploy，不运行全量 validate。
- generation executor 在自己的 cached.ts 上工作，主代理按方法序列合并，不能用本文件覆盖其 transport 变更。
- 当前媒体 source/canonical、私人预览、权限卡、WXML、44px 范围和主题保持原样。
- 仓储失效后的成功结果仍返回原调用方，这是当前契约；它不能回填缓存。个人页以本地 revision 阻止该结果继续写 UI 或卡片缓存。其它页面的权益 epoch 和活动 UI 迟到应用属于完整权益集成，不在本片新增。

## 文件职责与消费者

| 文件 | 操作 | 职责 |
| --- | --- | --- |
| `tests/rights-cache-invalidation.test.ts` | 新增 | 真实仓储/缓存工具/个人页消费者的 deferred 回归，mock 仅用于网络、wx 与身份宿主 |
| `miniprogram/repositories/cached.ts` | 修改 | 请求身份失效后拒绝失效前 persisted fallback，保留 metrics 和成功保护 |
| `miniprogram/utils/profile-page-cache.ts` | 修改 | 本地 revision、硬失效、异步图片清理、过期写入拒绝 |
| `miniprogram/pages/profile/index.ts` | 修改 | 唯一运行时 writeProfilePageCache 消费者，读取开始捕获 revision，跨 await 检查 |
| `tests/profile-page-cache.test.ts` | 修改 | 将旧“失效保留卡片”用例更新为已批准的清理契约 |
| 本计划 | 新增并更新状态 | 执行与 UT 七步跟踪 |
| `/tmp/cili-pr341-implementation/cache-invalidation-result.md` | 新增 | 精确范围、未覆盖、命令与 hash、集成交付约束 |

直接消费者清单：profile 页读/写/下载/clear；profile-edit 页调用 invalidate；settings 页调用 clear；profile 页 guidance 和媒体恢复调用 clear。后两页不新增业务逻辑，使用工具既有入口即生效。temp-file-url、capability-card Canvas/export 工具与其它页面缓存不在本片扩展；未来权益成功变更仍需统一清理并贯通全部消费者。

个人页 UI 前置已读影像志 README、`pages/profile.html`、`page-dom-contracts/profile.json`。本片不编辑布局、WXML、WXSS、Pages、版本或同步证据。

## UT 七步任务表

- [x] Step1 测试准备：执行 prepare_test.sh，TMP_ROOT=`/var/folders/xh/ty0hlc7s7438bsjdhcysj8x40000gn/T/tmp.73Zqxet5MM`，EXEC_SOURCE 为空。
- [x] Step2 加载语言知识与全局上下文：LANG=javascript，读取 default/general context 与语言 prompt；现有 npm/Vitest 配置，无外部 runnable sandbox。首次 npm exec 版本探测命中 npm 缓存，未发现本树缺 node_modules；首轮 npm test 因 runner 缺失退出 127，补做 `npm ci --ignore-scripts --no-audit --no-fund` 安装 170 包后重跑。未改锁文件。
- [x] Step3 确定生成范围：non_diff，仅下面 TARGETS，diff_context=null。
- [x] Step4 分析缺陷：读取 default/detect-bugs、JS scoring/verifier，输出下面 BUG_MAP。
- [x] Step5 生成、验证、修复：按源文件串行，Loop A/B/C/D，仓储 18 FAIL / 24 PASS，工具 9 FAIL / 3 PASS，个人页 10 FAIL / 2 PASS；C1-C3 均 confirmed，未删失败断言，生成期间生产 hash 与基线一致。目标测试 lint 通过。
- [x] Step6 覆盖率统计与补充：读取 default-gate-check，EXEC_SOURCE 为空、无 CI 覆盖率要求，cov_config=null、CHECK_COV_MODE=skip；未统计覆盖率，不声称覆盖率达标。
- [x] Step7 输出报告：读取 default-report，utree flush 退出 0，generation_duration_min=8.6；生成阶段报告写入 `/tmp/cili-pr341-implementation/cache-invalidation-result.md`。之后的生产修复独立记录 GREEN。

流程偏差留证：首轮依赖探测不足，在测试生成后补齐了本树依赖。安装后的 `npm test -- --version` 被 Vitest run 当作宽范围运行，意外执行的宽范围结果不计入本任务证据；该次探测没有 alarm。后续真实 RED/GREEN 均严格使用 alarm 与定向文件串行；未执行 npm run validate。

### TARGETS

`target_type=file`；`source=explicit`（个人页为 caller_callee）；`hunks=[]`。

1. `miniprogram/repositories/cached.ts`：`CachingRepository.readThrough`（基线 L228），通过 invalidatePrefix/clear 间接测试；原因是失效前 fallback。
2. `miniprogram/utils/profile-page-cache.ts`：read/write/clear/invalidate/persist/discard（基线 L45/69/105/115/177/173）；原因是卡片下载和持久化边界。
3. `miniprogram/pages/profile/index.ts`：hydrateCache、performLoad（基线 L139/207）；原因是真实唯一卡片缓存写入消费者。

### BUG_MAP

| ID | 分类 / 严重度 | 责任位置 | 触发、错误与正确期望 |
| --- | --- | --- | --- |
| C1 | Error Handling / P1 | cached.ts readThrough L260-269 | 过期 persisted 仍在离线窗口内，读开始后 invalidate/clear，再 reject；现有请求身份只限制清标记，仍返回旧 persisted；应抛原始错误、staleReads 不增长、不清新请求 |
| C2 | Concurrency / P1 | profile-page-cache.ts clear/invalidate/persist/write | 图片保存开始后 clear/invalidate，旧 persist 仍返回旧映射、新保存文件且 write 无 revision；应回收本轮新文件、不返回旧映射、不提交旧卡片；invalidate 不保留失效前卡片 fallback |
| C3 | Concurrency / P1 | profile/index.ts performLoad L256-311 / L316-358 | 页仍显示时 clear/invalidate，原 profile/card resolve 或 reject，loadRequestId 未变；现有回调可应用旧资料/卡片、复用旧 images、重新写盘；读取开始捕获 revision 后应忽略旧完成，新读取仍可提交 |

三组均基于批准的 Task3/本次用户契约与当前代码，不以覆盖率不足证明缺陷。保留正常过期缓存和非目标命名空间的离线功能，不报告它们为缺陷。

## Task 1: 仓储 Deferred 回归（UT Step5 第一个源文件）

- [x] 生成测试基础 deferred 与参数表。完整核心 fixture：

```ts
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

// 每个 profile/self、profile/capability-card、act/item、act/page、act/list、
// reg/mine 读取都按其真实仓储方法调用，MemoryCacheStorage seed expiresAt=900。
const pending = deferred<unknown>();
const reading = read(repo);
invalidate(repo);
const observed = reading.then(
  (value) => ({ value }),
  (error: unknown) => ({ error }),
);
pending.reject(offlineError);
expect(await observed).toEqual({ error: offlineError });
expect(storage.get(key)).toBeUndefined();
expect(repo.cacheControl.getMetrics().staleReads).toBe(0);
```

- [x] 串行验证 RED：

```bash
perl -e 'alarm shift; exec @ARGV' 120 npm test -- tests/rights-cache-invalidation.test.ts -t CachingRepository
```

预期：C1 缺陷用例因返回旧值失败，成功防回填、普通离线兜底、新旧请求所有权用例通过。记录生成/验证/修复轮次，只修测试问题，不修生产。

## Task 2: 卡片工具 Deferred 回归（UT Step5 第二个源文件）

- [x] 向同一测试文件追加真实存储 Map、真实工具 import 和可控 getImageInfo/saveFile 回调。覆盖 clear 与 invalidate，download 后 clear、save 后 clear、新图片局部完成后 invalidate、旧图片映射不复用。
- [x] 更新既有旧用例：invalidate 后 read 返回 null，保存图片调用 removeSavedFile，正常过期缓存仍由既有 TTL/offline 用例覆盖。
- [x] 串行验证 RED：

```bash
perl -e 'alarm shift; exec @ARGV' 120 npm test -- tests/rights-cache-invalidation.test.ts -t profile-page-cache
```

预期：C2 用例因旧映射、未清新文件和晚到写盘失败。

## Task 3: 个人页真实消费者（UT Step5 第三个源文件）

- [x] 使用既有 Page mount 模式，仅 mock rideService/identity/wx 宿主，导入真实 profile 页及真实缓存工具。
- [x] 开始 profile/card deferred 后 invalidate，再分别 resolve/reject；要求无 setStorageSync、无旧 profile/heroCard 应用、无旧图片映射回落。
- [x] profile/card 已成功而 saveFile 未完成时 invalidate，完成保存后要求新文件回收、无卡片提交。失效后新 load 可完成，不被旧 Promise finally 清掉。
- [x] 串行验证 RED：

```bash
perl -e 'alarm shift; exec @ARGV' 120 npm test -- tests/rights-cache-invalidation.test.ts -t 'profile-page consumer'
```

预期：C3 用例实锤旧消费者写缓存。保存 RED 日志和生产基线 hash；完成 UT Step6/Step7 后才进入生产修复。

## Task 4: 独立生产 GREEN

- [x] 仓储失败分支先检查同一请求身份，将 fallback 限定在身份有效分支，保持 originLoads、storageHits/Writes/Errors、memoryHits 的定义：

```ts
if (this.inflight.get(key) === request) {
  this.inflight.delete(key);
  if (persisted && persisted.expiresAt + this.staleMs > this.now()) {
    this.metrics.staleReads++;
    return persisted.value;
  }
}
throw error;
```

- [x] 工具增加 revision；clear 每次递增，即使无缓存也失效在途读；invalidate 调用 clear。read 在本次删除失败后保持不可读，当前合法新 write 成功才能恢复。write 接受可选末尾 revision 参数，写前拒绝不匹配。

```ts
let cacheRevision = 0;
let cacheInvalidated = false;

export function getProfilePageCacheRevision() {
  return cacheRevision;
}
```

- [x] 图片持久化接收捕获的 revision。每个 download 完成后先比较 revision，save 完成后若旧则清文件；Promise.all 后若旧，丢弃本轮 created，返回 `{ images: {}, created: [], complete: false }`。正常 token URL 去重、部分失败、旧文件成功提交后才清理规则不变。
- [x] 个人页 performLoad 在任何请求开始前保存 revision，所有 await 后已有 requestId 保护额外检查 revision；将 revision 传给 persist/write：

```ts
const cacheRevision = getProfilePageCacheRevision();
const isCurrent = () =>
  requestId === this.loadRequestId &&
  cacheRevision === getProfilePageCacheRevision();
```

若当前 load 的 revision 已失效，不复用该在途 loadPromise；新 load 可直接启动。hydrateCache 每次读取工具当前缓存，不能返回已被外部 clear 的旧对象。

- [x] 独立 GREEN：

```bash
perl -e 'alarm shift; exec @ARGV' 120 npm test -- tests/rights-cache-invalidation.test.ts
```

结果：66/66 PASS，未改断言；`/tmp/cili-pr341-implementation/cache-green.log`。

## Task 5: 定向回归与交付

- [x] 本树定向缓存、页面和媒体消费者回归，JS 文件串行：

```bash
perl -e 'alarm shift; exec @ARGV' 300 npm test -- --no-file-parallelism tests/rights-cache-invalidation.test.ts tests/caching-repository.test.ts tests/caching-repository-persist.test.ts tests/profile-page-cache.test.ts tests/profile-page-cache-integration.test.ts tests/profile-edit-avatar.test.ts tests/settings-page.test.ts tests/profile-media-dedupe.test.ts tests/temp-file-url-cache.test.ts
```

- [x] 仅目标 format/lint：

```bash
npm exec -- prettier --write tests/rights-cache-invalidation.test.ts tests/profile-page-cache.test.ts miniprogram/repositories/cached.ts miniprogram/utils/profile-page-cache.ts miniprogram/pages/profile/index.ts docs/superpowers/plans/2026-10-26-pr341-cache-invalidation.md
npm exec -- eslint tests/rights-cache-invalidation.test.ts tests/profile-page-cache.test.ts miniprogram/repositories/cached.ts miniprogram/utils/profile-page-cache.ts miniprogram/pages/profile/index.ts
npm exec -- prettier --check tests/rights-cache-invalidation.test.ts tests/profile-page-cache.test.ts miniprogram/repositories/cached.ts miniprogram/utils/profile-page-cache.ts miniprogram/pages/profile/index.ts docs/superpowers/plans/2026-10-26-pr341-cache-invalidation.md
```

- [x] 执行 `npm run build`（现有脚本末尾 scripts/validate.mjs 是构建资源校验，不是全量 npm run validate）。
- [x] 复核 git diff、hash，生产补丁只包含本计划边界。最终报告注明 UT 七步顺序、RED/GREEN、覆盖与未覆盖、缓存工具消费者、媒体/transport 合并边界。
- [ ] 完成集成交付：客户端版本、设置页与 Pages 发布说明、严格 UI 同步、治理、全量 validate、代码审查、PR/main 检查和发布 outcome。真实云只读、普通成员写链路及双物理真机仍为独立现场验收，不能由本地 Mock 替代。

## 计划自审

Task3 缓存条款由 Task1-4 覆盖；纯 consent 刻意排除且留给主代理，未加入未批准业务。实现符号都是本计划明确定义的当前文件方法或新增 revision getter，无占位步骤。全部 JS 验证有 alarm，单测生成串行且与生产修复隔离；不提交、不部署。
