# 活动地点选点恢复设计

## 目标

在保留现有右侧“地图选点”、坐标持久化、手改文本清坐标和详情导航合同的前提下，补齐创建/编辑活动时的选点失败反馈与保存竞态保护。

## 平台约束

- 微信自 2022-06-13 起取消 `wx.chooseLocation` 对 `scope.userLocation` 的依赖。这里不得新增 `wx.authorize`、`wx.getSetting`、`wx.openSetting` 或 `permission.scope.userLocation`，避免额外申请精确定位权限。
- `miniprogram/app.json` 已声明 `requiredPrivateInfos: ["chooseLocation"]`，保持不变。
- 微信管理后台仍需开通 `chooseLocation` 接口，并在用户隐私保护指引中声明“收集用户选择的位置信息”的具体用途。这两项是发布/真机验收清单，不由客户端代码假定成功。

官方依据：

- https://developers.weixin.qq.com/community/business/doc/000a829c82012059fdfde795c5100d
- https://developers.weixin.qq.com/miniprogram/dev/reference/configuration/app.html#requiredPrivateInfos
- https://developers.weixin.qq.com/community/business/doc/000446c32047e0fe222ee01bb5b40d

## 方案选择

采用直接调用 `wx.chooseLocation` 的最小状态机。

不采用旧式位置 scope 预授权，因为当前接口不再需要该 scope，且会扩大隐私授权范围。不自建地图或调用 `wx.getLocation`，因为现有需求只需要用户主动选择起终点。

## 状态与数据流

页面增加 `choosingLocation: '' | 'start' | 'end'`。

1. 保存中或已有选点请求时，忽略新的选点。
2. 开始选点时写入目标，两个选点按钮与保存动作均进入互斥状态。
3. 成功返回后严格验证经纬度和展示文本，再只更新对应起点或终点。
4. 用户取消时不写错误、不改表单。
5. 系统定位服务或微信系统定位权限关闭时，展示不可取消的操作说明，要求用户到系统设置开启后重试。
6. 接口未开通、隐私声明缺失等平台配置错误时，提示联系管理员检查接口权限与隐私指引。
7. 其他失败显示稳定的重试提示，不回显平台原始错误。
8. 无论成功失败都释放 `choosingLocation`；保存期间选点、选点期间保存均不得发起后台写入。

## 界面

- 继续使用输入框右侧的“地图选点”按钮，不新增页面或说明卡片。
- 当前目标按钮使用原生 loading 状态；两个按钮在保存或选点期间禁用。
- 保存按钮在选点期间同步禁用，避免页面状态与提交载荷不一致。

## 测试

按 TDD 补充以下行为：

- 成功选择起终点并保存坐标，既有手改清坐标合同保持通过。
- 用户取消后无错误且状态释放。
- 系统定位关闭时显示系统设置指引。
- 接口/隐私配置失败时显示管理员处理提示。
- 选点期间重复选点与保存均被阻止；保存期间选点被阻止。
- WXML 按钮具备 loading/disabled 绑定。
- `app.json` 只声明 `chooseLocation`，不新增精确定位 scope。

## 验收边界

自动化测试、CI 和开发版上传后，仍需在物理真机验证创建与编辑两种模式：成功选点、取消、关闭系统定位后的提示、重新开启后的恢复、保存重开坐标，以及详情页真实导航。管理后台接口开通状态和隐私保护指引由发布验收回读，不用代码推断。
