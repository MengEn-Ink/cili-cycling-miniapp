# 官方路线 + GPX 部署验证记录

> 时间：2026-10-13 19:17 CST
> 分支：`main`
> 合入提交：`1e72c85b664a47bf0314ae30ea0b15d1bb2fe3e3`（PR #192）
>
> 历史说明：本文记录的是 `route-web` / `pages/route-view` 仍存在时的阶段性验收。后续 PR #210 已删除官方路线页、下线 `route-web` 与 `/route/embed`，当前主线以“活动详情仅复制 Strava 路线链接”为准；阅读本文时请勿把其中的 Embed / web-view 结论当作现行实现。

## 结论

CloudBase 数据资源、存储规则和四个路线函数已部署。真实微信身份下的 GPX
上传、解析、保存、发布、详情读取、原件下载和清理闭环通过；下载字节与上传
源文件完全一致。

官方 Embed 后端已返回正确 HTML，但 CloudBase 默认域名会显示平台风险中间页，
且非导航请求被强制附加 `Content-Disposition: attachment`。官方文档明确说明，
唯一移除方式是绑定已备案自定义域名。当前环境没有自定义 HTTP 服务域名，因此
官方路线 `web-view` 尚不能宣布可用。

GitHub Actions 已使用受管密钥上传开发版 `0.0.194.1`，不可变回执绑定
`main@1e72c85`。退休迁移定时器仍保持关闭，purge 未开启，旧 OAuth 函数、
路由、密钥和数据均未删除。

## 已执行

### CloudBase 资源

`cloudbase:apply` 创建并回读：

- `route_previews`
- 客户端全拒绝 ACL
- `route_previews_expires_at`
- `route_previews_owner_expires_at`

执行 RequestId：

- collection：`07840cba-7f25-4b15-a39b-ec999554792b`
- ACL：`e76d1ba8-9e87-40d7-8211-dbd633f0c8cf`
- expires index：`57bdbf86-8d97-4d3d-abc8-0946f543bc7b`
- owner index：`b2e69cd4-65ee-4e03-aa1e-e108f6e73ed4`

随后 `cloudbase:verify` 返回通过且无不符合项。

### 云存储规则

回读为 `CUSTOM`：

```text
read = false
write = authenticated creator AND (profiles/ OR activity-routes/)
```

`profile-canonical/` 仍不允许客户端写入。

### 云函数与网关

| 函数 | 状态 | Runtime | Timeout | 回读 |
| --- | --- | --- | --- | --- |
| `activity-admin` | Active / Available | Nodejs20.19 | 10s | 9 个生产文件匹配 |
| `activity-read` | Active / Available | Nodejs20.19 | 10s | 8 个生产文件匹配 |
| `route-web` | Active / Available | Nodejs20.19 | 5s | 3 个生产文件匹配 |
| `route-maintenance` | Active / Available | Nodejs20.19 | 30s | 3 个生产文件匹配 |

HTTP 服务 `/route/embed` 已绑定 `route-web`。合法 ID 返回 200、Embed 标记和
CSP；非法 ID 返回 400。浏览器导航仍先进入 CloudBase 默认域名风险中间页。

`route-maintenance-worker` 在函数首次部署时自动创建，随后因小程序尚未发布而
主动删除。`route-maintenance` 当前无触发器且无环境变量，避免提前迁移或 purge。

### 真实 GPX 运行时验收

通过微信开发者工具内的真实管理员身份执行：

1. 写入并上传含海拔 GPX 到 owner 路径。
2. 调用 `previewRouteGpx` 并由服务端解析。
3. 创建草稿、发布活动、读取详情。
4. 调用 `downloadRouteGpx` 并比较原始字节。
5. 下架、软删除测试活动并删除存储对象。

结果：

| 项目 | 结果 |
| --- | --- |
| 距离 | 114.87 km |
| 爬升 / 下降 | 777 m / 88 m |
| 最低 / 最高海拔 | 42 m / 1684 m |
| 海拔曲线点 | 5 |
| 路线轮廓点 | 5 |
| 详情摘要 | 名称、SHA-256、轮廓一致 |
| GPX 下载 | 字节完全一致，`application/gpx+xml` |
| 清理 | 两条诊断活动均已软删；两个 GPX 摘要云存储搜索为 0 |

运行时发现并修复两项只在真实平台出现的兼容问题：

- HTTP 服务把挂载路径剥离为 `/`。
- `wx.cloud.callFunction` 自动注入 `userInfo` 和 `tcbContext`。

对应回归测试和第二次 `npm run validate` 均通过。

### 合入与开发版

- PR #192 已通过远端 CI 并以 merge commit 合入 `main`。
- main CI run
  [38388886507](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/38388886507)
  成功。
- GitHub Pages run
  [38388886411](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/38388886411)
  成功。
- 微信开发版上传 run
  [38389045290](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/38389045290)
  成功。
- 上传回执：版本 `0.0.194.1`、robot `1`、main SHA `1e72c85`。
- 合入后再次回读 CloudBase：资源校验无不符合项；四个路线函数均为
  `Active`，线上生产文件与主干逐文件 SHA-256 一致。
- `route-maintenance` 回读为零触发器、零环境变量；OAuth purge 保持关闭。
- 默认 HTTP 域名对合法 Embed 请求返回 200，但平台仍把函数声明的
  `Content-Disposition: inline` 改写为 `attachment`。

## 本地验证

- `npm run validate`：通过
- 前端测试：72 文件、854 项通过
- 全部云函数测试：通过
- `npm run audit:all`：0 漏洞
- UI 普通门禁：3 个未同步 UI 提交，剩余额度 1
- UI 严格门禁：体验版晋级前仍需同步到零漂移
- 双端视觉证据：
  `docs/evidence/ui-sync/2026-10-13-route-embed-gpx-no-oauth/`

## 阻塞与下一步

1. 提供并绑定已完成 ICP 备案的自定义域名。
2. 把 `/route/embed` 绑定到该域名，更新 `runtimeConfig.routeEmbedOrigin`，并配置
   微信小程序 `web-view` 业务域名。
3. 更新 UI 同步证据，把严格模式恢复到零漂移。
4. 使用开发版 `0.0.194.1` 在开发者工具和 iOS/Android 真机验证官方路线、
   真实 GPX UI、Canvas 和下载。
5. 验收通过后恢复 `route-maintenance-worker`，保持 purge 关闭并观察迁移。
6. 最后临时开启 purge，清空并回读旧集合，再删除旧函数、旧网关和旧密钥。

在第 4 步完成前，不恢复维护触发器，不开启 purge，不删除旧 OAuth 资源。
