# 骑有此里（此里）· 骑行活动微信小程序

“骑有此里”是面向骑行俱乐部的原生微信小程序，覆盖活动发布、路线展示、实名资料、Strava 能力数据、报名审批、签到和个人骑行名片。小程序内使用简称“此里”。

项目基于微信云开发（CloudBase）。业务数据库集合只允许云函数访问；客户端仅可按存储规则写入与本人绑定的 `profiles/` staging 路径。本地构建或测试通过不代表云端资源已经部署，也不代表真实报名旅程已经验证。

## 已实现能力

- **活动**：已登录用户可创建和编辑本人草稿、发布与下架，并从本人的历史活动复制草稿；管理员可管理全部活动并结束活动。活动支持图集、集合地点、分组容量、后援车信息和 Strava 路线预览/GPX。
- **报名**：微信身份、实名资料、微信授权或手填手机号、集合方式与骑行经验；支持提交、驳回后重报、取消、审批、凭证和管理员签到。
- **Strava**：OAuth 绑定、自动就绪、手动同步、解绑，以及最近 90 天里程、次数、最长距离、爬升和加权均速。
- **个人资料**：昵称、微信/自定义头像、多张骑行照片、称号展示和个人骑行名片。
- **通知**：报名时请求订阅授权；审批结果通过带租约和退避的 Outbox 异步发送。
- **安全与可靠性**：服务端可信 `OPENID`、管理员白名单、敏感字段 AES-256-GCM 加密、媒体 owner/canonical 校验、容量事务和操作审计。

当前不包含在线支付、Strava 豁免流程、管理员白名单维护界面、报名名单导出或多俱乐部租户体系。完整产品边界见 [产品需求与当前能力](docs/requirements-design.md)。

公开骑手头像的代码契约已经要求显式公开授权、授权 revision 与当前头像 revision 一致，并只为 owner/current registry 完整匹配的 canonical 媒体签发临时地址；其他情况一律隐藏头像。代码和自动化验证不代表目标环境已经部署，仍须按对应不可变提交核对云函数版本、同值 `PROFILE_MEDIA_PATH_SECRET` 和真实 smoke，证据缺失时不得宣称生产就绪。

## 技术栈

- 原生微信小程序：TypeScript、WXML、WXSS
- 微信云开发：云函数、云数据库、云存储、HTTP 网关、定时触发器
- Node.js 20、npm、Vitest、ESLint、Prettier
- Strava OAuth 与只读 API

## 目录

```text
miniprogram/                 小程序页面、组件、仓库层和领域视图模型
cloudfunctions/              可独立部署的 CloudBase 云函数
cloudfunctions/shared/       报名领域的共享源码
cloudfunctions/strava-shared/ Strava 领域的共享源码
scripts/                     部署准备、CloudBase bootstrap 和证据校验
tests/                       小程序与跨模块回归测试
docs/                        产品、数据契约和真实环境验证文档
```

## 本地开始

前置条件：Node.js 20、npm、微信开发者工具，以及有权限的微信小程序/CloudBase 测试环境。

```bash
npm ci
npm run cloud:install
npm run validate
```

然后用微信开发者工具导入仓库根目录。`project.config.json` 已声明 `miniprogram/` 和 `cloudfunctions/`；个人开发者配置写入未跟踪的 `project.private.config.json`，不要提交真实账号或环境凭据。

常用检查：

```bash
npm run format:check     # Markdown、JSON、TS/JS 等格式
npm run lint             # TypeScript ESLint
npm run typecheck        # TypeScript 类型检查
npm test                 # 小程序与共享领域测试
npm run test:cloud       # 各云函数及 Strava 共享模块测试
npm run coverage         # 覆盖率门禁
npm run audit:all        # 根项目和云函数依赖审计
```

`npm run validate` 会串行执行格式、Lint、类型、测试、证据工具、bootstrap、部署脚本单测、云函数包和构建检查。它不连接或修改 CloudBase。

## 协作与发布规则

所有变更都必须遵循 [贡献与发布规则](CONTRIBUTING.md)：基于最新 `main` 开发，本地门禁与 PR CI 通过后合入，并在 `main` CI 成功后完成自动部署验收。自动上传的设计、安全边界、首轮验证证据和故障处理见 [微信开发版 CI 自动部署方案](docs/miniprogram-ci-deployment.md)。

## GitHub Actions 自动上传微信开发版

`.github/workflows/deploy-miniprogram.yml` 会在 `main` 的 `CI` 成功后自动上传微信开发版；也支持在 Actions 页面从 `main` 手动触发并填写版本号、说明和 robot 编号。自动版本格式为 `0.0.<run_number>.<attempt>`，上传前会再次确认目标提交仍是远端 `main` 最新 head，旧 CI 重跑或非 `main` 手动运行只记录跳过，不会回退开发版。

首次启用：

1. 在微信公众平台进入“管理 → 开发管理 → 开发设置 → 小程序代码上传”，生成新的代码上传密钥。
2. 在 GitHub 仓库进入“Settings → Secrets and variables → Actions → New repository secret”，创建 `WECHAT_MINIPROGRAM_PRIVATE_KEY`，值为密钥文件的完整正文。密钥不得放入仓库、Actions variable 或日志。
3. 处理上传 IP 白名单：GitHub 托管 runner 的出口 IP 会变化。若必须开启白名单，应使用具备固定出口 IP 的受控 runner；否则需要在微信公众平台关闭该白名单，并通过主分支保护、最小 Actions 权限和定期轮换密钥补偿风险。
4. 合并工作流后，在“Actions → 微信开发版自动上传 → Run workflow”手动执行一次。确认开发版上传成功后，再依赖 `main` CI 成功后的自动触发。

手动本地上传使用同一脚本，仅通过环境变量传入密钥路径，不读取密钥正文：

```bash
npm ci --ignore-scripts --prefix tools/miniprogram-ci
MINIPROGRAM_CI_PRIVATE_KEY_PATH=/secure/private.key \
MINIPROGRAM_VERSION=1.0.29 \
MINIPROGRAM_DESCRIPTION='手动上传最新主分支' \
MINIPROGRAM_CI_ROBOT=1 \
npm run deploy:miniprogram
```

紧急停用时，在 Actions 页面禁用“微信开发版自动上传”工作流并删除 `WECHAT_MINIPROGRAM_PRIVATE_KEY`；若怀疑密钥泄露，还应立即在微信公众平台重置代码上传密钥。

## 配置

以 `cloudfunctions/.env.example` 为键名清单，只在 CloudBase 控制台配置真实值：

| 变量                                                          | 使用方                                                              | 说明                                                               |
| ------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `PII_ENCRYPTION_KEY`                                          | `profile`                                                           | base64 编码的 32 字节密钥                                          |
| `PROFILE_MEDIA_PATH_SECRET`                                   | `profile`、`profile-media-cleanup`、`admin-review`、`activity-read` | 至少 32 字符，四者必须一致；`activity-read` 缺失时头像 fail closed |
| `STRAVA_CLIENT_ID` / `STRAVA_CLIENT_SECRET`                   | Strava 函数                                                         | Strava 应用凭据                                                    |
| `STRAVA_TOKEN_ENCRYPTION_KEY`                                 | Strava 函数                                                         | base64 编码的 32 字节密钥                                          |
| `STRAVA_CALLBACK_URL`                                         | Strava 函数                                                         | 完整 HTTPS 回调地址                                                |
| `REVIEW_APPROVED_TEMPLATE_ID` / `REVIEW_REJECTED_TEMPLATE_ID` | `notification-send`                                                 | 审批订阅消息模板                                                   |

仓库禁止保存 secret、token、真实 `openid`、手机号、OAuth code/state、密文或真实旅程原始证据。

## CloudBase 初始化与部署

先生成只读计划，再由环境负责人审核并显式应用：

```bash
npm run cloudbase:plan
npm run cloudbase:apply
npm run cloudbase:verify
```

bootstrap 当前管理 12 个集合、22 个业务索引和全拒绝客户端数据库规则，包含 Strava 路线短期可信快照集合 `strava_route_previews`。bootstrap 不创建业务活动，也不会自动应用 `cloudstorage.rules.json`。完整顺序：

1. 审阅并执行 CloudBase plan/apply/verify。
2. 按 [CloudBase 数据契约](docs/cloudbase-schema.md) 配置云函数环境变量和 `cloudstorage.rules.json`，并回读确认 canonical 媒体路径不可由客户端写入。
3. 运行 `npm run cloud:install`，再依次部署 `auth`、`profile-media-cleanup`、`admin-review`、`profile`、`strava-callback`、`strava-auth`、`activity-read`、`activity-admin`、`registration`、`notification-send`。必须先验证 fail-closed 新版 `admin-review` 已生效；旧 `admin-review` 仍可能为可变 source 签 URL 时禁止进入 `profile` 部署。
4. 应用并回读 `cloudbaserc.json` 中 `/strava/callback`、`/strava/success`、`/strava/failure` 三条 HTTPS 网关路由；把完整 callback 地址配置到 Strava 应用，并把网关域名加入小程序 `web-view` 业务域名。OAuth scope 固定为 `read,activity:read_all,profile:read_all`。
5. 按 [安全初始化说明](scripts/seed-cloudbase/README.md) 创建首个管理员；活动只能通过已部署的活动管理业务流程创建。
6. 在隔离测试环境按 [P0 真实报名旅程手册](docs/verification/p0-real-registration-journey.md) 验证。缺少真实环境证据时结论只能是“未执行”，不能写成通过。

## 文档导航

- [产品需求与当前能力](docs/requirements-design.md)：用户、流程、已实现范围和后续边界。
- [CloudBase 数据契约与安全边界](docs/cloudbase-schema.md)：集合、索引、状态机、错误码和部署后检查。
- [P0 真实报名旅程手册](docs/verification/p0-real-registration-journey.md)：测试环境端到端验证和脱敏证据格式。
- [首个管理员初始化](scripts/seed-admin/README.md)：管理员白名单的人工引导。
- [CloudBase 安全初始化](scripts/seed-cloudbase/README.md)：bootstrap、权限和首个业务数据入口。

文档以当前 `main` 的代码、配置和可复现验证为准。功能变化应在同一变更中更新对应文档；阶段性设计和执行计划完成后不长期保留在主文档树中，历史决策通过 Git 追溯。
