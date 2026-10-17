# CloudBase 俱乐部资料幂等 smoke 可见性修复验收报告

## 1. 验收对象

| 项目 | 内容 |
| --- | --- |
| 前序功能 PR | [#278](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/278) |
| 时间兼容 PR | [#279](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/279) |
| 失败运行 | [CloudBase #39078336984](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/39078336984) |
| 客户端版本 | `2026.10.18.3`；本次不改产品代码与版本 |
| 验收环境 | 本地 smoke harness；CloudBase 待合并后复验 |
| 验收角色 | 自动化生产写入账号 |
| 执行时间 | 2026-10-18 07:26 CST |
| 执行人 | Aime |

## 2. 影响范围

| 维度 | 结论 |
| --- | --- |
| 页面与交互 | 不涉及 |
| 云函数与数据 | 不修改生产云函数；仅增强部署后的真实写入 smoke |
| 权限与隐私 | 不涉及权限变化；查询仅限 smoke 自己创建的审计记录 |
| Pages / 文档 | 新增本验收报告 |
| 部署与回滚 | 合并后重新触发 CloudBase 部署与 smoke；异常可直接回滚脚本提交 |

## 3. 测试用例矩阵

| 用例 | 类型 | 前置条件 | 步骤 | 预期 | 实际 | 证据 | 结论 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Extended JSON `$date` | 根因反例 | QUERY 返回日期包装对象 | 解析查询结果 | 转成 ISO 字符串 | 新增断言通过 | smoke node test | PASS |
| 审计最终一致性 | 失败恢复 | 首次更新已写审计但 QUERY 暂不可见 | 轮询最多 12 秒后再重放 requestId | 审计可见后执行幂等重放 | 内存测试通过 | smoke node test | PASS |
| 审计持续不可见 | 边界 | 查询窗口耗尽 | 等待 12 次 | 明确失败，不绕过幂等验证 | 显式错误分支 | `waitForProfileAudit` | PASS |
| 生产真实写入 | 端到端 | main 合并部署 | 执行 8 阶段 smoke | 幂等重放通过且清理零残留 | 待合并执行 | main CloudBase workflow | BLOCKED |

## 4. 自动化门禁

| 门禁 | 结果 | 关键输出或链接 |
| --- | --- | --- |
| `npm run validate` | 通过 | 云函数包与 17 个页面校验通过 |
| `npm run coverage` | 通过 | 95 files / 1173 tests；`cloud.ts` lines 90.39%、branches 88.56% |
| `npm run audit:all` | 通过 | 前序同一依赖树已通过，项目及云函数 0 high |
| `git diff --check` | 通过 | 无空白错误 |
| PR checks | 待执行 | 推送 PR 后执行 |

## 5. 端到端执行记录

1. #279 合并后的生产 smoke 仍在“重复资料更新”阶段返回并发冲突。
2. 确认 smoke CLI 通过独立 UPDATE 与 QUERY 模拟事务，overlay 不跨事务；审计写入后立即 QUERY 存在最终一致性窗口。
3. 在幂等重放前按 requestId、clubId、action 轮询 smoke 自己的审计记录，同时补齐 `$date` 归一化。
4. 执行定向 node tests、完整 validate 与 coverage。

**执行结论**：本地自动化 PASS；生产 CloudBase smoke 待合并后复验。

**未执行或阻塞说明**：生产写入门禁仅在 main 部署工作流中执行；合并后必须确认 8 阶段通过且测试数据清理完成。

## 6. 部署与回读

| 流程 | 运行链接 | 结果 | 回读 |
| --- | --- | --- | --- |
| main CI | 待合并后回填 | 待执行 | 待核对 main SHA |
| Pages | 不适用 | 安全跳过 | 无页面变化 |
| CloudBase | 待合并后回填 | 待部署 | 必须确认生产 smoke 通过 |
| 微信开发版 | 预计安全跳过 | 待执行 | 本次不改小程序源码 |

## 7. 风险与回滚

- 剩余风险：CloudBase 审计可见性超过 12 秒会继续阻断部署，避免假通过。
- 监控与观察：关注 smoke 的审计等待耗时和临时数据清理结果。
- 回滚步骤：回滚本提交；不需重新部署业务云函数。
- 数据恢复：smoke `finally` 清理本次临时数据；不涉及用户数据。

## 8. 最终结论

修复仅校正 smoke 对 CloudBase 最终一致性的等待方式，不降低产品幂等与并发门禁；本地测试满足合并条件，最终交付以 main CloudBase 8 阶段 smoke 通过为准。
