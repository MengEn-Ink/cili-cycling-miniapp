# Pages 活动首页与俱乐部流程本地验收

## 范围

- 仅修改 GitHub Pages 原型，不修改小程序、云函数、数据库字段或部署配置。
- 活动首页使用三卡 v3 轮播。
- 俱乐部创建仅对平台管理员展示，创建后直接进入 `active`；不再展示普通用户创建申请、撤回、驳回或平台审批流程。
- 正式路由 ID 保持不变：`admin-club-applications` 用作俱乐部管理，`admin-club-application-detail` 用作创建俱乐部。

## 自动化结果

- `npx vitest run tests/showcase-pages-contract.test.ts tests/pages-full-app-prototype.test.ts`
  - 2 个测试文件、77 项测试通过。
- `npm run typecheck`
  - 通过。
- `git diff --check`
  - 通过。
- `npm run validate`
  - 首次因本地云函数依赖未安装而中止；执行 `npm run cloud:install` 后全量通过。
  - 根测试 99 个文件、1250 项测试通过；全部云函数测试、构建和工程门禁通过。
- `npm run coverage`
  - 通过；根覆盖率为 statements 81.91%、branches 75.94%、functions 81.80%、lines 85.26%。
  - `cloud.ts` 覆盖率为 lines 90.91%、branches 89.00%、functions 96.27%、statements 90.00%。
- `npm run audit:all`
  - 阻塞；根项目为 0 漏洞，微信上传工具链仍报告可升级修复的 `fast-glob` 与 `request`。

## 浏览器验收

- 本地地址：`http://127.0.0.1:4174/`
- 视口：`340×740`、`375×812`、`390×844`（另补 `340×812`、`390×812`）
- 页面：`#activities`、`#admin-club-applications`、`#admin-club-application-detail`、`#club/center`、`#profile`
- 三个宽度下均无页面或原型容器横向溢出，无图片加载失败，可见按钮实际热区均不小于 44px。
- 活动轮播点击、分页、`Home` / `End`、首尾禁用状态通过，URL 保持 `#activities`。
- 创建俱乐部背景删除、重新上传、创建成功状态通过。
- 普通成员个人中心不显示活动管理或俱乐部管理入口；管理员状态各显示一处。
- 视觉复核发现并修复 `club/center` 发现页徽标压住标题的问题；仅详情态保留悬浮徽标。
- 浏览器控制台与页面错误为空。

## 截图证据

目录：`docs/evidence/ui-sync/2026-10-16-design-acceptance`

- `activities-pages.png`
- `admin-club-applications-pages.png`
- `admin-club-application-detail-pages.png`
- `club-center-pages.png`
- `profile-pages.png`

以上截图均为 `375×812` Pages 演示数据。`docs/ui-sync-manifest.json` 已更新内容摘要、状态、数据类型和差异说明。
小程序 `source.digest` 仅按当前 `f7a33376` 基线重新计算；本轮未修改小程序源码，也未据此重采或升级 DevTools 结论。

## 未覆盖

- 未部署 Pages、CloudBase 或微信开发版。
- 未执行微信开发者工具复验、iOS / Android 物理真机或真实写链路。
- 现有 DevTools 证据继续标记为 `blocked`，不得据此声明双端一致或线上就绪。
