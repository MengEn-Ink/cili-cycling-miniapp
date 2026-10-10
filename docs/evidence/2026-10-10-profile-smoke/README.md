# 个人中心头像预览与背景单槽位真机 smoke 证据

- 采集时间：2026-10-10 16:23（CST）
- 代码基线：`05942f0`（HP-10 客户端槽位协议 + HP-11 头像预览已部署）
- 采集方式：微信开发者工具官方 `miniprogram-automator@0.12.1`，`cli auto` 自动化端口 9420
- 设备配置：HUAWEI Mate 70 Pro，逻辑屏幕 376×809，基础库 3.17.4
- 线上云函数：`profile`/`admin-review`/`strava-auth`/`strava-callback`/`profile-media-cleanup` 均为当日 15:45–15:48 部署的 Active 版本，线上 `$LATEST` 与本地逐字节一致
- 证据边界：这是开发者工具真机模拟运行态证据，仍建议补一次物理真机手动点按复核

## HP-20261009-11 · 个人中心头像预览

真机运行态验证 `previewAvatar` 四分支（通过临时拦截 `wx.previewImage` 统计调用）：

| 输入 `heroAvatarUrl` | 行为 | 结论 |
| --- | --- | --- |
| `https://temporary.example/avatar.jpg` | 触发预览，current = 该 URL | ✅ 合法 HTTPS 预览 |
| `''`（空） | 不调用 | ✅ fail closed |
| `cloud://env/profiles/legacy/avatar.jpg` | 不调用 | ✅ fail closed |
| `http://example.com/avatar.jpg` | 不调用 | ✅ fail closed |

`totalCalls=1`：四次输入仅合法 HTTPS 触发一次预览。`previewAvatar` 处理器在部署页面存在。
当前测试账号无头像时渲染占位，不渲染 `.avatar-image`，符合预期。

截图：[profile-hero.png](profile-hero.png)

## HP-20261009-10 · 背景图单槽位数据安全

### 真实账号（已有背景图）
- `profile-edit` 加载到 `backgroundPhoto = { id: cloud://.../profiles/....jpg, category: ride }`，`photos.length = 1`，`photoItems.length = 1`
- save payload 字段 = `["gender","emergencyName","backgroundPhoto"]`，`hasPhotos = false`
- 证明部署版 `profile` 函数返回 `background_photo` 字段且客户端严格映射

### 存量多图账号（注入 3 张 legacy photos，无 background_photo 字段）
- `setData` 后 `photos.length = 3` 原样保留（历史相册不截断）
- save payload 字段 = `["gender","emergencyName","backgroundPhoto"]`，`hasPhotos = false`
- `backgroundPhoto` = 首张 legacy `cloud://legacy-a`（category 规整为 ride）
- 结论：旧账号打开并保存只写背景单槽位，不发送 photos 数组，服务端 legacy 历史相册零丢失

截图：[profile-edit.png](profile-edit.png)

## 复核结论

- HP-11 头像预览 fail-closed 逻辑在真机运行态通过。
- HP-10 背景单槽位协议在真实账号与存量多图账号两种场景的客户端 payload 均符合"只写槽位、不截断历史"的数据安全目标。
- 仍建议 TraeX 审判者补一次物理真机手动点按头像/替换背景的独立复核后再关闭两条。

## SHA-256

```text
39cc393515bbc4fadf14aa241feb7395bb5fb79add955ba31c74fdf101322aad  profile-edit.png
a4bfec24802be0d808ea6d69bdde42c32765722848cda8166b351d6e2f5bdabf  profile-hero.png
```
