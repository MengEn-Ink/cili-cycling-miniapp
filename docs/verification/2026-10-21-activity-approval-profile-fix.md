# 活动创建、报名审批与个人中心修复验收记录

## 问题现象

- 活动创建或编辑页只显示顶部导航栏，表单区域空白。
- 没有活动时，报名审批页显示“加载失败”和“暂无可审批活动”，将正常空状态误报为故障。
- 个人中心重复展示“全平台唯一俱乐部”，并单列骑行名片入口，信息偏重。

## 根因

活动编辑页属于 `pages/admin` 分包，却直接引用 `pages/activity-detail` 兄弟分包中的格式化模块。Node 测试允许普通文件引用，因此原单测未暴露问题；微信小程序运行时禁止分包间直接引用，页面脚本加载失败后只保留静态导航栏。

审批页在活动列表为空时把“暂无可审批活动”写入 `error`，导致错误态覆盖正常空状态。

## 修复方案

- 活动编辑页直接复用主包公共模块 `utils/route-visual`，保持海拔图绘制参数与行为不变。
- 报名审批将“没有活动”改为独立空状态，真实接口错误继续显示重试按钮。
- 个人中心俱乐部区域仅展示俱乐部名称；未加入时显示“暂未加入俱乐部”。
- 移除个人中心单独的骑行名片入口及无用事件处理。
- 发布版本升级至 `2026.10.21.2`，同步 Pages 设计口径与 UI 摘要。

## 自动化验证

| 类型 | 命令 | 结果 |
| --- | --- | --- |
| 定向回归 | `npx vitest run tests/main-package-contract.test.ts tests/admin-review-regressions.test.ts tests/profile-page.test.ts tests/club-foundation-m0-frontend.test.ts tests/club-application-flow.test.ts tests/activity-admin-edit.test.ts` | 6 个文件、121 项通过 |
| 全量门禁 | `npm run validate` | 99 个测试文件、1290 项通过；构建、设计、治理和 CloudBase 契约通过 |
| 覆盖率 | `npm run coverage` | 通过；关键 CloudBase 模块覆盖率门禁通过 |
| 安全审计 | `npm run audit:all` | 通过；业务与云函数依赖无 high 风险漏洞 |
| 格式与差异 | `npm run format:check && git diff --check` | 通过 |
| 提交门禁 | `verify_squash.sh --base c783004 --pre-head ba6c803` | 单提交、远端同步、中文正文与 trailer 通过 |

## 关键回归用例

| 用例 | 覆盖场景 |
| --- | --- |
| `分包页面只依赖自身分包或公共模块，避免真机加载空白` | 阻止活动管理分包再次引用活动详情兄弟分包 |
| `没有可审批活动时展示友好空态而不是加载失败` | 正常空状态不进入错误态，真实错误仍可重试 |
| `头部保持简洁，个人中心只显示俱乐部名称且不单列骑行名片` | 俱乐部名称直显，不恢复唯一性提示和独立名片入口 |

## 真实环境验收

当前沙箱未注入 CloudBase 凭证，不能在本地伪造真实环境通过结论。合并后按以下顺序验收：

1. Main CI、CodeQL 与 Pages 全绿。
2. 微信开发版自动上传成功，并确认版本号与上传回执。
3. 手动触发 `CloudBase 自动部署` 的 activity full-flow smoke，验证创建草稿、发布、回读、报名、取消、删除与零残留。
4. 在微信开发版复核活动创建页、报名审批空状态与个人中心文案。

验收状态：**代码与自动化门禁通过；真实开发版与 CloudBase 流程待合并后执行。**
