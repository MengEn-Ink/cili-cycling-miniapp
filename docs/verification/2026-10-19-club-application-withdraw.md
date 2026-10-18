# 俱乐部创建申请撤回验证（2026-10-19）

## 最终状态机

- `draft -> pending_review`：沿用既有 `submit`；每次成功提交将 `review_version + 1`。
- `pending_review -> draft`：仅申请本人可调用 `withdraw`，请求必须携带 8–128 字符的 `requestId` 与当前 `expectedReviewVersion`。
- 撤回与管理员审批在同一申请文档的 CloudBase 事务上竞争；事务内重读状态及版本，只有一个状态迁移可以成功。
- 同一 `requestId` 重放成功撤回时返回同一份 `draft`；草稿使用不同 `requestId` 再撤回返回 `INVALID_STATE`。
- 缺失、非法或过期版本返回 `VERSION_CONFLICT`；`approved`、`rejected` 均不可撤回。
- 撤回不递减 `review_version`，并写入 `club_application_withdrawn` 审计，保留 before/after、`review_version`、`request_id`、`created_at`。
- 客户端在 `pending_review` 状态展示“撤回申请”次操作；二次确认后进入禁用加载态。失败保留审核中状态和稳定 requestId 供重试；成功立即切换为草稿编辑表单。

## 自动化验证

已在本分支执行：

- `npm --prefix cloudfunctions/club-application test`：通过，33/33（含 core 与 handler 的正常、幂等、版本冲突、状态拒绝、申请人校验和事务竞争）。
- `npx vitest run tests/club-application-flow.test.ts tests/club-center-runtime.test.ts tests/caching-repository.test.ts tests/settings-page.test.ts tests/unified-theme-tokens-contract.test.ts tests/pages-full-app-prototype.test.ts`：通过，90/90，包含撤回期间旧 load 晚返回的受控 deferred 竞态用例，以及草稿进入申请编辑而非俱乐部管理的 Pages 契约。
- `npm run typecheck`：通过。
- `npm run test:release-notes` 与 `npm run check:release-notes`：通过。
- `npm run test:ui-sync`：通过，17/17；`npm run check:ui-sync`：源 UI 与 Pages 可自动计算摘要已更新并通过。该结果只说明内容摘要一致，不代表截图已复验；Pages 撤回流程截图和微信 DevTools 真实截图仍待主代理补采。
- `npm run test:design && npm run check:design`：通过，设计测试 9/9，95 个双端变量与 15 组对比度通过。
- 定向 ESLint：0 error；Pages 文件按仓库忽略规则仅报告 2 条 ignored warning。
- `npm run test:affected:plan`：返回 fail-safe `full`，合并前仍需执行仓库全量门禁。

## 合并后真实环境复验

1. 部署更新后的 `club-application` 云函数，再上传版本 `2026.10.19.3` 的小程序开发版；不得只上传客户端。
2. 使用真实申请人账号提交创建申请，记录申请 ID、`review_version` 与审核中页面截图。
3. 在申请人端点击撤回：分别验证取消确认、确认后的处理中禁用、弱网失败重试，以及成功后资料完整回到草稿。
4. 使用同一 requestId 模拟响应丢失后重放，确认返回同一草稿且只新增一条 `club_application_withdrawn` 审计。
5. 分别制造错误版本、不同 requestId 对草稿、approved、rejected 请求，核对错误码与状态不变。
6. 让申请人撤回与管理员审批同时发起，确认仅一个成功；回读 `club_applications`、`clubs`、`club_memberships` 与 `audit_logs`，核对不存在双写或越权结果。
7. 从草稿重新提交，确认 `review_version` 递增；在管理员端确认新版本可继续正常审批。
8. 在微信开发者工具及 iOS / Android 真机补采审核中、确认、处理中、失败、回草稿五种状态截图，并与 Pages `club/center` 对应 mode 核对。
