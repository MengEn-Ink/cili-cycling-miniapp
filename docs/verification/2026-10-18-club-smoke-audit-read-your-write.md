# CloudBase smoke 幂等审计读己之写修复验收报告

## 1. 验收对象

| 项目 | 内容 |
| --- | --- |
| 前序 PR | [#280](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/280) |
| 失败运行 | [CloudBase #39080161932](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/39080161932) |
| 客户端版本 | `2026.10.18.3`；本次不改产品代码与版本 |
| 验收环境 | 本地 smoke harness；CloudBase 待合并后复验 |
| 验收角色 | 自动化生产写入账号 |
| 执行时间 | 2026-10-18 07:55 CST |
| 执行人 | Aime |

## 2. 影响范围

| 维度 | 结论 |
| --- | --- |
| 页面与交互 | 不涉及 |
| 云函数与数据 | 不修改生产云函数；仅让 CLI smoke 在本进程内保留自己写入的确定性幂等审计 |
| 权限与隐私 | 仅缓存 smoke 自建审计，不读取或保留用户数据 |
| Pages / 文档 | 新增本验收报告 |
| 部署与回滚 | 合并后重跑 CloudBase smoke；异常可回滚脚本提交 |

## 3. 测试用例矩阵

| 用例 | 类型 | 前置条件 | 步骤 | 预期 | 实际 | 证据 | 结论 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 跨模拟事务读取确定性审计 | 根因反例 | UPDATE 成功但 QUERY 返回空 | 事务一 `putAudit`，事务二 `getAudit` | 从本进程缓存读到首次结果，不触发 QUERY | 新增测试通过 | smoke node test | PASS |
| 普通集合 overlay | 回归 | 写入 application | 跨事务读取 | 仍通过真实 QUERY，不扩大缓存范围 | 原测试通过 | smoke node test | PASS |
| requestId 重放 | 标准 | 首次资料更新成功 | 相同 requestId 再调用 | 返回首次结果，不误触发版本冲突 | 完整状态机测试通过 | smoke node test | PASS |
| 生产真实写入 | 端到端 | main 合并部署 | 执行 8 阶段 smoke | 幂等重放通过、清理零残留 | 待合并执行 | main CloudBase workflow | BLOCKED |

## 4. 自动化门禁

| 门禁 | 结果 | 关键输出或链接 |
| --- | --- | --- |
| 定向 Node tests | 通过 | 33 tests passed |
| `npm run validate` | 通过 | 云函数包与 17 个页面校验通过 |
| `npm run coverage` | 通过 | 前序同一产品代码：95 files / 1173 tests |
| `npm run audit:all` | 通过 | 同一依赖树 0 high |
| `git diff --check` | 通过 | 无空白错误 |
| PR checks | 待执行 | 推送 PR 后执行 |

## 5. 端到端执行记录

1. #280 的轮询已能看到审计，但业务重放仍通过确定性 `_id` 查询；CLI 的下一条 QUERY 仍可能短暂不可见。
2. 将 smoke 本进程刚写入的确定性幂等审计保存到专用 `knownAudits`，仅 `getAudit` 跨模拟事务复用。
3. 普通 application、club、membership 仍只保留事务内 overlay，跨事务继续真实回读。
4. 新增“QUERY 始终为空但幂等审计可读”的精确回归测试。

**执行结论**：定向自动化 PASS；生产 CloudBase smoke 待合并后复验。

**未执行或阻塞说明**：生产写入门禁只在 main 工作流执行；合并后必须确认 8 个阶段和清理均成功。

## 6. 部署与回读

| 流程 | 运行链接 | 结果 | 回读 |
| --- | --- | --- | --- |
| main CI | 待合并后回填 | 待执行 | 待核对 main SHA |
| Pages | 不适用 | 安全跳过 | 无页面变化 |
| CloudBase | 待合并后回填 | 待部署 | 必须确认生产 smoke 通过 |
| 微信开发版 | 预计安全跳过 | 待执行 | 本次不改小程序源码 |

## 7. 风险与回滚

- 剩余风险：缓存仅覆盖当前 smoke 进程写入的审计，不能掩盖跨进程或生产数据库缺失。
- 监控与观察：关注生产 smoke 的幂等重放与清理阶段。
- 回滚步骤：回滚本提交，不需重新部署业务云函数。
- 数据恢复：不涉及用户数据；临时数据由 smoke `finally` 清理。

## 8. 最终结论

修复将 CLI 模拟事务缺失的审计读己之写限定在 smoke 本进程和确定性 audit ID，不降低业务门禁；以 main CloudBase 8 阶段 smoke 通过作为最终交付标准。
