(() => {
  const data = window.prototypeData;
  const templates = window.pageTemplates;
  const deliveryCenter = window.deliveryCenter;
  const pageById = new Map(data.pages.map((page) => [page.id, page]));
  const tabRoutes = ['activities', 'registrations', 'profile'];
  const baseOverviewSections = [
    'overview',
    'delivery',
    'requirements',
    'prd',
    'guide',
    'deploy',
    'prototype',
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
    overview.innerHTML = `
      <section class="product-hero">
        <p class="eyebrow">研发交付中心 · 当前基线同步至 main</p>
        <h2>让骑行俱乐部的研发交付——从需求到发布，都收口到一个可维护的 Pages</h2>
        <p class="lead">“此里”面向单个骑行俱乐部的微信小程序。本页把 README、需求、设计、架构、规范、测试、发布、复盘按 SDLC 八大类聚合，并给每份文档打上成熟度标签，方便产品、设计、研发、测试与运营共享同一事实。</p>
        <div class="product-actions"><a class="btn" href="#delivery">进入研发交付中心</a><a class="btn-secondary" href="#activities">体验 13 个交互原型</a></div>
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
          <a href="https://github.com/MengEn-Ink/cili-cycling-miniapp/blob/main/docs/superpowers/specs/2026-10-14-full-ui-redesign.md"><b>UI 设计演进记录</b><span>2026-10-14 页面结构与阶段验收口径，最终视觉以在线原型为准</span></a>
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
        <h2>13 个真实页面 + 8 页 M0 组织地基与审批原型</h2>
        <p class="card-hint">13 个页面与 app.json 路由一一对应；另 8 页 M0 原型（组织地基与审批）仅为设计表达，服务端尚未实现。官方路线独立页已从产品路由删除；活动详情直接承载路线事实与 GPX 能力，Strava 路线只提供规范化链接复制。</p>
        <div class="overview-grid">${pageCards}</div>
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
          <p>当前 13 页统一使用暖米白画布、白卡、墨黑信息块、品牌红强调与深行动红主行动；历史主题问题已从当前原型说明中移除。</p>
          <div class="official-links"><a href="./designs/2026-10-16-boiling-point/index.html">查看沸点手稿与全套交接成果</a><a href="./design-contract.json">查看双端设计契约</a></div>
        </div>
      </details>`;
  }

  function renderNavigation() {
    const groups = [...new Set(data.pages.map((page) => page.group))];
    nav.innerHTML = groups
      .map(
        (group) => `<section><h3>${group}</h3>${data.pages
          .filter((page) => page.group === group)
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
    if (!overview.innerHTML) renderOverview();
    if (window.location.hash !== `#${targetSection}`) {
      window.history.replaceState(null, '', `#${targetSection}`);
    }
    if (targetSection !== 'overview') {
      window.requestAnimationFrame(() => {
        document.getElementById(targetSection)?.scrollIntoView({ block: 'start' });
      });
    }
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
    demo.hidden = false;
    overview.hidden = true;
    const page = pageById.get(route) || pageById.get('activities');
    if (!options.replace && currentRoute !== page.id) routeHistory.push(currentRoute);
    currentRoute = page.id;
    const stateIds = page.states.map(([id]) => id);
    currentState = normalizePrototypeState(stateIds, options.state);
    window.prototypeState = currentState;
    container.innerHTML = templates[page.id]();
    container.scrollTop = 0;
    updateChrome(page);
    modal.hidden = true;
    const hash = currentState === page.states[0][0] ? `#${page.id}` : `#${page.id}/${currentState}`;
    if (window.location.hash !== hash) window.history.replaceState(null, '', hash);
  }

  function parseHash() {
    const [route, state] = window.location.hash.slice(1).split('/');
    const query = new URLSearchParams(window.location.search).get('state');
    return { route, state: state || query || '' };
  }

  const toastIcons = { success: '✓', warning: '⚠', error: '!' };

  // 成功前缀白色 ✓、提醒前缀白色 ⚠、失败前缀品牌红 !（theme-constraints.md §7 toast）
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
      'org-approval': 'org-overview',
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
      showPage(target.dataset.route, { state: target.dataset.state, replace: sameRoute });
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
    if (action === 'copy-route') {
      showPage('activity-detail', { state: 'copied', replace: true });
      showToast('路线链接已复制');
    }
    if (action === 'copy-route-coord') {
      const coord = target.dataset.coord || '';
      // 原型层仅做反馈示意：真实接入时由小程序 wx.setClipboardData 处理
      if (coord && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(coord).catch(() => {});
      }
      showToast(coord ? `已复制坐标 ${coord}` : '已复制坐标');
    }
    if (action === 'choice') {
      target.parentElement.querySelectorAll('button').forEach((button) => button.classList.remove('is-active'));
      target.classList.add('is-active');
    }
    if (action === 'submit-registration') {
      showToast('报名已提交，等待管理员审核');
      window.setTimeout(() => showPage('registrations'), 600);
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
    if (action === 'approve-review' || action === 'reject-review') {
      const rejectReason = document.getElementById('registration-reject-reason')?.value.trim();
      if (action === 'reject-review' && !rejectReason) {
        showPage('admin-review-detail', { state: 'reject-error', replace: true });
        showToast('驳回时请填写理由', 'error');
        return;
      }
      showToast(action === 'approve-review' ? '报名已通过' : '报名已驳回');
      window.setTimeout(() => showPage('admin-reviews'), 500);
    }
    if (action === 'confirm-club-application') {
      showPage('club-application-edit', { state: 'submit-confirm', replace: true });
    }
    if (action === 'submit-club-application') {
      showToast('申请已提交，等待平台所有者审批');
      window.setTimeout(() => showPage('club-applications', { state: 'pending_review' }), 500);
    }
    if (action === 'publish-target-admin') {
      showPage('approval-outcome', { state: 'role-auto' });
      showToast('已以俱乐部管理员身份发布');
    }
    if (action === 'publish-target-submit') {
      const pendingState = target.dataset.pendingState;
      showPage('approval-outcome', { state: pendingState });
      showToast(`已提交审核，${pendingState.startsWith('pending-club') ? '等待俱乐部管理员处理' : '等待平台所有者处理'}`);
    }
    if (action === 'publish-target-platform') {
      showPage('approval-outcome', { state: 'platform-owner-public' });
      showToast('已显式确认并发布');
    }
    if (action === 'org-approve') {
      const outcomeContext = target.dataset.outcomeContext;
      showPage('approval-outcome', { state: `manual--${outcomeContext}` });
      showToast(outcomeContext.startsWith('club-application') ? '申请已通过并创建俱乐部' : outcomeContext.startsWith('public-activity') ? '公开活动已通过并发布' : '俱乐部活动已通过并发布');
    }
    if (action === 'org-reject') {
      const rejectReason = document.getElementById('org-reject-reason')?.value.trim();
      if (!rejectReason) {
        const errorState = currentState.includes('--') ? `${currentState}--reject-error` : 'reject-error';
        showPage('approval-detail', { state: errorState, replace: true });
        showToast('驳回时请填写理由', 'error');
        return;
      }
      const outcomeContext = target.dataset.outcomeContext;
      showPage('approval-outcome', { state: `rejected--${outcomeContext}` });
      showToast(outcomeContext.startsWith('club-application') ? '俱乐部申请已驳回' : outcomeContext.startsWith('public-activity') ? '公开活动已驳回' : '俱乐部活动已驳回');
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
