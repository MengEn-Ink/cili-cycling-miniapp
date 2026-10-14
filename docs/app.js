(() => {
  const data = window.prototypeData;
  const templates = window.pageTemplates;
  const pageById = new Map(data.pages.map((page) => [page.id, page]));
  const tabRoutes = ['activities', 'registrations', 'profile'];
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
    ['主按钮', '--color-on-action', '--color-action', 4.5, '黑底白字主按钮、选中项'],
    ['黑底辅助文字', '--color-media-muted', '--color-media-card-bg', 4.5, '黑底信息条的时间、地点'],
    ['当前步骤', '--color-on-brand', '--color-brand', 4.5, '橙底近黑字步骤条'],
    ['错误说明', '--color-brand-active', '--color-surface', 4.5, '白底卡片内的字段错误说明'],
    ['成功色 / 白底', '--color-status-success', '--color-surface', 4.5, '复制成功等行内提示文字'],
    ['成功色 / 页面底', '--color-status-success', '--color-bg', 4.5, '成功色文字放在页面底时'],
    ['成功色 / 灰底', '--color-status-success', '--color-raised', 4.5, '成功色文字放在灰底时'],
    ['成功小标签', '--color-status-success', '--color-status-success-soft', 4.5, '“✓ 已通过”标签'],
    ['警告色 / 白底', '--color-status-warning', '--color-surface', 4.5, '提醒文字'],
    ['警告色 / 页面底', '--color-status-warning', '--color-bg', 4.5, '提醒文字放在页面底时'],
    ['警告色 / 灰底', '--color-status-warning', '--color-raised', 4.5, '提醒文字放在灰底时'],
    ['提醒小标签', '--color-status-warning', '--color-status-warning-soft', 4.5, '“⚠ 即将截止 / 名额紧张 / 可能过期”'],
    ['主题橙线条', '--color-brand', '--color-surface', 3, '待审核描边、信息条短线（非文字）'],
    ['控件描边', '--color-border-strong', '--color-surface', 3, '卡片 / 输入框 / 按钮 2px 描边'],
  ];

  function renderOverview() {
    const pageCards = data.pages
      .map(
        (page, index) =>
          `<a href="#${page.id}"><small>${String(index + 1).padStart(2, '0')} · ${page.group} · ${page.path}</small><b>${page.title}</b><p>${page.fixes[0]}</p><p>关键状态：${page.states.map(([, label]) => label).join(' / ')}</p></a>`,
      )
      .join('');
    const contrast = contrastRows
      .map(([name, fg, bg, min, usage]) => {
        const value = ratio(fg, bg);
        const pass = value >= min;
        return `<tr><td>${name}</td><td><span class="swatch" style="background:var(${fg})"></span><code>${fg}</code> ${cssVar(fg)}</td><td><span class="swatch" style="background:var(${bg})"></span><code>${bg}</code> ${cssVar(bg)}</td><td><b class="pass ${pass ? '' : 'is-fail'}">${value.toFixed(2)} : 1</b></td><td>${min} : 1 ${pass ? '通过' : '不通过'}</td><td>${usage}</td></tr>`;
      })
      .join('');
    const issues = data.issues
      .map(
        ([id, page, problem, fix, spec]) =>
          `<tr><td><b>${id}</b></td><td>${page}</td><td>${problem}</td><td>${fix}</td><td>${spec}</td></tr>`,
      )
      .join('');
    overview.innerHTML = `
      <p class="eyebrow">总览 · 2026-10-14 全套 UI 改版</p>
      <h2 style="margin-top:4px">以报名表单设计稿为基准，统一 13 个页面</h2>
      <p class="lead">继承 2026-10-10 统一明亮 UI（只有明亮主题、8px 栅格、字号 24/18/14/12、卡片圆角）与 2026-10-12 黑白灰 + 主题橙规范；颜色变量与 miniprogram/app.wxss 同名同值。橙色只用于当前步骤、必选与待处理；重点信息用黑底白字条块。</p>
      <h2>页面清单（13 / 13，与 app.json 路由一一对应）</h2>
      <p class="card-hint">app.json 中的 pages/route-view/index（官方路线 web-view）没有任何页面跳转到它，属于孤立页；小程序不跳转第三方页面，本稿不设计该页，Strava 只能复制链接。</p>
      <div class="overview-grid">${pageCards}</div>
      <h2>公共组件示例</h2>
      <div class="spec-demo">
        <div><h3>按钮：主 / 次 / 文字 / 禁用 / 加载</h3><div class="btn-row"><button class="btn">提交报名</button><button class="btn-secondary">保存草稿</button></div><div class="btn-row"><button class="btn is-disabled">名额已满</button><button class="btn is-loading">提交中</button></div><button class="btn-text">删除</button></div>
        <div><h3>标签：中性 / 已通过 / 待审核 / 线框 / 已结束</h3><div class="chips"><span class="tag tag-neutral">默认</span><span class="tag tag-solid">已通过</span><span class="tag tag-pending">待审核</span><span class="tag tag-outline">已下架</span><span class="tag tag-muted">已结束</span></div><div class="steps" style="margin-top:12px"><div class="step is-done"><b>✓</b>填写报名</div><div class="step is-current"><b>02</b>等待审核</div><div class="step"><b>03</b>出发凭证</div></div></div>
        <div><h3>输入框：默认 / 聚焦 / 错误 / 禁用</h3><div class="input"><span class="ph">例如：周末环湖骑</span></div><div class="input is-focus"><span>云蒙山&amp;喇叭沟 RIDE<i class="caret"></i></span></div><div class="input is-error"><span class="ph">请填写活动标题</span></div><p class="field-msg is-error">请填写活动标题</p><div class="input is-disabled"><span>资料完整，欢迎参加</span></div></div>
        <div><h3>黑底信息条</h3><section class="info-bar" style="margin-top:0"><div class="info-head"><span class="info-kicker">10月18日 周日 · 高阶</span><span class="info-tag">报名中</span></div><h2 class="info-title">云蒙山&amp;喇叭沟 RIDE</h2><p class="info-meta"><span>早上 6 点 20 分集合</span><span>望京西地铁站</span></p></section></div>
      </div>
      <h2>浅色对比度检查表（实时读取 CSS 变量计算）</h2>
      <table class="overview-table"><thead><tr><th>用途</th><th>前景</th><th>背景</th><th>对比度</th><th>门槛</th><th>使用位置</th></tr></thead><tbody>${contrast}</tbody></table>
      <p class="lead">--color-subtle（#737373）对页面底 #f3f3f1 只有 4.27 : 1，不得用于页面底上的文字，只用于白底或线稿；--color-border 只作分隔线，不作控件边框。</p>
      <h2>截图问题对照表（${data.issues.length} 条，全部有对应方案）</h2>
      <table class="overview-table"><thead><tr><th>编号</th><th>页面</th><th>问题</th><th>改版方案</th><th>规范</th></tr></thead><tbody>${issues}</tbody></table>`;
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

  const list = (items) => items.map((item) => `<li>${item}</li>`).join('');

  function updateChrome(page) {
    const stateLabel = (page.states.find(([id]) => id === currentState) || page.states[0])[1];
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
          `<button class="${id === currentState ? 'is-active' : ''}" data-state="${id}" data-route="${page.id}">${label}</button>`,
      )
      .join('');
    $('#screen-problems').innerHTML = list(page.problems);
    $('#screen-fixes').innerHTML = list(page.fixes);
    $('#screen-spec').innerHTML = page.spec.map((item) => `<button data-action="open-overview">${item}</button>`).join('');
    nav.querySelectorAll('[data-route]').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.route === page.id);
    });
    $('#tab-bar').hidden = !tabRoutes.includes(page.id);
    document.querySelectorAll('.tab-button').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.route === page.id);
    });
  }

  function showOverview() {
    demo.hidden = true;
    overview.hidden = false;
    if (!overview.innerHTML) renderOverview();
    if (window.location.hash !== '#overview') window.history.replaceState(null, '', '#overview');
  }

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
    currentState = stateIds.includes(options.state) ? options.state : page.states[0][0];
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

  // 成功前缀白色 ✓、提醒前缀白色 ⚠、失败前缀橙色 !（theme-constraints.md §7 toast）
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
    if (action === 'copy-activity') showCopyActivity();
    if (action === 'copy-route') {
      showPage('activity-detail', { state: 'copied', replace: true });
      showToast('路线链接已复制');
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
      if (action === 'reject-review' && currentState !== 'reject-error') {
        showPage('admin-review-detail', { state: 'reject-error', replace: true });
        showToast('驳回时请填写理由', 'error');
        return;
      }
      showToast(action === 'approve-review' ? '报名已通过' : '报名已驳回');
      window.setTimeout(() => showPage('admin-reviews'), 500);
    }
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') modal.hidden = true;
    if (!demo.hidden && ['ArrowUp', 'ArrowDown'].includes(event.key)) {
      event.preventDefault();
      const page = pageById.get(currentRoute);
      const index = page.states.findIndex(([id]) => id === currentState);
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
    if (route === 'overview') showOverview();
    else if (pageById.has(route)) showPage(route, { state, replace: route === currentRoute });
  });

  renderNavigation();
  const initial = parseHash();
  if (initial.route === 'overview') showOverview();
  else showPage(pageById.has(initial.route) ? initial.route : 'activities', { state: initial.state, replace: true });
})();
