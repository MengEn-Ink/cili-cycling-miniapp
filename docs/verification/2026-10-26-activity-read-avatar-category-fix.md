# activity-read 头像 category 兼容修复验收报告

## 概要

修复 activity-read 云函数因媒体类别不兼容导致授权后头像与背景无法解析的问题。

## 根因

媒体登记时 category 存储为 `profile-avatar` / `profile-background`，而公开资料字段使用 `other` / `ride`。`profile` 云函数通过 `compatibleProfileCategory` 处理映射，但 `activity-read` 的 `canonicalPublicMedia` 直接比较 `record.category !== expectedCategory`，导致授权后头像与背景 URL 无法签发。

## 修复

- `cloudfunctions/activity-read/public-avatar.js`：新增 `compatibleProfileCategory` 映射（`profile-avatar`↔`other`，`profile-background`↔`ride`），替换直接比较
- 新增生产类别测试
- 骑行名片弹窗无头像时显示昵称首字占位符
- 更新 UI 同步清单摘要

## 本地验证

| 类型 | 命令 | 结果 |
| --- | --- | --- |
| 云函数测试 | `node --test cloudfunctions/activity-read/public-avatar.node-test.js cloudfunctions/activity-read/index.node-test.js` | 通过（37/37） |
| UI 同步严格检查 | `npm run check:ui-sync -- --strict` | 通过 |
| 治理检查 | `npm run check:governance` | 通过 |
| 类型检查 | `npx tsc --noEmit` | 通过 |
| ESLint | `npm run lint` | 通过 |
| 前端测试 | `npx vitest run tests/activity-detail-design.test.ts tests/profile-edit-avatar.test.ts tests/profile-page.test.ts tests/cycling-image-journal-page-dom-contract.test.ts` | 通过（305/305） |
| 格式检查 | `npm run format:check` | 通过 |

## 待云端验收

部署 `activity-read` 云函数后，在活动详情页完成头像授权，验证头像与背景在骑友列表和骑行名片弹窗中正常显示。
