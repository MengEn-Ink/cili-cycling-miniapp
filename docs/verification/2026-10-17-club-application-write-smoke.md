# 俱乐部申请真实写入门禁验收报告

## 目标

验证 CloudBase 生产部署后的俱乐部申请数据链路能够真实持久化，并且测试数据在成功或失败后均被完整清理。

## 覆盖范围

- TCB Mgo `Data/Result` 查询响应解包。
- Extended JSON 数字无损归一。
- CLI store 写穿及事务内读己之写。
- 草稿、首次提交、管理员驳回、修改草稿、二次提交、审批通过。
- `clubs`、OWNER `club_memberships` 与 `audit_logs` 持久化回读。
- `finally` 逐集合清理及零残留回读。

## 本地验证

- `npm run test:bootstrap`：92/92 通过。
- `npm run test:deploy`：32/32 通过。
- Smoke 专项测试：18/18 通过。
- `npm run lint`、`npm run typecheck`、`npm run format:check`、`git diff --check`：通过。

## 生产验收

本报告随修复 PR 提交。合并后由 `CloudBase 自动部署` 工作流执行真实写入门禁；只有完整状态链通过且全部测试记录清理、回读零残留，部署任务才会成功。

## 安全边界

- 真实写入需要显式 gate 与目标环境 ID 双确认。
- 测试身份和记录使用隔离标记，不输出 OpenID、记录 ID、联系方式或请求 ID。
- 损坏响应、数值精度风险、任一阶段漂移、删除失败或清理残留都会阻断。
- 生产门禁不模拟微信 OPENID；微信鉴权由云函数单元测试和客户端端到端测试覆盖。
