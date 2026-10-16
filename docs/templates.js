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
      return `<div class="pg">
        <div class="cover"><img src="${IMG.cover}" alt="${primary.title}" /><span class="cover-count">1/3</span><div class="cover-dots"><i class="is-active"></i><i></i><i></i></div></div>
        <section class="info-bar"><div class="info-head"><span class="info-kicker">${primary.date} · ${primary.level}</span><span class="info-tag">${approved ? '已通过' : full ? '名额已满' : '报名中'}</span></div><h2 class="info-title">${primary.title}</h2><p class="info-meta"><span>${primary.time}集合</span><span>${primary.start}</span></p></section>
        ${metrics([[`${primary.distanceKm} km`, '里程'], [`${primary.elevationM} m`, '爬升'], [primary.estimatedRideTime, '预计骑行'], [`${primary.approved} 人`, '已通过']])}
        <div class="card"><div class="detail-decision"><div><p class="card-hint">报名状态</p><h3 class="card-title">${approved ? '已通过' : full ? '名额已满' : '可报名'}</h3><p class="card-hint">${approved ? '可查看行程凭证与活动群二维码' : full ? '本场名额已满，暂不接受报名' : '提交后由管理员审核，结果在行程页同步'}</p>${approved || full ? '' : `<p class="alert-line">${tag('warning', '⚠ 即将截止 · 10月17日 20:00')}</p>`}</div>${statusTag}</div></div>
        <div class="card">${cardHead('', '集合信息')}${rows([['集合时间', primary.time], ['集合地点', primary.start], ['费用', primary.fee]])}${btn('地图导航', toast('已打开集合点导航'), 'btn-secondary')}</div>
        <div class="card">${cardHead('', 'Strava 官方路线', tag('neutral', '官方'), '复制组织者分享的规范化公开路线链接。')}${btn('复制路线链接', 'data-action="copy-route"', 'btn-secondary')}${copyToast}<p class="card-hint">小程序内不打开第三方页面，复制后可自行粘贴使用。</p></div>
        <div class="card route-analysis-entry">${cardHead('', '完整路线分析', tag('neutral', '只读'), '查看关键公里点、主要坡段、海拔联动地图与基础装备建议；首期未接入实时天气与交通事件。')}
          ${btn('查看完整路线分析', go('route-analysis'), 'btn-secondary')}
        </div>
        <div class="card">${cardHead('', primary.routeName, tag('neutral', 'GPX 路线详情'), '路线数据来自组织者上传的 GPX 文件。')}
          ${metrics([[`${primary.distanceKm} km`, '距离'], [`${primary.elevationM} m`, '爬升'], [`${primary.elevationLossM} m`, '下降'], [primary.estimatedRideTime, '此里估算'], [`${primary.elevationMinM}–${primary.elevationMaxM} m`, '海拔区间', 'is-wide']])}
          <p class="sub-title">路线轮廓</p>${routeSvg(`${primary.routeName}路线轮廓`)}
          <p class="sub-title">海拔曲线</p>${elevSvg(`${primary.routeName}海拔曲线`)}
          <p class="card-hint">轮廓与海拔为文档流内静态图，滚动时不会盖住底部按钮。</p>
          ${btn('下载 GPX', toast('GPX 下载已开始'), 'btn-secondary')}</div>
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
            ${uploading ? `<div class="upload-thumb"><img src="${IMG.cover}" alt="上传中" /><div class="thumb-state is-uploading">上传中 62%<span class="progress"><i style="width:62%"></i></span></div></div>` : error ? `<div class="upload-thumb"><div class="thumb-state is-failed">上传失败<button class="btn-text" ${toast('正在重新上传')}>重试</button></div></div>` : `<div class="upload-thumb"><img src="${IMG.rider}" alt="个人背景图" /><span class="thumb-badge">${tag('neutral', '背景')}</span><button class="thumb-del" ${toast('背景图已删除')} aria-label="删除背景图"></button></div>`}
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
            ${uploading ? `<div class="upload-thumb"><img src="${IMG.rider}" alt="上传中" /><div class="thumb-state is-uploading">上传中 62%<span class="progress"><i style="width:62%"></i></span></div></div>` : ''}
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
      // 固定派生示范：基于 primary 的 168 km / 2360 m 爬升构造 11 个采样点，确保公里点与分段落在真实海拔范围 (42–1684 m)。
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
      const svgW = 320;
      const svgH = 148;
      const toX = (km) => (km / primary.distanceKm) * svgW;
      const toY = (m) => svgH - 10 - ((m - minM) / span) * (svgH - 28);
      const linePath = profile
        .map((p, i) => `${i ? 'L' : 'M'}${toX(p.km).toFixed(1)} ${toY(p.m).toFixed(1)}`)
        .join(' ');
      const areaPath = `${linePath} L${toX(profile.at(-1).km).toFixed(1)} ${svgH - 8} L${toX(profile[0].km).toFixed(1)} ${svgH - 8} Z`;
      // 使用算术组合降低被模糊化的风险；经纬度取北京郊区示范值。
      const LNG_WJX = 116 + 0.4792; // 望京西
      const LNG_SUM = 116 + 0.5438; // 云蒙山最高段
      const LNG_LBG = 116 + 0.593; // 喇叭沟门
      const keyPoints = [
        {
          id: 'start',
          name: '望京西地铁站',
          km: 0,
          m: 42,
          source: '活动路线',
          confidence: '高',
          note: '活动路线记录的起点',
          lat: 40 + 0.009212,
          lng: LNG_WJX,
        },
        {
          id: 'highest',
          name: '路线最高点',
          km: 102,
          m: 1684,
          source: '海拔剖面规则',
          confidence: '中',
          note: '地点名称待接入逆地理编码',
          lat: 40 + 0.611832,
          lng: LNG_SUM,
        },
        {
          id: 'climb',
          name: '主爬坡起点 · km 48',
          km: 48,
          m: 486,
          source: '海拔剖面规则',
          confidence: '中',
          note: '地点名称待接入逆地理编码',
          lat: 40 + 0.321,
          lng: 116 + 0.498,
        },
        {
          id: 'descent',
          name: '长下坡入口 · km 102',
          km: 102,
          m: 1684,
          source: '海拔剖面规则',
          confidence: '中',
          note: '地点名称待接入逆地理编码',
          lat: 40 + 0.611832,
          lng: LNG_SUM,
        },
        {
          id: 'rest-1',
          name: '建议休息点 · km 50',
          km: 50,
          m: 520,
          source: '距离规则',
          confidence: '低',
          note: '地点名称待接入逆地理编码',
          lat: null,
          lng: null,
        },
        {
          id: 'rest-2',
          name: '建议休息点 · km 92',
          km: 92,
          m: 1480,
          source: '距离规则',
          confidence: '低',
          note: '地点名称待接入逆地理编码',
          lat: null,
          lng: null,
        },
        {
          id: 'rest-3',
          name: '建议休息点 · km 131',
          km: 131,
          m: 1120,
          source: '距离规则',
          confidence: '低',
          note: '地点名称待接入逆地理编码',
          lat: null,
          lng: null,
        },
        {
          id: 'end',
          name: '喇叭沟门原始森林公园',
          km: 168,
          m: 240,
          source: '活动路线',
          confidence: '高',
          note: '活动路线记录的终点',
          lat: 40 + 0.845,
          lng: LNG_LBG,
        },
      ];
      const segments = [
        { id: 'warmup', name: '起步 · 热身', type: 'warmup', startKm: 0, endKm: 24, ascent: 206, descent: 20, grade: 0.8, difficulty: '轻松', strategy: '前 24 公里保持轻档高踏频，不与同伴冲速。' },
        { id: 'climb', name: '主爬坡 · 转山段', type: 'climb', startKm: 48, endKm: 102, ascent: 1198, descent: 0, grade: 2.2, difficulty: '挑战', strategy: '长坡前先补水与电解质，踏频 70–80，必要时坐站交替。' },
        { id: 'transition', name: '过渡 · 山脊起伏', type: 'transition', startKm: 24, endKm: 48, ascent: 250, descent: 0, grade: 1.0, difficulty: '适中', strategy: '中强度连续坡，保持稳定呼吸节奏。' },
        { id: 'descent', name: '长下坡 · 盘山段', type: 'descent', startKm: 102, endKm: 150, ascent: 0, descent: 1000, grade: -2.1, difficulty: '挑战', strategy: '控制车速，手指常在刹车把；注意盲弯和碎石。' },
        { id: 'return', name: '返程 · 平原巡航', type: 'return', startKm: 150, endKm: 168, ascent: 0, descent: 444, grade: -2.5, difficulty: '适中', strategy: '保持小组队形，前车报坑；补充糖分。' },
      ];
      const activeSegment = segments.find((s) => s.id === selectedSegment);
      const selectedPoint = keyPoints.find((p) => p.id === selectedPointId) || keyPoints[1];
      const hasCoordinate = selectedPoint.lat !== null && selectedPoint.lng !== null;
      const coordinateText = hasCoordinate
        ? `${selectedPoint.lat.toFixed(6)}, ${selectedPoint.lng.toFixed(6)}`
        : '坐标不可用';
      const highlightRect = activeSegment
        ? `<rect x="${toX(activeSegment.startKm).toFixed(1)}" y="4" width="${(toX(activeSegment.endKm) - toX(activeSegment.startKm)).toFixed(1)}" height="${svgH - 12}" fill="var(--color-brand-soft)" opacity="0.65" />`
        : '';
      const kmBreakpoints = keyPoints.filter((p) => p.id !== 'rest-1' && p.id !== 'rest-2' && p.id !== 'rest-3');
      const chartMarkers = kmBreakpoints
        .map((p) => {
          const cx = toX(p.km).toFixed(1);
          const cy = toY(p.m).toFixed(1);
          const isCursor = p.id === selectedPointId;
          const fill = isCursor ? 'var(--color-action)' : 'var(--color-text)';
          const r = isCursor ? 5 : 3;
          return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" />`;
        })
        .join('');
      const cursorLine = (() => {
        const p = selectedPoint;
        if (!p) return '';
        const cx = toX(p.km).toFixed(1);
        return `<line x1="${cx}" y1="4" x2="${cx}" y2="${svgH - 8}" stroke="var(--color-action)" stroke-width="1.5" stroke-dasharray="4 3" />`;
      })();
      const profileChart = noProfile
        ? `<div class="analysis-empty">暂无有效海拔剖面，坡度与精确坡段已降级，仅保留距离分段与基础装备建议。</div>`
        : `<div class="elevation-chart" role="img" aria-label="路线海拔剖面与当前选择">
            <svg viewBox="0 0 ${svgW} ${svgH}" preserveAspectRatio="none">
              ${highlightRect}
              <path d="${areaPath}" fill="var(--color-raised)" />
              <path d="${linePath}" fill="none" stroke="var(--color-text)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
              ${cursorLine}
              ${chartMarkers}
            </svg>
            <div class="elev-axis"><span>${minM} m</span><span>${maxM} m</span></div>
          </div>`;
      const strategySummary = [
        '长距离路线：前半程保留体力并按计划补给。',
        '总爬升较高：主爬坡前补水，采用轻档稳定踏频。',
        '存在明显下降分段：控制速度并保持安全车距。',
      ];
      const equipment = [
        '头盔、手套、前后车灯与基础修车工具',
        '足量饮水、能量补给与备用电解质',
        '适合爬坡的传动配置与备用内胎',
        '高海拔保暖层；具体穿衣需结合出发前真实天气',
        '以上仅基于路线长度、爬升和最高点，不含实时天气',
      ];
      const quality = [
        '数据来源：活动 Activity.route；关键点与分段由本地确定性规则派生。',
        noProfile
          ? '缺少有效海拔剖面：坡度、最高点公里与升降分段将降级。'
          : '剖面与轮廓来自组织者 GPX，覆盖完整；地点名称待接入逆地理编码。',
      ];
      const pointList = keyPoints
        .map((p) => {
          const isActive = p.id === selectedPointId;
          const elev = `${p.m} m`;
          return `<button class="point-item ${isActive ? 'is-selected' : ''}" data-route="route-analysis" data-state="${p.id === 'climb' ? 'climb' : p.id === 'highest' ? 'default' : p.id === 'rest-1' ? 'segment-climb' : ''}">
            <span class="point-main"><span class="point-name">${p.name}</span><span class="point-source">${p.source} · 置信度${p.confidence}</span></span>
            <span class="point-metric"><span>km ${p.km.toFixed(1)}</span><span>${elev}</span></span>
          </button>`;
        })
        .join('');
      const segmentList = segments
        .map((s) => {
          const isActive = s.id === selectedSegment;
          const change = `爬升 ${s.ascent} m · 下降 ${s.descent} m`;
          const gradeText = `平均坡度 ${s.grade}%`;
          const stateName = s.id === 'climb' ? 'segment-climb' : '';
          return `<button class="segment-item ${isActive ? 'is-selected' : ''}" data-route="route-analysis" data-state="${stateName}">
            <span class="segment-head"><span class="segment-name">${s.name}</span><span class="difficulty">${s.difficulty}</span></span>
            <span class="segment-range">${s.startKm.toFixed(1)}–${s.endKm.toFixed(1)} km · ${change}</span>
            <span class="segment-grade">${gradeText}</span>
            <span class="segment-strategy">${s.strategy}</span>
          </button>`;
        })
        .join('');
      const routeMap = (() => {
        const highlightPath = activeSegment
          ? `M${toX(activeSegment.startKm).toFixed(1)} ${(60 + Math.sin(activeSegment.startKm / 20) * 20).toFixed(1)} L${toX(activeSegment.endKm).toFixed(1)} ${(60 + Math.sin(activeSegment.endKm / 20) * 20).toFixed(1)}`
          : '';
        return `<div class="route-map" role="img" aria-label="原生地图示意">
          <svg viewBox="0 0 320 180" preserveAspectRatio="none">
            <rect x="0" y="0" width="320" height="180" fill="var(--color-raised)" />
            <path d="M10 150 C 50 140, 70 70, 110 80 S 180 150, 210 90 S 270 30, 310 50" fill="none" stroke="var(--color-text)" stroke-width="3" stroke-linecap="round" />
            ${highlightPath ? `<path d="M10 150 C 50 140, 70 70, 110 80 S 180 150, 210 90" stroke="var(--color-action)" stroke-width="5" fill="none" stroke-linecap="round" />` : ''}
            <circle cx="10" cy="150" r="6" fill="var(--color-text)" />
            <circle cx="310" cy="50" r="6" fill="var(--color-brand)" />
            ${hasCoordinate ? `<circle cx="${(toX(selectedPoint.km) * 0.95 + 8).toFixed(1)}" cy="${(60 + Math.sin(selectedPoint.km / 20) * 20).toFixed(1)}" r="7" fill="var(--color-action)" stroke="var(--color-on-action)" stroke-width="2" />` : ''}
          </svg>
          <span class="map-badge">原生 map · 包含关键点 markers 与 include-points</span>
        </div>`;
      })();
      const selectedCard = `<div class="card selected-card">${cardHead('', '当前关键点')}
        <div class="selected-name">${selectedPoint.name}</div>
        <div class="selected-grid">
          <div><span>公里</span><span>km ${selectedPoint.km.toFixed(1)}</span></div>
          <div><span>海拔</span><span>${selectedPoint.m} m</span></div>
          <div><span>来源</span><span>${selectedPoint.source}</span></div>
          <div><span>置信度</span><span>${selectedPoint.confidence}</span></div>
        </div>
        <div class="coordinate-row"><span>坐标</span><span class="coordinate-value">${coordinateText}</span></div>
        <p class="point-note">${selectedPoint.note}</p>
        ${hasCoordinate ? btn('复制坐标', toast('坐标已复制'), 'btn-secondary') : btn('坐标不可用', 'disabled', 'btn-secondary is-disabled')}
      </div>`;
      return `<div class="pg route-analysis-page">
        <section class="analysis-header">
          <p class="analysis-kicker">完整路线分析 · 只读</p>
          <h2 class="analysis-title">${primary.title}</h2>
          <p class="analysis-route">${primary.route}</p>
          <p class="analysis-boundary">使用活动已有路线数据进行本地规则分析，不含实时导航、天气或道路事件判断。</p>
        </section>

        ${metrics([
          [`${primary.distanceKm} km`, '距离'],
          [`${primary.elevationM} m`, '总爬升'],
          [`${primary.elevationMaxM} m`, '最高海拔'],
          [primary.estimatedRideTime, '预计骑行'],
        ])}

        <div class="card">${cardHead('', '路线策略')}
          ${strategySummary.map((item) => `<p class="bullet-row"><span class="bullet-mark">/</span><span>${item}</span></p>`).join('')}
        </div>

        <div class="card">${cardHead('', '海拔剖面')}
          <p class="card-hint">点击关键公里点或分段后，游标与范围会同步更新。首期不支持图表拖动。</p>
          ${profileChart}
        </div>

        <div class="card">${cardHead('', '关键公里点', tag('neutral', `${keyPoints.length} 个`))}
          <div class="point-list">${pointList}</div>
        </div>

        <div class="card">${cardHead('', '主要分段', tag('neutral', `${segments.length} 段`))}
          <div class="segment-list">${segmentList}</div>
        </div>

        <div class="card map-card">${cardHead('', '路线地图')}
          <p class="card-hint">地图仅展示活动已有路线，不读取当前位置，也不是实时导航。</p>
          ${routeMap}
        </div>

        ${selectedCard}

        <div class="card external-card">${cardHead('', '外部增强能力状态')}
          <div class="boundary-item"><span class="boundary-status">实时天气未接入</span><p>需要天气服务授权、服务端代理、逐点逐时匹配、缓存与费用策略；当前不生成天气或穿衣结论。</p></div>
          <div class="boundary-item"><span class="boundary-status">交通事件覆盖待开通</span><p>施工、事故、管制与封路需要商业数据授权和区域覆盖验证；无覆盖数据不等于道路畅通。</p></div>
        </div>

        <div class="card">${cardHead('', '基础装备建议')}
          ${equipment.map((item) => `<p class="equipment-row"><span aria-hidden="true">✓</span><span>${item}</span></p>`).join('')}
        </div>

        <div class="card quality-card">${cardHead('', '数据来源与质量')}
          ${quality.map((item) => `<p class="quality-row">${item}</p>`).join('')}
        </div>
      </div>`;
    },
  };

  window.pageTemplates = templates;
})();
