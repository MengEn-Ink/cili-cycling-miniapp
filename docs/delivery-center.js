/*
 * 研发交付中心（SDLC Delivery Center）
 *
 * 把仓库里散落在 README / docs/*.md / docs/superpowers / docs/verification /
 * .github/workflows / cloudbaserc.json / miniprogram/app.json 等处的事实，
 * 按 8 大类（项目总览 / 产品与需求 / 设计与体验 / 技术与架构 /
 * 开发规范 / 测试与验收 / 发布与运维 / 版本与复盘）聚合展示。
 *
 * 维护口径：
 * - 正式基线：有可追溯的仓库主文档或代码事实可以直接读到。
 * - 事实索引：由多处零散事实聚合，内容做二次组织而非一手文档。
 * - 模板待补：没有仓库事实，这里只提供“待补字段”，不虚构。
 *
 * 不要把该模块当作 app.js 的一部分：index.html 已把本文件提前到 app.js 之前
 * 加载，渲染入口由 app.js 的 renderOverview() 调用。
 */
(() => {
  const BASE = 'https://github.com/MengEn-Ink/cili-cycling-miniapp/blob/main/';
  const RAW = 'https://github.com/MengEn-Ink/cili-cycling-miniapp/tree/main/';

  // 文档卡片的三档成熟度，带可读文案与色标 class
  const maturity = {
    baseline: { label: '正式基线', hint: '仓库主文档' },
    aggregated: { label: '事实索引', hint: '来源聚合' },
    template: { label: '模板待补', hint: '待线下确认' },
  };

  // 一个“文档卡片”对象字段：
  //   title / summary / maturity / inline(可选，详情页展开内容) /
  //   source: [{ label, href, external? }]
  //   templateFields: [string]（仅 maturity=template 时）

  const categories = [
    {
      id: 'overview-ia',
      number: '01',
      title: '项目总览',
      lead: 'README、交付中心定位和当前基线，让任何角色打开 Pages 都能先回答“这个项目是什么、现在到哪一步”。',
      cards: [
        {
          id: 'readme',
          title: '项目简介与目录结构',
          summary:
            '面向骑行俱乐部的原生微信小程序；覆盖活动、报名、审批、签到、名片。本地构建或测试通过不代表云端资源已部署，也不代表真实报名旅程已验证。',
          maturity: 'baseline',
          sources: [
            { label: 'README.md', href: BASE + 'README.md' },
            { label: 'miniprogram/ 目录', href: RAW + 'miniprogram' },
            { label: 'cloudfunctions/ 目录', href: RAW + 'cloudfunctions' },
          ],
        },
        {
          id: 'current-baseline',
          title: '当前基线与微信版本',
          summary:
            'main 当前基线、CI、微信开发版版本号、云函数部署状态与剩余 P0/P1 待办集中在高优问题清单中维护。',
          maturity: 'baseline',
          sources: [{ label: 'docs/high-priority-issues.md', href: BASE + 'docs/high-priority-issues.md' }],
        },
        {
          id: 'sdlc-matrix',
          title: 'SDLC 流程与文档矩阵',
          summary:
            '从需求到复盘的八个阶段，每个阶段对应仓库里的事实出处或者待补模板。本页面即是该矩阵的在线可读版本。',
          maturity: 'aggregated',
          inline: 'sdlc-matrix',
        },
        {
          id: 'project-background',
          title: '项目背景与业务价值',
          summary:
            '合并原 BRD/MRD 职责：目标用户、业务问题、价值假设、成功指标。仓库未提供立项书、预算或 ROI，这里仅给出可维护模板。',
          maturity: 'template',
          templateFields: [
            '目标俱乐部 / 用户规模（骑手、发起人、管理员）',
            '业务问题（微信群接龙、人工核对、报名丢失）',
            '价值假设（成单效率、取消率、回头报名率）',
            '成功指标与观测口径（无线上数据平台，先以 CloudBase 审计做人工统计）',
            '投入预算 / 投入人力 / 预期回报（线下填写，不进仓库）',
          ],
        },
      ],
    },
    {
      id: 'product-ia',
      number: '02',
      title: '产品与需求',
      lead: '合并 BRD/MRD 为“项目背景与业务价值”；需求与 PRD 保持与 main 同步；路线图承载后续候选。',
      cards: [
        {
          id: 'requirements',
          title: '产品需求与当前能力',
          summary:
            '角色权限、核心旅程、活动与报名状态机、公开骑手卡片边界、当前限制与后续候选。小程序内简称“此里”。',
          maturity: 'baseline',
          sources: [{ label: 'docs/requirements-design.md', href: BASE + 'docs/requirements-design.md' }],
        },
        {
          id: 'prd-roles',
          title: '角色与权限模型',
          summary:
            '骑手、活动发起人、管理员；身份来源与权限边界。客户端传入的 openid、角色或本地缓存均不授予权限。',
          maturity: 'baseline',
          inline: 'roles',
        },
        {
          id: 'backlog',
          title: '产品路线图与澄清结论',
          summary:
            '发起人申请、完整通知闭环、凭证前缀、活动标签与模板、双主题、一句话更新日志六项澄清结论与推荐实施顺序。',
          maturity: 'baseline',
          sources: [{ label: 'docs/product-backlog-clarification-2026-10-13.md', href: BASE + 'docs/product-backlog-clarification-2026-10-13.md' }],
        },
        {
          id: 'brief-mrd',
          title: '项目背景与业务价值（精简 BRD/MRD）',
          summary:
            '仓库未沉淀立项书，仅由现有 README 可推断业务目标。此处合并呈现一页式模板，用于线下填写后再归档。',
          maturity: 'template',
          templateFields: [
            '目标俱乐部 / 骑手画像',
            '关键业务指标（场次、报名完成率、取消率）',
            '价值假设 / 替代方案（微信群、第三方 SaaS）',
            '核心边界（单俱乐部、不含支付、不含多租户）',
            '里程碑 / 风险 / 投入（线下文档，Git 不保存商业敏感信息）',
          ],
        },
        {
          id: 'biz-rules',
          title: '关键业务规则',
          summary:
            '活动状态遵循 draft ↔ published → finished；published 不等于允许报名；pending/approved/checked_in 占用名额。',
          maturity: 'baseline',
          inline: 'biz-rules',
        },
      ],
    },
    {
      id: 'design-ia',
      number: '03',
      title: '设计与体验',
      lead: '统一设计规范、可计算契约、交互原型与双端证据；结构以 Pages 为参照，可读性以契约为准。',
      cards: [
        {
          id: 'ui-spec',
          title: '全套 UI 改版设计稿（2026-10-14）',
          summary: '页面结构、阶段验收口径与截图问题对照；13 个 app.json 可达页面逐页核对。',
          maturity: 'baseline',
          sources: [{ label: 'docs/superpowers/specs/2026-10-14-full-ui-redesign.md', href: BASE + 'docs/superpowers/specs/2026-10-14-full-ui-redesign.md' }],
        },
        {
          id: 'theme-constraints',
          title: '统一设计规范与约束门禁',
          summary: '32 个双端变量、15 组对比度；深橙主操作白字 4.91:1，44px 控件，明确媒体按钮背景、安全区与 13 页截图口径。',
          maturity: 'baseline',
          sources: [
            { label: '统一设计规范', href: BASE + 'docs/design-system.md' },
            { label: '设计契约 JSON', href: BASE + 'docs/design-contract.json' },
            { label: '门禁脚本', href: BASE + 'scripts/check-design-contract.mjs' },
          ],
        },
        {
          id: 'prototype-entry',
          title: '13 个交互原型',
          summary: '与 app.json 路由一一对应，可键盘导航、带状态的 hash 深链；本中心保留此入口不改动。',
          maturity: 'baseline',
          sources: [
            { label: '原型首页', href: '#prototype' },
            { label: '骑友旅程', href: '#activities' },
            { label: '管理员旅程', href: '#admin-activity-list' },
          ],
        },
        {
          id: 'ui-sync',
          title: 'UI 同步清单',
          summary: 'v2 清单要求全部路由双端 PNG、同视口、状态与差异说明，并绑定 UI / Pages 内容摘要；截图完整不等于业务与真机通过。',
          maturity: 'baseline',
          sources: [
            { label: 'docs/ui-sync-manifest.json', href: BASE + 'docs/ui-sync-manifest.json' },
            { label: 'docs/evidence/ui-sync/', href: RAW + 'docs/evidence/ui-sync' },
            { label: '本轮双端截图与逐页差异', href: 'evidence/ui-sync/2026-10-16-design-acceptance/index.html' },
          ],
        },
        {
          id: 'design-history',
          title: '设计演进记录',
          summary: '2026-10-08 至 2026-10-14 的页面级设计 spec 与 plans，按时间线保留决策链路。',
          maturity: 'aggregated',
          sources: [
            { label: 'docs/superpowers/specs/', href: RAW + 'docs/superpowers/specs' },
            { label: 'docs/superpowers/plans/', href: RAW + 'docs/superpowers/plans' },
          ],
        },
      ],
    },
    {
      id: 'arch-ia',
      number: '04',
      title: '技术与架构',
      lead: '合并原“概要/详细设计/技术风险”为单一技术方案；数据契约、安全边界与云资源映射在同一入口。',
      cards: [
        {
          id: 'tech-plan',
          title: '技术方案（概要 + 详细 + 风险）',
          summary:
            '原生小程序 TS + 云开发；业务集合客户端全拒绝 ACL；敏感字段 AES-256-GCM；媒体 owner/canonical 校验；活动容量事务；通知 Outbox。',
          maturity: 'aggregated',
          inline: 'tech-plan',
        },
        {
          id: 'cloudbase-schema',
          title: 'CloudBase 数据契约',
          summary:
            '集合字段、索引、状态字段、错误码、个人信息展示规则与安全边界。响应统一为 { ok, data } 或 { ok, error }。',
          maturity: 'baseline',
          sources: [{ label: 'docs/cloudbase-schema.md', href: BASE + 'docs/cloudbase-schema.md' }],
        },
        {
          id: 'cloudbase-config',
          title: '云资源与函数清单',
          summary: '9 个云函数 + 共享领域；envId、运行时 Nodejs20.19、超时与内存配额在 cloudbaserc.json。',
          maturity: 'baseline',
          sources: [
            { label: 'cloudbaserc.json', href: BASE + 'cloudbaserc.json' },
            { label: 'cloudfunctions/', href: RAW + 'cloudfunctions' },
            { label: 'cloudstorage.rules.json', href: BASE + 'cloudstorage.rules.json' },
            { label: 'scripts/bootstrap-cloudbase.mjs', href: BASE + 'scripts/bootstrap-cloudbase.mjs' },
          ],
        },
        {
          id: 'module-map',
          title: '模块与数据流',
          summary:
            '小程序 pages / repositories / services / store；云函数 auth / activity-read / activity-admin / registration / admin-review / notification-send / profile / profile-media-cleanup / route-maintenance 职责分工。',
          maturity: 'aggregated',
          inline: 'module-map',
        },
        {
          id: 'external-apis',
          title: '外部接口（第三方集成）',
          summary:
            '仓库仅使用 Strava 公开路线链接（粘贴 + 规范化复制，不走 OAuth）与微信开放能力；其他外部接口无仓库证据。',
          maturity: 'template',
          templateFields: [
            'Strava 公开路线：粘贴 URL → 规范化复制，不读写私有数据',
            '微信能力：登录、动态手机号、订阅消息、`wx.scanCode`、`chooseLocation`、`writePhotosAlbum`',
            '若未来接入支付 / 短信 / 推送：按契约在此补齐 provider、鉴权方式、调用点、失败降级',
          ],
          sources: [
            { label: 'miniprogram/app.json', href: BASE + 'miniprogram/app.json' },
            { label: 'docs/strava-athlete-capacity.md', href: BASE + 'docs/strava-athlete-capacity.md' },
          ],
        },
      ],
    },
    {
      id: 'dev-std-ia',
      number: '05',
      title: '开发规范',
      lead: '沙箱配置、依赖安装、本地校验、代码交付规则。所有凭据按用途隔离，不入仓库。',
      cards: [
        {
          id: 'local-setup',
          title: '本地开发与依赖',
          summary:
            'Node.js 24、npm、微信开发者工具；`npm ci && npm run cloud:install && npm run validate`。真实值通过受控 Secret 注入，不加载 .env。',
          maturity: 'baseline',
          sources: [
            { label: 'README.md', href: BASE + 'README.md' },
            { label: 'package.json', href: BASE + 'package.json' },
            { label: '.env.example', href: BASE + '.env.example' },
          ],
        },
        {
          id: 'sandbox-config',
          title: '沙箱、密钥与凭据边界',
          summary:
            'Aime 沙箱 Secret / GitHub Actions Secret / CloudBase 云函数环境变量 / 仓库固定配置的职责划分；不在仓库、日志或聊天中泄露任何凭据。',
          maturity: 'baseline',
          sources: [{ label: 'docs/sandbox-environment-configuration.md', href: BASE + 'docs/sandbox-environment-configuration.md' }],
        },
        {
          id: 'lint-type-format',
          title: '格式 / Lint / 类型',
          summary:
            'Prettier、ESLint（@typescript-eslint）、TypeScript。validate 串行执行 format:check / lint / typecheck / test / 证据工具 / 云函数 / build。',
          maturity: 'baseline',
          inline: 'lint-cmds',
        },
        {
          id: 'commit-review',
          title: '分支、提交与评审规则',
          summary:
            '活跃任务通过 PR 合入 main，合并后删除分支；是否存在开放 PR 以 GitHub 实时状态为准；完整产品边界更新须同步主文档。',
          maturity: 'aggregated',
          inline: 'commit-rules',
        },
        {
          id: 'security-boundary',
          title: '安全与隐私边界',
          summary:
            '所有业务集合客户端拒绝；敏感字段 AES-256-GCM；日志、审计、证据不得包含 PII、密钥、密文或第三方凭证。',
          maturity: 'baseline',
          sources: [
            { label: 'docs/cloudbase-schema.md', href: BASE + 'docs/cloudbase-schema.md' },
            { label: 'cloudstorage.rules.json', href: BASE + 'cloudstorage.rules.json' },
          ],
        },
      ],
    },
    {
      id: 'test-ia',
      number: '06',
      title: '测试与验收',
      lead: '测试策略、质量门禁与真实环境验证手册；UAT 模板和外部签字以线下归档为准。',
      cards: [
        {
          id: 'e2e-acceptance',
          title: '从部署到端到端验收',
          summary: '最新主干 → 静态门禁 → 云端只读 smoke → Pages / 微信同视口校准 → PR / 开发版部署 → 普通成员写链路 → 双平台真机 UAT。',
          maturity: 'baseline',
          inline: 'e2e-acceptance',
          sources: [
            { label: '完整验收流程', href: BASE + 'docs/verification/wechat-devtools-e2e.md' },
            { label: '本轮实操与差异', href: BASE + 'docs/verification/2026-10-16-design-e2e-acceptance.md' },
            { label: '高优待验收项', href: BASE + 'docs/high-priority-issues.md' },
          ],
        },
        {
          id: 'test-strategy',
          title: '测试策略与命令矩阵',
          summary:
            '单元 + 共享 + 云函数 + 证据工具 + bootstrap + 部署脚本契约 + 发布记录；本地提交至少 `npm run validate`。',
          maturity: 'aggregated',
          inline: 'test-cmds',
        },
        {
          id: 'core-flow',
          title: '核心流程端到端验证',
          summary: '2026-10-09 历史记录：真实报名主链、数据库审计与失败补偿；当前验收以本页最新流程为准。',
          maturity: 'baseline',
          sources: [{ label: 'docs/verification/2026-10-09-core-flow-e2e.md', href: BASE + 'docs/verification/2026-10-09-core-flow-e2e.md' }],
        },
        {
          id: 'p0-journey',
          title: 'P0 真实报名旅程手册',
          summary: '完整报名、审批、凭证、取消与重报的现场验证手册与证据格式。',
          maturity: 'baseline',
          sources: [
            { label: 'docs/verification/p0-real-registration-journey.md', href: BASE + 'docs/verification/p0-real-registration-journey.md' },
            { label: 'docs/verification/wechat-devtools-e2e.md', href: BASE + 'docs/verification/wechat-devtools-e2e.md' },
          ],
        },
        {
          id: 'evidence',
          title: '发布与证据档案',
          summary:
            '7 个证据目录按主题归档：bright-ui / core-smoke / alignment-e2e / title-card-smoke / profile-smoke / gpx-upload / ui-sync。',
          maturity: 'aggregated',
          sources: [
            { label: 'docs/verification/', href: RAW + 'docs/verification' },
            { label: 'docs/evidence/', href: RAW + 'docs/evidence' },
          ],
        },
        {
          id: 'quality-gate',
          title: '质量门禁',
          summary:
            'validate / coverage / audit:all / check:design / check:ui-sync 组合成本地与 CI 门禁；写链路与物理真机另行验收。',
          maturity: 'baseline',
          inline: 'quality-gate',
        },
        {
          id: 'uat',
          title: 'UAT 验收口径（模板待补）',
          summary:
            '仓库未沉淀正式 UAT 签字文档。真机验收口径以 docs/high-priority-issues.md 中 P0 / P1 项为过程清单，正式签字模板如下。',
          maturity: 'template',
          templateFields: [
            '验收范围：引用具体 PR / 微信开发版版本号',
            '验收负责人（线下签字，不含手机号 / 身份证号）',
            'iOS / Android 真机覆盖：机型、系统版本、网络',
            '业务结论：通过 / 条件通过 / 不通过（含条件项）',
            '发现问题清单与跟进 Issue 编号',
            '签字日期与证据存档位置（线下 OA / 云盘，不进仓库）',
          ],
        },
      ],
    },
    {
      id: 'release-ia',
      number: '07',
      title: '发布与运维',
      lead: '微信链路：本地开发 → 开发版 → 体验版 / UAT → 正式版；运维联系人与审批人以模板呈现。',
      cards: [
        {
          id: 'wechat-pipeline',
          title: '微信小程序发布链路',
          summary:
            '本地开发 → 开发版自动上传（CI 成功后触发） → 体验版晋级证据门禁（两阶段 candidate / verified） → 正式版（公众平台人工审核与发布）。',
          maturity: 'baseline',
          inline: 'wechat-pipeline',
        },
        {
          id: 'ci-workflow',
          title: 'CI 工作流（.github/workflows）',
          summary:
            'ci.yml 验证 PR / main；deploy-miniprogram.yml 自动上传开发版；promote-miniprogram-experience.yml 两阶段晋级与回退演练。',
          maturity: 'baseline',
          sources: [
            { label: '.github/workflows/ci.yml', href: BASE + '.github/workflows/ci.yml' },
            { label: '.github/workflows/deploy-miniprogram.yml', href: BASE + '.github/workflows/deploy-miniprogram.yml' },
            { label: '.github/workflows/promote-miniprogram-experience.yml', href: BASE + '.github/workflows/promote-miniprogram-experience.yml' },
          ],
        },
        {
          id: 'ci-deployment',
          title: '微信开发版 CI 自动部署方案',
          summary: '把上传动作迁移到 GitHub Actions：PR→main→CI→开发版自动上传→公众平台核验；清理临时密钥。',
          maturity: 'baseline',
          sources: [{ label: 'docs/miniprogram-ci-deployment.md', href: BASE + 'docs/miniprogram-ci-deployment.md' }],
        },
        {
          id: 'experience-release',
          title: '固定体验版发布记录',
          summary:
            '只保存已在微信公众平台完成回读的 verified 清单；开发版滚动上传，体验版只能通过两阶段人工晋级；自动上传不得覆盖体验基线。',
          maturity: 'baseline',
          sources: [
            { label: 'docs/releases/experience/', href: RAW + 'docs/releases/experience' },
            { label: 'docs/releases/experience/README.md', href: BASE + 'docs/releases/experience/README.md' },
          ],
        },
        {
          id: 'rollback',
          title: '回滚与恢复',
          summary:
            '体验版支持 `restore_release_id` 从 verified / promote 清单恢复稳定版本；仓库中已有一次 rollback 清单的真实演练。',
          maturity: 'aggregated',
          sources: [
            { label: 'experience-rollback-0.0.85.1', href: BASE + 'docs/releases/experience/experience-rollback-0.0.85.1-4190831422cf-38073739247.json' },
          ],
        },
        {
          id: 'ops-contact',
          title: '运维通讯录与值班（模板待补）',
          summary:
            '仓库未保存值班表、SLA、生产审批人、线上通讯录。该信息涉及个人隐私，应放在线下 OA / 云盘，这里仅给出字段模板。',
          maturity: 'template',
          templateFields: [
            '产品负责人 / 技术负责人（姓名，不含手机号）',
            '微信公众平台管理员 / 发布审批人',
            'CloudBase 管理员 / 密钥轮换责任人',
            '值班表（周粒度，线下维护）',
            'SLA / 响应时效 / 升级路径（无线上监控平台时，先约定人工巡检频率）',
            '事故应急流程链接（线下文档）',
          ],
        },
        {
          id: 'release-approval',
          title: '上线审批（模板待补）',
          summary: '仓库没有生产发布的审批流水；对应信息须在线下走审批后，仅把发布 commit / 版本号写回仓库。',
          maturity: 'template',
          templateFields: [
            '发布版本号 / 对应 main SHA',
            '发布内容摘要（一句话更新日志）',
            '业务审批人（线下签字）',
            '技术审批人（线下签字）',
            '发布时间窗（避开真实骑行活动时段）',
            '回滚决策人与阈值（人工巡检发现问题时的回退口径）',
          ],
        },
      ],
    },
    {
      id: 'manuals-ia',
      number: '08',
      title: '版本与复盘',
      lead: '骑手 / 发起人 / 管理员操作手册、版本记录、Bug 聚合与复盘模板。',
      cards: [
        {
          id: 'manual-rider',
          title: '骑手操作手册',
          summary:
            '浏览活动 → 完善资料 → 提交报名 → 查看审批与凭证 → 现场签到。资料和照片按产品规则只对本人与管理员完整显示。',
          maturity: 'aggregated',
          inline: 'manual-rider',
        },
        {
          id: 'manual-organizer',
          title: '活动发起人操作手册',
          summary:
            '创建草稿 → 粘贴 Strava 链接 / 上传 GPX → 配置集合地点与分组容量 → 发布 / 下架 / 复制历史活动为新草稿。',
          maturity: 'aggregated',
          inline: 'manual-organizer',
        },
        {
          id: 'manual-admin',
          title: '管理员操作手册',
          summary:
            '审批列表筛选报名 → 按审核权限查看完整资料 → 通过 / 驳回（需填理由） → 签到。可查看全部活动并结束活动。',
          maturity: 'aggregated',
          inline: 'manual-admin',
        },
        {
          id: 'version-log',
          title: '版本记录',
          summary:
            '微信开发版 / 体验版的版本号与 commit 关联，统一记录在 docs/releases/experience/ 下的清单 JSON；设置页展示一句话更新日志。',
          maturity: 'baseline',
          sources: [
            { label: 'docs/releases/experience/', href: RAW + 'docs/releases/experience' },
            { label: 'miniprogram/pages/settings/', href: RAW + 'miniprogram/pages/settings' },
          ],
        },
        {
          id: 'bug-aggregation',
          title: 'Bug 聚合入口',
          summary:
            '仓库不单独维护 Bug 库：高优问题 / 遗留风险 → high-priority-issues.md；流水态 Bug → GitHub Issues / PR。',
          maturity: 'aggregated',
          sources: [
            { label: 'docs/high-priority-issues.md', href: BASE + 'docs/high-priority-issues.md' },
            { label: 'GitHub Issues', href: 'https://github.com/MengEn-Ink/cili-cycling-miniapp/issues', external: true },
            { label: 'GitHub Pull Requests', href: 'https://github.com/MengEn-Ink/cili-cycling-miniapp/pulls', external: true },
          ],
        },
        {
          id: 'retrospective',
          title: '版本复盘模板',
          summary:
            '仓库未沉淀通用复盘文档，这里提供可复用的字段模板，具体项目实施后手动归档到 docs/verification/ 单次记录。',
          maturity: 'template',
          templateFields: [
            '发布批次（引用版本号 / commit / 对应 CI run）',
            '业务结果（场次、报名、取消、投诉数量）',
            '技术结果（告警、异常、回滚次数）',
            '做得好的事（可持续）',
            '做得不好的事（下一次要改）',
            '后续动作（Issue / PR 关联）',
          ],
        },
      ],
    },
  ];

  // ---------- 行内展开内容 ----------

  // 把纯文本行列表包成 ul / 定义列表
  const ul = (items) => `<ul class="dc-list">${items.map((item) => `<li>${item}</li>`).join('')}</ul>`;
  const dl = (rows) =>
    `<dl class="dc-dl">${rows.map(([key, value]) => `<div><dt>${key}</dt><dd>${value}</dd></div>`).join('')}</dl>`;

  const inlineBlocks = {
    'e2e-acceptance': () => `
      <ol class="dc-pipeline">
        <li><b>固定基线</b><p>记录 main SHA、客户端版本、云环境、账号角色；检查 CI 与 Pages 部署状态。</p></li>
        <li><b>运行与校准</b><p><code>npm run test:devtools:e2e</code> 读取真实云数据并保存失败报告；使用 <code>?capture=viewport#activities</code> 采集同视口设计。</p></li>
        <li><b>约束门禁</b><p><code>npm run check:design</code> 校验变量与对比度；<code>npm run check:ui-sync -- --strict</code> 校验 13 页截图和内容摘要。</p></li>
        <li><b>部署后复验</b><p>PR / main CI → Pages → 微信开发版上传 → 设置页版本回读 → 同版本模拟器复测；普通成员写链路与 iOS/Android 真机单独记录。</p></li>
      </ol>`,
    'sdlc-matrix': () => `
      <div class="dc-matrix-scroll">
      <table class="dc-matrix">
        <thead><tr><th>阶段</th><th>仓库事实来源</th><th>成熟度</th></tr></thead>
        <tbody>
          <tr><td>01 项目总览</td><td>README.md · high-priority-issues.md</td><td><span class="dc-pill dc-pill-baseline">正式基线</span></td></tr>
          <tr><td>02 产品与需求</td><td>docs/requirements-design.md · product-backlog-clarification-2026-10-13.md</td><td><span class="dc-pill dc-pill-baseline">正式基线</span></td></tr>
          <tr><td>03 设计与体验</td><td>docs/superpowers/specs/*.md · 交互原型</td><td><span class="dc-pill dc-pill-baseline">正式基线</span></td></tr>
          <tr><td>04 技术与架构</td><td>docs/cloudbase-schema.md · cloudbaserc.json · cloudfunctions/</td><td><span class="dc-pill dc-pill-aggregated">事实索引</span></td></tr>
          <tr><td>05 开发规范</td><td>README.md · sandbox-environment-configuration.md · package.json</td><td><span class="dc-pill dc-pill-baseline">正式基线</span></td></tr>
          <tr><td>06 测试与验收</td><td>docs/verification/* · docs/evidence/* · package.json scripts</td><td><span class="dc-pill dc-pill-baseline">正式基线</span></td></tr>
          <tr><td>07 发布与运维</td><td>.github/workflows/* · docs/miniprogram-ci-deployment.md · docs/releases/experience/</td><td><span class="dc-pill dc-pill-baseline">正式基线</span></td></tr>
          <tr><td>08 版本与复盘</td><td>docs/releases/experience/ · GitHub Issues / PR</td><td><span class="dc-pill dc-pill-aggregated">事实索引</span></td></tr>
          <tr><td>立项 / BRD / MRD / UAT 签字 / 运维通讯录 / 上线审批</td><td>—</td><td><span class="dc-pill dc-pill-template">模板待补</span></td></tr>
        </tbody>
      </table>
      </div>`,
    roles: () =>
      dl([
        ['骑手', '身份来源：CloudBase WXContext.OPENID。权限：浏览活动、维护本人资料和照片、报名、查看凭证、取消报名、查看公开骑行名片。'],
        ['活动发起人', '任意已登录用户；活动 created_by 由服务端写入。权限：创建和编辑本人草稿、发布 / 下架、从本人历史活动复制草稿。'],
        ['管理员', '来源：admins 白名单（CloudBase 控制台维护，无管理界面）。权限：管理并结束全部活动、查看报名、通过 / 驳回、签到。'],
      ]),
    'biz-rules': () =>
      ul([
        '活动状态：draft ↔ published → finished；finished 为终态。',
        'status=published 与“允许报名”是两件事；由服务端按活动时间、截止、总 / 分仓容量、费用、必要司机计算 registration_state。',
        '报名状态：pending → approved → checked_in；pending → rejected；pending/approved → cancelled；rejected/cancelled → pending（可沿用同一条记录重报）。',
        'pending + approved + checked_in 占用名额；驳回或取消释放名额。',
        '本人与审核管理员完整显示实名和电话，其他骑友只见昵称；后援车司机电话公开完整显示。',
      ]),
    'tech-plan': () => `
      <div class="dc-grid-2">
        <article class="dc-sub"><h4>概要</h4><p>原生微信小程序（TypeScript / WXML / WXSS）+ 微信云开发（CloudBase）。业务数据库集合客户端全拒绝，仅云函数访问；云存储按 owner 绑定 staging 路径。</p></article>
        <article class="dc-sub"><h4>详细</h4><p>9 个云函数按领域拆分：auth / activity-read / activity-admin / registration / admin-review / notification-send / profile / profile-media-cleanup / route-maintenance。响应统一为 { ok, data } 或 { ok, error }。活动容量在事务中更新；通知走 Outbox + 租约 + 退避。</p></article>
        <article class="dc-sub"><h4>关键风险</h4>${ul([
          'UGC 内容安全闭环未统一接入 msgSecCheck / mediaCheckAsync。',
          '当前 runtime 固定一个 CloudBase EnvID，缺少开发 / 测试 / 生产的多环境隔离。',
          '合规检查未变成发布门禁；备案状态、服务类目、隐私保护指引需加入提审清单。',
          '文档漂移：产品已移除内嵌 Route Embed，部分旧表述仍需后续契约测试保护。',
        ])}</article>
        <article class="dc-sub"><h4>性能与可靠性</h4>${ul([
          '媒体回收、通知发送、GPX 预览消费、活动容量：租约 / 幂等键 / 事务。',
          '活动与资料 TTL、冷启动持久化、断网兜底、临时图片 URL 刷新均已有自动化。',
          '旧账号指标缓存命名空间整体失效，避免跨账号展示。',
        ])}</article>
      </div>`,
    'module-map': () => `
      <div class="dc-grid-2">
        <article class="dc-sub"><h4>miniprogram/</h4>${ul([
          'pages/ — 13 个 app.json 路由',
          'components/ — 复用组件（活动卡、报名表单段、骑手卡）',
          'repositories/ — 封装对云函数的调用',
          'services/ — 领域服务（身份、报名、路线）',
          'store/ — 全局运行态',
          'models/ — 视图模型与类型',
          'utils/ — 工具函数',
          'config/ — 环境与功能开关',
        ])}</article>
        <article class="dc-sub"><h4>cloudfunctions/</h4>${ul([
          'auth — 身份与管理员白名单校验',
          'activity-read — 活动列表与详情（含 listPage envelope）',
          'activity-admin — 发起人与管理员的写入与状态扭转',
          'registration — 报名、取消、重报，容量事务',
          'admin-review — 审批通过 / 驳回 / 签到',
          'notification-send — Outbox 消费 + 微信订阅消息',
          'profile — 本人资料、PII 加解密、媒体校验',
          'profile-media-cleanup — 媒体回收定时任务',
          'route-maintenance — 路线文件回收 / 历史迁移',
          'shared/ — 报名领域共享源码',
        ])}</article>
      </div>`,
    'lint-cmds': () =>
      dl([
        ['格式', '<code>npm run format:check</code> · Prettier'],
        ['Lint', '<code>npm run lint</code> · ESLint + @typescript-eslint'],
        ['类型', '<code>npm run typecheck</code> · tsc --noEmit'],
        ['测试', '<code>npm test</code> · Vitest；<code>npm run test:cloud</code> 云函数'],
        ['合流门禁', '<code>npm run validate</code> 串行执行格式 / Lint / 类型 / 测试 / 证据工具 / bootstrap / 部署脚本 / 云函数 / build'],
      ]),
    'commit-rules': () =>
      ul([
        '活跃任务通过 PR 合入 main；合并后分支必须删除。',
        '是否存在开放 PR 以 GitHub 实时状态为准，不以本地记忆为准。',
        '产品需求或状态机变化：更新 docs/requirements-design.md；数据契约变化：更新 docs/cloudbase-schema.md。',
        '单次发布的测试、预览、部署和 smoke 证据：按 docs/verification/README.md 新增不可变记录。',
        '`.pai/`、`.superpowers/`、`.trae/` 仅用于本地工具运行，必须保持未跟踪状态。',
      ]),
    'test-cmds': () =>
      dl([
        ['单元', '<code>npm test</code> · Vitest（小程序 + 共享领域）'],
        ['云函数', '<code>npm run test:cloud</code>'],
        ['覆盖率', '<code>npm run coverage</code> + <code>check-cloud-coverage.mjs</code>'],
        ['发布脚本契约', '<code>npm run test:deploy</code>'],
        ['证据工具', '<code>npm run test:journey-evidence</code>'],
        ['Bootstrap', '<code>npm run test:bootstrap</code>'],
        ['发布记录', '<code>npm run check:experience-releases</code> · <code>npm run check:release-notes</code>'],
        ['UI 同步', '<code>npm run check:ui-sync</code>'],
        ['设计约束', '<code>npm run test:design</code> · <code>npm run check:design</code>'],
        ['模拟器实操', '<code>npm run test:devtools:e2e</code> · 真实云端只读，13 页截图'],
        ['CloudBase 规划 / 校验', '<code>npm run cloudbase:plan</code> → 人工审核 → <code>cloudbase:apply</code> → <code>cloudbase:verify</code>'],
        ['真机验证', '按 <code>docs/verification/p0-real-registration-journey.md</code> 现场执行'],
      ]),
    'quality-gate': () =>
      ul([
        '<code>npm run validate</code>：合流前本地强制门禁。',
        '<code>npm run coverage</code>：覆盖率门禁 + 云函数覆盖检查。',
        '<code>npm run audit:all</code>：根项目与所有云函数的 high 级依赖审计。',
        '<code>npm run check:ui-sync</code>：UI 同步清单与原型页面覆盖。',
        '<code>npm run check:design</code>：双端变量、浅色文字与操作对比度；包含在 validate。',
        '<code>npm run check:experience-releases</code>：体验版清单一致性。',
        'GitHub CI：ci.yml 对 PR 和 main 均执行同一套 validate。',
      ]),
    'wechat-pipeline': () => `
      <ol class="dc-pipeline">
        <li><b>本地开发</b><p>微信开发者工具导入仓库根目录；按 README 走 <code>npm ci && npm run cloud:install && npm run validate</code>。</p></li>
        <li><b>开发版（滚动）</b><p>main CI 成功后自动触发 deploy-miniprogram.yml，使用 Secret 中的 CI 私钥调用 miniprogram-ci；也可手动触发恢复模式。</p></li>
        <li><b>体验版 / UAT</b><p>promote-miniprogram-experience.yml 两阶段：candidate 生成晋级候选 → verified 记录微信公众平台回读。UAT 真机验收以此阶段为准。</p></li>
        <li><b>正式版</b><p>微信公众平台人工提审 → 发布。审核政策与时长以平台当前页面为准，不在仓库写死。</p></li>
      </ol>`,
    'manual-rider': () =>
      ul([
        '在“活动”页浏览未来 / 进行中活动；切换“历史活动”查看已结束场次。',
        '在“我的”完成微信云身份验证，补齐昵称、实名、手机号、紧急联系人、头像与照片。',
        '在活动详情点“立即报名”进入报名页，选择集合方式和骑行经验，提交后进入待审核。',
        '在“行程”查看审批状态；通过后在“凭证”查看集合信息并出示给管理员签到。',
        '需要重新报名时，取消或驳回后沿用同一记录再次提交。',
      ]),
    'manual-organizer': () =>
      ul([
        '在“我的 → 我的活动”创建草稿，填写标题、图集、说明、行程节点、集合地点、费用、装备、时间与容量。',
        '粘贴 Strava 公开路线 URL 或上传 GPX；两者可并存，仅支持复制规范化链接，不跳转第三方页面。',
        '发布前服务端会校验标题、起止时间与路线起终点；容量 / 分仓 / 司机 / 截止时间 / 费用未补齐时活动仍可预告，但报名保持关闭。',
        '本人历史活动可复制为新草稿，但必须重新填写日期；已发布活动可下架回草稿。',
      ]),
    'manual-admin': () =>
      ul([
        '在管理员入口查看全部活动与报名；可按状态筛选 pending / approved / checked_in / rejected / cancelled。',
        '在审批详情按审核权限查看完整实名与电话、手机号来源、骑行照片、经验与集合方式；公开验收截图另行脱敏。',
        '通过 / 驳回；驳回必须填写理由；驳回或取消释放名额。',
        '对 approved 报名执行签到（checked_in）；重复签到幂等。',
        '可结束活动，结束后为终态；活动结束后次日自动归档到历史活动视图。',
      ]),
  };

  // ---------- 渲染 ----------

  function cardHtml(card) {
    const m = maturity[card.maturity];
    const pill = `<span class="dc-pill dc-pill-${card.maturity}" title="${m.hint}">${m.label}</span>`;
    const sources = card.sources
      ? `<div class="dc-sources">${card.sources
          .map(
            (src) => {
              const external = src.external || /^https?:/.test(src.href) && !src.href.startsWith('#');
              return `<a href="${src.href}" ${external ? 'target="_blank" rel="noreferrer"' : ''}><span>${src.label}</span></a>`;
            },
          )
          .join('')}</div>`
      : '';
    const tmpl = card.templateFields
      ? `<details class="dc-template"><summary>待补字段 · ${card.templateFields.length} 项</summary><ul>${card.templateFields.map((item) => `<li>${item}</li>`).join('')}</ul></details>`
      : '';
    const inline = card.inline && inlineBlocks[card.inline]
      ? `<details class="dc-inline"><summary>展开查看聚合内容</summary><div class="dc-inline-body">${inlineBlocks[card.inline]()}</div></details>`
      : '';
    return `
      <article class="dc-card" id="dc-${card.id}">
        <header class="dc-card-head">
          <h3>${card.title}</h3>
          ${pill}
        </header>
        <p class="dc-card-body">${card.summary}</p>
        ${inline}
        ${tmpl}
        ${sources}
      </article>`;
  }

  function categoryHtml(category, index) {
    const cards = category.cards.map(cardHtml).join('');
    return `
      <section class="dc-category" id="${category.id}">
        <header class="dc-cat-head">
          <span class="dc-cat-number">${category.number}</span>
          <div>
            <h2>${category.title}</h2>
            <p>${category.lead}</p>
          </div>
          <div class="dc-cat-count">
            <b>${category.cards.length}</b>
            <span>份文档</span>
          </div>
        </header>
        <div class="dc-card-grid">${cards}</div>
      </section>`;
  }

  function summaryStats() {
    const totals = { baseline: 0, aggregated: 0, template: 0 };
    categories.forEach((cat) => cat.cards.forEach((card) => (totals[card.maturity] += 1)));
    const total = totals.baseline + totals.aggregated + totals.template;
    return { totals, total };
  }

  function navHtml() {
    return `<nav class="dc-nav" aria-label="研发交付中心分类导航">${categories
      .map(
        (cat) => `<a href="#${cat.id}"><b>${cat.number}</b><span>${cat.title}</span><em>${cat.cards.length} 份</em></a>`,
      )
      .join('')}</nav>`;
  }

  function heroHtml() {
    const { totals, total } = summaryStats();
    return `
      <section class="dc-hero" id="delivery">
        <div class="dc-hero-left">
          <p class="eyebrow">05 · 研发交付中心</p>
          <h2>按 SDLC 八大类聚合整个项目的文档事实</h2>
          <p class="lead">把 README、需求、设计、数据契约、工作流、发布记录、运维约定收口到一个可维护目录，并明确每份文档是正式基线、事实索引还是模板待补。</p>
          <div class="dc-hero-actions">
            <a class="btn" href="#overview-ia">从 01 项目总览开始</a>
            <a class="btn-secondary" href="#prototype">查看 13 个交互原型</a>
          </div>
        </div>
        <aside class="dc-hero-right">
          <div class="dc-stat"><b>${total}</b><span>份文档</span></div>
          <ul class="dc-legend">
            <li><span class="dc-pill dc-pill-baseline">正式基线</span><em>${totals.baseline}</em><p>仓库主文档或代码事实可直接读取</p></li>
            <li><span class="dc-pill dc-pill-aggregated">事实索引</span><em>${totals.aggregated}</em><p>由多处零散事实聚合，做二次组织</p></li>
            <li><span class="dc-pill dc-pill-template">模板待补</span><em>${totals.template}</em><p>仓库未提供事实，仅给出待补字段</p></li>
          </ul>
        </aside>
      </section>`;
  }

  function deliveryHtml() {
    return [heroHtml(), navHtml(), ...categories.map(categoryHtml)].join('\n');
  }

  // 对外暴露：由 app.js 的 renderOverview() 注入这段 HTML，
  // 以及把 category id 加入 overviewSections 以支持 hash 导航。
  window.deliveryCenter = {
    categoryIds: categories.map((cat) => cat.id),
    extraOverviewAnchors: ['delivery', ...categories.map((cat) => cat.id)],
    render: deliveryHtml,
  };
})();
