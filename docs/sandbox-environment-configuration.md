# GitHub 托管的测试、部署与代码交付配置指南

本文统一说明“此里”小程序如何完成代码修改、自动化测试、CloudBase 部署、GitHub PR、微信开发版上传和真实环境验证。生产部署凭证统一托管在 GitHub Actions Environment 中；Aime 只需要仓库写权限，不再持有 CloudBase 或微信上传密钥。

> 本文以仓库当前 `main` 的脚本与工作流为准。测试通过不等于云函数已部署，微信开发版上传成功也不等于 CloudBase 已更新。

## 1. 环境与责任边界

| 层级 | 用途 | 配置位置 | 是否允许进入仓库 |
| --- | --- | --- | --- |
| Aime 沙箱 Secret | GitHub fetch/push、查询和创建 PR | Aime 空间的 Secret 管理 | 否 |
| GitHub Actions Environment | CloudBase 自动部署与目标环境配置 | GitHub `cloudbase-production` Environment | 否 |
| GitHub Actions Secret | 合并后上传微信开发版 | GitHub 仓库 Settings → Secrets and variables → Actions | 否 |
| CloudBase 云函数环境变量 | 运行时加密、路线退休清理、订阅消息 | CloudBase 控制台中对应云函数的环境变量 | 否 |
| 仓库固定配置 | AppID、CloudBase EnvID、函数清单、网关路由 | `project.config.json`、`cloudbaserc.json` | 是 |
| 本地私有文件 | 微信开发者工具个人设置、现场证据签发密钥 | 未跟踪文件或受控目录 | 否 |
| 普通命令参数 | 版本号、说明、robot、目标环境确认 | 单次命令或 workflow input | 不保存 |

### 当前固定配置

| 参数 | 当前来源 | 说明 |
| --- | --- | --- |
| 小程序 AppID | `project.config.json` 的 `appid` | 上传脚本直接读取；不要另建重复变量 |
| CloudBase EnvID | `cloudbaserc.json` 的 `envId` | bootstrap 默认只允许操作该环境 |
| CloudBase Region | `scripts/bootstrap-cloudbase.mjs` | 默认 `ap-shanghai`，需要时用 `--region` 覆盖 |
| 小程序源码目录 | `project.config.json` | `miniprogram/` |
| 云函数目录 | `project.config.json`、`cloudbaserc.json` | `cloudfunctions/` |
| CI Node.js | `.github/workflows/*.yml` | GitHub Actions 使用 Node.js 24 |
| 云函数 Runtime | `cloudbaserc.json` | 云端运行时为 Node.js 20.19 |

沙箱和 CI 建议使用 Node.js 24；云函数代码同时必须兼容 `Nodejs20.19`。不要因为 README 中的最低开发前置条件是 Node.js 20，就忽略 CI 使用 Node.js 24 的事实。

## 2. 需要提供的配置总表

### 2.1 Aime 沙箱 Secret

以下变量由环境负责人通过 Aime 的安全配置入口注入。不要把值粘贴到聊天、Issue、PR、文档、`.env` 或 shell 历史中。

| 变量 | 必需场景 | 是否敏感 | 要求 |
| --- | --- | --- | --- |
| `GITHUB_TOKEN` | fetch/push、查询和创建 PR、读取 Actions | 是 | 推荐 fine-grained token，仅授权本仓库 |

`GH_TOKEN` 只作为 `GITHUB_TOKEN` 的兼容别名；统一提供 `GITHUB_TOKEN` 即可。脚本或命令需要 GitHub CLI 时，可在**单条命令作用域**内映射：

```bash
GH_TOKEN="${GH_TOKEN:-$GITHUB_TOKEN}" gh pr list \
  --repo MengEn-Ink/cili-cycling-miniapp \
  --state open
```

GitHub fine-grained token 的最小仓库权限：

- Contents：Read and write
- Pull requests：Read and write
- Actions：Read
- Metadata：Read

只有自动化需要修改 `.github/workflows/**` 时，才增加 Workflows/Actions 写权限。不要使用包含无关仓库或组织管理权限的宽权限 token。

Aime 不再执行 CloudBase 生产部署，也不需要腾讯云永久密钥或 CloudBase API Key。CloudBase CLI 的无头认证只在 GitHub 托管 Runner 中进行，官方登录方式见 [CloudBase CLI 使用指南](https://docs.cloudbase.net/cli-v1/install)。

### 2.2 GitHub Actions Secrets 与 Variables

建议创建名为 `cloudbase-production` 的 GitHub Environment，并按下表配置：

| 名称 | 类型 | 必需场景 | 配置要求 |
| --- | --- | --- | --- |
| `CLOUDBASE_API_KEY` | Environment Secret | CloudBase 集合、索引和云函数部署 | 目标环境的环境级 API Key；敏感、不可回读、按有效期轮换 |
| `CLOUDBASE_ENV_ID` | Environment Variable | CloudBase 防串环境校验 | 必须与 `cloudbaserc.json` 的 `envId` 完全一致 |
| `CLOUDBASE_REGION` | Environment Variable | CloudBase 数据库 API 地域 | 当前目标为 `ap-shanghai` |
| `WECHAT_MINIPROGRAM_PRIVATE_KEY` | Repository 或 Environment Secret | 微信开发版自动上传 | 微信公众平台代码上传密钥文件完整正文 |

仓库工作流中的 `secrets.GITHUB_TOKEN` 由 GitHub Actions 自动提供，不需要人工创建，也不要与 Aime 沙箱的 `GITHUB_TOKEN` 混为一谈。

配置位置：

1. 微信公众平台 → 管理 → 开发管理 → 开发设置 → 小程序代码上传，生成或轮换代码上传密钥。
2. GitHub 仓库 → Settings → Secrets and variables → Actions → New repository secret。
3. Name 填 `WECHAT_MINIPROGRAM_PRIVATE_KEY`，Secret 填密钥文件完整正文。
4. 首次配置后，从 `main` 手动运行一次“微信开发版自动上传”并核对微信公众平台开发版。

若开启微信上传 IP 白名单，GitHub 托管 Runner 的动态出口 IP 不适用；应使用固定出口的受控 Runner。怀疑私钥泄露时，先在微信公众平台重置，再原子更新 GitHub Secret。

### 2.3 CloudBase 云函数环境变量

真实值只配置到 CloudBase 控制台对应函数，不写入仓库。`cloudfunctions/.env.example` 只维护键名清单。

| 变量 | 配置到哪些函数 | 必需性与格式 |
| --- | --- | --- |
| `PII_ENCRYPTION_KEY` | `profile`、`admin-review` | 必需；32 字节随机值的 base64 编码；两个函数必须完全同值 |
| `PROFILE_MEDIA_PATH_SECRET` | `profile`、`profile-media-cleanup`、`admin-review`、`activity-read` | 必需；至少 32 字符；四个函数必须完全同值 |
| `OAUTH_RETIREMENT_PURGE_ENABLED` | `route-maintenance` | 默认不配置或设为 `0`；仅在新路线链路部署并完成运行时验收后临时设为 `1`，旧数据清空回读后移除 |
| `REVIEW_APPROVED_TEMPLATE_ID` | `notification-send` | 启用“审核通过”订阅消息时必需 |
| `REVIEW_REJECTED_TEMPLATE_ID` | `notification-send` | 启用“审核驳回”订阅消息时必需 |
| `WAITLIST_ENTERED_TEMPLATE_ID` | `notification-send` | 启用“进入候补”订阅消息时必需 |
| `WAITLIST_PROMOTED_TEMPLATE_ID` | `notification-send` | 启用“候补转正”订阅消息时必需 |
| `ACTIVITY_REMINDER_TEMPLATE_ID` | `notification-send` | 启用“活动提醒”订阅消息时必需 |

安全生成命令应在受控终端执行，输出直接进入 Secret 管理器，不要回传到聊天：

```bash
# PII_ENCRYPTION_KEY
openssl rand -base64 32

# PROFILE_MEDIA_PATH_SECRET；48 字节随机值会生成长度充足的 base64 文本
openssl rand -base64 48
```

`PII_ENCRYPTION_KEY` 和 `PROFILE_MEDIA_PATH_SECRET` 用途不同，不得复用。轮换前必须先评估存量密文和存量媒体路径兼容性，不能直接覆盖生产值。

### 2.4 现场验证与本地私有文件

| 配置 | 形式 | 用途 |
| --- | --- | --- |
| `project.private.config.json` | 从 `project.private.config.example.json` 复制的未跟踪文件 | 微信开发者工具个人配置；不要放账号或云密钥 |
| `journey-run.key` | 权限为 `0600`、至少 32 字节的普通文件 | P0 真实旅程证据签发与离线校验 |
| `sanitized-preflight.json` | 只含白名单布尔字段的脱敏 JSON | P0 写操作前预检 |
| `sanitized-evidence.json` | 脱敏 JSON | P0 真实旅程离线校验 |

生成证据签发密钥：

```bash
umask 077
openssl rand 32 > /absolute/secure/path/journey-run.key
chmod 600 /absolute/secure/path/journey-run.key
```

它不是环境变量，也不应上传到 Aime、GitHub 或 CloudBase。

## 3. 沙箱首次配置

### 3.1 只检查“是否存在”，禁止打印值

```bash
command -v node
command -v npm
command -v git
command -v gh
node --version
npm --version

for name in GITHUB_TOKEN; do
  if [ -n "$(printenv "$name")" ]; then
    printf '%s=present\n' "$name"
  else
    printf '%s=missing\n' "$name"
  fi
done
```

禁止运行会泄露整个环境的 `env`、`set`、`printenv`（无变量名）、`gh auth token`，也禁止开启 `set -x`。

### 3.2 安装仓库依赖

```bash
npm ci
npm run cloud:install
```

- `npm ci` 使用根目录 lockfile 安装小程序测试和构建依赖。
- `npm run cloud:install` 先准备共享源码，再按 lockfile 安装每个云函数依赖。
- `tools/miniprogram-ci` 只在微信上传时单独安装：

```bash
npm ci --ignore-scripts --prefix tools/miniprogram-ci
```

### 3.3 CloudBase 连通性与部署归 GitHub Actions

仓库把 CLI 锁定为 `@cloudbase/cli@3.8.4`。Aime 沙箱只运行不需要生产 Secret 的测试与 plan 生成逻辑，不登录或修改 CloudBase。PR 合入 `main` 且 CI 成功后，`.github/workflows/deploy-cloudbase.yml` 会在 `cloudbase-production` Environment 中完成：

1. 比较 GitHub Variable 与 `cloudbaserc.json`，环境 ID 不一致时立即停止。
2. 使用 `CLOUDBASE_API_KEY` 完成无头登录，并先执行 `fn list` 验证连通性。
3. 基础设施发生变更或强制 reconcile 时，依次执行数据库 plan/apply/verify，再以 `CUSTOM` ACL 应用 `cloudstorage.rules.json` 并通过 `storage rules get --json` 比较完整 `read` / `write`；漂移立即阻断。
4. 以上次成功的 CloudBase workflow SHA 为基线，累计识别新增、修改、重命名和删除，只重新部署受影响的云函数；共享领域代码展开到实际消费者。
5. 部署后通过 `fn detail club-application --json` 严格确认目标环境中的部署对象、函数名，且状态为 CLI 3.8.4 的可服务终态 `Active`（比较时忽略大小写）；Creating、Updating、Inactive 和未知状态均阻断。
6. 复用俱乐部申请本地 core 驱动生产数据库完整状态链，并在成功或失败时清理全部隔离记录；该门禁不调用云函数、不模拟微信 `OPENID`，鉴权由云函数单元测试和客户端 E2E 覆盖。

工作流也支持手动恢复：可选择全量重新部署函数或重新应用数据库基线，但仍受 production Environment 审批与 Secret 边界保护。

## 4. 开发、测试与本地验证

### 4.1 开工前

1. 检查工作区，发现用户未提交改动时先停止破坏性操作，不执行 `reset --hard`。
2. 获取最新 `origin/main`。
3. 查询 open PR，避免与他人重复修改同一能力。
4. 从最新 `origin/main` 创建 `feat/*`、`fix/*`、`docs/*` 或 `chore/*` 分支；分支名禁止包含 `aime`。

```bash
git status --short --branch
git fetch origin main
git switch -c docs/example origin/main
GH_TOKEN="${GH_TOKEN:-$GITHUB_TOKEN}" gh pr list \
  --repo MengEn-Ink/cili-cycling-miniapp \
  --state open
```

Git fetch/push 使用短期 token 和 `GIT_ASKPASS` 注入；禁止把 token 拼进 remote URL，禁止设置 `credential.helper store`。

### 4.2 无外部 Secret 的本地门禁

以下命令不应连接或修改 CloudBase，也不需要真实业务 Secret：

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run test:cloud
npm run test:bootstrap
npm run test:deploy
npm run test:release-notes
npm run validate
npm run coverage
npm run audit:all
git diff --check
```

标准推送前顺序：

```bash
npm ci
npm run cloud:install
npm run validate
npm run coverage
npm run audit:all
git diff --check
```

说明：

- `npm run validate` 会执行格式、Lint、类型、测试、P0 证据工具、bootstrap/部署脚本契约测试、全部云函数测试、包一致性和构建。
- `npm run coverage` 执行小程序覆盖率和 CloudBase bootstrap 覆盖率检查。
- `npm run audit:all` 审计根项目及各云函数的高危依赖。
- 产品代码变化必须更新 `miniprogram/pages/settings/index.ts` 的 `RELEASE_NOTES`；纯文档、测试、CI 或开发脚本变化不要求新增应用日志。

### 4.3 GitHub Pages UI 同步门禁

`docs/ui-sync-manifest.json` 记录最近一次小程序 UI 与 GitHub Pages
高保真原型同步的完整 Git SHA、内容摘要、13 个真实页面路由和双端截图证据。
普通 CI 允许短期批量同步，体验版晋级要求零漂移。

普通模式规则：

- 最多允许 4 个未同步 UI 提交；第 5 个提交阻断。
- 存在 UI 漂移时，距最近同步超过 7 天即阻断。
- `miniprogram/app.json`、`miniprogram/app.wxss`、品牌资产目录和
  `brand-logo` 组件变化必须立即同步。
- P0 用户可见性修复即使未命中自动分类，也必须在同一 PR 更新原型和证据。

本地检查：

```bash
npm run test:ui-sync
npm run check:ui-sync
npm run check:ui-sync -- --strict
```

`npm run check:ui-sync` 与普通 CI 使用提交数/时间预算；
`npm run check:ui-sync -- --strict` 用于体验版晋级，只接受零 UI 漂移。
证据存放在 `docs/evidence/ui-sync/<date>-main-<sha>/`，每个覆盖路由必须同时
提供 `*-devtools.png` 和 `*-pages.png`，并记录截图视口、采集方式和
Automator 断言结果。

同步时从目标 `main` SHA 采集微信开发者工具截图，更新 `docs/` 原型，
使用相同路由生成 Pages 截图，再更新根清单的 source/prototype 摘要。
不得只修改清单摘要绕过视觉核对。GitHub Pages 正式地址部署后还要复核
14 个路由、移动端/桌面端布局和浅色主题可读性，才算本轮同步完成。

### 4.4 CloudBase 资源验证

```bash
# 只读计划；默认入口
npm run cloudbase:plan

# 写入集合、索引和数据库安全规则；必须经环境负责人明确授权
npm run cloudbase:apply

# 写后回读集合、索引和数据库安全规则
npm run cloudbase:verify
```

如需覆盖仓库目标环境，必须同时传入完全相同的二次确认值：

```bash
node scripts/bootstrap-cloudbase.mjs \
  --env-id '<TARGET_ENV_ID>' \
  --confirm-env-id '<TARGET_ENV_ID>' \
  --region ap-shanghai
```

不要把环境 ID 隐藏在额外环境变量里。目标环境必须在命令中清晰可审计；`apply` 没有明确写入授权时禁止执行。

`cloudbase:verify` 只验证数据库集合、索引与数据库规则。存储规则由生产工作流单独执行 `npm run cloudbase:storage:reconcile -- --env-id <id>` 应用并回读；该命令会真实修改环境，禁止在本地无授权执行。

### 4.5 P0 真实旅程验证

真实旅程需要：

- 已部署到隔离测试环境的不可变提交；
- 一个管理员账号和一个普通新测试用户；
- 一条可公开访问的 Strava 官方路线和一份含海拔的 GPX 夹具；
- 受控的 `journey-run.key`；
- 不含真实标识和凭据的 preflight/evidence 文件。

先预检：

```bash
npm run check:journey-preflight -- \
  --input /absolute/path/to/sanitized-preflight.json
```

退出码 `0` 才能继续；`2` 表示本轮“未执行”并停止写操作；`1` 表示输入无效。

签发和校验证据：

```bash
npm run issue:journey-run -- \
  --key-file /absolute/secure/path/journey-run.key \
  > /absolute/secure/path/journey-run-template.json

npm run verify:journey-evidence -- \
  --key-file /absolute/secure/path/journey-run.key \
  /absolute/path/to/sanitized-evidence.json
```

离线校验通过不等于真实旅程已执行。完整现场步骤见 [P0 真实报名旅程现场验证手册](verification/p0-real-registration-journey.md)。

## 5. 提交、PR 与合并

### 5.1 提交前检查

```bash
git status --short
git diff --stat origin/main...HEAD
git diff --check origin/main...HEAD
git log --oneline origin/main..HEAD
```

要求：

- 相对 `main` 只保留一个语义完整提交。
- 精确暂存；排除 `.trae/`、`node_modules/`、`dist/`、`coverage/`、密钥和临时证据。
- 标题格式：`<type>(<scope>): <中文结果>`，不超过 72 字符。
- 正文按主改动、测试、文档等分类，写清“做了什么 + 为什么”。
- 提交带 `Co-Authored-By: Aime <...>` trailer。

示例：

```text
docs(env): 补齐沙箱交付与部署配置说明

- 文档：统一 GitHub、CloudBase、微信上传与真实旅程的配置入口
- 验证：列明本地门禁、远端验收信号和未执行边界

Co-Authored-By: Aime <...>
```

### 5.2 推送与 PR

推送和创建 PR 只在用户明确要求后执行。PR 描述包含八段：需求上下文、背景、修改方案、复现/验证路径、改动、影响面、测试、改动文件。

```bash
# 推送时通过受控 GIT_ASKPASS 注入 token，不把 token 写入命令或 remote
GIT_TERMINAL_PROMPT=0 GIT_ASKPASS='<ASKPASS_SCRIPT>' \
  git push -u origin '<branch>'

GH_TOKEN="${GH_TOKEN:-$GITHUB_TOKEN}" gh pr create \
  --repo MengEn-Ink/cili-cycling-miniapp \
  --base main \
  --head '<branch>' \
  --title '<中文标题>' \
  --body-file '<PR_DESCRIPTION_FILE>'
```

PR 创建后等待 checks 完成：

```bash
GH_TOKEN="${GH_TOKEN:-$GITHUB_TOKEN}" gh pr checks '<PR_NUMBER>' \
  --repo MengEn-Ink/cili-cycling-miniapp \
  --watch
```

只有用户明确授权自动合并时才能执行合并；否则停在待 review 状态。

## 6. 微信开发版上传

### 6.1 标准自动链路

1. PR checks 全绿。
2. PR 合入 `main`。
3. `main` push 触发 `CI`。
4. `CI` 成功后，“微信开发版自动上传”读取变更决策 artifact。
5. 仅当变更影响小程序产物且目标 SHA 仍是最新 `main` 时上传。
6. 工作流日志出现 `微信开发版 <version> 上传成功`。
7. 微信公众平台版本管理可见对应开发版。

自动版本为 `0.0.<run_number>.<run_attempt>`。仅文档、测试或不影响小程序产物的变化会记录安全跳过，不应把“跳过”误判成部署失败。

### 6.2 手动从 GitHub Actions 补发

仅用于固定版本号或自动 Run 的外部瞬时故障，且必须从 `main` 触发：

```bash
GH_TOKEN="${GH_TOKEN:-$GITHUB_TOKEN}" gh workflow run deploy-miniprogram.yml \
  --repo MengEn-Ink/cili-cycling-miniapp \
  --ref main \
  -f version='1.0.29' \
  -f description='手动补发最新 main' \
  -f robot='1'
```

输入约束：

| 参数 | 约束 |
| --- | --- |
| `version` | 首字符为字母或数字；整体只含字母、数字、点、下划线、连字符；最长 64 字符 |
| `description` | 单行；最长 128 个字符 |
| `robot` | 1–30 的整数；默认 1 |

### 6.3 沙箱直接调用上传脚本

仅在受控故障处理或验收中使用。私钥正文先由执行器写入权限为 `0600` 的临时文件，脚本只接收文件路径：

```bash
npm ci --ignore-scripts --prefix tools/miniprogram-ci

MINIPROGRAM_CI_PRIVATE_KEY_PATH='/secure/miniprogram-ci.key' \
MINIPROGRAM_VERSION='1.0.29' \
MINIPROGRAM_DESCRIPTION='手动上传最新 main' \
MINIPROGRAM_CI_ROBOT='1' \
npm run deploy:miniprogram
```

这些变量是单次上传参数，不需要长期注入到 Aime。上传前必须确认当前提交等于远端最新 `main`。

## 7. CloudBase 云函数部署与验收

微信开发版工作流**不会**部署云函数。根据 diff 判断：

| 变更范围 | 需要的部署动作 |
| --- | --- |
| 仅 `miniprogram/**` | 上传微信开发版；不部署云函数 |
| 仅 `tests/**`、文档或 CI | 不部署云函数；自动上传可安全跳过 |
| `cloudfunctions/<name>/**` | 部署受影响函数并执行对应 smoke |
| `scripts/bootstrap-cloudbase.mjs`、集合、索引或数据库规则 | 先 plan，经授权 apply，再 verify |
| `cloudstorage.rules.json`、CloudBase 部署 workflow 或相关验证脚本 | 自动触发基础设施对账；应用 `CUSTOM` 存储规则并严格回读 `read` / `write` |
| `cloudbaserc.json` 网关路由 | 单独应用并回读 HTTPS 网关 |

完整初始化时，先 `npm run cloud:install`，再按 README 规定顺序部署函数。部署后至少核对：

- 目标函数状态为 Active；
- 部署版本对应已验证的不可变 commit；
- 四个媒体相关函数使用同值 `PROFILE_MEDIA_PATH_SECRET`；
- `route-maintenance` 已部署，运行时验收前 purge 开关保持关闭（官方路线页已下线，`route-web` 不再部署）；
- timer 和数据库/存储安全规则已回读；
- 对应业务 smoke 或 P0 旅程已执行；无法执行的项目明确记为“未执行”。

### 7.1 俱乐部申请生产写入 smoke

CloudBase 部署完成后，工作流先以锁定版本 CLI 调用已部署的 `club-application`，要求无微信上下文时返回 `UNAUTHENTICATED` 业务信封，以验证线上入口和鉴权边界；随后以唯一 GitHub run id 派生隔离申请人和管理员标识，直接复用 `cloudfunctions/club-application/core.js`，通过 `tcb db nosql execute --json` 逐步执行草稿、提交、驳回、修改重提和批准，并回读 `club_applications`、`clubs`、OWNER `club_memberships` 与四条 `audit_logs`。脚本不输出派生 openid、CLI 原始响应或凭证。`finally` 清理逐集合独立 best-effort，即使单项删除失败也继续其余项目，随后回读五个集合；任何残留或无法回读都会只按集合名阻断部署。

CLI 当前没有暴露与生产云函数 `db.runTransaction` 回调等价的事务接口，因此该 smoke 验证的是逐步真实读写与持久化，不声称覆盖事务原子性；生产云函数路径仍由状态机单测和 `db.runTransaction` 实现约束。不得为 smoke 在生产云函数增加测试 action。

本地默认拒绝执行。只有明确授权时，才可同时提供固定 gate、`--env-id`、同值 `--confirm-env-id` 和同值 `CILI_SMOKE_ENV_ID`；脚本还会核对 `cloudbaserc.json`。日常本地门禁只运行 `npm run test:bootstrap`，使用内存 store 与命令桩，不访问真实环境。

### 7.6 资料页提示“服务暂时不可用”

优先检查 `profile` 云函数的运行时环境变量，而不是只核对本地 `.env`：函数入口会先校验 `PII_ENCRYPTION_KEY`，缺失、非 base64 或解码后不是 32 字节时会以 `PII_KEY_INVALID` 失败；图片上传/回显链路还要求 `PROFILE_MEDIA_PATH_SECRET` 至少 32 字符。常见根因是代码已更新，但云端函数未重新部署或部署时没有同步环境变量。

修复后必须同时核对：

- `profile` 与 `admin-review` 的 `PII_ENCRYPTION_KEY` 完全一致；
- `profile`、`profile-media-cleanup`、`admin-review`、`activity-read` 的 `PROFILE_MEDIA_PATH_SECRET` 完全一致；
- 重新部署受影响函数，并分别执行资料读取、资料保存、活动详情成员背景图 smoke；
- 不在命令输出、PR 描述或验收记录中打印密钥原值。

## 8. 最终交付验收

只有适用项都通过后才能宣布交付完成：

- [ ] 分支来自最新 `origin/main`，没有覆盖用户 WIP
- [ ] 定向测试通过
- [ ] `npm run validate` 通过
- [ ] `npm run coverage` 通过
- [ ] `npm run audit:all` 通过
- [ ] `git diff --check` 通过
- [ ] 产品代码已更新设置页 `RELEASE_NOTES`（如适用）
- [ ] 相对 `main` 为中文单提交且 trailer 正确
- [ ] PR checks 全绿
- [ ] PR 已按授权合入
- [ ] `main` CI 成功
- [ ] 微信开发版上传成功或按变更决策明确安全跳过
- [ ] 云函数/索引/规则/网关已按 diff 单独部署并回读（如适用）
- [ ] 真实 smoke/P0 旅程已执行，或明确记录“未执行”及原因
- [ ] Secret、token、真实 OpenID、手机号、OAuth 参数、密文和原始证据未进入仓库或日志

## 9. 交给环境负责人的最小清单

请通过安全配置入口分别提供，不要在聊天中发送值。

### Aime 沙箱

```text
GITHUB_TOKEN=<required for repository delivery>
```

### GitHub `cloudbase-production` Environment

```text
Secret: CLOUDBASE_API_KEY=<required for CloudBase deployment>
Variable: CLOUDBASE_ENV_ID=<must match cloudbaserc.json>
Variable: CLOUDBASE_REGION=ap-shanghai
```

### GitHub Actions

```text
WECHAT_MINIPROGRAM_PRIVATE_KEY=<required for WeChat development upload>
```

### CloudBase 云函数

```text
PII_ENCRYPTION_KEY=<same value on profile/admin-review>
PROFILE_MEDIA_PATH_SECRET=<same value on profile/profile-media-cleanup/admin-review/activity-read>
OAUTH_RETIREMENT_PURGE_ENABLED=<route-maintenance; keep 0 until runtime acceptance>
REVIEW_APPROVED_TEMPLATE_ID=<notification-send>
REVIEW_REJECTED_TEMPLATE_ID=<notification-send>
WAITLIST_ENTERED_TEMPLATE_ID=<notification-send>
WAITLIST_PROMOTED_TEMPLATE_ID=<notification-send>
ACTIVITY_REMINDER_TEMPLATE_ID=<notification-send>
```

提供完成后，只先做“存在性检查 + GitHub 只读查询 + CloudBase plan”。任何 push、PR、merge、CloudBase apply、函数部署或真实旅程写操作仍按用户授权逐步执行。
