# 2026-10-11 13:25 核心流程开发者工具运行态 smoke（main `608590d` / 开发版 0.0.119.1）

## 环境

- 代码基线：`origin/main` `608590d`（含至 #119，产品代码与微信开发版 **0.0.119.1** 一致）。
- 通道：本机已登录微信开发者工具，官方 `miniprogram-automator@0.12.1` 经 `cli auto` 端口 9420 连接；模拟器为登录态真实账号（实名“曹**”，管理员），CloudBase 为线上环境 `cloudbase-d0gizacy77a1ab017`，数据均为真实回读。
- 脚本：`core-smoke-20261011.js`；原始结果：`results.json`（17 项检查，16 PASS / 1 选择器误报，**运行态异常 0**）。
- 安全边界：本轮不发布、不下架、不删除、不写入任何线上数据；所有“保存”均在前端校验层被拦截（标题 → 日期 → 时间三层），未触达云函数写接口。

## 检查结论（对应清单泳道）

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| 首页加载无错误（N3/N8） | PASS | `error=null`，未来视图 1 条真实活动 |
| 首页日期分组（N3，#89/#116） | PASS | 1 个分组头渲染“10月17日 周六”，与 `rows` 数据一致；仅 1 个日期时按契约不渲染日期 chip（`dayChips.length>1` 才出现） |
| 发布人 DTO 与渲染（N8，#109） | PASS | 卡片数据含 `publisher.nickname=莫拉拉` 且 canonical 头像为 https 临时地址；截图可见“莫拉拉 发布”头像行 |
| 详情分享好友契约（N2，#97） | PASS | `onShareAppMessage` 返回 title=`10月17日骑行 · 辛庄桥`、path、imageUrl（封面）三者齐备 |
| 详情分享朋友圈契约（N2，#97） | PASS | `onShareTimeline` 返回 title 与 `query=id=activity_2d9b…` |
| 管理列表滑动删除结构（N6，#99/#94） | PASS | 3 条活动对应 3 个 `.swipe-row` 与 3 个删除按钮，右侧红色删除区就位；`allowed/isAdmin` 正常 |
| 创建三层必填拦截（N1/N10，#95/#113） | PASS | 空标题→“请输入活动标题”（formErrors.title）；补标题→“请选择集合日期”；补日期→“请选择集合时间”，弹窗“请检查活动信息”，全程无云端写入 |
| 资料性别必填拦截（N4，#96） | PASS | 真实账号清空性别后保存，toast“请选择性别”，未触达 `updateProfile` |
| 行程/我的/设置三页导航 | PASS | 均成功打开、`error=null`，全程零 `RUNTIME-EXCEPTION` |

`home-items-and-cards` 一项 FAIL 为 automator 对 `<activity-card>` 自定义组件宿主标签的查询限制（组件内部节点不可经页面宿主选择器命中），非产品缺陷：`rows` 条目数、`.day-group-head` 与截图 `01-home.png` 均证明卡片真实渲染。

## 截图

- `01-home.png`：首页未来视图，日期头、发布人头像昵称、黑底白字按钮、全中文界面（#118）。
- `02-detail.png`：活动详情，封面、集合时间 `2026-10-17 08:00:00`、立即报名。
- `03-admin-list.png`：活动管理 3 条记录与右滑删除红色露出区。
- `04-create-validation.png`：创建表单缺时间被弹窗拦截（标题已填“SMOKE 不会保存”，无写入）。
- `05-profile-edit.png`：资料编辑清空性别后 toast“请选择性别”。
- `06-settings.png`：设置页可达无异常。

## 证据边界

本证据为**微信开发者工具模拟器 + 真实 CloudBase 数据**的运行态回读，不替代：物理真机点按/手势（N6 真实左滑、N3 多日期切换、N2 真机扫码分享）、TraeX 审判者独立复核与用户人工确认。各泳道状态仍为 `PENDING_EVIDENCE`。
