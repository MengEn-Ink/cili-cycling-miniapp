# Pages 与微信端到端验收流程

统一入口：[设计规范](../design-system.md)、[13 页交互设计](../index.html#prototype)、[P0 写链路与真机手册](p0-real-registration-journey.md)、[高优清单](../high-priority-issues.md)。本手册更新于 2026-10-16。

## 验收分层

| 层次 | 证据 | 可以证明 | 不能替代 |
| --- | --- | --- | --- |
| 静态与单测 | validate / coverage / audit | 类型、领域逻辑、契约和可计算可读性 | 真实云数据与触控 |
| Pages 设计 | 对应 hash、状态、同视口 PNG | 信息层级、交互方向、浅色配色 | 小程序业务成功 |
| 模拟器 E2E | results.json、真实页面截图 | 当前账号的云端读取、媒体、页面运行 | 新成员写链路与物理真机 |
| 双角色写链路 | 状态、计数、审计、补偿回读 | 创建→发布→报名→审批→凭证→取消→重报 | iOS/Android 系统能力 |
| 真机 UAT | 双平台机型、版本、截图、验收人 | 权限、相册、分享、扫码、字体、安全区 | 未测试的角色与网络 |

## 标准执行顺序

1. `git fetch origin`，从最新 `origin/main` 建分支；先读高优清单，检查开放 PR，记录起点 SHA 与 Pages 工作流。
2. 安装依赖并执行 `npm ci && npm run cloud:install`，然后 `npm run validate`、`npm run coverage`、`npm run audit:all`。UI 变化执行 `npm run check:design`。
3. 只在涉及函数、规则或索引时部署相应云资源并回读。确认小程序 AppID、运行云环境与测试账号匹配；禁止凭证进入截图或日志。
4. 在登录的微信开发者工具运行只读 E2E，记录每个页面状态及运行时尺寸。导航同时等待路径和 loading 状态；超时要保留失败报告。
5. 同版本 Pages 使用 `?capture=viewport#<路由>`。标准设计视口 375×812；与模拟器对比时必须使用其实际 CSS 视口，差异写入记录。`?capture` 保留长页设计查看模式。
6. 按下表采集全部路由，滚动核对底部操作、长文本、错误/空态、输入焦点和照片操作。公开目录只放脱敏截图；原始图留在受控本地。
7. 更新 `ui-sync-manifest.json` 的内容摘要、时间、视口、双端截图与差异说明，执行 `npm run check:ui-sync -- --strict`。机器只校验完整性；人工结论单独记录。
8. 提交 PR，checks 成功后合入；等待 main CI、Pages 发布、微信开发版上传完成。回读部署 SHA、上传版本与设置页版本，再运行同版本 E2E。
9. 按 P0 手册补齐普通成员写链路、iOS/Android 真机及体验版 UAT。仅有部署与验收双证据的事项才能从高优清单删除。

## 模拟器只读检查范围

| 小程序路由 / Pages hash | 本次脚本检查或截图 |
| --- | --- |
| `activities` | 活动存在、日期与自然时间拆分 |
| `activity-detail` | 详情、报名人员图片地址、点击公开名片、背景下载解码；渲染结果另核截图 |
| `registration-form` | 活动与本人资料加载，不提交报名 |
| `registrations` | 本人行程与集合时间 |
| `credential` | 可访问凭证、日期与集合时间 |
| `profile` | 头像与背景回显 |
| `profile-edit` | 头像与照片预览状态，不保存 |
| `capability-card` | 背景图与名片 |
| `settings` | 设置页更新日志版本与运行版本一致 |
| `admin-activity-list` | 管理员身份、活动列表读取 |
| `admin-activity-edit` | 已有活动照片、二维码、路线图回显及删除按钮可见性；空白创建态截图 |
| `admin-reviews` | 审核列表读取，不审批 |
| `admin-review-detail` | 可访问记录详情，长编号与状态标签宽度，不修改状态 |

路由路径以 `miniprogram/app.json` 为准；管理员页面的 hash 用连字符，真实路径为 `pages/admin/.../index`。正常页面至少一张图，详情名片、创建表单等额外状态另存图。

## 一次性准备与命令

macOS 安装并登录微信开发者工具；准备有图片活动、本人行程与审核权限的测试账号。将官方旧版 automator 安装到仓库外：

```bash
mkdir -p ~/.cili-devtools-e2e
cd ~/.cili-devtools-e2e
npm init -y
npm install miniprogram-automator@0.12.1
```

回到仓库执行：

```bash
CILI_E2E_OUTPUT=/tmp/cili-e2e-current npm run test:devtools:e2e
npm run test:design
npm run check:design
npm run check:ui-sync -- --strict
```

可配置：`CILI_PROJECT_PATH`（默认 cwd）、`CILI_E2E_OUTPUT`（默认 artifacts/wechat-devtools-e2e）、`WECHAT_DEVTOOLS_CLI`（默认 /Applications/wechatwebdevtools.app/Contents/MacOS/cli）、`MINIPROGRAM_AUTOMATOR_PATH`（默认上述独立安装目录）。

稳定性回归每轮使用新目录并单独统计；三轮通过应记录为三份结果，不能覆盖为一份。脚本对 automator 使用实际生效的 `timeout: 180000`，允许 IDE 冷启动，但业务页面等待仍维持 30 秒，避免把后端或页面卡死掩盖成正常。

## 报告、失败与回退

`results.json` schema v3 包含 Git SHA、工作区是否有未提交变更、客户端版本、时间、设备与窗口参数、逐项断言、异常、阻塞、路由/截图和 `notCovered`。`mode=real-cloud-readonly` 不做发布、报名、审批、删除或资料保存。报告保存于执行及关闭动作的 finally；参数/依赖等启动前错误直接退出。

退出码 0 表示本次只读范围通过；1 为断言/运行异常；2 为启动错误或缺少样本造成阻塞。`passed` 数量非零不代表总结果成功，以 `outcome` 和退出码为准。无检查、少截图、缺少审核记录不能当作完整通过。

失败先查环境和当前页面状态；会话失联则退出开发者工具并重新启动，不重复业务写入。冷启动未进入页面且报告为 0 checks 时，只能记为环境启动失败，不能记产品通过或失败。若 CLI 报退出成功但 `ps -axo pid=,comm=` 仍显示无自动化端口的微信开发者工具残留进程，确认它属于本轮自动化后先正常终止，仍不退出才强制终止；随后从新目录重跑。2026-10-16 遇到 `rawPath` 空值、页面上下文失效和 automator 响应超时，退出 IDE 后恢复只读回归；失败报告保留。运行中不要修改小程序源文件，热重载会使页面句柄失效。截图有白底白字、溢出或遮挡时修正源代码后重采；不得只更新摘要。合并后回归失败暂停体验版晋级，按已验证发布记录恢复稳定版本并登记下一步。

验收记录模板：日期、基线 SHA、内容摘要、客户端/上传版本、环境、测试账号角色、设备、逐项结果、差异、脱敏证据路径、部署工作流链接、未覆盖项、负责人及复测条件。
