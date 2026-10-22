(() => {
  const data = window.prototypeData;
  const templates = window.pageTemplates;
  const deliveryCenter = window.deliveryCenter;
  const pageById = new Map(data.pages.map((page) => [page.id, page]));
  const tabRoutes = ['activities', 'registrations', 'profile'];
  const baseOverviewSections = [
    'overview',
    'story-hook',
    'audience',
    'product',
    'journey-rider',
    'journey-organizer',
    'privacy',
    'pipeline',
    'roadmap',
    'delivery',
    'requirements',
    'prd',
    'guide',
    'deploy',
    'prototype',
    'planned',
  ];
  const overviewSections = new Set([
    ...baseOverviewSections,
    ...((deliveryCenter && deliveryCenter.extraOverviewAnchors) || []),
  ]);
  const setupSteps = [
    ['01', '先定目标与主体', '确认核心用户、服务范围、是否商用，再选择个人或企业主体；名称、简介、类目和实际功能保持一致。'],
    ['02', '注册并取得 AppID', '在微信公众平台注册小程序；AppID 位于“开发—开发设置”，它是项目标识，不是服务端密钥。'],
    ['03', '选择技术路线', '简单项目优先原生小程序；需要跨端复用再评估 Taro/uni-app；希望少运维可选微信云开发。'],
    ['04', '搭建开发环境', '安装 Node.js、微信开发者工具与 Git，导入项目后先跑模拟器，再做真机预览和弱网验证。'],
    ['05', '划清数据边界', '敏感写操作进云函数；客户端不保存 AppSecret，只申请完成当前动作所需的最小权限。'],
    ['06', '并行准备合规', '开发同时确认服务类目、备案、用户隐私保护指引和内容安全方案，避免完成后再返工。'],
    ['07', '测试关键旅程', '覆盖游客浏览、登录授权、图片上传、数据保存、分享、失败重试，以及不同机型和网络。'],
    ['08', '上传并提交审核', '开发者工具上传代码，在小程序后台提交审核；版本备注应准确描述本次用户可见变化。'],
    ['09', '发布与持续运营', '审核通过后仍需执行发布；上线后监控错误、成本、内容安全结果，并保留可回滚版本。'],
  ];
  const stackChoices = [
    ['原生小程序', '首选', '微信能力直连、包体可控，适合单端和中小团队；此里采用这条路线。'],
    ['跨端框架', '按需', '已有 React/Vue 团队且必须复用多端代码时评估，同时预算平台差异与调试成本。'],
    ['微信云开发', '低运维', '数据库、存储和云函数一体化，适合快速上线；仍需做环境隔离、权限规则和成本监控。'],
    ['自建后端', '高控制', '需要复杂集成或独立基础设施时选择，同时承担服务器、域名、安全和运维责任。'],
  ];
  const coreVariables = [
    ['AppID', '微信公众平台 → 开发 → 开发设置', '项目标识；可进入 project.config.json'],
    ['CloudBase EnvID', 'GitHub Environment Variable：CLOUDBASE_ENV_ID', '非敏感环境标识；必须与 cloudbaserc.json 一致'],
    ['小程序 CI 私钥', 'GitHub Secret：WECHAT_MINIPROGRAM_PRIVATE_KEY', '只在微信上传工作流中写入临时文件，结束时清理'],
    ['CloudBase API Key', 'GitHub Environment Secret：CLOUDBASE_API_KEY', '环境级部署凭证；不进入 Aime、仓库、Artifact 或日志'],
  ];
  const deploySteps = [
    [1, 'PR 门禁', '格式、类型、测试、覆盖率与依赖审计全部通过后才允许合入。', 'gate'],
    [2, '合入 main', '受保护分支拒绝直接推送、强推和未通过检查的变更。', 'gate'],
    [3, 'main CI 复验', '用合并后的真实提交再次运行完整门禁，并生成变更范围判定。', 'gate'],
    [4, 'CloudBase', '只部署受影响的基线与云函数，完成后回读函数和基础设施状态。', 'cloud'],
    [5, '微信开发版', '仅小程序变更触发上传，使用临时私钥并留下版本与 receipt。', 'wechat'],
    [6, 'GitHub Pages', 'docs 变更由 Pages 独立发布，交付中心与代码事实保持同一提交。', 'pages'],
    [7, '三端验收', '核对 CI、CloudBase、微信开发版与 Pages 均指向当前 main。', 'verify'],
  ];
  const githubDeployConfig = [
    ['CLOUDBASE_API_KEY', 'Environment Secret', 'CloudBase 环境级 API Key；敏感、不可回读'],
    ['CLOUDBASE_ENV_ID', 'Environment Variable', '目标环境 ID；必须匹配 cloudbaserc.json'],
    ['CLOUDBASE_REGION', 'Environment Variable', '目标地域，例如 ap-shanghai'],
    ['WECHAT_MINIPROGRAM_PRIVATE_KEY', 'Repository / Environment Secret', '微信开发版上传私钥；保持完整多行内容'],
  ];
  const projectAudit = [
    ['P0', '补齐 UGC 内容安全闭环', '活动标题、说明、昵称和图片目前未见统一安全检查入口；建议在云函数写入前集中接入 msgSecCheck / mediaCheckAsync，并保留审核结果与失败策略。'],
    ['P1', '把合规检查变成发布门禁', '将备案状态、服务类目、隐私保护指引与实际接口调用的核对加入提审清单；规则以公众平台当前提示为准。'],
    ['P1', '明确多环境映射', '当前 runtime.ts 固定一个 CloudBase EnvID；在准备正式环境前建立开发/测试/生产映射与防误连校验。'],
    ['P2', '持续清理文档漂移', '产品已移除内嵌 Route Embed，但部分说明仍沿用旧表述；本次先修 README 与需求文档，后续由契约测试保护关键能力描述。'],
  ];
  const routeHistory = [];
  let currentRoute = 'activities';
  let currentState = '';
  let toastTimer;

  const $ = (selector) => document.querySelector(selector);
  const container = $('#screen-container');
  const nav = $('#screen-nav');
  const modal = $('#prototype-modal');
  const toast = $('#demo-toast');
  const demo = $('#demo');
  const overview = $('#overview-view');

  const queryParams = new URLSearchParams(window.location.search);
  if (queryParams.has('capture')) document.body.classList.add('capture');
  if (queryParams.get('capture') === 'viewport') document.body.classList.add('capture-viewport');
  if (queryParams.get('viewport') === '340') document.body.classList.add('is-narrow');

  /* ---------- 对比度（WCAG 2.1 相对亮度），直接读取 CSS 变量计算 ---------- */
  const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const luminance = (hex) => {
    const value = hex.replace('#', '');
    const channel = (offset) => {
      const c = parseInt(value.slice(offset, offset + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
  };
  const ratio = (a, b) => {
    const [l1, l2] = [luminance(cssVar(a)), luminance(cssVar(b))].sort((x, y) => y - x);
    return (l1 + 0.05) / (l2 + 0.05);
  };
  const contrastRows = [
    ['正文 / 标题', '--color-text', '--color-surface', 4.5, '卡片正文、标题、输入值'],
    ['正文 / 页面底', '--color-text', '--color-bg', 4.5, '页面标题'],
    ['正文 / 灰底', '--color-text', '--color-raised', 4.5, '灰底标签“默认 / 本人可见”'],
    ['次要文字', '--color-muted', '--color-surface', 4.5, '标签—值行的标签、说明'],
    ['次要文字 / 页面底', '--color-muted', '--color-bg', 4.5, '页面副标题'],
    ['次要文字 / 灰底', '--color-muted', '--color-raised', 4.5, '中性提示条、已结束标签'],
    ['占位文字', '--color-placeholder', '--color-surface', 4.5, '输入框 placeholder（只放在白底）'],
    ['禁用文字', '--color-disabled-text', '--color-raised', 4.5, '禁用按钮'],
    ['主按钮', '--color-on-action', '--color-action', 4.5, '深行动红底白字主按钮、选中项'],
    ['黑底辅助文字', '--color-media-muted', '--color-media-card-bg', 4.5, '黑底信息条的时间、地点'],
    ['当前步骤', '--color-on-brand', '--color-brand', 4.5, '品牌红底近黑字步骤条'],
    ['错误说明', '--color-brand-active', '--color-surface', 4.5, '白底卡片内的字段错误说明'],
    ['成功色 / 白底', '--color-status-success', '--color-surface', 4.5, '复制成功等行内提示文字'],
    ['成功色 / 页面底', '--color-status-success', '--color-bg', 4.5, '成功色文字放在页面底时'],
    ['成功色 / 灰底', '--color-status-success', '--color-raised', 4.5, '成功色文字放在灰底时'],
    ['成功小标签', '--color-status-success', '--color-status-success-soft', 4.5, '“✓ 已通过”标签'],
    ['警告色 / 白底', '--color-status-warning', '--color-surface', 4.5, '提醒文字'],
    ['警告色 / 页面底', '--color-status-warning', '--color-bg', 4.5, '提醒文字放在页面底时'],
    ['警告色 / 灰底', '--color-status-warning', '--color-raised', 4.5, '提醒文字放在灰底时'],
    ['提醒小标签', '--color-status-warning', '--color-status-warning-soft', 4.5, '“⚠ 即将截止 / 名额紧张 / 可能过期”'],
    ['品牌红线条', '--color-brand', '--color-surface', 3, '待审核描边、信息条短线（非文字）'],
    ['控件描边', '--color-border-strong', '--color-surface', 3, '卡片 / 输入框 / 按钮 2px 描边'],
  ];

  function renderOverview() {
    const pageCards = data.pages
      .map(
        (page, index) =>
          `<a href="#${page.id}"><small>${String(index + 1).padStart(2, '0')} · ${page.group} · ${page.path}</small><b>${page.title}</b><p>${page.copy}</p><p>关键状态：${page.states.map(([, label]) => label).join(' / ')}</p></a>`,
      )
      .join('');
    const setupTimeline = setupSteps
      .map(
        ([number, title, description]) =>
          `<article class="guide-step"><span>${number}</span><h3>${title}</h3><p>${description}</p></article>`,
      )
      .join('');
    const stackCards = stackChoices
      .map(
        ([title, badge, description]) =>
          `<article class="stack-choice"><div><h3>${title}</h3><span>${badge}</span></div><p>${description}</p></article>`,
      )
      .join('');
    const variableRows = coreVariables
      .map(
        ([name, source, usage]) =>
          `<tr><th scope="row"><code>${name}</code></th><td>${source}</td><td>${usage}</td></tr>`,
      )
      .join('');
    const auditRows = projectAudit
      .map(
        ([priority, title, description]) =>
          `<article class="audit-item"><span class="audit-priority audit-${priority.toLowerCase()}">${priority}</span><div><h3>${title}</h3><p>${description}</p></div></article>`,
      )
      .join('');
    const deployFlow = deploySteps
      .map(
        ([number, title, description, lane]) =>
          `<article class="deploy-step deploy-step-${lane}" style="--deploy-order:${number}"><span>${String(number).padStart(2, '0')}</span><b>${title}</b><p>${description}</p></article>`,
      )
      .join('');
    const deployConfigRows = githubDeployConfig
      .map(
        ([name, type, purpose]) =>
          `<tr><th scope="row"><code>${name}</code></th><td>${type}</td><td>${purpose}</td></tr>`,
      )
      .join('');
    const contrast = contrastRows
      .map(([name, fg, bg, min, usage]) => {
        const value = ratio(fg, bg);
        const pass = value >= min;
        return `<tr><td>${name}</td><td><span class="swatch" style="background:var(${fg})"></span><code>${fg}</code> ${cssVar(fg)}</td><td><span class="swatch" style="background:var(${bg})"></span><code>${bg}</code> ${cssVar(bg)}</td><td><b class="pass ${pass ? '' : 'is-fail'}">${value.toFixed(2)} : 1</b></td><td>${min} : 1 ${pass ? '通过' : '不通过'}</td><td>${usage}</td></tr>`;
      })
      .join('');
    const roleScopeLabel = (scope) =>
      scope === '平台后台' ? '平台后台' : scope === '非会员' ? '非会员' : '俱乐部内部';
    const roleCanPublishLabel = (value) =>
      value === 'platform'
        ? '跨俱乐部发布 / 审核'
        : value === 'club'
          ? '可代俱乐部发布'
          : '不能发布';
    const rolesRows = (data.rolesMatrix || [])
      .map(
        (role) =>
          `<tr><th scope="row"><code>${role.key}</code><br/><span>${role.cn}</span></th><td>${roleScopeLabel(role.scope)}</td><td>${roleCanPublishLabel(role.canPublish)}</td><td>${role.note}</td></tr>`,
      )
      .join('');
    const plannedScreens = Array.isArray(data.plannedScreens) ? data.plannedScreens : [];
    const plannedByPriority = (level) =>
      plannedScreens
        .filter((screen) => screen.status === level)
        .map(
          (screen) =>
            `<article class="planned-card planned-${screen.status}"><header><span class="planned-priority">${screen.status.toUpperCase()}</span><span class="planned-group">${screen.group}</span></header><h3>${screen.title}</h3><p>${screen.note}</p><footer><span class="planned-role">${screen.role.join(' · ')}</span><code>${screen.code}</code></footer></article>`,
        )
        .join('');
    const plannedP0Cards = plannedByPriority('p0');
    const plannedP1Cards = plannedByPriority('p1');
    const stats = data.experienceStats || {};
    overview.innerHTML = `
      <article class="story" aria-label="此里研发交付中心技术长读">

      <section class="journal-overview-hero" aria-label="骑行影像志正式版本">
        <div class="journal-overview-media" data-image-fallback>
          <img src="./designs/2026-10-22-cycling-image-journal/assets/mountain.webp" alt="山路骑行影像" onerror="this.closest('[data-image-fallback]').classList.add('is-image-error')" />
          <span class="journal-image-fallback" role="img" aria-label="骑行影像暂不可用"><i aria-hidden="true"></i><b>此里 CILI</b><small>骑行影像暂不可用</small></span>
        </div>
        <div class="journal-overview-copy">
          <p class="story-eyebrow">当前正式 Pages · 2026.10.22</p>
          <h2>把每一次出发，<br/>留成一页骑行影像志</h2>
          <p>17 条正式路由已统一为摄影与编辑式长屏。先看最终骑友体验，也可继续阅读下方技术文章、交付证据与历史设计。</p>
          <div class="journal-overview-actions"><a class="btn" href="#profile">从“我的”开始</a><a class="btn-secondary" href="#activities">浏览活动影像</a></div>
        </div>
      </section>

      <section class="story-hook" id="story-hook">
        <p class="story-eyebrow">研发交付中心 · 技术长读 · 当前基线同步 main</p>
        <h2 class="story-headline">一次骑行从被想到<br/>到真的发车，中间要过几道关？</h2>
        <div class="story-hook-questions" role="list" aria-label="开篇三个问题">
          <article role="listitem">
            <span class="story-q">Q1</span>
            <h3>骑友周末想找条路，为什么不是直接扫个群接龙？</h3>
            <p>微信群接龙没有权限、没有凭证、没有审批、没有照片担保；一旦有人没来、有人没名额，组织者就得人肉对账。本页第 3 章用一张动态图回答。</p>
          </article>
          <article role="listitem">
            <span class="story-q">Q2</span>
            <h3>把一次活动交给代码，要不要做成互联网产品那套？</h3>
            <p>一个俱乐部的小圈子不需要租户、不需要支付、不需要内嵌第三方页。看第 2 章产品边界与第 5 章隐私边界，答案是「做减法 + 服务端判权」。</p>
          </article>
          <article role="listitem">
            <span class="story-q">Q3</span>
            <h3>只有一个人维护，怎么保证代码上线不翻车？</h3>
            <p>答案是把部署凭证留在 GitHub、三端并行发布、每一步都留回读证据。第 6 章把 PR → CloudBase / 微信 / Pages 的七步拆开。</p>
          </article>
        </div>

        <nav class="story-map" aria-label="阅读地图">
          <p class="story-eyebrow">阅读地图 · 本页 7 章 · 每章先给结论再讲机制</p>
          <ol class="story-map-list">
            <li><a href="#audience"><b>01</b><span>你是哪一类读者？</span><em>骑友 / 组织者 / 开发者 三入口</em></a></li>
            <li><a href="#product"><b>02</b><span>产品全貌</span><em>做什么 / 不做什么 / 活动状态机</em></a></li>
            <li><a href="#journey-rider"><b>03</b><span>骑手旅程</span><em>发现 → 判断 → 报名 → 凭证 → 签到</em></a></li>
            <li><a href="#journey-organizer"><b>04</b><span>组织者旅程</span><em>创建 → 路线 → 审批 → 现场</em></a></li>
            <li><a href="#privacy"><b>05</b><span>隐私与产品边界</span><em>公开卡片字段 · Strava OAuth 退役</em></a></li>
            <li><a href="#pipeline"><b>06</b><span>七步交付链路</span><em>PR → CloudBase / 微信 / Pages</em></a></li>
            <li><a href="#prototype"><b>07</b><span>原型与证据</span><em>17 个正式路由 + 21 个原型 / 38 个画面 + 对比截图</em></a></li>
            <li><a href="#planned"><b>08</b><span>规划能力地图</span><em>6 角色矩阵 + 15 页 design-only</em></a></li>
          </ol>
          <p class="story-map-foot">八大类文档索引保留在页面末尾的 <a href="#delivery">研发交付中心</a>；仓库里的所有事实、源码与证据可以从那里收口。</p>
        </nav>
      </section>

      <section class="story-section" id="audience">
        <p class="story-eyebrow">01 · 你是哪一类读者</p>
        <h2 class="story-h2">先给结论：三种人进来，走三条路</h2>
        <p class="story-lead">产品、工程、组织协作的事实都在同一个 Pages。但不同角色关心的是不同切片：骑友想知道「我报名能靠谱吗」，组织者想知道「我创建的活动能被看见和被审」，开发者想知道「我提交代码之后发生了什么」。</p>
        <div class="audience-grid">
          <article class="audience-card audience-rider">
            <span class="audience-tag">骑友</span>
            <h3>我周末骑一次，中间会被怎样处理？</h3>
            <ul class="audience-steps">
              <li><a href="#journey-rider">看第 3 章：骑手完整旅程动图</a></li>
              <li><a href="#activities">体验原型：活动列表 → 详情 → 报名</a></li>
              <li><a href="#privacy">看第 5 章：我被看到的只有昵称、头像、照片</a></li>
            </ul>
            <p class="audience-hint">本人与审核管理员才看得到完整实名和电话；其他骑友只看到昵称和公开照片。</p>
          </article>
          <article class="audience-card audience-organizer">
            <span class="audience-tag">组织者</span>
            <h3>我要发车，怎么把路线、名额和审批放上来？</h3>
            <ul class="audience-steps">
              <li><a href="#journey-organizer">看第 4 章：创建 → 路线 → 审批 → 现场</a></li>
              <li><a href="#admin-activity-list">体验原型：我的活动管理与审批</a></li>
              <li><a href="#roadmap">看路线图：组织地基与审批（M0 待实施，原型已交付）</a></li>
            </ul>
            <p class="audience-hint">Strava 公开链接或 GPX 二选一都能用；小程序只复制规范化链接，不跳转第三方页面。</p>
          </article>
          <article class="audience-card audience-dev">
            <span class="audience-tag">开发者</span>
            <h3>我提交一行代码，要走哪些门禁才能上线？</h3>
            <ul class="audience-steps">
              <li><a href="#pipeline">看第 6 章：七步交付链路</a></li>
              <li><a href="#delivery">查全部文档索引 · 8 大类 · 需求 / 设计 / 契约 / 发布</a></li>
              <li><a href="#guide">查搭建指南：九步交付、技术选型、合规清单</a></li>
            </ul>
            <p class="audience-hint">生产 Secret 只能在 cloudbase-production Environment 的 Runner 作业中使用；Secret 无法通过 Pages 或 Aime 反向读取。</p>
          </article>
        </div>
      </section>

      <section class="story-section" id="product">
        <p class="story-eyebrow">02 · 产品全貌</p>
        <h2 class="story-h2">先给结论：此里是单俱乐部的活动小程序，<br/>核心是「把骑行一次办完」。</h2>
        <p class="story-lead">产品边界是一句话：面向一个骑行俱乐部、不多租户、不做支付、不内嵌第三方页。换来的是一张非常短的状态图和一组非常明确的能做与不做清单。</p>

        <div class="product-overview">
          <div class="product-overview-main">
            <h3 class="story-h3">做什么 · 做到什么程度</h3>
            <ul class="story-bullets">
              <li><b>活动</b>：发起人创建草稿、配置路线和分组容量、发布或下架；骑手在首页按时间正序看未来活动、在历史分页看结束活动。</li>
              <li><b>报名</b>：服务端复核资料、名额、截止时间、活动状态；重复提交幂等，审批与容量在事务内一致。</li>
              <li><b>凭证</b>：审核通过后展示活动、集合、路线与报名状态；管理员在审核详情中二次确认签到，不提供扫码核销入口。</li>
              <li><b>资料</b>：昵称、实名、电话、紧急联系人、头像、骑行照片在本人页维护；敏感字段 AES-256-GCM 加密。</li>
              <li><b>名片</b>：公开骑行名片只展示本人维护的昵称、性别、头像和照片，不读取第三方账号指标。</li>
            </ul>
          </div>
          <aside class="product-overview-side">
            <h3 class="story-h3">不做什么 · 边界检查</h3>
            <ul class="story-bullets-x">
              <li>不做多俱乐部 / 多租户 / 独立 Web 后台</li>
              <li>不做在线支付、退款、押金</li>
              <li>不做名单 Excel / CSV 导出</li>
              <li>不嵌 web-view 跳转第三方；Strava 路线只复制规范化链接</li>
              <li>不采集证件号、access/refresh token 等三方凭据</li>
            </ul>
          </aside>
        </div>

        <figure class="state-diagram state-diagram-activity" aria-label="活动状态机图解：草稿 ↔ 已发布 → 已结束，发布 ≠ 允许报名">
          <figcaption>
            <span class="story-eyebrow">图 2.1 · 活动状态机</span>
            <strong>一张图回答一个问题：发布就等于允许报名吗？不等于。</strong>
            <p>服务端根据活动时间、截止时间、总 / 分仓容量、费用、必要司机信息计算 <code>registration_state</code>；配置不完整时客户端看到「报名待开放」而不是「可报名」。</p>
          </figcaption>
          <div class="state-canvas state-canvas-activity">
            <div class="state-node state-node-draft"><span>s1</span><b>draft</b><em>草稿</em></div>
            <div class="state-edge state-edge-h state-edge-draft-published" aria-hidden="true"></div>
            <div class="state-node state-node-published"><span>s2</span><b>published</b><em>已发布</em><p class="state-sub">= 公开展示<br/>≠ 可报名</p></div>
            <div class="state-edge state-edge-h state-edge-published-finished" aria-hidden="true"></div>
            <div class="state-node state-node-finished"><span>s3</span><b>finished</b><em>已结束（终态）</em></div>
            <div class="state-side-note">
              <p><b>服务端另算</b>：<code>registration_state</code>（open · closed · setup_pending）由活动配置动态计算，不是另一个活动状态。</p>
            </div>
          </div>
        </figure>
      </section>

      <section class="story-section" id="journey-rider">
        <p class="story-eyebrow">03 · 骑手旅程</p>
        <h2 class="story-h2">先给结论：一次报名要经过五个可观察实体，<br/>每一步都在某个真实页面上。</h2>
        <p class="story-lead">这一节把骑手视角做成可切换的动态图：选择「发现 → 判断 → 报名 → 凭证 → 签到」中的任何一步，图里对应的节点亮起，右侧列出对应的真实原型页面和检查点。</p>

        <div class="journey-interactive" data-journey-canvas>
          <ol class="journey-steps" role="tablist" aria-label="骑手旅程步骤">
            <li role="presentation"><button role="tab" class="journey-step is-active" data-step="discover" aria-selected="true"><span>01</span><b>发现</b><em>活动列表</em></button></li>
            <li role="presentation"><button role="tab" class="journey-step" data-step="judge" aria-selected="false"><span>02</span><b>判断</b><em>活动详情 · 路线分析</em></button></li>
            <li role="presentation"><button role="tab" class="journey-step" data-step="apply" aria-selected="false"><span>03</span><b>报名</b><em>报名表 · 等待审核</em></button></li>
            <li role="presentation"><button role="tab" class="journey-step" data-step="credential" aria-selected="false"><span>04</span><b>凭证</b><em>活动信息 · 审核状态</em></button></li>
            <li role="presentation"><button role="tab" class="journey-step" data-step="checkin" aria-selected="false"><span>05</span><b>签到</b><em>管理员二次确认</em></button></li>
          </ol>

          <div class="journey-stage" role="tabpanel" aria-live="polite">
            <svg class="journey-flow" viewBox="0 0 1000 220" preserveAspectRatio="xMidYMid meet" role="img" aria-labelledby="journey-flow-title">
              <title id="journey-flow-title">骑手旅程流程图</title>
              <defs>
                <marker id="journey-arrow" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M0,0 L10,5 L0,10 z" fill="currentColor"/>
                </marker>
              </defs>
              <g class="journey-flow-track" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="4 6">
                <path d="M80,110 L250,110"/>
                <path d="M330,110 L490,110"/>
                <path d="M570,110 L720,110"/>
                <path d="M800,110 L870,110"/>
              </g>
              <g class="journey-flow-node" data-node="discover">
                <circle cx="60" cy="110" r="30"/>
                <text x="60" y="106" text-anchor="middle">01</text>
                <text x="60" y="124" text-anchor="middle" class="journey-flow-label">发现</text>
                <text x="60" y="172" text-anchor="middle" class="journey-flow-sub">pages/activities</text>
              </g>
              <g class="journey-flow-node" data-node="judge">
                <circle cx="290" cy="110" r="30"/>
                <text x="290" y="106" text-anchor="middle">02</text>
                <text x="290" y="124" text-anchor="middle" class="journey-flow-label">判断</text>
                <text x="290" y="172" text-anchor="middle" class="journey-flow-sub">activity-detail · route-analysis</text>
              </g>
              <g class="journey-flow-node" data-node="apply">
                <circle cx="530" cy="110" r="30"/>
                <text x="530" y="106" text-anchor="middle">03</text>
                <text x="530" y="124" text-anchor="middle" class="journey-flow-label">报名</text>
                <text x="530" y="172" text-anchor="middle" class="journey-flow-sub">registration-form · pending</text>
              </g>
              <g class="journey-flow-node" data-node="credential">
                <circle cx="760" cy="110" r="30"/>
                <text x="760" y="106" text-anchor="middle">04</text>
                <text x="760" y="124" text-anchor="middle" class="journey-flow-label">凭证</text>
                <text x="760" y="172" text-anchor="middle" class="journey-flow-sub">credential · 审核状态</text>
              </g>
              <g class="journey-flow-node" data-node="checkin">
                <circle cx="880" cy="110" r="26"/>
                <text x="880" y="106" text-anchor="middle">05</text>
                <text x="880" y="124" text-anchor="middle" class="journey-flow-label">签到</text>
                <text x="880" y="168" text-anchor="middle" class="journey-flow-sub">approved → checked_in</text>
              </g>
            </svg>

            <div class="journey-detail" data-step-detail>
              <div class="journey-detail-pane" data-pane="discover">
                <h4>先给结论：进来默认看未来活动，历史活动倒序分页。</h4>
                <p>两份视图分别缓存，切换、刷新、加载更多的迟到响应不能覆盖当前列表（这是一个真实的 bug 过滤器）。</p>
                <ul>
                  <li><b>原型</b>：<a href="#activities">pages/activities/index</a></li>
                  <li><b>关键状态</b>：有活动 · 空 · 加载失败</li>
                  <li><b>检查点</b>：340px 窄屏无横向溢出；活动卡片含俱乐部快照</li>
                </ul>
              </div>
              <div class="journey-detail-pane" data-pane="judge" hidden>
                <h4>先给结论：详情页只回答「这次活动能不能去、我要怎么准备」。</h4>
                <p>路线概览固定在详情卡里；完整路线分析是独立页，提供走向、爬升、关键公里点、补给、WC POI；GPX 原生详情由管理员编辑页承载。</p>
                <ul>
                  <li><b>原型</b>：<a href="#activity-detail">activity-detail</a> → <a href="#route-analysis">route-analysis</a></li>
                  <li><b>边界</b>：不跳转第三方；Strava 只复制规范化链接</li>
                  <li><b>检查点</b>：路线概览与完整分析之间无数据漂移</li>
                </ul>
              </div>
              <div class="journey-detail-pane" data-pane="apply" hidden>
                <h4>先给结论：报名表只允许在服务端复核通过的字段。</h4>
                <p>资料、活动状态、截止时间、分类名额都由服务端复核；拒绝订阅通知不阻断报名；提交后进入 pending，占用名额。</p>
                <ul>
                  <li><b>原型</b>：<a href="#registration-form">registration-form</a> → <a href="#registrations">registrations</a></li>
                  <li><b>关键状态</b>：pending · approved · rejected · cancelled</li>
                  <li><b>检查点</b>：rejected/cancelled 可沿用同一记录重报</li>
                </ul>
              </div>
              <div class="journey-detail-pane" data-pane="credential" hidden>
                <h4>先给结论：凭证是一张可核对的行程卡，不是扫码通行证。</h4>
                <p>它集中展示活动、集合、路线与审核状态；签到由管理员在审核详情中二次确认，当前没有扫码核销入口。</p>
                <ul>
                  <li><b>原型</b>：<a href="#credential">credential</a>（with-photo / no-photo / rejected / support-car 状态）</li>
                  <li><b>边界</b>：历史行程保留发布 / 成行时的俱乐部归属快照</li>
                  <li><b>检查点</b>：取消后的凭证不再展示集合信息</li>
                </ul>
              </div>
              <div class="journey-detail-pane" data-pane="checkin" hidden>
                <h4>先给结论：签到是幂等的 approved → checked_in。</h4>
                <p>管理员在审批详情完成二次确认；重复签到不会报错也不会重复占用名额；离线核销和批量签到不在本期范围。</p>
                <ul>
                  <li><b>原型</b>：<a href="#admin-review-detail">admin-review-detail</a></li>
                  <li><b>边界</b>：驳回必须填写理由（textarea 非空）</li>
                  <li><b>检查点</b>：approved → cancelled 可以释放名额</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        <figure class="state-diagram state-diagram-registration" aria-label="报名状态机图解：pending → approved → checked_in；pending → rejected；可沿用同一记录重报">
          <figcaption>
            <span class="story-eyebrow">图 3.1 · 报名状态机</span>
            <strong>一张图回答一个问题：被驳回了还能再报吗？能，沿用同一条记录。</strong>
          </figcaption>
          <div class="state-canvas state-canvas-registration">
            <div class="state-node state-node-pending" style="--c-row:1;--c-col:1"><span>r1</span><b>pending</b><em>待审核</em></div>
            <div class="state-node state-node-approved" style="--c-row:1;--c-col:2"><span>r2</span><b>approved</b><em>已通过（占名额）</em></div>
            <div class="state-node state-node-checkedin" style="--c-row:1;--c-col:3"><span>r3</span><b>checked_in</b><em>已签到</em></div>
            <div class="state-node state-node-rejected" style="--c-row:2;--c-col:2"><span>r4</span><b>rejected</b><em>已驳回（释放名额）</em></div>
            <div class="state-node state-node-cancelled" style="--c-row:2;--c-col:3"><span>r5</span><b>cancelled</b><em>已取消（释放名额）</em></div>
            <svg class="state-edges" viewBox="0 0 600 220" aria-hidden="true">
              <defs>
                <marker id="reg-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M0,0 L10,5 L0,10 z" fill="currentColor"/>
                </marker>
              </defs>
              <g fill="none" stroke="currentColor" stroke-width="2" marker-end="url(#reg-arrow)">
                <path d="M165,55 L235,55"/>
                <path d="M365,55 L435,55"/>
                <path d="M100,100 Q100,165 230,165"/>
                <path d="M300,100 Q300,165 430,165"/>
                <path d="M300,195 Q180,195 100,100" stroke-dasharray="5 5"/>
                <path d="M495,195 Q580,195 500,100" stroke-dasharray="5 5"/>
              </g>
            </svg>
            <p class="state-legend"><span class="state-legend-item state-legend-solid">实线</span> 正向流转 · <span class="state-legend-item state-legend-dashed">虚线</span> rejected / cancelled 沿用同一记录重新进入 pending</p>
          </div>
        </figure>
      </section>

      <section class="story-section" id="journey-organizer">
        <p class="story-eyebrow">04 · 组织者旅程</p>
        <h2 class="story-h2">先给结论：组织者的职责是「活动可被看见」和「现场可被审」。</h2>
        <p class="story-lead">全平台只有一个俱乐部，由平台管理员直接创建并统一发布活动。所有活动都归属该俱乐部、对所有用户可见，不再区分俱乐部活动与公开活动。本页旅程覆盖发布、审核、现场确认全链路。</p>

        <div class="organizer-flow">
          <article class="organizer-step">
            <span class="organizer-no">01</span>
            <h3>创建草稿</h3>
            <p>我的 → 我的活动 → 新建；填标题、图集、时间、集合地点、费用、装备、容量、分仓。</p>
            <p class="organizer-ev"><a href="#admin-activity-edit">admin-activity-edit · create 状态</a></p>
          </article>
          <article class="organizer-step">
            <span class="organizer-no">02</span>
            <h3>导入路线</h3>
            <p>连接 Strava 后粘贴标准路线 URL，由云函数下载 GPX 并复用可信解析器；或直接手动上传 GPX。授权信息只留在云端，导入失败时可立即降级手动上传。</p>
            <p class="organizer-ev"><a href="#admin-activity-edit">admin-activity-edit · GPX 路线详情</a> · <a href="#privacy">边界见第 5 章</a></p>
          </article>
          <article class="organizer-step">
            <span class="organizer-no">03</span>
            <h3>发布 ≠ 可报名</h3>
            <p>服务端校验标题、起止时间、路线起终点；容量 / 分仓 / 司机 / 截止 / 费用未补齐时，活动可预告但报名保持关闭（<code>registration_setup_pending</code>）。</p>
            <p class="organizer-ev"><a href="#admin-activity-list">admin-activity-list · 四态筛选</a></p>
          </article>
          <article class="organizer-step">
            <span class="organizer-no">04</span>
            <h3>审批与现场</h3>
            <p>审批详情查看脱敏资料、手机号来源、骑行照片；通过 / 驳回（必须填理由）；approved → checked_in 幂等；驳回或取消释放名额。</p>
            <p class="organizer-ev"><a href="#admin-reviews">admin-reviews</a> · <a href="#admin-review-detail">admin-review-detail</a></p>
          </article>
        </div>

        <div class="organizer-note">
          <p><b>俱乐部与活动归属（单俱乐部收口）</b>：全平台始终只有一个俱乐部。首次由平台管理员创建后，任何角色都不能再创建；所有活动统一归属该唯一俱乐部，对所有用户可见。相关正式路由见 <a href="#admin-club-applications">admin-club-applications</a> 与 <a href="#club/center">club/center</a>。</p>
        </div>
      </section>

      <section class="story-section" id="privacy">
        <p class="story-eyebrow">05 · 隐私与产品边界</p>
        <h2 class="story-h2">先给结论：公开骑手卡片只有四个字段，<br/>其他都看不到。</h2>
        <p class="story-lead">这不是一句话承诺，而是服务端 DTO 的直接约束：公开 DTO 只允许昵称、性别、头像、本人维护的照片，并且媒体必须经过 owner / status / canonical 校验，才签发临时 URL。违反契约的字段直接从返回里消失。</p>

        <div class="privacy-grid">
          <article class="privacy-allow">
            <h3>✓ 公开可见</h3>
            <ul>
              <li>昵称</li>
              <li>性别</li>
              <li>头像（canonical 媒体 · 临时 URL）</li>
              <li>本人维护的骑行照片</li>
              <li>后援车司机电话（功能必要，公开完整）</li>
            </ul>
          </article>
          <article class="privacy-deny">
            <h3>✗ 公开不可见</h3>
            <ul>
              <li>真实姓名 · 手机号 · 紧急联系人（本人与审核管理员才看完整）</li>
              <li>报名备注 · openid · 原始文件 ID · 审计数据</li>
              <li>证件类型 / 证件号（根本不采集）</li>
              <li>第三方账号 access / refresh token（Strava 路线授权凭证仅在云端 AES-256-GCM 加密存储，永不返回前端）</li>
              <li>骑行指标（90 天次数、加权均速、累计爬升 — 全部不展示）</li>
            </ul>
          </article>
        </div>

        <div class="privacy-callout">
          <b>Strava OAuth 仅恢复路线 GPX 导入</b>
          <p>活动管理员在外部浏览器完成授权后，小程序只轮询“已连接”状态；access/refresh token 以 AES-256-GCM 密文留在云端。粘贴标准路线 URL 后由云函数下载 GPX，并复用与手动上传相同的解析器和预览票据。导入失败时可随时改用手动上传 GPX。</p>
        </div>
      </section>

      <section class="story-section" id="pipeline">
        <p class="story-eyebrow">06 · 七步交付链路</p>
        <h2 class="story-h2">先给结论：PR 一旦合入 main，<br/>三条独立管线并行发布，每一步都有回读。</h2>
        <p class="story-lead">这张图把 <code>.github/workflows/</code> 里的三份 YAML 合并成一个可读的交付链路。CloudBase 只部署受影响的函数；微信开发版只在小程序变更时触发；GitHub Pages 由 docs 变更独立发布——三端最终都要指向当前 main。</p>

        <div class="pipeline-flow" aria-label="从 Pull Request 到三端验收的七步交付链路（契约验证视图）">
          <div class="pipeline-rail pipeline-rail-top" aria-hidden="true"></div>
          <article class="pipeline-step" style="--p-order:1" data-lane="gate"><span>01</span><b>PR 门禁</b><p>格式 / 类型 / 测试 / 覆盖率 / 依赖审计全部通过才允许合入；受保护分支拒绝直接推送与强推。</p></article>
          <article class="pipeline-step" style="--p-order:2" data-lane="gate"><span>02</span><b>合入 main</b><p>合并后分支必须删除；GitHub 实时状态是开放 PR 的唯一判断依据。</p></article>
          <article class="pipeline-step" style="--p-order:3" data-lane="gate"><span>03</span><b>main CI 复验</b><p>用合并后的真实提交再次运行完整门禁，并生成变更范围判定（CloudBase / 微信 / Pages）。</p></article>
          <div class="pipeline-split" aria-hidden="true"><span>三路并行</span></div>
          <article class="pipeline-step" style="--p-order:4" data-lane="cloud"><span>04</span><b>CloudBase</b><p>只部署受影响的基线与云函数（CLOUDBASE_ENV_ID 双重校验），完成后回读 fn list。</p></article>
          <article class="pipeline-step" style="--p-order:5" data-lane="wechat"><span>05</span><b>微信开发版</b><p>仅小程序变更触发上传，使用临时私钥（WECHAT_MINIPROGRAM_PRIVATE_KEY），结束时清理。</p></article>
          <article class="pipeline-step" style="--p-order:6" data-lane="pages"><span>06</span><b>GitHub Pages</b><p>docs 变更由 Pages 独立发布，交付中心与代码事实保持同一提交。</p></article>
          <article class="pipeline-step pipeline-step-verify" style="--p-order:7" data-lane="verify"><span>07</span><b>三端验收</b><p>核对 CI、CloudBase、微信开发版与 Pages 均指向当前 main；任一失败都保留日志与可重跑入口。</p></article>
          <div class="pipeline-rail pipeline-rail-bot" aria-hidden="true"></div>
        </div>
        <p class="pipeline-note"><b>并行点：</b>main CI 复验完成后，CloudBase、微信开发版和 GitHub Pages 按变更范围独立执行；任何一路失败都保留日志与可重跑入口，不用重新合并代码。详细 Secret 清单与手动恢复见 <a href="#deploy">「04 · 自动化部署链路」深潜</a>。</p>
      </section>

      <section class="story-section" id="roadmap">
        <p class="story-eyebrow">当前已实现 vs 路线图待实施</p>
        <h2 class="story-h2">把「已经能用」和「还只是设计」分清楚</h2>
        <div class="roadmap-grid">
          <article class="roadmap-done">
            <h3>✓ 当前已实现（17 个真实路由）</h3>
            <ul>
              <li>骑友端：活动列表、活动详情、路线分析、报名表、行程、凭证、我的、俱乐部中心、设置、名片、资料编辑</li>
              <li>管理端：我的活动、活动编辑、报名审批列表 / 详情、俱乐部管理 / 创建</li>
              <li>公共：Strava 公开路线链接解析（无 OAuth）、GPX 上传与预览、报名凭证、公开骑手卡片四字段契约</li>
              <li>交付：PR / main CI、CloudBase 自动部署、微信开发版自动上传、体验版两阶段晋级、GitHub Pages 发布</li>
            </ul>
          </article>
          <article class="roadmap-todo">
            <h3>⌛ 后续演进（4 个规划原型画面）</h3>
            <ul>
              <li>隐私与授权说明、通知中心、全局离线 / 网络错误、活动分享海报 — 仅 Pages 设计原型</li>
              <li>报名信息同步腾讯文档 — 需求阶段，等官方接入与权限验证</li>
              <li>发起人申请、完整通知闭环、凭证前缀、活动标签 / 模板、双主题、一句话更新日志</li>
              <li>UGC 内容安全闭环（msgSecCheck / mediaCheckAsync）统一入口 — P0 待办</li>
              <li>多环境映射（开发 / 测试 / 生产）与合规检查发布门禁 — P1 待办</li>
            </ul>
          </article>
        </div>
      </section>

      </article>

      <section class="story-divider" aria-hidden="true">
        <span>— 以下是深潜资料 · 深度阅读按原顺序保留 —</span>
      </section>

      <section class="product-hero" id="overview">
        <p class="eyebrow">研发交付中心 · 当前基线同步至 main</p>
        <h2>让骑行俱乐部的研发交付——从需求到发布，都收口到一个可维护的 Pages</h2>
        <p class="lead">“此里”面向单个骑行俱乐部的微信小程序。本页把 README、需求、设计、架构、规范、测试、发布、复盘按 SDLC 八大类聚合，并给每份文档打上成熟度标签，方便产品、设计、研发、测试与运营共享同一事实。</p>
        <div class="product-actions"><a class="btn" href="#delivery">进入研发交付中心</a><a class="btn-secondary" href="#activities">体验 17 个交互原型</a></div>
      </section>

      ${deliveryCenter ? deliveryCenter.render() : ''}

      <section class="product-section" id="requirements">
        <p class="eyebrow">01 · 需求概览</p>
        <h2>谁在使用，解决什么问题</h2>
        <div class="product-card-grid">
          <article class="product-card"><span>骑手</span><h3>看活动、报名和出发</h3><p>比较时间、集合点、路线与强度，维护本人资料，提交报名并查看审核、凭证和签到状态。</p></article>
          <article class="product-card"><span>活动发起人</span><h3>发布与维护本人活动</h3><p>创建草稿、配置路线和分组容量、发布或下架活动，并复用本人历史活动建立新草稿。</p></article>
          <article class="product-card"><span>俱乐部管理员</span><h3>统一审批与现场管理</h3><p>查看全部活动与报名资料，执行通过、驳回、签到和活动结束，所有权限均由服务端校验。</p></article>
        </div>
        <div class="requirements-grid">
          <article><b>活动发现</b><p>未来与进行中活动默认正序展示，历史活动倒序分页；列表状态互不串扰。</p></article>
          <article><b>资料与隐私</b><p>本人和审核管理员按权限查看完整资料，其他骑友只看到公开昵称与名片信息。</p></article>
          <article><b>报名审批</b><p>服务端复核资料、名额、截止时间和活动状态；重复提交幂等，审批与容量在事务内一致。</p></article>
          <article><b>路线与行程</b><p>详情展示官方路线、GPX 与集合信息；不使用 web-view 跳转第三方页面。</p></article>
        </div>
      </section>

      <section class="product-section" id="prd">
        <p class="eyebrow">02 · PRD</p>
        <h2>核心旅程、业务规则与验收口径</h2>
        <div class="prd-flow" aria-label="核心产品旅程">
          <div><span>01</span><b>发现活动</b><p>按日期与状态筛选，比较路线事实和剩余名额。</p></div>
          <div><span>02</span><b>完善资料</b><p>校验实名、电话、紧急联系人和骑行经验。</p></div>
          <div><span>03</span><b>提交报名</b><p>选择集合方式，服务端原子占用活动与分组名额。</p></div>
          <div><span>04</span><b>审核出发</b><p>管理员审批并签到，骑手在行程与凭证中查看结果。</p></div>
        </div>
        <div class="prd-columns">
          <article><h3>关键业务规则</h3><ul><li>活动状态遵循 draft ↔ published → finished。</li><li>活动已发布不代表允许报名，报名状态由服务端根据配置与时间动态计算。</li><li>pending、approved、checked_in 占用名额；取消或驳回释放名额。</li><li>客户端传入的角色、openid 或本地缓存均不能授予权限。</li></ul></article>
          <article><h3>本期验收标准</h3><ul><li>13 个 app.json 可达页面均有对应原型与关键状态。</li><li>340px 窄屏无横向溢出，主要操作满足安全区和触控高度。</li><li>真实报名主链覆盖浏览、资料、报名、审批、凭证、取消与重报。</li><li>用户可见页面不展示第三方授权入口、内部状态机或敏感数据。</li></ul></article>
        </div>
        <div class="source-links">
          <a href="https://github.com/MengEn-Ink/cili-cycling-miniapp/blob/main/docs/requirements-design.md"><b>产品需求与当前能力</b><span>角色、核心旅程、功能清单与数据安全边界</span></a>
          <a href="https://github.com/MengEn-Ink/cili-cycling-miniapp/blob/main/docs/superpowers/specs/2026-10-22-cycling-image-journal-design.md"><b>UI 设计演进记录</b><span>骑行影像志页面结构与阶段验收口径，最终视觉以在线原型为准</span></a>
          <a href="https://github.com/MengEn-Ink/cili-cycling-miniapp/blob/main/docs/verification/p0-real-registration-journey.md"><b>P0 真实报名旅程</b><span>报名、审批、凭证、取消与重报的真实环境验证手册</span></a>
          <a href="https://github.com/MengEn-Ink/cili-cycling-miniapp/blob/main/docs/product-backlog-clarification-2026-10-13.md"><b>产品路线图</b><span>权限、通知、凭证、模板、主题与更新日志的后续计划</span></a>
        </div>
      </section>

      <section class="product-section guide-section" id="guide">
        <div class="guide-heading">
          <div>
            <p class="eyebrow">03 · 从零搭建</p>
            <h2>先把产品、平台和安全边界想清楚，再开始写代码</h2>
          </div>
          <p>这份路线把“做出一个页面”扩展为可审核、可发布、可运营的小程序。政策、费用和处理时长会变化，最终以微信公众平台当前页面为准。</p>
        </div>

        <div class="guide-callout">
          <b>先判断交付物</b>
          <p>网页、React 或普通 HTML 不能直接上传为微信小程序。需要使用 WXML / WXSS / JavaScript 或 TypeScript，并按小程序的页面、组件、权限和生命周期重新实现。</p>
        </div>

        <div class="guide-timeline" aria-label="微信小程序从零到发布九步">${setupTimeline}</div>

        <div class="guide-subsection">
          <p class="section-label">技术选型</p>
          <h2>不是框架越多越专业，而是边界越清楚越容易上线</h2>
          <div class="stack-grid">${stackCards}</div>
        </div>

        <div class="guide-subsection">
          <p class="section-label">核心环境变量</p>
          <h2>只准备真正影响构建与部署的四项</h2>
          <p class="card-hint">AppSecret、CI 私钥和 API Key 都不是前端变量。示例文件只记录键名，真实值进入受控 Secret 管理器。</p>
          <div class="table-scroll">
            <table class="guide-table">
              <thead><tr><th>变量</th><th>获取路径</th><th>边界</th></tr></thead>
              <tbody>${variableRows}</tbody>
            </table>
          </div>
        </div>

        <div class="guide-columns">
          <article>
            <p class="section-label">提审前检查</p>
            <h3>功能、合规和真实设备一起过</h3>
            <ul class="check-list">
              <li>名称、简介、服务类目、备案与实际功能一致</li>
              <li>游客可先浏览，敏感信息在需要时再授权</li>
              <li>隐私保护指引覆盖真实调用的个人信息接口</li>
              <li>用户输入的文字、图片与音频经过服务端内容安全检查</li>
              <li>加载、空、失败、弱网和权限拒绝都有恢复路径</li>
              <li>分享、登录、上传、保存和核心业务旅程完成真机回归</li>
              <li>审核通过后执行发布，并核对线上版本与回滚点</li>
            </ul>
          </article>
          <article class="fact-check">
            <p class="section-label">不把经验帖当平台规则</p>
            <h3>这些结论必须到后台复核</h3>
            <p>认证费用、审核时长、名称敏感词、个人主体能力、支付与广告门槛会随主体、类目、地区和平台规则变化，不在项目文档中写死。</p>
            <div class="official-links">
              <a href="https://mp.weixin.qq.com/" target="_blank" rel="noreferrer">微信公众平台</a>
              <a href="https://developers.weixin.qq.com/miniprogram/dev/framework/" target="_blank" rel="noreferrer">小程序开发文档</a>
              <a href="https://developers.weixin.qq.com/miniprogram/dev/wxcloudservice/wxcloud/quick-start/miniprogram.html" target="_blank" rel="noreferrer">云开发快速开始</a>
              <a href="https://developers.weixin.qq.com/miniprogram/dev/framework/user-privacy/" target="_blank" rel="noreferrer">隐私保护</a>
              <a href="https://developers.weixin.qq.com/miniprogram/dev/server/API/sec-center/sec-check/" target="_blank" rel="noreferrer">内容安全</a>
              <a href="https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/share.html" target="_blank" rel="noreferrer">转发能力</a>
            </div>
          </article>
        </div>

        <div class="guide-subsection project-audit">
          <p class="section-label">当前项目审计</p>
          <h2>已有基础扎实，下一步优先补安全与发布治理</h2>
          <p class="card-hint">已确认：可信 OPENID、管理员白名单、敏感字段加密、加载/失败状态、分享、自动测试与微信开发版上传均已落地。以下只列仍有代码证据的改进项。</p>
          <div class="audit-list">${auditRows}</div>
        </div>
      </section>

      <section class="product-section deploy-section" id="deploy">
        <div class="guide-heading">
          <div>
            <p class="eyebrow">04 · 自动化部署链路</p>
            <h2>部署凭证留在 GitHub，Aime 只交付代码和 PR</h2>
          </div>
          <p>生产 Secret 由 <code>cloudbase-production</code> Environment 托管，只有 main CI 成功后的 Runner 能在当前作业中使用；Secret 不能通过 GitHub API、Pages 或 Aime 反向读取。</p>
        </div>

        <div class="deploy-flow" aria-label="从 Pull Request 到三端验收的七步交付链路">${deployFlow}</div>
        <p class="deploy-flow-note"><b>并行点：</b>main CI 复验完成后，CloudBase、微信开发版和 GitHub Pages 按变更范围独立执行；任何一路失败都保留日志与可重跑入口，不用重新合并代码。</p>

        <div class="guide-subsection">
          <p class="section-label">一次性配置</p>
          <h2>在 Settings → Secrets and variables → Actions 中录入</h2>
          <div class="guide-table-wrap">
            <table class="guide-table deploy-config-table">
              <thead><tr><th>名称</th><th>类型</th><th>用途与边界</th></tr></thead>
              <tbody>${deployConfigRows}</tbody>
            </table>
          </div>
          <div class="deploy-security-grid">
            <article><span>最小权限</span><b>环境级 API Key</b><p>只授权目标 CloudBase 环境所需的集合、索引和云函数部署能力，按有效期轮换。</p></article>
            <article><span>防串环境</span><b>EnvID 双重校验</b><p>工作流会比较 GitHub Variable 与 <code>cloudbaserc.json</code>；不一致时在认证前立即终止。</p></article>
            <article><span>精确发布</span><b>以上次成功部署为基线</b><p>跨多个 main 提交累计识别新增、修改、重命名和删除；普通函数按目录部署，共享代码只展开到实际消费者。</p></article>
            <article><span>闭环验收</span><b>先读、再写、再回读</b><p>部署前执行 <code>fn list</code>；数据库走 plan/apply/verify；部署后再次查询并核对函数名称。</p></article>
          </div>
        </div>

        <div class="guide-subsection">
          <p class="section-label">触发与恢复</p>
          <div class="guide-columns">
            <article><h3>自动触发</h3><p>PR 合入 main 后，只有名为 CI 的工作流成功才会启动 CloudBase 部署。若排队期间 main 再次推进，作业会切换到最新 main 并执行完整对账，避免漏部署。</p></article>
            <article><h3>手动恢复</h3><p>在 Actions 中运行“CloudBase 自动部署”，可选择重新部署全部函数或重新执行基础设施 apply；仍受 production Environment 保护。</p></article>
            <article><h3>失败处理</h3><p>缺少 Secret、环境不一致、测试失败、API Key 登录失败、apply/verify 失败或部署后回读缺函数都会让工作流失败，不会静默标记成功。</p></article>
          </div>
          <div class="guide-callout deploy-callout"><b>交付完成标准</b><p>PR checks、main CI、CloudBase 自动部署、微信开发版上传全部成功，且日志能够确认目标环境、函数范围、版本号和部署后回读结果。配置方法以 <a href="https://docs.cloudbase.net/cli-v1/install" target="_blank" rel="noreferrer">CloudBase CLI 官方文档</a>为准。</p></div>
        </div>
      </section>

      <section class="product-section" id="prototype">
        <p class="eyebrow">05 · 交互原型</p>
        <h2>17 个正式路由 + 4 个规划原型 / 21 个画面</h2>
        <p class="card-hint">17 个正式页面与 app.json 路由一一对应；4 个 planned design-only 画面覆盖隐私授权、通知中心、全局离线 / 网络错误与活动分享海报，可进入 Pages 原型导航，但不计入正式路由。全平台只有一个俱乐部，由平台管理员直接创建，创建后任何角色都不能再创建；所有活动统一归属该唯一俱乐部、对所有用户可见，不再区分俱乐部活动与公开活动。官方路线独立页已从产品路由删除；活动编辑页通过云端 Strava OAuth 按 URL 下载 GPX 并复用可信解析器，手动上传 GPX 始终保留。</p>
        <div class="overview-grid">${pageCards}</div>
      </section>

      <section class="product-section planned-section" id="planned">
        <p class="eyebrow">06 · 规划能力地图 · design-only</p>
        <h2>v2 评审确认的角色矩阵与 4 页规划能力补齐</h2>
        <p class="card-hint">本节是 v2 全套 App 评审工作台中确认但尚未进入 miniprogram 的能力清单：仅在 Pages 原型里以设计表达呈现，不写入 <code>miniprogram/app.json</code>，也不进入 <code>docs/ui-sync-manifest.json</code> 的正式路由对账。真实运行以 17 条路由为准：${stats.canonicalRoutes || 17} 条正式运行路由 · P0 规划 ${stats.plannedP0 || 3} 页 · P1 规划 ${stats.plannedP1 || 1} 页。</p>
        <h3 class="planned-subhead">6 种角色颗粒 · 俱乐部角色 ≠ 平台管理员</h3>
        <table class="overview-table planned-roles-table"><thead><tr><th>角色</th><th>所属范围</th><th>发布能力</th><th>说明</th></tr></thead><tbody>${rolesRows}</tbody></table>
        <h3 class="planned-subhead">P0 规划能力 · ${stats.plannedP0 || 3} 页</h3>
        <div class="planned-grid">${plannedP0Cards}</div>
        <h3 class="planned-subhead">P1 规划能力 · ${stats.plannedP1 || 1} 页</h3>
        <div class="planned-grid">${plannedP1Cards}</div>
        <p class="planned-foot">${(stats && stats.note) || '现有 17 条正式路由见 ui-sync-manifest.routes；规划页仅在 Pages 原型中作为 design-only 呈现，不进 miniprogram/app.json，也不进入 ui-sync 对账。'}</p>
      </section>

      <details class="reference-panel">
        <summary>沸点设计系统与验收依据</summary>
        <div class="reference-content">
          <h2>公共组件示例</h2>
          <div class="spec-demo">
            <div><h3>按钮：主 / 次 / 文字 / 禁用 / 加载</h3><div class="btn-row"><button class="btn">提交报名</button><button class="btn-secondary">保存草稿</button></div><div class="btn-row"><button class="btn is-disabled">名额已满</button><button class="btn is-loading">提交中</button></div><button class="btn-text">删除</button></div>
            <div><h3>标签：中性 / 已通过 / 待审核 / 线框 / 已结束</h3><div class="chips"><span class="tag tag-neutral">默认</span><span class="tag tag-solid">已通过</span><span class="tag tag-pending">待审核</span><span class="tag tag-outline">已下架</span><span class="tag tag-muted">已结束</span></div></div>
            <div><h3>输入框：默认 / 聚焦 / 错误 / 禁用</h3><div class="input"><span class="ph">例如：周末环湖骑</span></div><div class="input is-focus"><span>云蒙山&amp;喇叭沟 RIDE<i class="caret"></i></span></div><div class="input is-error"><span class="ph">请填写活动标题</span></div><p class="field-msg is-error">请填写活动标题</p><div class="input is-disabled"><span>资料完整，欢迎参加</span></div></div>
          </div>
          <h2>浅色对比度检查表</h2>
          <table class="overview-table"><thead><tr><th>用途</th><th>前景</th><th>背景</th><th>对比度</th><th>门槛</th><th>使用位置</th></tr></thead><tbody>${contrast}</tbody></table>
          <h2>沸点视觉验收</h2>
          <p>当前 14 页统一使用暖米白画布、白卡、墨黑信息块、品牌红强调与深行动红主行动；历史主题问题已从当前原型说明中移除。</p>
        </div>
      </details>`;
  }

  function renderNavigation() {
    const groups = [...new Set(data.pages.map((page) => page.group))];
    nav.innerHTML = groups
      .map(
        (group) => `<section><h3>${group}</h3>${data.pages
          .filter((page) => page.group === group)
          .filter((page) => page.id !== 'capability-card')
          .map(
            (page) =>
              `<button data-route="${page.id}"><span>${String(data.pages.indexOf(page) + 1).padStart(2, '0')}</span><b>${page.title}</b></button>`,
          )
          .join('')}</section>`,
      )
      .join('');
  }


  function updateChrome(page) {
    const baseState = currentState.split('--')[0];
    const stateLabel = (page.states.find(([id]) => id === baseState) || page.states[0])[1];
    $('.phone-inner').classList.toggle('custom-tab-navigation', tabRoutes.includes(page.id));
    $('#mini-title').textContent =
      page.id === 'admin-activity-edit' && currentState === 'create' ? '创建活动' : page.navTitle;
    $('#route-path').textContent = page.path;
    $('#screen-title').textContent = page.title;
    $('#screen-copy').textContent = page.copy;
    $('#screen-role').textContent = page.role;
    $('#screen-state').textContent = stateLabel;
    $('#state-switch').innerHTML = page.states
      .map(
        ([id, label]) =>
          `<button class="${id === baseState ? 'is-active' : ''}" data-state="${id}" data-route="${page.id}">${label}</button>`,
      )
      .join('');
    nav.querySelectorAll('[data-route]').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.route === page.id);
    });
    $('#tab-bar').hidden = !tabRoutes.includes(page.id);
    document.querySelectorAll('.tab-button').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.route === page.id);
    });
  }

  function showOverview(section = 'overview') {
    const targetSection = overviewSections.has(section) ? section : 'overview';
    demo.hidden = true;
    overview.hidden = false;
    if (!overview.innerHTML) {
      renderOverview();
      bindJourneyInteractive();
    }
    if (window.location.hash !== `#${targetSection}`) {
      window.history.replaceState(null, '', `#${targetSection}`);
    }
    if (targetSection !== 'overview') {
      window.requestAnimationFrame(() => {
        document.getElementById(targetSection)?.scrollIntoView({ block: 'start' });
      });
    }
  }

  // 03 骑手旅程动态图：点击 tab 切换右侧 pane，并高亮 SVG 中对应节点
  function bindJourneyInteractive() {
    const canvas = document.querySelector('[data-journey-canvas]');
    if (!canvas) return;
    const tabs = canvas.querySelectorAll('.journey-step');
    const panes = canvas.querySelectorAll('.journey-detail-pane');
    const nodes = canvas.querySelectorAll('.journey-flow-node');
    const activate = (step) => {
      tabs.forEach((tab) => {
        const match = tab.dataset.step === step;
        tab.classList.toggle('is-active', match);
        tab.setAttribute('aria-selected', match ? 'true' : 'false');
      });
      panes.forEach((pane) => {
        pane.hidden = pane.dataset.pane !== step;
      });
      nodes.forEach((node) => {
        node.classList.toggle('is-active', node.dataset.node === step);
      });
    };
    tabs.forEach((tab) => tab.addEventListener('click', () => activate(tab.dataset.step)));
    activate('discover');
  }

  function normalizePrototypeState(stateIds, requestedState) {
    const requested = requestedState || '';
    const baseState = requested.split('--')[0];
    return stateIds.includes(baseState) ? requested : stateIds[0];
  }

  window.normalizePrototypeState = normalizePrototypeState;

  function showPage(route, options = {}) {
    if (route === 'overview') {
      showOverview();
      return;
    }
    const canonicalRoute = route === 'capability-card' ? 'profile' : route;
    demo.hidden = false;
    overview.hidden = true;
    const page = pageById.get(canonicalRoute) || pageById.get('activities');
    if (!options.replace && currentRoute !== page.id) routeHistory.push(currentRoute);
    currentRoute = page.id;
    const stateIds = page.states.map(([id]) => id);
    currentState = normalizePrototypeState(stateIds, options.state);
    window.prototypeState = currentState;
    if (page.id === 'activity-detail') window.prototypeActivityId = options.activityId || '';
    container.innerHTML = templates[page.id]();
    container.scrollTop = 0;
    updateChrome(page);
    modal.hidden = true;
    const hash = currentState === page.states[0][0] ? `#${page.id}` : `#${page.id}/${currentState}`;
    if (window.location.hash !== hash) window.history.replaceState(null, '', hash);
  }

  function parseHash() {
    const payload = window.location.hash.slice(1);
    const route = [...pageById.keys()]
      .sort((a, b) => b.length - a.length)
      .find((id) => payload === id || payload.startsWith(`${id}/`)) || payload.split('/')[0];
    const state = route && payload.startsWith(`${route}/`) ? payload.slice(route.length + 1) : '';
    const query = new URLSearchParams(window.location.search).get('state');
    return { route, state: state || query || '' };
  }

  const toastIcons = { success: '✓', warning: '⚠', error: '!' };

  // 成功前缀白色 ✓、提醒前缀白色 ⚠、失败前缀品牌红 ! 的 toast 前缀约定。
  function showToast(message, kind = 'success') {
    window.clearTimeout(toastTimer);
    toast.className = `demo-toast is-${kind}`;
    toast.innerHTML = toastIcons[kind] ? `<b aria-hidden="true">${toastIcons[kind]}</b>` : '';
    toast.append(message);
    toast.hidden = false;
    toastTimer = window.setTimeout(() => {
      toast.hidden = true;
    }, 1800);
  }

  function showRider(name) {
    modal.innerHTML = `<div class="modal-sheet"><button class="modal-close" data-action="close-modal" aria-label="关闭">×</button><span class="avatar lg">${name.slice(0, 1)}</span><p class="section-label" style="margin-top:12px">完整公开骑行名片</p><h3 class="card-title">${name} <span class="tag tag-neutral">${data.rider.gender}</span></h3><p class="card-hint">${data.rider.experience}</p><p class="neutral-note">昵称、头像与照片由骑友本人维护，仅展示公开资料。</p></div>`;
    modal.hidden = false;
  }

  function showCancelledTripDetail() {
    modal.innerHTML = `<div class="modal-sheet"><button class="modal-close" data-action="close-modal" aria-label="关闭">×</button><span class="tag tag-muted">已取消</span><h3 class="card-title" style="margin-top:12px">奉贤海湾拉练</h3><div class="row-list"><div class="row"><span>集合时间</span><strong>10月11日 周日 07:00</strong></div><div class="row"><span>集合地点</span><strong>奉贤海湾旅游区集合点</strong></div></div><p class="neutral-note">此行程已取消，不再提供出发凭证。</p></div>`;
    modal.hidden = false;
  }

  function showCopyActivity() {
    modal.innerHTML = `<div class="modal-sheet"><button class="modal-close" data-action="close-modal" aria-label="关闭">×</button><h3 class="card-title">从此活动创建</h3><p class="card-hint">默认带入原活动时间，确认后生成草稿</p>
      ${[['报名截止', '2026-10-24', '20:00'], ['开始', '2026-10-25', '06:20'], ['结束', '2026-10-25', '15:00']].map(([label, d, t]) => `<div class="field"><div class="field-label">${label}</div><div class="field-2col"><div class="input"><span>${d}</span><span class="unit">›</span></div><div class="input"><span>${t}</span><span class="unit">›</span></div></div></div>`).join('')}
      <div class="btn-row" style="grid-template-columns:0.82fr 1.18fr"><button class="btn-secondary" data-action="close-modal">取消</button><button class="btn" data-action="toast" data-message="草稿已创建">创建草稿</button></div></div>`;
    modal.hidden = false;
  }

  function showSafeCacheConfirmation() {
    modal.innerHTML = `<div class="modal-sheet settings-cache-modal"><button class="modal-close" data-action="close-modal" aria-label="关闭">×</button><span class="tag tag-neutral">安全清理</span><h3 class="card-title">清理缓存</h3><p class="card-hint">只会清理可重新下载的活动、资料和图片缓存，不会退出登录，也不会删除报名、行程或个人资料。</p><div class="btn-row"><button class="btn-secondary" data-action="close-modal">取消</button><button class="btn" data-action="settings-confirm-clear-cache">确认清理</button></div></div>`;
    modal.hidden = false;
  }

  function showCancelRegistrationConfirmation() {
    modal.innerHTML = `<div class="modal-sheet"><button class="modal-close" data-action="close-modal" aria-label="关闭">×</button><span class="tag tag-warning">取消报名</span><h3 class="card-title">确认取消本次报名？</h3><p class="card-hint">取消后当前凭证立即失效并释放名额；之后仍可沿用资料重新报名。</p><div class="btn-row"><button class="btn-secondary" data-action="close-modal">暂不取消</button><button class="btn" data-action="confirm-cancel-registration">确认取消</button></div></div>`;
    modal.hidden = false;
  }

  function showCheckinConfirmation() {
    modal.innerHTML = `<div class="modal-sheet"><button class="modal-close" data-action="close-modal" aria-label="关闭">×</button><span class="tag tag-neutral">现场签到</span><h3 class="card-title">确认骑友已到场？</h3><p class="card-hint">请核对本人和活动后完成签到；签到完成后报名记录会更新为已签到。</p><div class="btn-row"><button class="btn-secondary" data-action="close-modal">暂不签到</button><button class="btn" data-action="confirm-checkin">确认签到</button></div></div>`;
    modal.hidden = false;
  }

  function showNotificationChoice() {
    modal.innerHTML = `<div class="modal-sheet"><button class="modal-close" data-action="close-modal" aria-label="关闭">×</button><span class="tag tag-neutral">按次订阅</span><h3 class="card-title">接收本次活动通知？</h3><p class="card-hint">每次请求都以微信授权选择为准；接受本次订阅不代表永久开启，拒绝也不影响报名和查看行程。</p><div class="btn-row"><button class="btn-secondary" data-action="notification-decline">本次不订阅</button><button class="btn" data-action="notification-accept">接受本次订阅</button></div></div>`;
    modal.hidden = false;
  }

  function showProfileMedia(kind) {
    const isAvatar = kind === 'avatar';
    const src = isAvatar
      ? './designs/2026-10-22-cycling-image-journal/assets/rider.webp'
      : './designs/2026-10-22-cycling-image-journal/assets/mountain.webp';
    const label = isAvatar ? '头像' : '骑行背景';
    modal.innerHTML = `<div class="modal-sheet journal-media-preview"><button class="modal-close" data-action="close-modal" aria-label="关闭">×</button><p class="section-label">${label}</p><div data-image-fallback><img src="${src}" alt="${data.rider.nickname}的${label}" onerror="this.closest('[data-image-fallback]').classList.add('is-image-error')" /><span class="journal-image-fallback" role="img" aria-label="${label}暂不可用"><i aria-hidden="true"></i><b>此里 CILI</b><small>${label}暂不可用，请稍后重试</small></span></div></div>`;
    modal.hidden = false;
  }

  function goBack() {
    const previous = routeHistory.pop();
    showPage(previous || 'activities', { replace: true });
  }

  function runJourney(name) {
    const starts = {
      registration: 'activities',
      credential: 'registrations',
      profile: 'profile',
      admin: 'admin-activity-list',
    };
    showPage(starts[name]);
    showToast('旅程入口已切换，可在手机原型内继续操作', 'info');
  }

  document.addEventListener('click', (event) => {
    const target = event.target.closest('[data-action], [data-route], [data-journey]');
    if (!target || target.disabled) return;
    if (target.dataset.journey) {
      runJourney(target.dataset.journey);
      return;
    }
    const action = target.dataset.action || (target.dataset.route ? 'route' : '');
    if (action === 'route') {
      const sameRoute = target.dataset.route === currentRoute;
      showPage(target.dataset.route, {
        state: target.dataset.state,
        activityId: target.dataset.activityId,
        replace: sameRoute,
      });
    }
    if (action === 'back') goBack();
    if (action === 'open-overview') showOverview();
    if (action === 'toast') {
      modal.hidden = true;
      showToast(target.dataset.message || '操作已完成');
    }
    if (action === 'close-modal') modal.hidden = true;
    if (action === 'rider') showRider(target.dataset.rider);
    if (action === 'cancelled-trip-detail') showCancelledTripDetail();
    if (action === 'delete-trip') {
      window.prototypeCancelledTripDeleted = true;
      showPage(currentRoute, { state: currentState, replace: true });
      showToast('已删除行程记录');
    }
    if (action === 'copy-activity') showCopyActivity();
    if (action === 'settings-notifications') showNotificationChoice();
    if (action === 'notification-accept') {
      modal.hidden = true;
      showToast('已完成本次订阅选择 · 不代表永久开启');
    }
    if (action === 'notification-decline') {
      modal.hidden = true;
      showToast('本次未订阅，仍可在行程中查看报名状态', 'warning');
    }
    if (action === 'settings-privacy') showToast('已打开微信隐私管理');
    if (action === 'settings-clear-cache') showSafeCacheConfirmation();
    if (action === 'settings-confirm-clear-cache') {
      modal.hidden = true;
      showToast('缓存已清理');
    }
    if (action === 'preview-profile-background') showProfileMedia('background');
    if (action === 'preview-profile-avatar') showProfileMedia('avatar');
    if (action === 'request-cancel-registration') showCancelRegistrationConfirmation();
    if (action === 'confirm-cancel-registration') {
      modal.hidden = true;
      showPage('registrations', { state: 'cancelled' });
      showToast('报名已取消，可随时重新报名');
    }
    if (action === 'request-checkin') showCheckinConfirmation();
    if (action === 'confirm-checkin') {
      modal.hidden = true;
      showPage('admin-review-detail', { state: 'checked-in', replace: true });
      showToast('已签到 · 报名记录已更新');
    }
    if (action === 'share-activity') {
      showToast('将分享公开活动详情，不含本人的凭证、实名或电话');
    }
    if (action === 'copy-route') {
      showPage('activity-detail', { state: 'copied', replace: true });
      showToast('路线链接已复制');
    }
    if (action === 'navigate-route-start') showToast('已打开起点导航');
    if (action === 'choice') {
      target.parentElement.querySelectorAll('button').forEach((button) => button.classList.remove('is-active'));
      target.classList.add('is-active');
    }
    if (action === 'submit-registration') {
      // 报名模式分支：统一回到行程页展示服务端确认后的真实状态。
      const mode = target.dataset.registrationMode || 'approval';
      if (mode === 'open') {
        if (target.dataset.capacityAvailable === 'false') {
          showToast('名额刚刚报满，已进入候补', 'warning');
          window.setTimeout(() => showPage('registrations', { state: 'full-waiting' }), 400);
          return;
        }
        showToast('已加入 · 公开报名直接生效，凭证已生成');
        window.setTimeout(() => showPage('registrations', { state: 'open-approved' }), 600);
      } else {
        showToast('报名已提交，等待管理员审核');
        window.setTimeout(() => showPage('registrations', { state: 'review-pending' }), 600);
      }
    }
    if (action === 'save-profile') {
      showToast('报名资料已保存');
      window.setTimeout(() => showPage('profile'), 500);
    }
    if (action === 'publish-activity') {
      target.textContent = '已发布';
      target.disabled = true;
      target.classList.add('is-disabled');
      showToast('活动已发布，骑友端现在可见');
    }
    if (action === 'approve-review') {
      if (target.dataset.capacityAvailable === 'false') {
        showPage('admin-review-detail', { state: 'capacity-full', replace: true });
        showToast('活动名额已满，暂时无法通过', 'error');
        return;
      }
      showPage('admin-review-detail', { state: 'approved', replace: true });
      showToast('报名已通过，可在骑友到场后签到');
    }
    if (action === 'reject-review') {
      const rejectReason = document.getElementById('registration-reject-reason')?.value.trim();
      if (!rejectReason) {
        showPage('admin-review-detail', { state: 'reject-error', replace: true });
        showToast('驳回时请填写理由', 'error');
        return;
      }
      showToast('报名已驳回');
      window.setTimeout(() => showPage('admin-reviews'), 500);
    }
    if (action === 'club-create-avatar') {
      const operation = currentState.split('--')[0] === 'bootstrap' ? 'bootstrap' : 'edit';
      showPage('admin-club-application-detail', {
        state: `${operation}--avatar-uploading`,
        replace: true,
      });
      window.setTimeout(() => {
        window.prototypeClubCreateMedia = {
          ...(window.prototypeClubCreateMedia || {}),
          avatarReady: true,
          coverReady: window.prototypeClubCreateMedia?.coverReady ?? true,
        };
        showPage('admin-club-application-detail', { state: operation, replace: true });
        showToast('俱乐部头像已就绪');
      }, 500);
    }
    if (action === 'club-create-cover') {
      const operation = currentState.split('--')[0] === 'bootstrap' ? 'bootstrap' : 'edit';
      showPage('admin-club-application-detail', {
        state: `${operation}--cover-uploading`,
        replace: true,
      });
      window.setTimeout(() => {
        window.prototypeClubCreateMedia = {
          ...(window.prototypeClubCreateMedia || {}),
          avatarReady: window.prototypeClubCreateMedia?.avatarReady ?? true,
          coverReady: true,
        };
        showPage('admin-club-application-detail', { state: operation, replace: true });
        showToast('俱乐部背景图已就绪');
      }, 500);
    }
    if (action === 'club-create-remove-cover') {
      const operation = currentState.split('--')[0] === 'bootstrap' ? 'bootstrap' : 'edit';
      window.prototypeClubCreateMedia = {
        ...(window.prototypeClubCreateMedia || {}),
        avatarReady: window.prototypeClubCreateMedia?.avatarReady ?? true,
        coverReady: false,
      };
      showPage('admin-club-application-detail', { state: operation, replace: true });
      showToast('俱乐部背景图已移除');
    }
    if (action === 'club-create-submit') {
      const operation = currentState.split('--')[0] === 'bootstrap' ? 'bootstrap' : 'edit';
      showPage('admin-club-application-detail', {
        state: `${operation}--submitting`,
        replace: true,
      });
      window.setTimeout(() => {
        showPage('admin-club-application-detail', {
          state: `${operation}--success`,
          replace: true,
        });
        showToast(operation === 'bootstrap' ? '俱乐部已创建并生效' : '俱乐部资料已保存');
      }, 650);
    }
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') modal.hidden = true;
    if (!demo.hidden && ['ArrowUp', 'ArrowDown'].includes(event.key)) {
      event.preventDefault();
      const page = pageById.get(currentRoute);
      const baseState = currentState.split('--')[0];
      const index = page.states.findIndex(([id]) => id === baseState);
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      const next = page.states[(index + delta + page.states.length) % page.states.length][0];
      showPage(currentRoute, { state: next, replace: true });
      return;
    }
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    const index = data.pages.findIndex((page) => page.id === currentRoute);
    const delta = event.key === 'ArrowRight' ? 1 : -1;
    const next = (index + delta + data.pages.length) % data.pages.length;
    showPage(data.pages[next].id);
  });

  window.addEventListener('hashchange', () => {
    const { route, state } = parseHash();
    if (overviewSections.has(route)) showOverview(route);
    else if (pageById.has(route)) showPage(route, { state, replace: route === currentRoute });
  });

  renderNavigation();
  const initial = parseHash();
  if (overviewSections.has(initial.route)) showOverview(initial.route);
  else showPage(pageById.has(initial.route) ? initial.route : 'activities', { state: initial.state, replace: true });
})();
