# 管理端 P1 修复验收记录（2026-10-20）

> 分支：`fix/admin-review-p1`；基线：`origin/main` `abe84e4a`；客户端版本：`2026.10.20.3`。
> 范围：活动删除守卫、报名审批列表明文实名、审批详情编号与照片、群二维码过期服务端判断。

## 改动摘要

- 活动删除仅允许草稿：左滑删除仅草稿渲染、前端非草稿拦截；`activity-admin` 删除用例对 `pending_review/rejected/finished/published` 一律 `INVALID_TRANSITION`。
- 审批列表：`admin-review` list 经管理员鉴权后批量取资料解密，返回真实姓名、完整手机号与来源，单项密文损坏 fail-closed；公开骑手投影仍仅昵称。
- 审批详情：编号改用 `serialNo`（待通过态显“通过后生成凭证编号”），照片失败占位并支持点击预览，提交成功后防重复点击。
- 群二维码过期：阈值常量只保留在云函数，DTO 输出 `group_qr_may_be_expired`，旧数据缺时间戳不误报，客户端删除两处 7 天硬编码。

## 自动验证

| 类型 | 命令 | 结果 |
| --- | --- | --- |
| 格式 | `npm run format:check` | 通过 |
| 发布门禁 | `node scripts/check-release-notes.mjs` | 通过 |
| 单元/契约 | `npm test` | 99 文件 / 1259 用例通过 |
| 云函数 | `npm run test:cloud` | activity-admin 118、activity-read 63、admin-review 38 等全部通过 |
| 类型/静态 | `npm run typecheck`、`npm run lint` | 通过（1 个既有 warning，非本次文件） |
| 覆盖率 | `npm run coverage` | 通过（cloud.ts lines 90.91%） |
| 依赖审计 | `npm run audit:all` | 通过（0 high；fast-glob/request 为既有锁定例外） |
| 差异检查 | `git diff --check` | 通过 |
| 全量门禁 | `npm run validate` | 通过 |
| 部署包一致 | `npm run verify:cloud-packages` | 通过（二维码判断在 shared/domain.js 落地并同步 3 个函数副本） |

> 说明：`docs/ui-sync-manifest.json` 的 source 摘要已按当前 UI 文件机械重算；双端截图证据尚未按新画面重采，仍标记 blocked，合并后需重采核销。

## 端到端验收

- 沙箱无微信开发者工具与目标 CloudBase 写权限，**未执行**真机与普通成员写链路；合并部署后需回归：删除待审核活动被拒、管理员列表看到实名/手机号、公开活动名单仍仅昵称、旧二维码不误报过期、过期二维码出现警告。

## 安全口径

明文姓名/手机号仅 `admins` 白名单在 list/detail 获得；`activity-read` 公开投影不含明文。
