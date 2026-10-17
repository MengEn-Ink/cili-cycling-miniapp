(() => {
  const { activities, rider, driver, attendees, releaseNotes } = window.prototypeData;
  const primary = activities[0];
  const trip = activities[1];
  const IMG = {
    cover: './assets/prototype/img-cover.jpg',
    rider: './assets/prototype/img-rider.jpg',
    avatar: './assets/prototype/img-avatar.jpg',
  };

  // 当前页面状态由 app.js 写入 window.prototypeState；未写入时取 schema 中的第一个状态
  const st = () => window.prototypeState || '';
  const is = (...names) => names.includes(st());

  /* ---------- 公共组件（与设计说明“公共规范”对应） ---------- */
  const brandLogo = (meta) =>
    `<div class="prototype-brand-logo"><span class="prototype-wordmark" aria-hidden="true"><span>此</span><span>里</span><i></i></span><span class="prototype-brand-meta">${meta}</span></div>`;
  const tag = (type, label) => `<span class="tag tag-${type}">${label}</span>`;
  const row = (k, v) => `<div class="row"><span class="k">${k}</span><span class="v">${v}</span></div>`;
  const rows = (list) => `<div class="rows">${list.map(([k, v]) => row(k, v)).join('')}</div>`;
  const linkRow = (icon, title, sub, route, right = '') =>
    `<button class="row is-link" data-route="${route}"><span class="k"><span class="menu-icon ${icon}"><i></i></span><span>${title}<small>${sub}</small></span></span><span class="v">${right}<span class="chev">›</span></span></button>`;
  const metric = (value, label, extra = '') => {
    const match = String(value).match(/^(.+?)\s+(km|m|人)$/);
    const reading = match
      ? `<span class="metric-reading"><b>${match[1]}</b><i>${match[2]}</i></span>`
      : `<span class="metric-reading"><b>${value}</b></span>`;
    return `<span class="${extra}">${reading}<small>${label}</small></span>`;
  };
  const metrics = (list, extra = '') =>
    `<div class="metric-grid ${extra}">${list.map(([v, l, e]) => metric(v, l, e)).join('')}</div>`;
  const cardHead = (no, title, right = '', hint = '') =>
    `<div class="card-head">${no ? `<span class="card-no">${no}</span>` : ''}<h3 class="card-title">${title}</h3>${right}</div>${hint ? `<p class="card-hint">${hint}</p>` : ''}`;
  const btn = (label, attrs = '', kind = 'btn') => `<button class="${kind}" ${attrs}>${label}</button>`;
  const go = (route) => `data-route="${route}"`;
  const toast = (message) => `data-action="toast" data-message="${message}"`;
  const steps = (current) => {
    const stages = [
      ['填写报名', '当前'],
      ['组织审核', '提交后'],
      ['获取凭证', '通过后'],
    ];
    return `<div class="steps" role="list" aria-label="报名流程，共三阶段">${stages
      .map(([label, state], index) => {
        const n = index + 1;
        const cls = n === current ? 'is-current' : n < current ? 'is-done' : '';
        return `<div class="step ${cls}" role="listitem" ${n === current ? 'aria-current="step"' : ''}><b>${n < current ? '✓' : n}</b><span><strong>${label}</strong><small>${state}</small></span></div>`;
      })
      .join('')}</div>`;
  };
  const fixedBar = (hint, actions, neutral = false) =>
    `<div class="fixed-bar">${hint ? `<p class="bar-hint ${neutral ? 'is-neutral' : ''}">${hint}</p>` : ''}<div class="bar-actions ${actions.length === 1 ? 'single' : ''}">${actions.join('')}</div></div>`;
  const stateView = (mark, title, desc, action = '', error = false) =>
    `<div class="state ${error ? 'is-error' : ''}"><span class="state-mark">${mark}</span><h3>${title}</h3><p>${desc}</p>${action}</div>`;
  const skeletons = (count, media = false) =>
    `<p class="loading-line">正在加载…</p>${Array.from({ length: count }, () => `<div class="skeleton">${media ? '<i class="sk-media"></i>' : ''}<i></i><i></i><i></i></div>`).join('')}`;
  const field = (label, inner, extra = '') =>
    `<div class="field"><div class="field-label">${label}${extra}</div>${inner}</div>`;
  const input = (value, opts = {}) =>
    `<div class="input ${opts.cls || ''}">${value ? `<span>${value}</span>` : `<span class="ph">${opts.ph || ''}</span>`}${opts.unit ? `<span class="unit">${opts.unit}</span>` : ''}</div>${opts.error ? `<p class="field-msg is-error">${opts.error}</p>` : ''}${opts.count ? `<p class="count">${opts.count}</p>` : ''}`;
  const choices = (list, active) =>
    `<div class="seg">${list.map((label) => `<button class="${label === active ? 'is-active' : ''}" data-action="choice">${label}</button>`).join('')}</div>`;

  const routePath = 'M14 118 C 48 112, 58 64, 96 70 S 140 122, 176 96 S 214 28, 252 40 S 296 86, 306 30';
  const routeSvg = (label) =>
    `<div class="route-canvas" role="img" aria-label="${label}"><svg viewBox="0 0 320 148" preserveAspectRatio="none"><path d="${routePath}" style="fill:none;stroke:var(--color-text);stroke-width:3;stroke-linecap:round"/><circle cx="14" cy="118" r="6" style="fill:var(--color-brand)"/><circle cx="306" cy="30" r="6" style="fill:var(--color-text)"/></svg><span class="tag tag-neutral cap">起点 · 终点</span></div>`;
  const elevSvg = (label) =>
    `<div class="route-canvas" role="img" aria-label="${label}"><svg viewBox="0 0 320 148" preserveAspectRatio="none"><path d="M0 132 L0 120 L30 112 L60 96 L84 70 L110 82 L140 40 L168 28 L196 58 L222 72 L250 46 L278 90 L300 110 L320 118 L320 132 Z" style="fill:var(--color-raised);stroke:var(--color-text);stroke-width:2"/></svg><span class="tag tag-neutral cap">${primary.elevationMinM}–${primary.elevationMaxM} m</span></div>`;
  const qr = (seed = 7) => {
    const size = 21;
    const cells = [];
    const finder = (x, y) => {
      const inBox = (ox, oy) => x >= ox && x < ox + 7 && y >= oy && y < oy + 7;
      for (const [ox, oy] of [[0, 0], [14, 0], [0, 14]]) {
        if (inBox(ox, oy)) {
          const dx = x - ox;
          const dy = y - oy;
          return dx === 0 || dx === 6 || dy === 0 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4) ? 1 : 0;
        }
      }
      return -1;
    };
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const f = finder(x, y);
        const on = f === -1 ? ((x * 31 + y * 17 + seed * (x ^ y)) % 7) < 3 : f === 1;
        if (on) cells.push(`<rect x="${x}" y="${y}" width="1" height="1"/>`);
      }
    }
    return `<div class="qr" role="img" aria-label="二维码示意"><svg viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">${cells.join('')}</svg></div>`;
  };
  const emptyMedia = () =>
    `<div class="rider-card-media is-empty"><svg viewBox="0 0 360 168" preserveAspectRatio="none"><path d="M-10 140 C 60 120, 90 60, 150 72 S 240 150, 300 90 S 350 30, 380 40" style="fill:none;stroke:var(--color-muted);stroke-width:2"/><path d="M-10 160 C 70 140, 110 96, 170 104 S 250 160, 380 110" style="fill:none;stroke:var(--color-muted);stroke-width:1.5"/><path d="M20 128 C 80 112, 104 70, 150 78" style="fill:none;stroke:var(--color-brand);stroke-width:3;stroke-linecap:round"/></svg><span class="brand-word">CILI RIDER</span></div>`;
  const riderCard = (hasPhoto, extra = '') => `<article class="rider-card">
      ${hasPhoto ? `<div class="rider-card-media"><img src="${IMG.rider}" alt="骑行照片" />${tag('neutral', '骑行照片').replace('class="tag', 'class="media-label tag')}</div>` : emptyMedia()}
      <div class="rider-card-person"><span class="avatar lg">${hasPhoto ? `<img src="${IMG.avatar}" alt="${rider.nickname}" />` : rider.nickname.slice(0, 1)}</span><div><h3>${rider.nickname} ${tag('neutral', rider.gender)}</h3><p>${rider.title}</p></div></div>
      ${rows([
        ['骑行经验', rider.experience],
        ['公开范围', '活动中公开'],
      ])}
      ${extra}
    </article>`;

  const templates = {
    activities: () => {
      if (is('loading')) return `<div class="pg">${brandLogo('此里骑行活动')}<h2 class="page-title">选一场骑行，一起出发</h2>${skeletons(2, true)}</div>`;
      const head = `${brandLogo('此里骑行活动')}<h2 class="page-title">选一场骑行，一起出发</h2><p class="page-sub long-copy">路线、时间、集合点，一眼看清；先看状态与路线强度，再决定是否出发</p>
        <div class="seg"><button class="is-active" data-action="choice">即将开始</button><button data-action="choice">历史活动</button></div>`;
      if (is('empty'))
        return `<div class="pg">${head}${stateView('0', '近期暂无活动', '新的骑行发布后会出现在这里，可以先看看历史活动。', btn('查看历史活动', toast('已切换至历史活动'), 'btn-secondary'))}</div>`;
      if (is('error'))
        return `<div class="pg">${head}${stateView('!', '活动加载失败', '网络不稳定，请检查网络后重试。', btn('重新加载', toast('正在重新加载')), true)}</div>`;
      const chips = [
        ['全部', '2 场'],
        ['10.17', '周六'],
        ['10.18', '周日'],
        ['10.24', '周六'],
        ['10.25', '周日'],
      ];
      return `<div class="pg">${head}
        <div class="chips">${chips.map(([a, b], i) => `<button class="chip ${i ? '' : 'is-active'}" data-action="choice">${a}<small>${b}</small></button>`).join('')}</div>
        <div class="list-count"><span>近期活动 <em>当前第 1 场</em></span><b>共 2 场</b></div>
        ${activities
          .map(
            (a, i) => `<article class="activity-card">
            <div class="cover">${i ? emptyMedia().replace('rider-card-media is-empty', 'cover-empty') : `<img src="${IMG.cover}" alt="${a.title}" />`}${i ? tag('pending', '我已报名 · 待审核') : tag('solid', '报名中')}</div>
            <div class="activity-card-body"><p class="meta-line">${a.date} · ${a.time}</p><h3>${a.title}</h3><p class="meta-line">${a.start}集合 · ${a.level}</p>${i ? '' : `<p class="alert-line">${tag('warning', '⚠ 名额紧张')}</p>`}
            ${metrics([[`${a.distanceKm} km`, '里程'], [`${a.elevationM} m`, '爬升'], [`${a.approved}/${a.capacity}`, '名额']], 'three')}
            <div class="btn-row">${btn('查看详情', go('activity-detail'), 'btn-secondary')}${i ? btn('查看行程', go('registrations')) : btn('报名活动', 'data-route="registration-form"')}</div></div>
          </article>`,
          )
          .join('')}</div>`;
    },

    'activity-detail': () => {
      const approved = is('', 'approved', 'copied', 'copy-failed');
      const full = is('full');
      const bar = approved
        ? fixedBar('你已通过审核，出发前请查看凭证', [btn('查看我的行程', go('registrations'))], true)
        : full
          ? fixedBar('名额已满，可关注下一场活动', [btn('名额已满', 'disabled', 'btn is-disabled')], true)
          : fixedBar(`剩余 ${primary.capacity - primary.approved} 个名额，报名后需管理员审核`, [btn('立即报名', go('registration-form'))], true);
      const copyToast = is('copied')
        ? '<div class="inline-toast" role="status"><b aria-hidden="true">✓</b>路线链接已复制</div>'
        : is('copy-failed')
          ? '<div class="inline-toast is-error" role="alert"><b aria-hidden="true">!</b>复制失败，请稍后重试</div>'
          : '';
      const statusTag = approved ? tag('success', '✓ 已通过') : full ? tag('muted', '名额已满') : tag('outline', '报名中');
      return `<div class="pg has-bar">
        <div class="cover"><img src="${IMG.cover}" alt="${primary.title}" /><span class="cover-count">1/3</span><div class="cover-dots"><i class="is-active"></i><i></i><i></i></div></div>
        <section class="info-bar"><div class="info-head"><span class="info-kicker">${primary.date} · ${primary.level}</span><span class="info-tag">${approved ? '已通过' : full ? '名额已满' : '报名中'}</span></div><h2 class="info-title">${primary.title}</h2><p class="info-meta"><span>${primary.time}集合</span><span>${primary.start}</span></p></section>
        ${metrics([[`${primary.distanceKm} km`, '里程'], [`${primary.elevationM} m`, '爬升'], [primary.estimatedRideTime, '预计骑行'], [`${primary.approved} 人`, '已通过']])}
        <div class="card"><div class="detail-decision"><div><p class="card-hint">报名状态</p><h3 class="card-title">${approved ? '已通过' : full ? '名额已满' : '可报名'}</h3><p class="card-hint">${approved ? '可查看行程凭证与活动群二维码' : full ? '本场名额已满，暂不接受报名' : '提交后由管理员审核，结果在行程页同步'}</p>${approved || full ? '' : `<p class="alert-line">${tag('warning', '⚠ 即将截止 · 10月17日 20:00')}</p>`}</div>${statusTag}</div></div>
        <div class="card">${cardHead('', '集合信息')}${rows([['集合时间', primary.time], ['集合地点', primary.start], ['费用', primary.fee]])}${btn('地图导航', toast('已打开集合点导航'), 'btn-secondary')}</div>
        <div class="card">${cardHead('', 'Strava 官方路线', tag('neutral', '官方'), '复制组织者分享的规范化公开路线链接。')}${btn('复制路线链接', 'data-action="copy-route"', 'btn-secondary')}${copyToast}<p class="card-hint">小程序内不打开第三方页面，复制后可自行粘贴使用。</p></div>
        <div class="card route-brief-card">
          <div class="card-head"><h3 class="card-title">路线概览</h3><span class="route-brief-chip">${primary.level}</span></div>
          <div class="route-brief-metrics">
            <span><b>${primary.distanceKm}</b><i>km</i><small>距离</small></span>
            <span><b>${primary.elevationM}</b><i>m</i><small>累计爬升</small></span>
            <span><b>${primary.elevationLossM}</b><i>m</i><small>累计下降</small></span>
            <span><b>${primary.elevationMaxM}</b><i>m</i><small>最高海拔</small></span>
          </div>
          <div class="route-brief-sparkline" aria-hidden="true">
            <svg viewBox="0 0 320 60" preserveAspectRatio="none">
              <defs>
                <linearGradient id="briefFill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stop-color="#d64520" stop-opacity="0.32"/>
                  <stop offset="100%" stop-color="#d64520" stop-opacity="0"/>
                </linearGradient>
              </defs>
              <path d="M0 52 L18 46 L42 40 L72 28 L102 10 L132 6 L162 18 L198 24 L232 32 L268 42 L300 48 L320 54 L320 60 L0 60 Z" fill="url(#briefFill)"/>
              <path d="M0 52 L18 46 L42 40 L72 28 L102 10 L132 6 L162 18 L198 24 L232 32 L268 42 L300 48 L320 54" fill="none" stroke="#d64520" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
              <circle cx="132" cy="6" r="3" fill="#d64520"/>
            </svg>
            <span class="route-brief-elev"><b>${primary.elevationMinM}–${primary.elevationMaxM} m</b> 海拔区间</span>
          </div>
          <p class="route-brief-caption">${primary.route}</p>
          ${btn('查看完整路线分析 →', go('route-analysis'), 'btn-secondary route-brief-cta')}
        </div>
        <div class="card">${cardHead('', '已报名人员', tag('neutral', `${primary.approved} / ${primary.capacity}`), '其他骑友只显示昵称，头像与昵称经本人授权展示')}<div class="avatar-row">${attendees.map((name) => `<button data-action="rider" data-rider="${name}"><span class="avatar">${name.slice(0, 1)}</span><small>${name}</small></button>`).join('')}</div></div>
        <div class="card">${cardHead('', '活动群二维码')}${approved ? `<div class="qr-row" style="margin-top:12px">${qr(3)}<p class="card-hint">扫码加入活动群，出发前请留意群内通知。长按可保存。</p></div>` : `<p class="neutral-note">报名通过后可查看活动群二维码。</p>`}</div>
        <div class="card">${cardHead('', '备注事项')}<p class="card-hint" style="color:var(--color-text)">请佩戴头盔，携带补给水、备胎和基础维修工具；雨天活动另行通知。</p></div>
      </div>${bar}`;
    },

    'registration-form': () => {
      const selected = is('selected', 'submitting');
      const submitting = is('submitting');
      const action = submitting
        ? btn('提交中', 'disabled', 'btn is-loading')
        : selected
          ? btn('提交报名', 'data-action="submit-registration"')
          : btn('提交报名', 'disabled', 'btn is-disabled');
      return `<div class="pg registration-page">${steps(1)}
        <h2 class="page-title registration-title">确认报名信息</h2><p class="page-sub long-copy">提交后将进入审核，请确认资料准确；集合方式与能力自评将供组织者审核，通过后可查看出发凭证。</p>
        <section class="info-bar"><div class="info-head"><span class="info-kicker">当前活动</span><span class="info-tag">报名开放</span></div><h2 class="info-title">${primary.title}</h2><p class="info-meta"><span>${primary.date} · ${primary.time}</span><span>总名额 ${primary.capacity}</span></p></section>
        <div class="card">${cardHead('01', '报名资料', tag('neutral', '本人可见'), '用于审核与活动安全联络，仅你本人与审核管理员可见')}${rows([['昵称', rider.nickname], ['真实姓名', rider.realName], ['手机号', rider.phone], ['紧急联系人', rider.emergency]])}<button class="btn-text" ${go('profile-edit')}>修改资料</button></div>
        <div class="card">${cardHead('02', '集合方式', tag('neutral', '默认'), '不同集合方式分别计算名额，请按实际情况选择')}${choices(['自行前往', '需要后援车'], '自行前往')}<p class="card-hint">名额以提交时状态为准；活动或所选方式满额后，将自动进入候补。</p></div>
        <div class="card">${cardHead('03', '能力自评', tag('pending', '必选'), '请选择最接近当前骑行能力的一项，供组织者审核参考')}${choices(['新手', '有经验', '常骑'], selected ? '有经验' : '')}${selected ? '' : '<p class="pending-note">请选择骑行经验后再提交</p>'}</div>
        <div class="card">${cardHead('04', '备注与安全', tag('neutral', '选填'), '仅填写组织方需要提前了解的信息')}${input('', { cls: 'textarea', ph: '饮食、集合或其他备注', count: '0/500' })}</div>
      </div>${fixedBar(selected ? '资料已完整，可以提交' : '还差 1 项：骑行经验', [btn('返回活动', go('activity-detail'), 'btn-secondary'), action], selected)}`;
    },

    registrations: () => {
      const cancelledDeleted = Boolean(window.prototypeCancelledTripDeleted);
      const tripCount = is('empty') ? 0 : cancelledDeleted ? 1 : 2;
      const head = `${brandLogo('我的行程')}<div class="page-heading"><div><h2 class="page-title">我的行程</h2><p class="page-sub">审核状态与出发凭证，一处确认</p></div><b>${is('loading') ? '同步中' : `共 ${tripCount} 场`}</b></div>`;
      if (is('loading')) return `<div class="pg registrations-prototype">${head}${skeletons(2)}</div>`;
      if (is('empty'))
        return `<div class="pg registrations-prototype">${head}<div class="trip-summary">${metric('0', '审核中')}${metric('0', '可出发', 'is-ready')}${metric('0', '已失效')}</div>${stateView('0', '还没有行程', '报名活动后，审核进度和出发凭证都会出现在这里。', btn('去看看活动', go('activities')))}</div>`;
      return `<div class="pg registrations-prototype">${head}
        <div class="trip-summary">${metric('0', '审核中')}${metric('1', '可出发', 'is-ready')}${metric(cancelledDeleted ? '0' : '1', '已失效')}</div>
        <article class="trip-ticket"><div class="trip-ticket-top"><b class="ticket-label">骑行票据</b><span class="ticket-date">10月18日 周日</span>${tag('success', '✓ 已通过')}</div><div class="trip-ticket-body"><h3>浦东滨江夜骑 · 鎏金落日线</h3><div class="trip-ticket-info"><div><small>集合时间</small><b>17:30</b></div><div><small>集合地点</small><b>浦东滨江 12 号望江台</b></div></div><div class="ticket-meta"><span>集合方式</span><b>自行前往</b></div><p class="status-guidance"><i></i>凭证已就绪，出发当天向组织者出示</p>${btn('查看凭证', go('credential'), 'btn trip-ticket-primary')}</div></article>
        ${cancelledDeleted ? '' : `<article class="trip-ticket trip-ticket-cancelled"><div class="trip-ticket-top"><b class="ticket-label">骑行票据</b><span class="ticket-date">10月11日 周日</span>${tag('muted', '已取消')}</div><div class="trip-ticket-body"><h3>奉贤海湾拉练</h3><div class="trip-ticket-info"><div><small>集合时间</small><b>07:00</b></div><div><small>集合地点</small><b>奉贤海湾旅游区集合点</b></div></div><p class="status-guidance"><i></i>可左滑或点击删除记录</p><div class="trip-ticket-actions"><button class="btn trip-ticket-delete" data-action="delete-trip">删除记录</button><button class="btn-secondary" data-action="cancelled-trip-detail">查看详情</button></div></div></article>`}
      </div>`;
    },

    credential: () => {
      const hasPhoto = !is('no-photo');
      return `<div class="pg">
        <p class="section-label credential-rider-heading">公开骑行名片</p>
        ${riderCard(hasPhoto, hasPhoto ? '' : `<p class="neutral-note" style="margin:0 16px 12px">添加一张骑行照片，名片会更有辨识度。</p><div style="padding:0 16px 16px">${btn('添加骑行照片', go('profile-edit'), 'btn-secondary')}</div>`)}
        <article class="credential-ticket">
          <div class="ticket-head">${brandLogo('报名凭证')}<code>CILI-1017-012</code></div>
          <div class="ticket-body">${tag('success', '✓ 已通过 · 准时集合')}<h2 class="card-title" style="margin-top:8px">${trip.title}</h2><p class="meta-line">${trip.date}</p></div>
          <div class="credential-spotlight"><p class="info-kicker">集合时间</p><p class="info-big">${trip.time}</p><p class="info-kicker" style="margin-top:8px">集合地点</p><p class="info-title" style="margin-top:0">${trip.start}</p><p class="info-meta">北京市门头沟区黑石头村入口</p><div style="margin-top:12px">${btn('地图导航', toast('已打开集合点导航'), 'btn-inverse')}</div></div>
          <div class="ticket-body">${rows([
            ['骑手', rider.realName],
            ['性别', rider.gender],
            ['集合方式', '自行前往'],
          ])}</div>
        </article>
        <div class="card">${cardHead('', '队伍：风向小队')}<p class="card-hint">我是队长，可使用右上角分享邀请队员</p></div>
        <div style="margin-top:12px">${btn('查看路线分析', go('route-analysis'), 'btn-secondary')}</div>
        <div style="margin-top:12px">${btn('取消报名', toast('已取消报名'), 'btn-secondary')}</div>
      </div>`;
    },

    profile: () => {
      const notice = '<p class="neutral-note">联系电话仅用于活动联络；紧急联系人仅在骑行安全需要时使用。</p>';
      if (is('guest'))
        return `<div class="pg">${brandLogo('此里')}<h2 class="page-title">一起骑，去更远的地方</h2>${stateView('此', '微信未登录', '使用微信身份登录，报名资料仅用于活动联络与安全保障。', btn('重新登录', toast('微信授权中')))}${notice}</div>`;
      const admin = is('', 'admin');
      return `<div class="pg">${brandLogo('此里 · 一起骑，去更远的地方')}
        <section class="profile-hero-card"><img src="${IMG.rider}" alt="骑行背景照片" /><div class="profile-hero-shade"></div><div class="profile-hero-identity"><span class="avatar lg ring"><img src="${IMG.avatar}" alt="${rider.nickname}" /></span><div><h2>${rider.nickname}</h2><p>${rider.title}</p><p class="auth-line">微信已登录</p></div></div></section>
        <div class="card completion"><div class="row" style="min-height:24px;border:0"><span class="k">资料完整度</span><span class="v">80%</span></div><div class="progress on-light"><i style="width:80%"></i></div><p class="card-hint">还差：骑行照片。补充后公开名片会更完整。</p></div>
        <p class="section-label">常用服务</p>
        <div class="menu-card">
          ${admin ? linkRow('i-admin', '活动管理', '创建、编辑、上下架与报名审批', 'admin-activity-list') : ''}
          ${linkRow('i-profile', '报名资料', '头像、昵称、实名、电话与紧急联系人', 'profile-edit')}
          ${linkRow('i-settings', '设置', '查看当前版本与本次更新内容', 'settings')}
        </div>
        <div class="privacy-panel"><b>隐私说明</b><p>联系电话仅用于活动联络；紧急联系人仅在骑行安全需要时使用。资料仅你本人和报名审核员可见。</p></div></div>`;
    },

    settings: () => {
      const [version, title, summary] = releaseNotes[0];
      return `<div class="pg"><h2 class="page-title">设置</h2><p class="page-sub">查看当前版本信息与本次更新内容</p>
      <div class="card">${cardHead('01', 'App 更新', '', '当前版本的更新概览')}
        <div class="release release-current"><code>V${version}</code>${tag('solid', '当前版本')}<p>${title}</p><p class="card-hint">→ ${summary}</p></div>
      </div>
      <p class="neutral-note">此里 · 持续为每一次出发升级</p></div>`;
    },

    'capability-card': () => {
      const hasPhoto = !is('no-photo');
      return `<div class="pg"><p class="page-sub">其他骑友在活动中看到的样子：只显示昵称，不显示实名与电话。</p>
        ${riderCard(hasPhoto, hasPhoto ? '' : '<p class="neutral-note" style="margin:0 16px 16px">还没有骑行照片，先用品牌底图展示。添加一张骑行照片，名片会更有辨识度。</p>')}
        <p class="neutral-note">公开骑行名片只包含昵称、照片和骑行经验，不含第三方账号数据。</p>
        <div style="margin-top:12px">${btn(hasPhoto ? '更换骑行照片' : '添加个人骑行照片', toast('已打开骑行照片选择器'), hasPhoto ? 'btn-secondary' : 'btn')}</div></div>`;
    },

    'profile-edit': () => {
      const focus = is('focus');
      const error = is('error');
      const uploading = is('uploading');
      return `<div class="pg">
        <div class="card">${cardHead('01', '更新头像')}<div class="profile-avatar-editor"><span class="avatar profile-avatar-preview"><img src="${IMG.avatar}" alt="当前微信头像" /></span><div class="profile-avatar-panel"><p>请选择微信头像，选择后立即保存，并用于个人主页和活动报名中的骑手身份展示。</p>${btn('选择微信头像', toast('已打开微信头像选择器'), 'btn-secondary')}</div></div></div>
        <div class="card">${cardHead('02', '基础资料')}${field('昵称', input(rider.nickname, { count: '4/16' }))}
          ${field('真实姓名', input(focus ? `${rider.realName}<i class="caret"></i>` : rider.realName, { cls: focus ? 'is-focus' : '' }))}
          ${field('手机号', input(error ? '138 0000 567' : rider.phone, { cls: error ? 'is-error' : '', error: error ? '手机号应为 11 位数字' : '' }))}
          ${field('性别', choices(['男', '女'], rider.gender))}
          ${field('紧急联系人', input('杜某某'))}
          ${field('紧急联系人电话', input(error ? '' : '166 0000 4323', { cls: error ? 'is-error' : '', ph: '请输入紧急联系人电话', error: error ? '请填写紧急联系人电话' : '' }))}</div>
        <div class="card">${cardHead('03', '个人背景图', tag('neutral', uploading || !error ? '1/1' : '0/1'), '最多 1 张；选择后可按 16:9 移动和缩放画面，建议使用横向照片')}
          <div class="upload-grid">
            ${uploading ? `<div class="upload-thumb"><img src="${IMG.cover}" alt="上传中" /><div class="thumb-state is-uploading">正在上传 62%<span class="progress"><i style="width:62%"></i></span></div></div>` : error ? `<div class="upload-thumb"><div class="thumb-state is-failed">上传失败<button class="btn-text" ${toast('正在重新上传')}>重试</button></div></div>` : `<div class="upload-thumb"><img src="${IMG.rider}" alt="个人背景图" /><span class="thumb-badge">${tag('neutral', '背景')}</span><button class="thumb-del" ${toast('背景图已删除')} aria-label="删除背景图"></button></div>`}
          </div></div>
        <p class="neutral-note">真实姓名、手机号和紧急联系人只对你和审核管理员可见，不会出现在公开名片中。</p>
        ${error ? '<p class="field-msg is-error">有 2 项需要修改</p>' : ''}
        <div style="margin-top:12px">${btn('保存资料', 'data-action="save-profile"')}</div>
      </div>`;
    },

    'admin-activity-list': () => {
      const head = `<h2 class="page-title">我的活动</h2><p class="page-sub">管理全部活动与发布状态</p>
        <div class="seg"><button class="is-active" data-action="choice">全部 <small>3</small></button><button data-action="choice">已下架 <small>1</small></button><button data-action="choice">已上线 <small>1</small></button><button data-action="choice">已结束 <small>1</small></button></div>`;
      const footer = `<div class="btn-row" style="margin-top:16px">${btn('报名审批', go('admin-reviews'), 'btn-secondary')}${btn('创建活动草稿', go('admin-activity-edit') + ' data-state="create"')}</div>`;
      if (is('loading')) return `<div class="pg">${head}${skeletons(2)}</div>`;
      if (is('empty'))
        return `<div class="pg">${head}${stateView('0', '还没有活动', '创建第一场骑行活动草稿，发布后骑友即可报名。', btn('创建活动草稿', go('admin-activity-edit') + ' data-state="create"'))}</div>`;
      const list = [
        ...activities.map((a) => ({ ...a, signups: a.approved + a.pending })),
        { title: '秋日环湖耐力骑', date: '10月11日 周六', time: '早上 7 点整', start: '奥森南门', distanceKm: 82, elevationM: 680, adminStatus: '已结束', approved: 16, pending: 0, signups: 17 },
      ];
      return `<div class="pg">${head}<div class="list-count"><span>活动列表</span><b>共 3 场</b></div>
        ${list
          .map((a) => {
            const statusTag = a.adminStatus === '已上线' ? tag('solid', '已上线') : a.adminStatus === '已下架' ? tag('outline', '已下架') : tag('muted', '已结束');
            const toggle = btn(a.adminStatus === '已上线' ? '下架' : '上架', toast(a.adminStatus === '已上线' ? '活动已下架' : '活动已上架'), 'btn-secondary btn-sm');
            return `<article class="admin-card"><div class="admin-card-head">${statusTag}<span class="meta-line">${a.date} · ${a.time}</span></div><h3>${a.title}</h3><p class="meta-line">${a.start}集合 · ${a.distanceKm} km · ${a.elevationM} m</p>
              <div class="metric-grid three"><span><b>${a.signups}</b><small>报名</small></span><span><b class="${a.pending ? 'is-pending' : ''}">${a.pending}</b><small>待审核</small></span><span><b>${a.approved}</b><small>已通过</small></span></div>
              <div class="btn-row">${btn('编辑', go('admin-activity-edit'), 'btn-secondary btn-sm')}${toggle}</div>
              <div class="admin-card-more">${a.adminStatus === '已下架' ? `<button class="btn-text" ${toast('草稿已删除')}>删除（仅草稿）</button>` : ''}<button class="btn-text" data-action="copy-activity">从此活动创建</button></div></article>`;
          })
          .join('')}${footer}</div>`;
    },

    'admin-activity-edit': () => {
      const create = is('create');
      const error = is('error');
      const uploading = is('uploading');
      const filled = !create && !error;
      const v = (value) => (filled || uploading ? value : '');
      return `<div class="pg">
        ${create ? '' : `<p class="neutral-note" style="margin-top:0">${error ? '请补全标红的必填项后再发布。' : '草稿已保存 · 10:24'}</p>`}
        <div class="card">${cardHead('01', '基本信息')}
          ${field('活动标题', input(error ? '' : v(primary.title), { ph: '请输入活动标题', cls: error ? 'is-error' : '', error: error ? '请填写活动标题' : '' }), tag('pending', '必填'))}
          <p class="sub-title">集合信息</p>
          ${field('集合时间', `<div class="field-2col">${input(v('2026-10-18'), { ph: '选择日期', unit: '›' })}${input(v('06:20'), { ph: '选择时间', unit: '›' })}</div>`, tag('pending', '必填'))}
          ${field('集合地点', `<div class="input-group"><div>${input(error ? '' : v(primary.start), { ph: '填写地点或从地图选择', cls: error ? 'is-error' : '' })}</div>${btn('地图选点', toast('已打开地图选点'), 'btn-secondary btn-sm')}</div>${error ? '<p class="field-msg is-error">请填写集合地点</p>' : ''}`, tag('pending', '必填'))}</div>
        <div class="card">${cardHead('02', '封面照片', tag('neutral', create || error ? '0 / 3' : uploading ? '2 / 3' : '1 / 3'), '最多 3 张，第一张作为封面')}
          <div class="upload-grid">
            ${create || error ? '' : `<div class="upload-thumb"><img src="${IMG.cover}" alt="活动封面" /><span class="thumb-badge">${tag('neutral', '封面')}</span><button class="thumb-del" ${toast('封面已删除')} aria-label="删除封面"></button></div>`}
            ${uploading ? `<div class="upload-thumb"><img src="${IMG.rider}" alt="上传中" /><div class="thumb-state is-uploading">正在上传 62%<span class="progress"><i style="width:62%"></i></span></div></div>` : ''}
            ${error ? `<div class="upload-thumb"><div class="thumb-state is-failed">上传失败<button class="btn-text" ${toast('正在重新上传')}>重试</button></div></div>` : ''}
            <button class="upload-tile" ${toast('已打开照片选择器')}><b>+</b>添加照片</button>
          </div></div>
        <div class="card">${cardHead('03', '备注、路线与群二维码')}
          ${field('备注说明', input(create ? '' : '请佩戴头盔，携带补给水、备胎和基础维修工具。', { cls: 'textarea', ph: '集合提醒、补给安排或其他需要说明的内容', count: create ? '0 / 5000' : '26 / 5000' }))}
          <p class="sub-title">活动路线</p>
          ${field('Strava 官方路线（可选）', `${input(filled || uploading ? primary.routeUrl : '', { ph: '粘贴公开路线链接' })}<div style="margin-top:8px">${btn('添加并解析路线', toast('公开路线已解析'), 'btn-secondary btn-sm')}</div><p class="card-hint">无需 Strava 授权；解析公开路线后会保存可信的路线详情。</p>`)}
          ${filled ? `<div class="row" style="margin-top:8px"><span class="k">${primary.routeName.replace(' GPX', '')}</span>${tag('solid', '公开路线已解析')}</div>
            ${metrics([[`${primary.distanceKm} km`, '里程'], [`${primary.elevationM} m`, '爬升'], [`${primary.elevationLossM} m`, '下降'], [`${primary.elevationMinM}–${primary.elevationMaxM} m`, '海拔区间', 'is-wide']])}
            ${routeSvg('公开路线轮廓')}<p class="card-hint">解析结果只在编辑页展示，不提供跳转预览。</p>` : ''}
          <p class="sub-title">GPX 路线详情（推荐）</p><p class="card-hint">上传后可展示里程、爬升、海拔曲线和路线图，参与者也可下载原文件。</p>
          ${uploading ? `<div class="upload-tile is-wide" style="flex-direction:column;height:auto;padding:12px;gap:8px">正在读取路线… 62%<span class="progress on-light"><i style="width:62%"></i></span></div>` : filled ? `<div class="row" style="margin-top:8px"><span class="k">${primary.routeName}</span>${tag('solid', '路线详情已准备好')}</div><div class="btn-row three" style="margin-top:8px">${btn('更换 GPX', toast('已打开文件选择'), 'btn-secondary btn-sm')}${btn('移除路线详情', toast('路线详情已移除'), 'btn-secondary btn-sm')}${btn('设为活动背景', toast('已设为活动背景'), 'btn-secondary btn-sm')}</div>` : `<button class="upload-tile is-wide" ${toast('GPX 已上传并完成解析')}><b>+</b>上传 GPX</button>`}
          <p class="sub-title">活动群二维码</p><p class="card-hint">可选上传 1 张微信群二维码，便于已报名成员进群；上传超过 7 天会提示可能过期。</p>
          ${create || error ? `<button class="upload-tile is-wide" ${toast('已打开图片选择器')}><b>+</b>上传活动群二维码</button>` : `<div class="qr-row" style="margin-top:8px">${qr(3)}<div><p class="card-hint">已上传 · 报名通过后骑友可见</p><p class="alert-line">${tag('warning', '⚠ 已上传 8 天，可能过期')}</p><button class="btn-text" ${toast('二维码已删除')}>删除二维码</button></div></div>`}</div>
      </div>${fixedBar(error ? '还有 2 项必填未完成' : '', [btn('保存草稿', toast('草稿已保存'), 'btn-secondary'), btn('发布活动', 'data-action="publish-activity"')])}`;
    },

    'admin-reviews': () => {
      const head = `<section class="info-bar" style="margin-top:0"><div class="info-head"><h2 class="info-title">${primary.title}</h2><span class="info-tag ${is('empty') ? '' : 'is-pending'}">${is('empty') ? '0' : '2'} 待审核</span></div><div style="margin-top:12px">${btn('切换活动', toast('已打开活动选择'), 'btn-inverse is-ghost')}</div></section>
        <div class="review-filter">${[['候补', 0], ['待审核', is('empty') ? 0 : 2], ['已通过', 18], ['已签到', 0], ['已驳回', 1], ['全部', is('empty') ? 19 : 21]].map(([label, n]) => `<button class="${label === '待审核' ? 'is-active' : ''}" data-action="choice">${label}<small>${n}</small></button>`).join('')}</div>`;
      if (is('loading')) return `<div class="pg">${head}${skeletons(2)}</div>`;
      if (is('empty')) return `<div class="pg">${head}${stateView('0', '当前筛选暂无报名', '新的报名提交后会出现在这里。', btn('查看已通过', toast('已切换至已通过'), 'btn-secondary'))}</div>`;
      if (is('error')) return `<div class="pg">${head}${stateView('!', '报名列表加载失败', '网络不稳定，请稍后重试。', btn('重新加载', toast('正在重新加载')), true)}</div>`;
      const people = [
        { name: rider.nickname, img: IMG.avatar, way: '自行前往', exp: '有经验', time: '10月14日 09:12' },
        { name: '小北', img: '', way: '需要后援车', exp: '新手', time: '10月14日 08:47' },
      ];
      return `<div class="pg">${head}<div class="list-count"><span>报名列表</span><b>共 2 人</b></div>
        ${people
          .map(
            (p) => `<article class="review-item"><div class="review-item-head"><span class="avatar">${p.img ? `<img src="${p.img}" alt="${p.name}" />` : p.name.slice(0, 1)}</span><div class="review-person"><h3>${p.name === rider.nickname ? rider.realName : p.name}</h3><p class="meta-line">骑友 · ${p.name}</p></div>${tag('pending', '待审核')}</div>
            <h4 class="review-activity">${primary.title}</h4><dl class="review-facts"><div><dt>集合方式</dt><dd>${p.way}</dd></div><div><dt>能力自评</dt><dd>${p.exp}</dd></div><div><dt>提交时间</dt><dd>${p.time}</dd></div></dl>${btn('审核报名', 'data-route="admin-review-detail"', 'review-action')}</article>`,
          )
          .join('')}<div class="card reminder-card">${cardHead('', '活动提醒', '', '仅向已通过的骑友发送；重复操作不会重复发送。')}${btn('发送活动提醒', toast('提醒已发送给 18 位骑友'), 'btn-secondary')}</div></div>`;
    },

    'admin-review-detail': () => {
      if (is('loading')) return `<div class="pg">${skeletons(3)}</div>`;
      const approved = is('approved');
      const rejectError = is('reject-error');
      return `<div class="pg">
        <section class="info-bar" style="margin-top:0"><div class="info-head"><span class="info-kicker">报名编号 REG-1017-018</span><span class="info-tag ${approved ? '' : 'is-pending'}">${approved ? '已通过' : '待审核'}</span></div><h2 class="info-title">${rider.nickname} · ${primary.title}</h2><p class="status-explain">${approved ? '已于 10月14日 10:02 通过，骑友已收到出发凭证。' : '通过后骑友会收到出发凭证；驳回需填写理由，骑友会看到。'}</p></section>
        <div class="card">${cardHead('01', '报名人', tag('neutral', '管理员可见完整信息'))}${rows([['昵称', rider.nickname], ['真实姓名', rider.realName], ['性别', rider.gender], ['手机号', rider.phone], ['验证来源', '微信身份']])}</div>
        <div class="card">${cardHead('02', '报名信息')}${rows([['骑行经验', '有经验'], ['集合方式', '自行前往'], ['队伍', '风向小队'], ['报名备注', '无']])}</div>
        <div class="card">${cardHead('03', '照片', '', '资料仅用于本次活动审核，不包含第三方账号数据。')}<div class="photo-strip"><div><img src="${IMG.rider}" alt="骑行照片" /></div><div><img src="${IMG.avatar}" alt="公开头像" /></div></div></div>
        <div class="card">${cardHead('04', '审核意见', approved ? '' : tag('neutral', '驳回时必填'))}${approved ? input('资料完整，欢迎参加', { cls: 'textarea is-disabled' }) : input('', { cls: `textarea ${rejectError ? 'is-error' : ''}`, ph: '驳回时必填，骑友会看到这段说明', error: rejectError ? '驳回时请填写理由' : '', count: '0/200' })}</div>
      </div>${approved ? fixedBar('骑友到达集合点后确认签到', [btn('确认签到', toast('已确认签到'))], true) : fixedBar(rejectError ? '请先填写驳回理由' : '', [btn('驳回报名', 'data-action="reject-review"', 'btn-secondary'), btn('通过报名', 'data-action="approve-review"')])}`;
    },

    'route-analysis': () => {
      if (is('loading')) {
        return `<div class="pg route-analysis-page">${skeletons(3)}</div>`;
      }
      const noProfile = is('no-profile');
      const selectedSegment = is('segment-climb') ? 'climb' : '';
      const selectedPointId = is('segment-climb')
        ? 'rest-1'
        : is('climb')
          ? 'climb'
          : 'highest';

      // 11 个海拔采样点：覆盖 42–1684 m 真实区间，形成双峰起伏。
      const samples = [
        { km: 0, m: 42 },
        { km: 12, m: 128 },
        { km: 28, m: 236 },
        { km: 48, m: 486 },
        { km: 68, m: 912 },
        { km: 86, m: 1308 },
        { km: 102, m: 1684 },
        { km: 118, m: 1446 },
        { km: 134, m: 1092 },
        { km: 150, m: 684 },
        { km: 168, m: 240 },
      ];
      const profile = noProfile ? samples.slice(0, 2) : samples;
      const minM = Math.min(...profile.map((p) => p.m));
      const maxM = Math.max(...profile.map((p) => p.m));
      const span = Math.max(1, maxM - minM);

      // 关键点：仅在存在"已验证真实地名 + 经纬度"时才会入列（设计样本按"真实样本"口径填充）
      // 字段：label(地名) / lat / lng / role(用途) / caution(注意事项，可选)
      const keyPoints = [
        { id: 'start', km: 0, m: 42, label: '望京西地铁站', lat: 40.0022, lng: 116.4733, role: '起点集合', caution: '7:00 集合，7:30 出发；地铁 15 号线 B 口外侧' },
        { id: 'warm-end', km: 24, m: 198, label: '怀柔水库补给点', lat: 40.3611, lng: 116.6304, role: '热身段终点 · 补水', caution: '桥下阴凉，队形重整' },
        { id: 'climb', km: 48, m: 486, label: '汤河口岔路', lat: 40.6238, lng: 116.6082, role: '主爬坡起点', caution: '右转进 X006；左转切勿误入 G111 快速车道' },
        { id: 'rest-1', km: 68, m: 912, label: '黑山寺垭口', lat: 40.6911, lng: 116.5721, role: '中段补给 · 山泉水源', caution: '山泉需煮沸；路边无洗手间' },
        { id: 'highest', km: 102, m: 1684, label: '云蒙山顶', lat: 40.6322, lng: 116.4201, role: '全线最高点', caution: '气温较山下低 8–10 °C，请加防风层' },
        { id: 'descent', km: 118, m: 1446, label: '盘山公路入口', lat: 40.5888, lng: 116.3914, role: '长下坡起点', caution: '连续 48 km 下降，刹车片易过热' },
        { id: 'rest-2', km: 150, m: 684, label: '琉璃庙镇', lat: 40.5021, lng: 116.4712, role: '补给 · 简餐', caution: '镇中心有便利店与小餐馆' },
        { id: 'end', km: 168, m: 240, label: '喇叭沟门原始森林公园', lat: 40.9876, lng: 116.5088, role: '终点', caution: '停车场集合拉伸，等候收尾队员' },
      ];

      // 坡段：轨道可视化 + 行数据（排序按出发到达顺序）
      const segments = [
        { id: 'warmup', name: '起步 · 热身', startKm: 0, endKm: 24, ascent: 206, descent: 20, grade: 0.8, difficulty: '轻松', color: '#8fb9a8', strategy: '前 24 公里保持轻档高踏频，不与同伴冲速。' },
        { id: 'rolling', name: '过渡 · 山脊起伏', startKm: 24, endKm: 48, ascent: 250, descent: 0, grade: 1.0, difficulty: '适中', color: '#d4a017', strategy: '中强度连续坡，保持稳定呼吸节奏。' },
        { id: 'climb', name: '主爬坡 · 云蒙段', startKm: 48, endKm: 102, ascent: 1198, descent: 0, grade: 2.2, difficulty: '挑战', color: '#d64520', strategy: '长坡前先补水与电解质，踏频 70–80，必要时坐站交替。' },
        { id: 'descent', name: '长下坡 · 盘山段', startKm: 102, endKm: 150, ascent: 0, descent: 1000, grade: -2.1, difficulty: '挑战', color: '#0f766e', strategy: '控制车速，手指常在刹车把；注意盲弯和碎石。' },
        { id: 'return', name: '返程 · 平原巡航', startKm: 150, endKm: 168, ascent: 0, descent: 444, grade: -2.5, difficulty: '适中', color: '#8fb9a8', strategy: '保持小组队形，前车报坑；补充糖分。' },
      ];
      const activeSegment = segments.find((s) => s.id === selectedSegment);
      const selectedPoint = keyPoints.find((p) => p.id === selectedPointId) || keyPoints[4];
      const totalKm = primary.distanceKm;

      // 骑行走向：按公里分段的"方位 / 道路 / 关键转向 / 注意"
      // 每条 direction 关联一个关键转弯点（lat/lng 复用关键点，不单独伪造）
      const directions = [
        { from: 0, to: 24, bearing: '北偏东 18°', road: '京承高速辅路 · G101 + 怀柔郊县道', terrain: '平原 → 浅丘，视野开阔', turn: '望京西 → 怀柔水库', note: '前 10 km 城市并线路段，注意公交车道' },
        { from: 24, to: 48, bearing: '正北 → 北偏西 10°', road: '怀柔 X006 郊县公路', terrain: '连续起伏 150–240 m，弯道增多', turn: '怀柔水库 → 汤河口岔路', note: '通过 3 处小桥，桥面有横缝，减速' },
        { from: 48, to: 102, bearing: '北偏西 25° → 正西', road: '汤河口 → 云蒙山 Y 村道', terrain: '连续爬升，坡度 2–7%，密林遮荫', turn: '汤河口右转进 X006 山区段', note: '对向会车窄，持续靠右，鸣铃过盲弯' },
        { from: 102, to: 150, bearing: '西偏南 → 东南', road: '云蒙山顶 → 盘山公路 → 琉璃庙镇', terrain: '长距离下坡，弯道 40+、短桥 5 座', turn: '翻越垭口后右转进盘山公路', note: '下坡前点刹降温；碎石带与苔藓弯最危险' },
        { from: 150, to: 168, bearing: '东偏北 15°', road: '琉璃庙 → 喇叭沟门县道', terrain: '平原巡航 + 轻微起伏', turn: '琉璃庙镇中心左转过桥', note: '尾段 2 km 有正在修路，白天通行' },
      ];
      const dangerPoint = {
        km: 118,
        label: '盘山公路入口',
        note: '连续下坡起点 · 48 km 内下降 1000 m · 盲弯 + 碎石带',
      };

      // 爬升变化：按剖面派生的爬升段/下降段清单（样本：至少 3 段 ascent + 2 段 descent + 1 个 highest）
      const climbs = [
        { id: 'c1', type: 'climb', startKm: 0, endKm: 24, length: 24, delta: 206, avg: 0.9, max: 3.2, trend: '平缓热身，温和爬升' },
        { id: 'c2', type: 'climb', startKm: 24, endKm: 48, length: 24, delta: 250, avg: 1.0, max: 4.1, trend: '山脊起伏，坡度小而连续' },
        { id: 'c3', type: 'climb', startKm: 48, endKm: 102, length: 54, delta: 1198, avg: 2.2, max: 7.4, trend: '主爬坡，前陡后缓 · 68 km 处为阶梯平台' },
        { id: 'd1', type: 'descent', startKm: 102, endKm: 150, length: 48, delta: -1000, avg: -2.1, max: -8.3, trend: '长距离技术下坡，上段最陡' },
        { id: 'd2', type: 'descent', startKm: 150, endKm: 168, length: 18, delta: -444, avg: -2.5, max: -4.6, trend: '返程平原，缓降收尾' },
      ];
      const highestPoint = keyPoints.find((p) => p.id === 'highest');

      // 补给方案：节奏表 + 补给点清单 + 携带下限
      // 预计到达时间：按主办方 7:00 出发 + 平均 18–20 km/h 推演（设计样本可见；真实上线以主办方发布的集合时间为锚点）
      const supplyRhythm = [
        { k: '补水', v: '每 20 km / 500 ml + 电解质 1 片' },
        { k: '能量', v: '每 45 min / 150–200 kcal（能量胶或香蕉）' },
        { k: '正餐', v: 'km 150 琉璃庙镇一次简餐（15–20 min）' },
      ];
      const supplyPoints = [
        { km: 24, name: '怀柔水库补给点', type: '便利店 · 水 · 冰饮', eta: '08:20', pointId: 'warm-end' },
        { km: 68, name: '黑山寺垭口', type: '山泉 · 荫凉', eta: '10:50', pointId: 'rest-1' },
        { km: 102, name: '云蒙山顶', type: '无补给 · 风口', eta: '12:40', pointId: 'highest' },
        { km: 150, name: '琉璃庙镇', type: '便利店 · 餐馆 · 简餐', eta: '15:20', pointId: 'rest-2' },
      ];
      const carryMin = [
        '2 瓶水壶（1.5 L）· 盐丸 ×6',
        '能量胶 ×3 · 蛋白棒 ×2 · 香蕉 ×1',
        '现金 100 元备用（山区信号波动）',
      ];

      // 卫生间 POI 设计样本：用于评审名称、坐标、偏离距离与开放备注的信息形态；生产只渲染已验证点位。
      const restrooms = [
        { km: 24, name: '怀柔水库公共卫生间', lat: 40.3614, lng: 116.6315, offsetM: 30, open: '全天开放' },
        { km: 102, name: '云蒙山顶瞭望台旁', lat: 40.6318, lng: 116.4210, offsetM: 80, open: '09:00 – 17:00' },
        { km: 150, name: '琉璃庙镇中心加油站', lat: 40.5019, lng: 116.4718, offsetM: 50, open: '24h · 需向店员索取钥匙' },
      ];

      // ---------- 海拔剖面 SVG ----------
      const chartW = 343;
      const chartH = 160;
      const padL = 32;
      const padR = 8;
      const padT = 8;
      const padB = 22;
      const plotW = chartW - padL - padR;
      const plotH = chartH - padT - padB;
      const toX = (km) => padL + (km / totalKm) * plotW;
      const toY = (m) => padT + plotH - ((m - minM) / span) * plotH;
      const linePath = profile
        .map((p, i) => `${i ? 'L' : 'M'}${toX(p.km).toFixed(1)} ${toY(p.m).toFixed(1)}`)
        .join(' ');
      const areaPath = `${linePath} L${toX(profile.at(-1).km).toFixed(1)} ${(padT + plotH).toFixed(1)} L${toX(profile[0].km).toFixed(1)} ${(padT + plotH).toFixed(1)} Z`;
      const highlightRect = activeSegment
        ? `<rect x="${toX(activeSegment.startKm).toFixed(1)}" y="${padT}" width="${(toX(activeSegment.endKm) - toX(activeSegment.startKm)).toFixed(1)}" height="${plotH}" fill="${activeSegment.color}" opacity="0.14"/>`
        : '';
      const gridLines = [0, 0.25, 0.5, 0.75, 1]
        .map((t) => {
          const y = padT + plotH * t;
          const label = Math.round(maxM - span * t);
          return `<line x1="${padL}" x2="${chartW - padR}" y1="${y}" y2="${y}" stroke="#eadfca" stroke-width="1" stroke-dasharray="2 3"/><text x="${padL - 4}" y="${y + 3}" font-size="9" fill="#8a7f72" text-anchor="end">${label}</text>`;
        })
        .join('');
      const peakMarkers = keyPoints
        .map((p) => {
          const isSel = p.id === selectedPointId;
          const r = isSel ? 4.5 : 2.5;
          const fill = isSel ? '#d64520' : '#211f1c';
          return `<circle cx="${toX(p.km).toFixed(1)}" cy="${toY(p.m).toFixed(1)}" r="${r}" fill="${fill}" stroke="#fbf5ea" stroke-width="${isSel ? 2 : 1}"/>`;
        })
        .join('');
      const cursorLine = (() => {
        if (!selectedPoint) return '';
        const cx = toX(selectedPoint.km).toFixed(1);
        return `<line x1="${cx}" y1="${padT}" x2="${cx}" y2="${padT + plotH}" stroke="#d64520" stroke-width="1.2" stroke-dasharray="3 3"/>`;
      })();
      const xTicks = `<text x="${padL}" y="${chartH - 4}" font-size="10" fill="#8a7f72">0.0 km</text><text x="${chartW - padR}" y="${chartH - 4}" font-size="10" fill="#8a7f72" text-anchor="end">${totalKm}.0 km</text>`;

      const profileChart = noProfile
        ? `<div class="ra-empty">暂无有效海拔剖面，坡段与关键点仅按距离派生，详情请以活动页面提供的 GPX 为准。</div>`
        : `<svg class="ra-chart" viewBox="0 0 ${chartW} ${chartH}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="海拔联动剖面图">
            <defs><linearGradient id="elevFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#d64520" stop-opacity="0.3"/><stop offset="100%" stop-color="#d64520" stop-opacity="0"/></linearGradient></defs>
            ${gridLines}
            ${highlightRect}
            <path d="${areaPath}" fill="url(#elevFill)"/>
            <path d="${linePath}" fill="none" stroke="#d64520" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
            ${cursorLine}
            ${peakMarkers}
            ${xTicks}
          </svg>`;

      // 坐标格式化（在地图详情、关键点、补给、WC 面板中复用）
      const fmtLatLng = (lat, lng) => `${lat.toFixed(4)}°N · ${lng.toFixed(4)}°E`;
      const fmtLatLngPlain = (lat, lng) => `${lat.toFixed(6)}, ${lng.toFixed(6)}`;

      // ---------- 顶部地图（信息密度版 · 对齐参考页"路线走向·关键地名"模块） ----------
      // 地图坐标锚点：按真实骑行顺序铺一条自然北上—翻越—南下的环线；每个关键点有可控的 x/y
      // 采用 100×100 viewBox 对齐参考页，便于按比例写坐标与标签
      const mapCoords = {
        start:      { x: 68, y: 90 },
        'warm-end': { x: 82, y: 71 },
        climb:      { x: 76, y: 54 },
        'rest-1':   { x: 60, y: 40 },
        highest:    { x: 44, y: 22 },
        descent:    { x: 34, y: 32 },
        'rest-2':   { x: 30, y: 60 },
        end:        { x: 36, y: 85 },
      };
      // 路径顺序 + 对应 km 范围（用于分段上色、画条纹等）
      const routeSteps = [
        { from: 'start',    to: 'warm-end', color: '#5f8e59', kmA: 0,   kmB: 24,  stripe: '' },
        { from: 'warm-end', to: 'climb',    color: '#d9a93a', kmA: 24,  kmB: 48,  stripe: '' },
        { from: 'climb',    to: 'rest-1',   color: '#c1662f', kmA: 48,  kmB: 68,  stripe: 'construction' },
        { from: 'rest-1',   to: 'highest',  color: '#a1372c', kmA: 68,  kmB: 102, stripe: 'construction' },
        { from: 'highest',  to: 'descent',  color: '#a1372c', kmA: 102, kmB: 118, stripe: 'closure' },
        { from: 'descent',  to: 'rest-2',   color: '#8aa15c', kmA: 118, kmB: 150, stripe: 'unknown' },
        { from: 'rest-2',   to: 'end',      color: '#5f8e59', kmA: 150, kmB: 168, stripe: '' },
      ];

      // 层级筛选：根据状态推断聚焦；默认 all
      const focused = is('segment-climb', 'climb');
      const highlightSeg = activeSegment ||
        (selectedPointId === 'climb' ? segments.find((s) => s.id === 'climb')
          : selectedPointId === 'descent' ? segments.find((s) => s.id === 'descent')
          : null);

      // 画出被高亮的坡段子路径：根据起止点锚点
      const highlightSubPath = highlightSeg
        ? (() => {
            // 找到被高亮覆盖的所有 route step
            const covered = routeSteps.filter(
              (step) => step.kmB > highlightSeg.startKm && step.kmA < highlightSeg.endKm,
            );
            if (!covered.length) return '';
            const first = mapCoords[covered[0].from];
            const d = [`M${first.x} ${first.y}`].concat(
              covered.map((step) => {
                const to = mapCoords[step.to];
                return `L${to.x} ${to.y}`;
              }),
            ).join(' ');
            return `<path d="${d}" stroke="${highlightSeg.color}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="0.5"/>`;
          })()
        : '';

      // 骨架等高线（围绕最高点）
      const contourRings = `<g opacity="0.4">
        <circle cx="${mapCoords.highest.x}" cy="${mapCoords.highest.y}" r="9" fill="none" stroke="#e3dcc9" stroke-width="0.4"/>
        <circle cx="${mapCoords.highest.x}" cy="${mapCoords.highest.y}" r="14" fill="none" stroke="#e3dcc9" stroke-width="0.3"/>
        <circle cx="${mapCoords.highest.x}" cy="${mapCoords.highest.y}" r="19" fill="none" stroke="#e3dcc9" stroke-width="0.2"/>
      </g>`;

      // 主路线：由多段按海拔上色的子路径拼成（底层）
      const routeFillLayers = routeSteps
        .map((step) => {
          const a = mapCoords[step.from];
          const b = mapCoords[step.to];
          return `<path d="M${a.x} ${a.y} L${b.x} ${b.y}" stroke="${step.color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`;
        })
        .join('');
      // 事件/条纹覆盖层：平行偏移绘制在主路线旁边
      const stripeLayers = routeSteps
        .filter((step) => step.stripe)
        .map((step) => {
          const a = mapCoords[step.from];
          const b = mapCoords[step.to];
          const fill = step.stripe === 'construction' ? 'url(#stripe-construction)'
            : step.stripe === 'closure' ? 'url(#stripe-closure)'
            : 'url(#stripe-unknown)';
          return `<path d="M${a.x} ${a.y} L${b.x} ${b.y}" stroke="${fill}" stroke-width="3.6" stroke-linecap="round" opacity="0.72"/>`;
        })
        .join('');

      // 方向箭头：沿路径中段放一个（指向当前骑行方向）
      const arrowPath = `<g transform="translate(${(mapCoords['warm-end'].x + mapCoords.climb.x) / 2} ${(mapCoords['warm-end'].y + mapCoords.climb.y) / 2}) rotate(-55)">
        <path d="M -3 2 L 0 -3 L 3 2" stroke="#211f1c" stroke-width="0.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      </g>`;

      // 关键点图标渲染（对齐参考页图例语义）
      const roleGlyph = {
        start:      { kind: 'start',    color: '#211f1c' },
        'warm-end': { kind: 'supply',   color: '#c1392b' },
        climb:      { kind: 'risk',     color: '#c1392b' },
        'rest-1':   { kind: 'supply',   color: '#c1392b' },
        highest:    { kind: 'peak',     color: '#211f1c' },
        descent:    { kind: 'descent',  color: '#c1392b' },
        'rest-2':   { kind: 'supply',   color: '#c1392b' },
        end:        { kind: 'start',    color: '#211f1c' },
      };
      // SVG 图标工厂：圆形红底+白符号 / 黑三角 / 黑圆环 / 蓝色桥等
      const renderGlyph = (kind, cx, cy, r, selected) => {
        if (kind === 'start') {
          return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#211f1c"/>
            <circle cx="${cx}" cy="${cy}" r="${r - 1.6}" fill="none" stroke="#fdfaf2" stroke-width="0.6"/>
            <circle cx="${cx}" cy="${cy}" r="${r - 3}" fill="#fdfaf2"/>`;
        }
        if (kind === 'peak') {
          return `<path d="M ${cx} ${cy - r + 0.2} L ${cx + r - 0.5} ${cy + r - 1.2} L ${cx - r + 0.5} ${cy + r - 1.2} Z" fill="#211f1c"/>`;
        }
        if (kind === 'descent') {
          return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${selected ? '#d64520' : '#c1392b'}" stroke="#fdfaf2" stroke-width="0.6"/>
            <path d="M ${cx} ${cy + r - 1.6} L ${cx - r + 1.4} ${cy - r + 1.4} L ${cx + r - 1.4} ${cy - r + 1.4} Z" fill="#fdfaf2" transform="rotate(180 ${cx} ${cy})"/>`;
        }
        if (kind === 'supply') {
          return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${selected ? '#d64520' : '#c1392b'}" stroke="#fdfaf2" stroke-width="0.6"/>
            <rect x="${cx - 1.4}" y="${cy - 0.6}" width="2.8" height="1.2" fill="#fdfaf2"/>
            <rect x="${cx - 0.6}" y="${cy - 1.4}" width="1.2" height="2.8" fill="#fdfaf2"/>`;
        }
        if (kind === 'risk') {
          return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${selected ? '#d64520' : '#c1392b'}" stroke="#fdfaf2" stroke-width="0.6"/>
            <rect x="${cx - 0.4}" y="${cy - 1.6}" width="0.8" height="2.1" fill="#fdfaf2"/>
            <circle cx="${cx}" cy="${cy + 1.3}" r="0.5" fill="#fdfaf2"/>`;
        }
        return '';
      };

      // 关键点 Marker + 名称标签
      const importantIds = new Set(['start', 'climb', 'highest', 'descent', 'end']);
      const labelAnchors = {
        start:      { dx:  4,  dy:  0.4, align: 'start' },
        'warm-end': { dx:  3.6, dy: -0.4, align: 'start' },
        climb:      { dx: -3.6, dy:  0.6, align: 'end' },
        'rest-1':   { dx:  3.6, dy: -0.6, align: 'start' },
        highest:    { dx:  3.6, dy: -0.6, align: 'start' },
        descent:    { dx: -3.6, dy:  0.4, align: 'end' },
        'rest-2':   { dx: -3.6, dy:  0.4, align: 'end' },
        end:        { dx:  3.6, dy:  1,   align: 'start' },
      };
      const mapMarkers = keyPoints
        .map((p) => {
          const c = mapCoords[p.id];
          const isSel = p.id === selectedPointId;
          const isMajor = importantIds.has(p.id);
          const g = roleGlyph[p.id];
          const r = isSel ? 2.6 : isMajor ? 2.2 : 1.9;
          const stateName = p.id === 'climb' ? 'climb'
            : p.id === 'rest-1' ? 'segment-climb'
            : p.id === 'highest' ? 'default'
            : '';
          const haloRing = isSel
            ? `<circle cx="${c.x}" cy="${c.y}" r="${r + 1.4}" fill="none" stroke="#d64520" stroke-width="0.4" stroke-dasharray="0.6 0.6"/>
               <circle cx="${c.x}" cy="${c.y}" r="${r + 2.6}" fill="none" stroke="#d64520" stroke-width="0.25" opacity="0.6"/>`
            : '';
          const dim = focused && !['climb', 'highest', 'descent', 'rest-1', 'rest-2'].includes(p.id) ? 'opacity="0.4"' : '';
          const anchor = labelAnchors[p.id];
          const labelX = c.x + anchor.dx;
          const labelY = c.y + anchor.dy;
          const nameLabel = p.label.length > 7 ? p.label.slice(0, 7) + '…' : p.label;
          const showLabel = (isMajor && (p.id === 'start' || p.id === 'end' || p.id === 'highest')) || isSel;
          return `<g class="ra-mk ${isSel ? 'is-active' : ''}" ${dim} data-route="route-analysis" data-state="${stateName}" aria-label="${p.label} km ${p.km}">
            ${haloRing}
            ${renderGlyph(g.kind, c.x, c.y, r, isSel)}
            ${showLabel ? `
              <text x="${labelX}" y="${labelY}" font-size="2.6" font-weight="800" fill="#211f1c" text-anchor="${anchor.align}" font-variant-numeric="tabular-nums">${nameLabel} · km ${p.km}</text>` : ''}
          </g>`;
        })
        .join('');

      // 卫生间地图标记：方形 + "WC" 字样
      const nearestCoord = (km) => {
        const nearest = keyPoints.reduce((a, b) => (Math.abs(b.km - km) < Math.abs(a.km - km) ? b : a));
        return mapCoords[nearest.id];
      };
      const restroomMarkers = restrooms
        .map((r) => {
          const anchor = nearestCoord(r.km);
          const cx = anchor.x + 2.8;
          const cy = anchor.y + 1.8;
          const dim = focused ? 'opacity="0.5"' : '';
          return `<g class="ra-mk ra-mk-wc" ${dim} aria-label="卫生间 ${r.name}">
            <rect x="${cx - 1.8}" y="${cy - 1.8}" width="3.6" height="3.6" rx="0.4" fill="#4b7aa8" stroke="#fdfaf2" stroke-width="0.4"/>
            <text x="${cx}" y="${cy + 1}" font-size="1.9" fill="#fff" font-weight="900" text-anchor="middle">WC</text>
          </g>`;
        })
        .join('');

      // 比例尺 + 指北针
      const scaleBar = `<g transform="translate(6 92)" aria-hidden="true">
        <line x1="0" y1="0" x2="12" y2="0" stroke="#211f1c" stroke-width="0.6"/>
        <line x1="0" y1="-1" x2="0" y2="1" stroke="#211f1c" stroke-width="0.6"/>
        <line x1="12" y1="-1" x2="12" y2="1" stroke="#211f1c" stroke-width="0.6"/>
        <text x="6" y="-1.4" font-size="2.6" font-weight="700" fill="#6f675d" text-anchor="middle">20 km</text>
      </g>`;
      const compass = `<g transform="translate(92 10)" aria-hidden="true">
        <path d="M 0 -3.5 L 1.6 2.6 L 0 1.6 L -1.6 2.6 Z" fill="#211f1c"/>
        <text x="0" y="7.2" font-size="3" text-anchor="middle" fill="#211f1c" font-weight="800">N</text>
      </g>`;

      // ---------- 筛选芯片 ----------
      const totalPoints = keyPoints.length + restrooms.length + 1 /* 风险 */;
      const supplyCount = keyPoints.filter((p) => p.role.includes('补给')).length;
      const landmarkCount = keyPoints.length;
      const riskCount = 1; // dangerPoint 当前只有一个（设计样本）
      const wcCount = restrooms.length;
      const segmentCount = segments.length;
      const filters = [
        { key: 'all',      label: '全部',      count: totalPoints, state: '' },
        { key: 'landmark', label: '地名',      count: landmarkCount, state: 'default' },
        { key: 'supply',   label: '补给',      count: supplyCount, state: 'segment-climb' },
        { key: 'risk',     label: '风险',      count: riskCount, state: 'climb' },
        { key: 'wc',       label: '卫生间',    count: wcCount, state: '' },
        { key: 'segment',  label: '坡段',      count: segmentCount, state: 'segment-climb' },
      ];
      const activeFilterKey = focused ? 'segment' : 'all';
      const filterChips = filters
        .map(
          (f) =>
            `<button class="ra-filter ${f.key === activeFilterKey ? 'is-active' : ''}" data-route="route-analysis" data-state="${f.state}" aria-pressed="${f.key === activeFilterKey}">${f.label}<i>${f.count}</i></button>`,
        )
        .join('');

      // ---------- 详情浮层数据 ----------
      // 对齐参考页：icon + 名称 + 类型 chip + sub-meta + 注释 + 数据来源 + 更新时间 + 坐标 + 复制坐标 + 关闭
      const detail = (() => {
        if (activeSegment) {
          const gradeSign = activeSegment.grade > 0 ? '+' : '';
          return {
            kind: 'segment',
            typeChip: '坡段',
            typeChipColor: activeSegment.color,
            title: activeSegment.name,
            subMeta: `km ${activeSegment.startKm}–${activeSegment.endKm} · ${activeSegment.difficulty} · 平均 ${gradeSign}${activeSegment.grade}%`,
            caption: activeSegment.strategy,
            source: '剖面派生',
            confidence: 'high',
            updated: '2026-10-17 09:40',
            lat: null,
            lng: null,
            metrics: [
              { k: '范围', v: `${activeSegment.startKm}–${activeSegment.endKm} km` },
              { k: '升 / 降', v: `↑${activeSegment.ascent} m · ↓${activeSegment.descent} m` },
              { k: '平均坡度', v: `${gradeSign}${activeSegment.grade}%` },
            ],
          };
        }
        const p = selectedPoint;
        const isSupply = p.role.includes('补给');
        const isPeak = p.id === 'highest';
        const typeChip = p.id === 'start' ? '起终点'
          : p.id === 'end' ? '起终点'
          : isPeak ? '坡顶'
          : p.id === 'descent' ? '长下坡'
          : p.id === 'climb' ? '风险'
          : isSupply ? '补给'
          : '地名';
        return {
          kind: 'point',
          typeChip,
          typeChipColor: p.id === 'start' || p.id === 'end' ? '#211f1c'
            : isPeak ? '#211f1c'
            : '#c1392b',
          title: p.label,
          subMeta: `km ${p.km} · ${p.m} m · ${p.role}`,
          caption: p.caution || '',
          source: 'GPX 轨迹',
          confidence: 'high',
          updated: '2026-10-17 09:40',
          lat: p.lat,
          lng: p.lng,
          metrics: [],
        };
      })();
      const confidenceColor = { high: '#5f8e59', mid: '#d9a93a', low: '#c1392b' }[detail.confidence] || '#5f8e59';
      const detailBlock = `<div class="ra-map-detail" role="status">
        <div class="ra-detail-head">
          <span class="ra-detail-icon" style="background:${detail.typeChipColor}">${detail.kind === 'segment' ? '◆' : (detail.typeChip === '坡顶' ? '▲' : detail.typeChip === '风险' ? '!' : detail.typeChip === '长下坡' ? '▽' : detail.typeChip === '补给' ? '✚' : '●')}</span>
          <div class="ra-detail-ident">
            <div class="ra-detail-title-row">
              <h3>${detail.title}</h3>
              <span class="ra-detail-type" style="color:${detail.typeChipColor};border-color:${detail.typeChipColor}">${detail.typeChip}</span>
            </div>
            <span class="ra-detail-sub">${detail.subMeta}</span>
          </div>
          <button class="ra-detail-close" data-route="route-analysis" data-state="default" aria-label="关闭详情">×</button>
        </div>
        ${detail.caption ? `<p class="ra-detail-caption">${detail.caption}</p>` : ''}
        ${detail.metrics.length ? `<dl class="ra-detail-metrics">
          ${detail.metrics.map((m) => `<div><dt>${m.k}</dt><dd>${m.v}</dd></div>`).join('')}
        </dl>` : ''}
        <div class="ra-detail-provenance">
          <div class="ra-detail-prov-row">
            <span class="ra-detail-prov-k">数据来源</span>
            <span class="ra-detail-prov-v">${detail.source}<em class="ra-detail-conf" style="background:${confidenceColor}">置信度：${detail.confidence}</em></span>
          </div>
          <div class="ra-detail-prov-row">
            <span class="ra-detail-prov-k">更新</span>
            <span class="ra-detail-prov-v">${detail.updated}</span>
          </div>
        </div>
        ${detail.lat !== null ? `<div class="ra-detail-coord">
          <code>${fmtLatLngPlain(detail.lat, detail.lng)}</code>
          <button class="ra-detail-copy" data-action="copy-route-coord" data-coord="${fmtLatLngPlain(detail.lat, detail.lng)}" aria-label="复制坐标到剪贴板">复制坐标</button>
        </div>` : ''}
      </div>`;

      // ---------- 地图主体 ----------
      const mapBlock = `<div class="ra-map">
        <div class="ra-map-head">
          <div class="ra-map-head-title">
            <span class="ra-kicker">完整路线分析</span>
            <h2>${primary.title}</h2>
            <p>${primary.route}</p>
          </div>
          <div class="ra-map-stats">
            <span><b>${primary.distanceKm}</b><i>km</i><small>距离</small></span>
            <span><b>${primary.elevationM}</b><i>m</i><small>累计爬升</small></span>
            <span><b>${primary.elevationLossM}</b><i>m</i><small>累计下降</small></span>
            <span><b>${primary.elevationMaxM}</b><i>m</i><small>最高海拔</small></span>
          </div>
        </div>

        <div class="ra-map-section">
          <div class="ra-map-section-head">
            <h3>路线走向 · 关键地名</h3>
            <span class="ra-map-section-sub">逆时针（起点 → 爬升 → 翻越 → 长下坡 → 返程）</span>
          </div>

          <div class="ra-map-filters" role="toolbar" aria-label="地图图层筛选">
            ${filterChips}
          </div>

          <div class="ra-map-canvas">
            <svg class="ra-map-svg" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" role="img" aria-label="完整路线地图：从望京西经怀柔、汤河口、黑山寺、云蒙山顶、盘山公路、琉璃庙到喇叭沟门的 168 km 环线，含补给、卫生间、风险与坡段标记">
              <defs>
                <pattern id="stripe-construction" patternUnits="userSpaceOnUse" width="2.4" height="2.4" patternTransform="rotate(45)">
                  <rect width="2.4" height="2.4" fill="#f6e3c7"/>
                  <rect width="1.2" height="2.4" fill="#d9a93a"/>
                </pattern>
                <pattern id="stripe-closure" patternUnits="userSpaceOnUse" width="1.6" height="1.6" patternTransform="rotate(45)">
                  <rect width="1.6" height="1.6" fill="#211f1c"/>
                  <rect width="0.8" height="1.6" fill="#c1392b"/>
                </pattern>
                <pattern id="stripe-unknown" patternUnits="userSpaceOnUse" width="2" height="2" patternTransform="rotate(45)">
                  <rect width="2" height="2" fill="#fdfaf2"/>
                  <rect width="1" height="2" fill="#c7c0b2"/>
                </pattern>
              </defs>
              <rect width="100" height="100" fill="#fdfaf2"/>
              ${contourRings}
              ${compass}
              ${scaleBar}
              ${stripeLayers}
              ${routeFillLayers}
              ${highlightSubPath}
              ${arrowPath}
              ${restroomMarkers}
              ${mapMarkers}
            </svg>

            <p class="ra-map-caption">按海拔着色 · 骑行方向顺序 · 点击可查看地名与坐标</p>

            <ul class="ra-map-legend-grid" aria-label="地图图例">
              <li><i class="ra-lg-dot ra-lg-start">●</i>起终点</li>
              <li><i class="ra-lg-dot ra-lg-village">◆</i>村镇</li>
              <li><i class="ra-lg-dot ra-lg-peak">▲</i>坡顶</li>
              <li><i class="ra-lg-dot ra-lg-descent">▽</i>长下坡</li>
              <li><i class="ra-lg-dot ra-lg-supply">✚</i>补给</li>
              <li><i class="ra-lg-dot ra-lg-view">✦</i>观景</li>
              <li><i class="ra-lg-dot ra-lg-bridge">⌒</i>桥 / 隧</li>
              <li><i class="ra-lg-dot ra-lg-risk">!</i>风险</li>
              <li><i class="ra-lg-dot ra-lg-wc">WC</i>卫生间</li>
              <li><i class="ra-lg-dot ra-lg-work">⚠</i>施工</li>
              <li><i class="ra-lg-dot ra-lg-closure">⛔</i>封路</li>
              <li><i class="ra-lg-dot ra-lg-unknown">?</i>未覆盖</li>
            </ul>

            ${detailBlock}

            <p class="ra-map-sample">脱敏演示样本 · 地名 / 坐标 / 施工 / 事故为示意结构 · 正式数据以主办方发布与接入服务为准</p>
          </div>
        </div>
      </div>`;

      // ---------- 分段轨道 + 行 ----------
      const trackStripes = segments
        .map((s) => {
          const left = (s.startKm / totalKm) * 100;
          const width = ((s.endKm - s.startKm) / totalKm) * 100;
          const isActive = s.id === selectedSegment;
          return `<span class="ra-track-seg ${isActive ? 'is-active' : ''}" style="left:${left.toFixed(2)}%;width:${width.toFixed(2)}%;background:${s.color}" title="${s.name}"></span>`;
        })
        .join('');
      const trackPeaks = keyPoints
        .filter((p) => ['climb', 'highest', 'descent'].includes(p.id))
        .map((p) => {
          const left = (p.km / totalKm) * 100;
          return `<span class="ra-track-peak" style="left:${left.toFixed(2)}%" title="${p.label}"></span>`;
        })
        .join('');
      const segmentRows = segments
        .map((s) => {
          const isActive = s.id === selectedSegment;
          const stateName = s.id === 'climb' ? 'segment-climb' : '';
          const diffCls = s.difficulty === '挑战' ? 'is-hard' : s.difficulty === '适中' ? 'is-med' : 'is-easy';
          const gradeSign = s.grade > 0 ? '+' : '';
          return `<button class="ra-seg-row ${isActive ? 'is-active' : ''}" data-route="route-analysis" data-state="${stateName}">
            <span class="ra-seg-color" style="background:${s.color}"></span>
            <span class="ra-seg-main">
              <span class="ra-seg-name">${s.name}<em class="ra-diff ${diffCls}">${s.difficulty}</em></span>
              <span class="ra-seg-range">${s.startKm.toFixed(1)}–${s.endKm.toFixed(1)} km · 全长 ${(s.endKm - s.startKm).toFixed(0)} km</span>
              <span class="ra-seg-strategy">${s.strategy}</span>
            </span>
            <span class="ra-seg-metrics">
              <span class="ra-seg-grade">${gradeSign}${s.grade}%</span>
              <span class="ra-seg-ud"><b>↑ ${s.ascent}</b><b>↓ ${s.descent}</b></span>
            </span>
          </button>`;
        })
        .join('');

      // ---------- 骑行走向 ----------
      const directionRows = directions
        .map((d, i) => {
          const idx = String(i + 1).padStart(2, '0');
          return `<li class="ra-dir-row">
            <span class="ra-dir-idx">${idx}</span>
            <span class="ra-dir-body">
              <span class="ra-dir-head">
                <span class="ra-dir-km">${d.from}–${d.to} km</span>
                <span class="ra-dir-bearing">${d.bearing}</span>
              </span>
              <span class="ra-dir-road">${d.road}</span>
              <span class="ra-dir-terrain">${d.terrain}</span>
              <span class="ra-dir-turn"><em>转向</em>${d.turn}</span>
              <span class="ra-dir-note"><em>注意</em>${d.note}</span>
            </span>
          </li>`;
        })
        .join('');

      // ---------- 爬升变化 ----------
      const climbRows = climbs
        .map((c) => {
          const isAscent = c.type === 'climb';
          const sign = c.delta > 0 ? '+' : '';
          const cls = isAscent ? 'is-ascent' : 'is-descent';
          const icon = isAscent ? '▲' : '▼';
          return `<li class="ra-climb-row ${cls}">
            <span class="ra-climb-ico">${icon}</span>
            <span class="ra-climb-body">
              <span class="ra-climb-head">
                <span class="ra-climb-range">${c.startKm}–${c.endKm} km · 全长 ${c.length} km</span>
                <span class="ra-climb-delta">${sign}${c.delta} m</span>
              </span>
              <span class="ra-climb-metrics">
                <span>平均 <b>${c.avg > 0 ? '+' : ''}${c.avg}%</b></span>
                <span>最大 <b>${c.max > 0 ? '+' : ''}${c.max}%</b></span>
              </span>
              <span class="ra-climb-trend">${c.trend}</span>
            </span>
          </li>`;
        })
        .join('');

      // ---------- 关键点时间轴（含地名/经纬度/用途/注意）----------
      const timelineRows = keyPoints
        .map((p) => {
          const isActive = p.id === selectedPointId;
          const stateName = p.id === 'climb' ? 'climb' : p.id === 'rest-1' ? 'segment-climb' : p.id === 'highest' ? 'default' : '';
          const marker = p.id === 'start' ? '起' : p.id === 'end' ? '终' : p.id === 'highest' ? '峰' : p.id === 'climb' ? '↑' : p.id === 'descent' ? '↓' : '•';
          const markerCls = p.id === 'highest' ? 'is-peak' : p.id === 'start' ? 'is-start' : p.id === 'end' ? 'is-end' : '';
          return `<button class="ra-tl-row ${isActive ? 'is-active' : ''}" data-route="route-analysis" data-state="${stateName}">
            <span class="ra-tl-col"><em class="ra-tl-marker ${markerCls}">${marker}</em></span>
            <span class="ra-tl-km">${p.km.toFixed(1)}<i>km</i></span>
            <span class="ra-tl-body">
              <span class="ra-tl-name">${p.label}</span>
              <span class="ra-tl-meta">${p.role}</span>
              <span class="ra-tl-geo">${fmtLatLng(p.lat, p.lng)}</span>
              ${p.caution ? `<span class="ra-tl-caution">${p.caution}</span>` : ''}
            </span>
            <span class="ra-tl-elev">${p.m}<i>m</i></span>
          </button>`;
        })
        .join('');

      // ---------- 策略 ----------
      const strategies = [
        ['配速', '前 24 km 保留体力，主爬坡进入前心率维持 Z2。'],
        ['补给', '每小时 300–400 kcal、500–750 ml 水 + 电解质。'],
        ['下坡', '盘山段连续 48 km 下降，刹车片温度与弯道盲区优先。'],
      ];

      // ---------- 补给方案 ----------
      const rhythmRows = supplyRhythm
        .map(({ k, v }) => `<div class="ra-rhythm-row"><dt>${k}</dt><dd>${v}</dd></div>`)
        .join('');
      const supplyRows = supplyPoints
        .map((s) => {
          const kp = keyPoints.find((p) => p.id === s.pointId);
          const stateName = s.pointId === 'highest' ? 'default' : s.pointId === 'rest-1' ? 'segment-climb' : s.pointId === 'climb' ? 'climb' : '';
          return `<button class="ra-sp-row" data-route="route-analysis" data-state="${stateName}">
            <span class="ra-sp-km">km ${s.km}</span>
            <span class="ra-sp-body">
              <span class="ra-sp-name">${s.name}</span>
              <span class="ra-sp-type">${s.type}</span>
              ${kp ? `<span class="ra-sp-geo">${fmtLatLng(kp.lat, kp.lng)}</span>` : ''}
            </span>
            <span class="ra-sp-eta"><b>${s.eta}</b><small>预计到达</small></span>
          </button>`;
        })
        .join('');
      const carryRows = carryMin.map((c) => `<li>${c}</li>`).join('');

      // ---------- 卫生间 ----------
      const restroomRows = restrooms
        .map(
          (r) => `<li class="ra-wc-row">
            <span class="ra-wc-mark">WC</span>
            <span class="ra-wc-body">
              <span class="ra-wc-head"><span class="ra-wc-km">km ${r.km}</span><span class="ra-wc-name">${r.name}</span></span>
              <span class="ra-wc-geo">${fmtLatLng(r.lat, r.lng)}</span>
              <span class="ra-wc-meta"><em>偏离主路 ≈ ${r.offsetM} m</em><em>${r.open}</em></span>
            </span>
          </li>`,
        )
        .join('');

      const gear = [
        '头盔 · 手套 · 骑行眼镜',
        '前后车灯 · 补胎工具 · 备用内胎',
        '两瓶水壶 · 盐丸 · 能量胶 ×3',
        '轻量防风外套（最高点 1684 m）',
      ];

      return `<div class="pg route-analysis-page">
        ${is('map-error') ? `<div class="analysis-empty map-fallback"><p>地图暂时无法显示，路线数据仍可查看</p>${btn('重试地图', toast('正在重试地图'), 'btn-secondary')}</div>` : mapBlock}

        <section class="ra-panel ra-elev">
          <header class="ra-panel-head">
            <h3>海拔剖面</h3>
            <span class="ra-elev-range">${noProfile ? '剖面不可用' : `${minM} m → ${maxM} m · 落差 ${span} m`}</span>
          </header>
          ${profileChart}
          ${activeSegment
            ? `<div class="ra-elev-caption"><span class="ra-swatch" style="background:${activeSegment.color}"></span>当前查看：${activeSegment.name} · ${activeSegment.startKm}–${activeSegment.endKm} km</div>`
            : selectedPoint
              ? `<div class="ra-elev-caption"><span class="ra-dot"></span>当前关键点：${selectedPoint.label} · km ${selectedPoint.km.toFixed(1)} · ${selectedPoint.m} m</div>`
              : ''}
        </section>

        <section class="ra-panel ra-direction">
          <header class="ra-panel-head">
            <h3>骑行走向</h3>
            <span class="ra-count">${directions.length} 段 · 去程 → 翻越 → 返程</span>
          </header>
          <ol class="ra-dir-list">${directionRows}</ol>
          <p class="ra-risk"><span class="ra-risk-mark">!</span>km ${dangerPoint.km} ${dangerPoint.label}：${dangerPoint.note}</p>
        </section>

        <section class="ra-panel ra-climbs">
          <header class="ra-panel-head">
            <h3>爬升与下降</h3>
            <span class="ra-count">${climbs.filter((c) => c.type === 'climb').length} 段爬升 · ${climbs.filter((c) => c.type === 'descent').length} 段下降</span>
          </header>
          <ul class="ra-climb-list">${climbRows}</ul>
          ${highestPoint
            ? `<p class="ra-climb-highest"><em>最高点</em>${highestPoint.label} · km ${highestPoint.km} · <b>${highestPoint.m} m</b> · ${fmtLatLng(highestPoint.lat, highestPoint.lng)}</p>`
            : ''}
        </section>

        <section class="ra-panel ra-segments">
          <header class="ra-panel-head">
            <h3>坡段分析</h3>
            <span class="ra-count">${segments.length} 段 · 点击联动</span>
          </header>
          <div class="ra-track">
            <span class="ra-track-bg"></span>
            ${trackStripes}
            ${trackPeaks}
            <span class="ra-track-tick" style="left:0%">0</span>
            <span class="ra-track-tick is-end" style="left:100%">${totalKm}</span>
          </div>
          <div class="ra-seg-list">${segmentRows}</div>
        </section>

        <section class="ra-panel ra-timeline">
          <header class="ra-panel-head">
            <h3>关键公里点</h3>
            <span class="ra-count">${keyPoints.length} 个 · 由起到终</span>
          </header>
          <div class="ra-tl-list">${timelineRows}</div>
        </section>

        <section class="ra-panel ra-strategy">
          <header class="ra-panel-head"><h3>路线策略</h3></header>
          <dl class="ra-strategy-list">
            ${strategies.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}
          </dl>
        </section>

        <section class="ra-panel ra-supplies">
          <header class="ra-panel-head">
            <h3>补给方案</h3>
            <span class="ra-count">节奏 + ${supplyPoints.length} 补给点</span>
          </header>
          <dl class="ra-rhythm-list">${rhythmRows}</dl>
          <div class="ra-sp-list">${supplyRows}</div>
          <div class="ra-carry">
            <span class="ra-carry-head">随身携带下限</span>
            <ul class="ra-carry-list">${carryRows}</ul>
          </div>
          <p class="ra-risk"><span class="ra-risk-mark">!</span>km 102–150 为连续下坡 48 km，建议中段短暂停车让刹车片降温。</p>
        </section>

        <section class="ra-panel ra-restrooms">
          <header class="ra-panel-head">
            <h3>沿线卫生间</h3>
            <span class="ra-count">${restrooms.length} 处 · 地图 WC 标记</span>
          </header>
          <ul class="ra-wc-list">${restroomRows}</ul>
        </section>

        <section class="ra-panel ra-gear">
          <header class="ra-panel-head"><h3>装备建议</h3></header>
          <ul class="ra-gear-list">
            ${gear.map((g) => `<li>${g}</li>`).join('')}
          </ul>
        </section>
      </div>`;
    },
  };

  window.pageTemplates = templates;
})();
