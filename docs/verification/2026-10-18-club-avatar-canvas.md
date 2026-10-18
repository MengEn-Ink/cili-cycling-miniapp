# 2026-10-18 俱乐部头像 Canvas 真机兼容修复验证

## 根因

俱乐部媒体处理使用 Legacy Canvas。页面此前仅通过 WXSS 将画布显示尺寸设为 `1280 × 720`，但 `<canvas>` 未声明 `width`、`height` 属性，部分真机的 backing store 因此仍是默认 `300 × 150`。头像按 `512 × 512`、背景按 `1280 × 720` 导出时超出实际像素区域，导致 `canvasToTempFilePath` 失败。

同时，`.club-media-canvas` 使用 `opacity: 0`，部分 Android 真机会优化掉绘制，进一步导致导出失败。

## 修复

- 在 Legacy Canvas 标签显式声明 `width="1280" height="720"`，继续将画布移出屏幕，但不再使用 `opacity: 0`。
- 每次绘制前清理完整 `1280 × 720` backing store，再按媒体规格绘制。
- 导出区域和目标尺寸均严格使用头像 `512 × 512` 或背景 `1280 × 720`，并保持在 `draw` 回调完成后导出。
- 当 `wx.cropImage` 不存在时，停止处理并提示“当前微信版本不支持图片裁剪，请升级微信后重试”；不上传文件，也不覆盖旧媒体。
- 未修改 CloudBase 数据契约与媒体归属逻辑。

## 验证

自动化契约覆盖：

- WXML Canvas 实际像素属性为 `1280 × 720`。
- Canvas 样式不包含 `opacity: 0`、`display: none` 或 `visibility: hidden`。
- `clearRect` 先于 `drawImage`，并清理完整 backing store。
- 头像和背景导出区域、目标尺寸均不超过 backing store。
- 缺少 `cropImage` 时不上传、不覆盖旧图，并展示升级提示。

执行门禁：`npm run coverage`（95 个测试文件、1194 个测试通过）、`CILI_SKIP_UI_SYNC=1 npm run validate`、`npm run audit:all` 与 `git diff --check` 均通过。

## 合并后部署项

1. 合并后按现有小程序发布流程构建并上传 `2026.10.18.6`。
2. 在至少一台 Android 和一台 iOS 真机分别验证：新建俱乐部和管理俱乐部场景下的头像、背景选择与上传。
3. 验证旧微信基础库缺少 `cropImage` 时只展示升级提示，已有头像或背景不变。
4. 合并后同步完成 CloudBase 流程与微信开发版上传；体验版验证通过后再推进正式发布。
