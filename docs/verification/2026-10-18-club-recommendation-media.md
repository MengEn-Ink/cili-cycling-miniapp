# 2026-10-18 俱乐部推荐与媒体分离验收报告

## 验收范围

- 推荐列表由 `club-application/listJoinable` 按当前 `WXContext.OPENID` 查询并排除本人 `status=active` 的 `club_memberships`；`inactive` 与无会员关系用户仍可推荐。
- active memberships 与公开可加入 clubs 均按 `_id asc`、每页 100 条完整分页读取，服务端完成过滤后再截取最多 100 条结果，避免第 101 条之后漏筛或漏推荐。
- 俱乐部头像固定使用 `clubs.avatar_url`（字段内继续承载 cloud file id），背景固定使用 `clubs.cover_file_id`，两者分别签发 HTTPS 临时地址。
- 创建申请新增 `avatar_file_id`，背景 `cover_file_id` 可选；审批和管理资料更新均保持头像、背景独立，存量无头像申请不使用背景兜底。
- 创建与编辑复用同一图片 helper：头像 `1:1 / 512×512`，背景 `16:9 / 1280×720`，质量 90；`compressImage` 成功后用 `getImageInfo` 精确校验输出像素，尺寸不匹配、尺寸读取失败或旧基础库不支持相关 API 时，通过 legacy canvas 按目标像素导出 JPEG。
- 页面提供两个独立选择器；俱乐部卡片只绑定头像，详情顶部宽图只绑定背景，缺背景显示品牌渐变占位。
- 客户端版本与 RELEASE_NOTES 更新为 `2026.10.18.5`，保留 `.4`、`.3` 且标记为非最新。

## 自动化验证

| 命令 | 结果 |
| --- | --- |
| `npm --prefix cloudfunctions/club-application test` | 通过，26/26 |
| `npx vitest run tests/club-center-runtime.test.ts tests/club-application-flow.test.ts tests/cloud-repository.test.ts tests/caching-repository.test.ts tests/settings-page.test.ts` | 通过，267/267 |
| `npm --prefix cloudfunctions/profile test` | 通过，66/66 |
| `npm --prefix cloudfunctions/activity-admin test` | 通过，107/107 |
| `npm run typecheck` | 通过 |
| 相关文件定向 `eslint` | 通过 |
| `npm run check:release-notes` | 通过 |
| `git diff --check` | 通过 |

## 关键兼容结论

1. CloudBase 查询复用确定性分页 helper：memberships 与 clubs 均完整分页，过滤发生在服务端且早于最终 100 条截断；101+ 数据场景已有自动化覆盖。
2. 存量申请缺少 `avatar_file_id` 时可审批，生成俱乐部的 `avatar_url` 保持空值，并沿用“待补俱乐部头像”入口。
3. 管理资料旧请求未携带 `cover_file_id` 时保留原背景；新请求可显式传空字符串清除背景或传本人目录文件替换。
4. 只有 `getImageInfo` 验证宽高精确匹配时才直接上传压缩结果；尺寸不匹配、尺寸读取不可用或读取失败均进入 canvas 固定像素导出。裁剪取消、裁剪失败、压缩失败或 canvas 导出失败均不上传且不覆盖原媒体。头像与背景的直传、尺寸不匹配、尺寸读取失败及 canvas 最终失败均已有表驱动测试覆盖。
