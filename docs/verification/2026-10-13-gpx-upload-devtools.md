# GPX 上传微信开发者工具验证

> 时间：2026-10-13 20:21 CST
> 分支：`fix/gpx-picker-privacy-feedback`
> 基线：`main@99426b680e2bf0d2f8b66c402b2282b0968eacd3`

## 结论

用户提供的 `解字石- 铁炉--南山环线.gpx` 文件有效，大小 326086 字节，
SHA-256 为
`980d83baf2cb4288b30e01c891419e1da2553bf8369e7c054a1473c2eaed297b`。

问题包含三个独立因素：

1. 微信开发者工具最初加载的是旧的
   `ride-event-miniprogram-ui-sync@cb9c080`，不是最新主干。
2. DevTools 模拟器无法打开 `wx.chooseMessageFile` 的聊天文件选择器。修复前错误
   被压成“路线读取失败，请稍后重试”并只显示在页面顶部，位于 GPX 区域的用户
   会感觉点击无响应。
3. GPX 可信解析完成后，页面异步生成路线图但提前显示“路线详情已准备好”并解除
   上传锁；用户立即发布时，服务端可能以“请重新生成路线图”拒绝。

本轮修复让选择器失败在 GPX 控件旁持续显示并通过 Toast 即时反馈；同时在路线图
生成与绑定完成前保持上传锁，完成后才宣告路线详情已准备好。

## 真机隐私诊断

微信官方把 `wx.chooseMessageFile` 对应到“收集你选中的文件”。仅有在小程序管理
后台隐私保护指引中声明该信息类型，平台才允许调用对应接口；未声明时返回
`errno: 112` 或 `api scope is not declared in the privacy agreement`。若提审时勾选
“未采集隐私”或隐私协议未声明，平台可能返回 `appid privacy api banned`。

本项目 `app.json` 中的 `requiredPrivateInfos: ["chooseLocation"]` 只负责位置接口，
不能替代 `MessageFile` 的后台隐私声明。真机修复步骤：

1. 微信公众平台进入“设置→服务内容声明→用户隐私保护指引”。
2. 增加“收集你选中的文件”。
3. 用途填写：`用于活动组织者上传 GPX 路线文件，解析里程、爬升、海拔曲线和
   路线轮廓，并向活动参与者提供原文件下载。`
4. 保存后等待约 5 分钟生效。
5. 若仍返回 `appid privacy api banned`，修正提审时“未采集隐私”的声明并重新
   提交发布。

客户端错误提示已拆分：

- 后台未声明：提示管理员补充“收集你选中的文件”并重新发布。
- 用户未授权（errno 103/104）：提示先同意小程序隐私保护指引。
- DevTools/当前环境不支持：提示改用微信真机。

官方参考：

- https://developers.weixin.qq.com/miniprogram/dev/framework/user-privacy/miniprogram-intro.html
- https://developers.weixin.qq.com/miniprogram/dev/framework/user-privacy/PrivacyAuthorize.html

## DevTools 完整链路

由于模拟器不支持系统文件选择器，自动化把同一文件字节写入
`wx.env.USER_DATA_PATH`，仅绕过文件选择动作。后续全部使用真实小程序与 CloudBase
链路：

1. `wx.cloud.uploadFile`
2. `activity-admin.previewRouteGpx`
3. Canvas 路线图生成与 `bindRoutePreviewImage`
4. 创建草稿并发布
5. `activity-read` 详情读取
6. `downloadRouteGpx` 下载并比较 SHA-256
7. 下架并软删除测试活动

结果：

| 检查项 | 结果 |
| --- | --- |
| 上传与可信解析 | 通过 |
| 上传/下载 SHA-256 | 与源文件一致 |
| 路线名称 | 解字石- 铁炉--南山环线 |
| 距离 | 159.07 km |
| 爬升 / 下降 | 1277 m / 1217 m |
| 最低 / 最高海拔 | 41.5 m / 768 m |
| 预计骑行 | 9 小时 22 分 |
| 海拔曲线 / 路线轮廓 | 120 / 240 点 |
| 发布与详情 | 通过 |
| 测试数据清理 | 已下架并删除 |
| 运行时异常 | 0 |

## 修复验证

- 修复前：真实点击后只在页面顶部显示通用错误；路线图未绑定时可立即发布并失败。
- 修复后：GPX 区域显示“当前环境无法打开文件选择器，请使用微信真机上传 GPX”；
  路线图生成期间保持 `uploadingRoute=true`，完成后才显示“路线详情已准备好”。
- 定向单测：`tests/activity-admin-edit.test.ts` 与 `tests/route-utils.test.ts` 共
  52 项通过。
- `npm run validate`：通过；72 个前端测试文件、857 项测试及全部云函数测试通过。
- `npm run audit:all`：0 漏洞。
- UI 发布严格模式：0 个未同步 UI 提交，剩余额度 4。

## 合入与开发版

- PR #194 已合入 `main`。
- main CI run
  [38392877311](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/38392877311)
  成功。
- GitHub Pages run
  [38392876472](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/38392876472)
  成功。
- 微信开发版上传 run
  [38393011088](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/38393011088)
  成功。
- 不可变上传回执：版本 `0.0.196.1`、robot `1`、main SHA `07b4c1d`。

## 证据

- `docs/evidence/gpx-upload/2026-10-13-devtools/chooser-feedback.png`
- `docs/evidence/gpx-upload/2026-10-13-devtools/activity-detail.png`

开发者工具证据不替代 iOS/Android 物理真机文件选择器和系统权限验收。
