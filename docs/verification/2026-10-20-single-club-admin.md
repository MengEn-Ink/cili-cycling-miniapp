# 单俱乐部管理端收口验收报告

## 1. 验收对象

| 项目 | 内容 |
| --- | --- |
| PR | https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/321（`feat/single-club-admin` → `main`） |
| Head SHA | 见 GitHub PR 头部 `feat/single-club-admin` 分支 tip |
| 客户端版本 | `2026.10.20.5` |
| 验收环境 | 本地 Node 自动化（vitest / node --test）；Pages 原型为既有事实源；CloudBase 与微信开发版未部署 |
| 验收角色 | 平台管理员（管理端页面与云函数新动作） |
| 执行时间 | 2026-10-20 CST |
| 执行人 | caomengen.lwdl |

## 2. 影响范围

| 维度 | 结论 |
| --- | --- |
| 页面与交互 | 管理员“俱乐部管理”页由三态审批列表改为唯一俱乐部概览（default/bootstrap/loading/error）；原审批详情页改为俱乐部资料编辑页，固定 01 头像 1:1、02 背景图 16:9、03 基本资料三段；profile 管理员第二入口改名为“俱乐部管理”。普通成员俱乐部中心页与其申请入口本 PR 不动。 |
| 云函数与数据 | club-application 新增 adminGetSoleClub/adminCreateSoleClub/adminUpdateSoleClub 三个动作；mine/listJoinable/joinPublicClub/getClubDetail/getManagedClub/updateManagedClub/saveDraft/submit/withdraw/adminList/adminDetail/review 全部保留。新增不删除任何 clubs/club_applications 文档。 |
| 权限与隐私 | 新动作要求 admins 集合启用记录（更新动作另允许俱乐部 OWNER/ADMIN）；客户端仍只展示服务端投影的中文 message，错误码不上屏；申请人联络等字段随旧审批页从客户端管理端移除，旧 action 数据结构不变。 |
| Pages / 文档 | docs/schema.js、docs/templates.js 与 ui-sync-manifest 已是单俱乐部口径（2026-10-19 先行），本 PR 让小程序实现对齐；docs 原型文件按纪律不修改。 |
| 部署与回滚 | 需重新部署 club-application 云函数并上传 2026.10.20.5 小程序；无集合结构变更、无数据迁移。回滚直接回退版本与云函数即可，bootstrap 写入的俱乐部文档保留不影响旧版本读取。 |

## 3. 测试用例矩阵

| 用例 | 类型 | 前置条件 | 步骤 | 预期 | 实际 | 证据 | 结论 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 空库读取唯一俱乐部 | 正常 | admins 有 admin-1，clubs 为空 | adminGetSoleClub / core getSoleClub | 返回 `{exists:false}` 不报错 | 与预期一致 | core.node-test.js「空库读取唯一俱乐部返回 exists:false」、index.node-test.js 同名校验 | PASS |
| 空库首次创建 | 正常 | clubs 为空 | adminCreateSoleClub 提交头像/背景/名称/地区/简介 | 固定文档 ID 落库，approved/active，同 requestId 幂等 | 与预期一致 | core.node-test.js「空库首次创建唯一俱乐部，固定 ID 落库并按 requestId 幂等」 | PASS |
| 已有俱乐部再创建 | 根因反例 | 旧审批流已创建其他 ID 俱乐部，或固定 ID 已存在 | 再次 adminCreateSoleClub | 返回 CLUB_ALREADY_EXISTS 与中文“全平台只允许存在一个俱乐部，不能创建第二个”，存量文档不变 | 与预期一致 | core.node-test.js 两条 exists 用例 + index.node-test.js「旧审批流已创建俱乐部时…」 | PASS |
| 并发首次创建 | 边界 | 两个管理员事务并发 | 串行化执行两个创建 | 恰好一个成功，另一个中文冲突错误，clubs 仍为 1 | 与预期一致 | core.node-test.js「并发首次创建串行化后只有一个成功」 | PASS |
| 资料更新与乐观锁 | 正常 / 边界 | 已存在唯一俱乐部 | 携带 expectedUpdatedAt 更新；再用旧版本更新 | 更新成功并写 sole_club_profile_updated 审计；旧版本返回 CLUB_PROFILE_CONFLICT 中文提示 | 与预期一致 | core.node-test.js「平台管理员更新…」「更新唯一俱乐部执行乐观锁…」 | PASS |
| 非管理员/普通成员拒绝 | 边界 | 无 admins 记录或仅 MEMBER | 读取/创建/更新 | 分别 ADMIN_REQUIRED、CLUB_ADMIN_REQUIRED | 与预期一致 | core.node-test.js 拒绝用例、index.node-test.js「非管理员读取或创建…被拒绝」 | PASS |
| OWNER 可更新、白名单字段 | 边界 | OWNER active membership；携带 owner_openid 等受保护字段 | 更新 / 创建 | OWNER 成功；受保护字段 FORBIDDEN_FIELD | 与预期一致 | core.node-test.js「俱乐部 OWNER 可更新…」「只允许白名单字段…」 | PASS |
| 客户端映射与载荷 | 回归 | CloudRepository mock callFunction | get/create/update | 空库映射 exists:false；只发送 name/city/introduction/avatar_file_id/cover_file_id 与 expectedUpdatedAt，不发送 join_mode | 与预期一致 | tests/club-application-flow.test.ts「单俱乐部管理端读写闭环」3 条 | PASS |
| 旧申请审批闭环不回归 | 回归 | 既有申请/审批数据 | mine/submit/withdraw/review/adminList/adminDetail 契约 | 旧 action、DTO 与客户端 center 页断言保持不变 | 与预期一致 | tests/club-application-flow.test.ts 前 4 条与静态契约、全量 vitest 1250 通过 | PASS |
| 管理页四态结构 | 回归 | 静态 WXML/JSON 契约 | 概览/创建/编辑结构与禁用旧字段断言 | 含 ACTIVE/全平台唯一/创建唯一俱乐部/编辑俱乐部资料/1:1/16:9；不含审核意见、申请人联络、驳回、加入方式、预计成员 | 与预期一致 | tests/club-application-flow.test.ts 静态契约用例 | PASS |

## 4. 自动化门禁

| 门禁 | 结果 | 关键输出或链接 |
| --- | --- | --- |
| `npm run validate` | 未执行（阻塞） | 该聚合门禁含微信开发者工具 e2e、miniprogram-ci 工具安装与 CloudBase 写环境，当前执行环境不具备；等价子集见下行，PR Checks 承接完整门禁 |
| 门禁子集（format/lint/typecheck/单测/云函数） | 通过 | `prettier --check .` All matched files use Prettier code style；`eslint` 改动文件 0 告警；`tsc --noEmit` 通过；`vitest run` 99 files / 1250 passed；`npm run test:cloud` 11 包 480 passed（club-application 47）；`node scripts/check-release-notes.mjs` 通过（19 个产品文件已记录） |
| `npm run coverage` | 未执行 | 本地未跑覆盖率聚合；新增逻辑已被新增 node --test 与 vitest 用例直接覆盖，覆盖率门禁由 CI 回读 |
| `npm run audit:all` | 未执行 | 依赖 npm audit 联网与各云函数包审计，由 CI 统一执行；本次未新增运行时依赖 |
| `git diff --check` | 通过 | 无空白错误 |
| PR checks | 待合并后回读 | 以 main CI 最终结果为准 |

## 5. 端到端执行记录

1. 阻塞：当前环境无微信开发者工具、真机与 CloudBase 测试环境写权限，未执行“管理员空库看到 bootstrap → 创建唯一俱乐部 → 返回概览 → 编辑资料 → 并发/冲突提示”的真机链路。
2. 已用云函数内存事务夹具完整模拟上述链路（含并发串行化、乐观锁、权限拒绝、旧审批流存量俱乐部兼容），并用静态契约测试锁定页面结构与导航标题。
3. 媒体选择/裁剪/上传沿用 club/center 已上线并验收过的同一链路（utils/club-media.ts 等价抽取），真机表现需合并后在开发版回归。

**执行结论**：`BLOCKED`

**未执行或阻塞说明**：微信开发者工具/真机 e2e 与 CloudBase test 环境部署未执行，不影响合并决策中的代码层验收，但合并后由负责人在开发版补跑四态真机回归与云端 smoke（管理员创建→二次创建中文报错→编辑→冲突提示），并回填本报告与 PR Checks。

## 6. 部署与回读

| 流程 | 运行链接 | 结果 | 回读 |
| --- | --- | --- | --- |
| main CI | 待合并后回读 | 待合并后回读 | 以最终 main SHA 回填 |
| Pages | 不适用 | Pages 原型与清单已于 2026-10-19 提前单俱乐部化，本 PR 无 Pages 改动 | N/A |
| CloudBase | 待部署 | club-application 云函数需随版本部署；无集合/索引变更 | 部署后跑 scripts/cloudbase-club-application-smoke.mjs（旧 action 回归）并手工验证三个 admin* 动作 |
| 微信开发版 | 待上传 | 2026.10.20.5 | 合并后上传开发版并按第 5 节路径回读 |

## 7. 风险与回滚

- 剩余风险：真机基础库裁剪/canvas 回退虽复用既有链路，仍需开发版确认；并发创建在真实 CloudBase 上依赖固定文档 ID 的事务冲突检测，已在内存夹具验证串行语义，上线后用第二次创建的中文报错做线上确认。
- 监控与观察：云函数 console 已按 error.code 打印 club-application failed；关注 CLUB_ALREADY_EXISTS、CLUB_PROFILE_CONFLICT、ADMIN_REQUIRED 与 MEDIA_* 频次。
- 回滚步骤：回退小程序版本到 2026.10.19.5 并回滚 club-application 云函数；新动作旧版本不调用，旧动作全部保留。
- 数据恢复：不适用。本变更不删除、不迁移任何 clubs/club_applications/club_memberships 数据；bootstrap 仅在空库新增一个固定 ID 俱乐部文档。

## 8. 最终结论

代码层、静态契约层与云函数事务层满足合并条件；真机与云端端到端按第 5 节标记 BLOCKED 并指定合并后回读，不以单元测试结果冒充真机验收。
