# 俱乐部头像与背景图统一上传验证（2026-10-20）

## 问题与修复结论

- 俱乐部头像和背景图已经接入统一媒体链路：`mediaUploadPath` 授权 → CloudBase 上传 → `registerMedia` 登记 canonical 文件 → 失败清理源文件。
- 上传失败发生在进入统一链路前：部分微信基础库不支持固定尺寸压缩，或 legacy Canvas 导出失败，页面直接中断。
- 修复后仍优先使用固定尺寸压缩和 Canvas 导出；若 Canvas 不可用，则回退微信 `cropImage` 已生成的裁剪图片，再继续统一上传。
- 不新增旁路上传接口，不放宽服务端的文件归属、文件大小、类型签名和 canonical 路径校验。

## 自动化验证

已在当前分支代码上执行：

- `npm test -- --run tests/club-center-runtime.test.ts tests/media-upload.test.ts tests/settings-page.test.ts`：通过，覆盖头像、背景图、尺寸读取失败、旧基础库固定尺寸压缩不兼容、Canvas 导出失败及统一上传返回 canonical FileID。
- `npm run validate`：通过，99 个测试文件、1251 个用例全部通过。
- `npm run coverage`：通过；Statements 81.92%、Branches 75.94%、Functions 81.80%、Lines 85.27%。
- `npm run audit:all`：通过。
- `npm run cloud:install`：通过。
- `npm run check:ui-sync && npm run test:ui-sync`：通过；本次没有视觉布局变化，仅同步可计算的 UI 内容摘要。
- `git diff --check`：通过。

## 关键端到端场景

| 场景 | 预期结果 | 自动化结论 |
| --- | --- | --- |
| 头像固定尺寸处理正常 | 上传固定尺寸结果并返回 canonical FileID | 通过 |
| 背景图固定尺寸处理正常 | 上传固定尺寸结果并返回 canonical FileID | 通过 |
| 压缩接口不支持目标尺寸、Canvas 可用 | 经 Canvas 固定尺寸后进入统一上传 | 通过 |
| 压缩接口不支持目标尺寸、Canvas 失败 | 回退微信裁剪图片并进入统一上传 | 通过 |
| 尺寸读取失败、Canvas 失败 | 不上传未知压缩产物，回退微信裁剪图片 | 通过 |
| 统一登记失败 | 清理源文件并保留旧俱乐部资料 | 既有统一媒体测试通过 |

## 合并后实际环境验收

1. 等待 PR checks 全绿后合并，不绕过提交门禁。
2. 确认 main CI 成功，并由 GitHub Actions 上传微信开发版 `2026.10.19.5`。
3. 本次没有云函数、索引或存储规则变化，CloudBase 工作流应判定无需部署函数。
4. 在微信开发者工具分别进入俱乐部创建申请和俱乐部资料管理，上传一张头像与一张背景图，确认预览、保存和重新进入页面后的图片一致。
5. 在 iOS 与 Android 真机各验证一次；若设备命中 Canvas 兼容回退，上传仍应成功，服务端返回 canonical FileID。

## 当前验收状态

- 代码层与自动化端到端：通过。
- PR 远端检查：待更新描述和验收报告后重新执行。
- main CI、微信开发版与真机：合并后验证，未提前标记为通过。
