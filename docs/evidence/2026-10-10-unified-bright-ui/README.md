# 统一明亮 UI 第一批 375×812 证据

- 采集时间：2026-10-10 13:07（CST）
- 代码基线：`4b27057d36ce375a96b0695f18872872271b222a`
- 微信开发版：`0.0.55.1`
- 采集方式：微信开发者工具官方 `miniprogram-automator`
- 设备配置：iPhone X，逻辑屏幕 375×812，像素比 3，基础库 3.17.4
- 导出说明：开发者工具裁切和缩放后的 PNG 为 728×1576；运行时 `screenWidth=375`、`screenHeight=812`
- 证据边界：这是开发者工具运行态证据，不冒充物理真机截图

## 逐页结论

| 页面 | 截图 | 结论 |
| --- | --- | --- |
| 活动首页 | [activities-375x812.png](activities-375x812.png) | 无重叠或裁切；40px 分段控件、活动卡和安全区正常；TabBar 三个图标正常 |
| 活动详情 | [activity-detail-375x812.png](activity-detail-375x812.png) | 指标、状态、时间和底部固定操作区无相互遮挡 |
| 创建活动 | [activity-create-375x812.png](activity-create-375x812.png) | 375px 下保持单列；类型卡与输入区无横向溢出 |
| 我的行程 | [registrations-375x812.png](registrations-375x812.png) | 行程卡、序号、状态和 TabBar 可读且无遮挡 |
| 个人中心 | [profile-375x812.png](profile-375x812.png) | 媒体 Hero、能力指标、设置入口和 TabBar 正常 |
| 设置 | [settings-375x812.png](settings-375x812.png) | Strava 错误恢复卡和升级日志无裁切；状态错误属于既有 HP-13 |

## 复核结论

- 第一批六页在 375×812 开发者工具运行态通过布局复核。
- 桌面级截图中的 TabBar 破图是嵌套 WebView 捕获异常；官方小程序截图显示实际图标资源正常。
- 仍需物理真机逐页截图与独立复核，证据齐全前不得关闭 `HP-20261010-02`。

## SHA-256

```text
3251a382afbcf3e2c67e276f8296911c2ed6698fdefa8fdfaa9b20f1aea3848f  activities-375x812.png
99318b952e445c47df075201cba30518c00dd78bcb8dffec451b18274efd0aa1  activity-create-375x812.png
4780aa9bf786fbd24ac96eef1433380c49b3bf9df8e66490c4dd17bb662e3a37  activity-detail-375x812.png
85c94f824f179fad479ca697f4938c1e4259f8e4ac84869d4dcb6b1a2a04bab3  profile-375x812.png
6c13dd1d3971b8d2afe508178be962249a92d9bb1bcaaf9f93f9bfe7d464356a  registrations-375x812.png
8d08787b4b75cfe1a46d7ba96a536d7ba369c7c1591e95e55db068a3553df660  settings-375x812.png
```
