# 成员克隆活动测试日期修复验证（2026-10-20）

## 问题结论

- main CI 在 `tests/member-activity-permissions.test.ts` 失败，`cloneActivity` 预期调用 1/2 次、实际 0 次。
- 用例把报名截止时间硬编码为 `2026-10-20T00:00:00.000Z`；执行时该时间已经过去，被生产代码的时间合法性校验正确拦截。
- 生产逻辑没有回归。本次只把测试窗口改为相对执行时刻的未来时间，并保持截止时间 < 开始时间 < 结束时间。

## 自动化验证

- `npm test -- --run tests/member-activity-permissions.test.ts`：通过，1 个测试文件、4 个用例。
- `npm run validate`：通过，99 个测试文件、1247 个用例。
- `npm run coverage`：通过；Statements 81.92%、Branches 75.94%、Functions 81.80%、Lines 85.27%。
- `npm run audit:all`：通过。
- `npx prettier --check tests/member-activity-permissions.test.ts`：通过。
- `git diff --check`：通过。

## 端到端验收

本次只修复测试数据，不改变小程序生产行为、CloudBase 云函数或数据。PR 合并后以 main CI 恢复为验收结果；CI 成功后继续执行被阻塞的 CloudBase 部署判定和微信开发版上传。
