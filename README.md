# 此里 · 骑行活动原生微信小程序

“此里”用于骑行活动发布、实名报名、Strava 能力资料与管理员审批。需求原文保留在 [`docs/requirements-design.md`](docs/requirements-design.md)。

当前分支完成了 CloudBase 核心报名闭环的**可部署代码与离线验证**，但 `miniprogram/config/runtime.ts` 的 `dataMode` 仍固定为 `mock`，现有页面不会切到未完成的真实资料/Strava 链路。已部署的 `auth` 保持不变。

## 已完成

- `auth`：从 `cloud.getWXContext().OPENID` 取得可信身份，并以 `admins._id` 判定角色。
- `activity-read`：仅返回已发布、未软删除活动的列表/详情和 `pending + approved` 真实占位；响应字段白名单不含内部审计字段。
- `registration`：我的报名、详情、提交、取消；确定性报名 ID、重报保留审批历史、活动/截止/资料/Strava 校验、事务名额闸门。
- `admin-review`：管理员报名列表/详情、通过/驳回、理由规则、状态机和同事务审计。
- `cloudfunctions/shared`：纯 JS 领域规则与事务 orchestration，可脱离微信运行；部署前由脚本把同一份领域源码复制到各函数的 `domain/`，函数只使用相对 require；每个部署目录都可独立 `npm ci`。
- `CloudRepository`：已接活动读、我的报名、报名提交/取消及审批调用，保持现有 `RideRepository` 形状；生产模式绝不回退 Mock。
- 数据契约、安全规则、索引和事务取舍见 [`docs/cloudbase-schema.md`](docs/cloudbase-schema.md)。安全初始化见 [`scripts/seed-cloudbase/README.md`](scripts/seed-cloudbase/README.md)。

## 明确未完成

- 未实现资料写入/手机号解码。没有 KMS/环境密钥前，不允许落明文手机号、证件号、紧急联系电话。
- 未实现 Strava OAuth、token 加密和同步；token 不进入本批函数响应。
- 未实现活动管理命令、支付、签到、导出、消息通知和管理员配置 UI。
- 未在真实 CloudBase 上验证事务冲突重试、热点吞吐、复合索引及 SDK 缺失文档错误码。离线事务替身只验证编排不变量，不能等同数据库并发证明。
- 因上述资料和 Strava 前置能力尚未实现，`dataMode` 必须保持 `mock`，不可直接切换生产。

## 本地安装与验证

```bash
npm ci
npm run cloud:install
npm run format:check
npm run lint
npm run typecheck
npm test
npm run test:cloud
npm run coverage
npm run build
npm run audit:all
```

`npm run cloud:prepare` 从唯一源码 `cloudfunctions/shared` 复制 `index.js / domain.js / use-cases.js` 到三个函数各自的 `domain/`。`npm run verify:cloud-packages` 会执行 `npm pack --dry-run`，确认入口和领域源码均在部署清单中、三份源码哈希一致，并拒绝任何 `file:` 依赖或 `vendor/` 残留。生成的 `domain/` 与函数 `package-lock.json` 应提交，`node_modules / dist / coverage` 不提交。

原生小程序没有常规 Web bundle；`build` 是源码编译和页面完整性证明。

## 目录

```text
miniprogram/
  config/              品牌、云环境、数据模式与云初始化
  models/              领域模型
  repositories/        Mock 与真实 Cloud adapter
  services/            业务入口与可信身份调用
  pages/                现有队员端/管理员端页面（本次不重构 UI）
cloudfunctions/
  auth/                 已有可信身份函数
  shared/               单一来源纯 JS 领域规则与事务编排
  activity-read/        活动只读
  registration/         队员报名命令与我的报名
  admin-review/         管理员审批
docs/cloudbase-schema.md
scripts/seed-cloudbase/README.md
```

## 建议部署顺序（本次未执行）

1. 审阅并创建集合、安全规则、复合索引；初始化所有活动的 `occupied_count=0`。
2. 按安全初始化文档取得真实 openid，创建首个管理员和 draft 活动；不要将 openid 写入 Git。
3. 先部署 `activity-read`，以 draft/published/soft-delete 数据核对字段白名单。
4. 完成 KMS/加密资料服务和 Strava OAuth 后，准备合规 `profiles` 测试数据。
5. 部署 `registration`，在隔离活动上做容量边界、重复提交、取消、驳回重报及真实并发压测。
6. 最后部署 `admin-review`，验证普通用户越权失败、审批状态迁移、计数释放和审计字段。
7. 真实链路全部通过后再单独评审将 `runtimeConfig.dataMode` 从 `mock` 切换；不要与 UI 重构同时进行。

## 安全边界

所有运行期 openid 均取自微信上下文；客户端传入的 openid、角色、状态、名额、金额和审核字段会被拒绝。业务集合禁止客户端直写。日志只记录错误码，不打印 openid、手机号、证件号或 token。对外报名资料只有脱敏值，审计日志使用严格字段白名单。
