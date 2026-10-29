(() => {
  const {
    activities,
    activityCarouselExtras,
    rider,
    driver,
    attendees,
    releaseNotes,
    clubIdentity,
    clubMembership,
    tripClubSnapshots,
    clubCenterPrototype,
    clubManagementPrototype,
  } = window.prototypeData;
  const primary = activities[0];
  const activityCarouselItems = [
    ...activities.slice(0, 2),
    ...(Array.isArray(activityCarouselExtras) ? activityCarouselExtras : []),
  ];
  const identityData = clubIdentity || {};
  const membershipData = clubMembership || {};
  const snapshotData = tripClubSnapshots || {};
  const SINGLE_CLUB_LABEL = identityData.singleClubLabel || '辛庄桥小火车';
  const ACTIVITY_IDENTITY_NOTE =
    identityData.snapshotNote ||
    '活动列表与详情优先使用当前俱乐部资料；资料不可用时回退发布快照。';
  const HISTORY_IDENTITY_NOTE =
    identityData.historySnapshotNote ||
    '历史行程与凭证保留发布或成行时的活动归属，不随当前成员关系变化。';
  const IMG = {
    mountain: './designs/2026-10-22-cycling-image-journal/assets/mountain.webp',
    lakeside: './designs/2026-10-22-cycling-image-journal/assets/lakeside.webp',
    club: './designs/2026-10-22-cycling-image-journal/assets/club.webp',
    rider: './designs/2026-10-22-cycling-image-journal/assets/rider.webp',
    cover: './designs/2026-10-22-cycling-image-journal/assets/mountain.webp',
    avatar: './designs/2026-10-22-cycling-image-journal/assets/rider.webp',
  };

  // 当前页面状态由 app.js 写入 window.prototypeState；未写入时取 schema 中的第一个状态
  const st = () => window.prototypeState || '';
  const is = (...names) => names.includes(st());

  /* ---------- 俱乐部身份：当前资料、历史快照、头像与头像组 ---------- */
  // 当前资料优先；当前资料不可用时回退到活动快照，缺少组织数据时统一回落到唯一俱乐部。
  const clubById = new Map(
    (Array.isArray(identityData.directory) ? identityData.directory : []).map((club) => [
      club.id,
      club,
    ]),
  );
  const normalizeClub = (club) => {
    if (!club) return null;
    const name = club.name || club.clubNameSnapshot;
    if (!name) return null;
    return {
      id: club.id || club.clubId,
      name,
      shortName: club.shortName || name,
      monogram:
        club.monogram ||
        club.avatarMonogram ||
        club.clubMonogram ||
        (club.shortName || name).slice(0, 2),
      tone: club.tone || club.avatarTone || club.clubTone || 'ink',
    };
  };
  const canonicalClub =
    normalizeClub([...clubById.values()][0]) ||
    normalizeClub({
      id: 'club-xinzhuangqiao',
      name: SINGLE_CLUB_LABEL,
      shortName: SINGLE_CLUB_LABEL,
      monogram: '辛',
      tone: 'ink',
    });
  const clubAvatar = (club, size = 'md') => {
    const normalized = normalizeClub(club) || canonicalClub;
    return `<span class="club-avatar club-avatar-${size} club-avatar-${normalized.tone}" role="img" aria-label="${normalized.name}头像"><b>${normalized.monogram.slice(0, 2)}</b></span>`;
  };
  const clubBadgeLine = (club, extra = '', historical = false) => {
    const normalized = normalizeClub(club) || canonicalClub;
    return `<span class="club-identity">${clubAvatar(normalized, 'sm')}<span class="club-identity-name"><b>${normalized.shortName}</b>${extra ? `<small>${extra}</small>` : ''}</span>${historical ? tag('neutral', '历史归属') : ''}</span>`;
  };
  const activityClubSnapshots = identityData.activitySnapshots || {};
  const activityHost = (activity) => {
    const current = normalizeClub(
      activity && activity.hostClub && activity.hostClub.status !== 'suspended' && activity.hostClub.status !== 'closed'
        ? clubById.get(activity.hostClub.id) || activity.hostClub
        : null,
    );
    if (current) return { kind: 'club', club: current, historical: false };
    const snapshot = activity && activity.id ? activityClubSnapshots[activity.id] : null;
    const snapshotClub = normalizeClub(snapshot);
    if (snapshotClub) return { kind: 'club', club: snapshotClub, historical: true };
    return { kind: 'club', club: canonicalClub, historical: false };
  };
  const getTripSnapshot = ({ activityId, credentialId = '' }) =>
    (credentialId && snapshotData.byCredentialId && snapshotData.byCredentialId[credentialId]) ||
    (activityId && snapshotData.byActivityId && snapshotData.byActivityId[activityId]) ||
    null;
  const snapshotHostLine = (snapshot) => {
    if (!snapshot || snapshot.kind !== 'club') {
      return clubBadgeLine(
        canonicalClub,
        snapshot && snapshot.capturedAt ? `成行时快照 · ${snapshot.capturedAt}` : '成行时快照',
      );
    }
    return clubBadgeLine(
      snapshot,
      `成行时快照${snapshot.capturedAt ? ` · ${snapshot.capturedAt}` : ''}`,
      snapshot.historical === true ||
        snapshot.currentClubStatus === 'suspended' ||
        snapshot.currentClubStatus === 'closed' ||
        snapshot.membershipStatus === 'left',
    );
  };
  const activeMembershipIds = (membership) => {
    if (!membership) return [];
    if (Array.isArray(membership.memberships)) {
      return membership.memberships
        .filter((item) => item && item.status === 'active')
        .map((item) => item.clubId);
    }
    return Array.isArray(membership.clubIds) ? membership.clubIds : [];
  };
  // 俱乐部头像组：单俱乐部收口后仅展示该唯一俱乐部头像；保留 overflow 容错以兼容历史数据。
  const clubAvatarStack = (ids) => {
    const list = ids.map((id) => clubById.get(id)).filter(Boolean);
    const visible = list.slice(0, 4);
    const overflow = Math.max(0, list.length - visible.length);
    return `<span class="club-avatar-stack" role="img" aria-label="已加入 ${list.length} 个俱乐部">${visible
      .map((club) => clubAvatar(club, 'sm'))
      .join('')}${overflow ? `<span class="club-avatar club-avatar-sm club-avatar-overflow"><b>+${overflow}</b></span>` : ''}</span>`;
  };

  /* ---------- 公共组件（与设计说明“公共规范”对应） ---------- */
  const brandLogo = (meta) =>
    `<div class="prototype-brand-logo"><span class="prototype-wordmark" aria-hidden="true"><span>此</span><span>里</span><i></i></span><span class="prototype-brand-meta">${meta}</span></div>`;
  // 旧模板调用保留空兼容，正式页面不再渲染与原生导航重复的场记横幅。
  const cinemaSlate = () => '';
  const tag = (type, label) => `<span class="tag tag-${type}">${label}</span>`;
  const row = (k, v) => `<div class="row"><span class="k">${k}</span><span class="v">${v}</span></div>`;
  const rows = (list) => `<div class="rows">${list.map(([k, v]) => row(k, v)).join('')}</div>`;
  const linkRow = (icon, title, sub, route, right = '') =>
    `<button class="row is-link" data-route="${route}"><span class="k"><span class="menu-icon ${icon}"><i></i></span><span>${title}<small>${sub}</small></span></span><span class="v">${right}<span class="chev">›</span></span></button>`;
  // 影像志设计的三栏指标条：div > strong(含 .unit) + span，统一承载在暗色信息层中。
  const metric = (value, label, extra = '') => {
    const match = String(value).match(/^(.+?)\s+(km|m|h|人|小时)$/);
    const reading = match
      ? `<strong>${match[1]}<span class="unit">${match[2]}</span></strong>`
      : `<strong>${value}</strong>`;
    return `<div${extra ? ` class="${extra}"` : ''}>${reading}<span>${label}</span></div>`;
  };
  const metrics = (list, extra = '') =>
    `<div class="metrics${extra ? ` ${extra}` : ''}">${list.map(([v, l, e]) => metric(v, l, e)).join('')}</div>`;
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
  const journalImage = (src, alt, fallback = '影像暂不可用，页面信息仍可继续查看。') =>
    `<span class="journal-image" data-image-fallback><img src="${src}" alt="${alt}" loading="lazy" onerror="this.closest('[data-image-fallback]').classList.add('is-image-error')" /><span class="journal-image-fallback" role="img" aria-label="${fallback}"><i aria-hidden="true"></i><b>此里 CILI</b><small>${fallback}</small></span></span>`;
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
  const emptyMediaInner = () =>
    `<svg viewBox="0 0 360 168" preserveAspectRatio="none"><path d="M-10 140 C 60 120, 90 60, 150 72 S 240 150, 300 90 S 350 30, 380 40" style="fill:none;stroke:var(--color-muted);stroke-width:2"/><path d="M-10 160 C 70 140, 110 96, 170 104 S 250 160, 380 110" style="fill:none;stroke:var(--color-muted);stroke-width:1.5"/><path d="M20 128 C 80 112, 104 70, 150 78" style="fill:none;stroke:var(--color-brand);stroke-width:3;stroke-linecap:round"/></svg><span class="brand-word">CILI RIDER</span>`;
  const emptyMedia = () => `<div class="rider-card-media is-empty">${emptyMediaInner()}</div>`;

  const templates = {
    'club/center': () => {
      const centerData = clubCenterPrototype || {};
      const club = centerData.club || {};
      const viewer = centerData.viewer || {};
      const recentActivities = Array.isArray(centerData.activities) ? centerData.activities.slice(0, 3) : [];
      const requestedMode = st() || 'home';
      const route = 'club/center';
      const canManage = ['ADMIN', 'OWNER', 'CLUB_ADMIN', 'PLATFORM_OWNER'].includes(viewer.roleToken);
      const mode = requestedMode === 'manage' && !canManage ? 'home' : requestedMode;
      const modeLink = (label, nextMode, kind = 'btn-secondary') =>
        btn(label, `data-action="route" data-route="${route}" data-state="${nextMode}"`, kind);

      if (mode === 'loading') {
        return `<div class="pg club-center-page" data-club-center data-mode="loading">
          <p class="page-sub" aria-live="polite">正在加载俱乐部主页…</p>
          <div class="club-center-skeleton" aria-live="polite">${skeletons(3, true)}</div>
        </div>`;
      }
      if (mode === 'error') {
        return `<div class="pg club-center-page" data-club-center data-mode="error">
          ${stateView('!', '暂时没能打开俱乐部主页', '请检查网络后重试，也可以稍后再来看看。', `<div class="btn-row">${modeLink('重新加载', 'home', 'btn')}</div>`, true)}
        </div>`;
      }

      const cover = `<div class="club-center-cover" role="img" aria-label="${club.coverAlt || '俱乐部封面'}">
        ${journalImage(IMG.club, club.coverAlt || '俱乐部骑行合影')}
        <span class="club-center-cover-loc" aria-label="所在城市：${club.city || '未填写'}"><i aria-hidden="true"></i>${club.city || '城市未填写'}</span>
      </div>`;
      const manageMeta = canManage
        ? `<div class="club-center-admin-meta"><span>我的身份 · ${viewer.roleLabel || '管理员'}</span>${modeLink('编辑资料 ›', 'manage', 'club-center-manage-link')}</div>`
        : '';
      const identity = `<section class="club-center-identity" aria-label="俱乐部身份">
        <span class="club-center-avatar"><img src="${club.avatarImage || IMG.avatar}" alt="${club.name || '俱乐部'}头像" /></span>
        <h2 class="club-center-name">${club.name || '辛庄桥小火车'}</h2>
        <p class="club-center-intro">${club.intro || '欢迎来到俱乐部主页。'}</p>
        ${manageMeta}
      </section>`;
      const activityRow = (activity) => `<button class="club-event-row" data-route="activity-detail" data-state="${activity.registrationMode === 'open' ? 'open-public' : 'open-approval'}" data-activity-id="${activity.id}" aria-label="${activity.title}，${activity.date} ${activity.weekday}，${activity.time}，${activity.meetingPoint}，${activity.distanceKm} 公里，${activity.elevationM} 米爬升，${activity.registration}">
        <span class="club-event-date" aria-hidden="true"><b>${activity.date}</b><small>${activity.weekday}</small></span>
        <span class="club-event-body">
          <span class="club-event-titleline"><strong>${activity.title}</strong><em class="club-event-status is-${activity.statusTone || 'open'}">${activity.status}</em></span>
          <span class="club-event-meta"><b>${activity.time}</b><i aria-hidden="true">·</i>${activity.meetingPoint}</span>
          <span class="club-event-stats"><b>${activity.distanceKm}</b>km <i>·</i> <b>${activity.elevationM}</b>m 爬升 <i>·</i> ${activity.registration}</span>
        </span>
        <span class="club-event-chevron" aria-hidden="true">›</span>
      </button>`;

      if (mode === 'manage') {
        return `<div class="pg club-center-page club-center-manage" data-club-center data-mode="manage">
          <p class="prototype-mock-badge">管理员 · 资料维护</p>
          <header class="pageheading"><div class="eyebrow">此里 · 俱乐部资料</div><h1 class="editorial">编辑俱乐部资料。</h1></header>
          <section class="card">
            ${cardHead('01', '基础资料')}
            ${field('俱乐部名称', input(club.name))}
            ${field('所在地区', input(club.locationLabel || club.city))}
            ${field('俱乐部简介', input(club.intro, { cls: 'textarea', count: `${(club.intro || '').length}/200` }))}
          </section>
          <section class="card club-center-media-manage">
            ${cardHead('02', '媒体资料', '', '头像与背景图分别选择、分别裁剪、分别上传')}
            <div class="club-center-media-grid">
              <article><div class="club-center-avatar-crop"><img src="${club.avatarImage || IMG.avatar}" alt="当前俱乐部头像" /></div><b>俱乐部头像 · 1:1</b><p>移动与缩放后按正方形裁剪。</p>${btn('更换头像', toast('打开头像 1:1 裁剪上传'), 'btn-secondary')}</article>
              <article><div class="club-center-cover-crop"><img src="${club.coverImage || IMG.cover}" alt="当前俱乐部背景图" /></div><b>俱乐部背景图 · 16:9</b><p>移动与缩放后按横向画幅裁剪。</p>${btn('更换背景图', toast('打开背景图 16:9 裁剪上传'), 'btn-secondary')}</article>
            </div>
          </section>
          <div class="btn-row">${modeLink('取消', 'home', 'btn-secondary')}${btn('保存资料', 'data-action="route" data-route="club/center" data-state="home"', 'btn')}</div>
        </div>`;
      }

      const activityContent =
        mode === 'empty' || recentActivities.length === 0
          ? stateView('0', '近期还没有活动', '新活动发布后会出现在这里，可以稍后再来看看。', btn('查看全部活动', go('activities'), 'btn-secondary'))
          : `<div class="club-event-list" role="list">${recentActivities.map(activityRow).join('')}</div>`;
      const activityHint =
        mode === 'empty' || recentActivities.length === 0
          ? '新活动发布后会显示在这里'
          : `${recentActivities.length} 场活动，就近出发`;
      return `<div class="pg club-center-page" data-club-center data-mode="${mode === 'empty' ? 'empty' : 'home'}">
        <header class="club-center-hero">${cover}${identity}</header>
        <section class="club-center-events" aria-label="近期活动">
          <div class="club-center-events-head"><div><h3>近期活动</h3><p>${activityHint}</p></div><button class="club-center-more" data-route="activities">更多 ›</button></div>
          ${activityContent}
        </section>
        <p class="club-center-footnote">报名后可在「我的 › 我的行程」中查看。</p>
      </div>`;
    },
    'admin-club-applications': () => {
      const management = clubManagementPrototype || {};
      const club = management.club || null;
      const route = 'admin-club-applications';
      if (is('loading')) {
        return `<div class="pg club-admin-list" data-club-admin-list data-mode="loading">
          <header class="pageheading"><div class="eyebrow">此里 · 平台管理</div><h1 class="editorial">俱乐部管理。</h1><p aria-live="polite">正在加载唯一俱乐部资料</p></header>
          ${skeletons(2, true)}
        </div>`;
      }
      if (is('error')) {
        return `<div class="pg club-admin-list" data-club-admin-list data-mode="error">
          <header class="pageheading"><div class="eyebrow">此里 · 平台管理</div><h1 class="editorial">俱乐部管理。</h1></header>
          ${stateView('!', '俱乐部资料加载失败', '网络不稳定，请稍后重试。', btn('重新加载', `data-action="route" data-route="${route}" data-state="default"`), true)}
        </div>`;
      }
      if (is('bootstrap')) {
        return `<div class="pg club-admin-list" data-club-admin-list data-mode="bootstrap">
          <header class="pageheading"><div class="eyebrow">此里 · 平台管理员 · 首次创建</div><h1 class="editorial">俱乐部管理。</h1><p>平台尚未创建俱乐部，仅平台管理员可完成首次创建；创建后此入口不再出现。</p></header>
          ${stateView('＋', '尚未创建俱乐部', '创建后将成为全平台唯一俱乐部，所有活动统一归属该俱乐部。', btn('创建唯一俱乐部', 'data-action="route" data-route="admin-club-application-detail" data-state="bootstrap"'))}
        </div>`;
      }
      // default：唯一俱乐部资料概览
      return `<div class="pg club-admin-list" data-club-admin-list data-mode="default">
        <header class="pageheading"><div class="eyebrow">此里 · 平台管理员</div><h1 class="editorial">俱乐部管理。</h1><p>全平台只有一个俱乐部，本页展示其资料并提供编辑入口；不再出现新建或列表。</p></header>
        <article class="card club-admin-card club-admin-card-single">
          <span class="club-admin-card-avatar"><img src="${(club && club.avatarImage) || IMG.avatar}" alt="${(club && club.name) || '辛庄桥小火车'}头像" /></span>
          <span class="club-admin-card-copy"><b>${(club && club.name) || '辛庄桥小火车'}</b><small>${(club && club.city) || '北京 · 海淀'} · 全平台唯一</small></span>
          <span class="club-admin-card-status">ACTIVE</span>
        </article>
        <div class="btn-row">${btn('编辑俱乐部资料', 'data-action="route" data-route="admin-club-application-detail" data-state="edit"')}</div>
        <p class="neutral-note">全平台只允许存在一个俱乐部；本页仅提供资料查看与编辑入口。</p>
      </div>`;
    },
    'admin-club-application-detail': () => {
      const management = clubManagementPrototype || {};
      const club = management.club || {};
      const draft = management.createDraft || {};
      const state = st() || 'edit';
      const [operation, transient = ''] = state.split('--');
      const bootstrap = operation === 'bootstrap';
      const viewState = transient || operation;
      const submitting = viewState === 'submitting';
      const validationError = viewState === 'validation-error';
      const submitError = viewState === 'submit-error';
      const avatarUploading = viewState === 'avatar-uploading';
      const coverUploading = viewState === 'cover-uploading';
      const mediaState = window.prototypeClubCreateMedia || {
        avatarReady: true,
        coverReady: true,
      };
      // 已有俱乐部时编辑；bootstrap 态仅平台管理员首次创建。
      const source = bootstrap ? draft : club;
      const titleText = bootstrap ? '创建唯一俱乐部' : '编辑俱乐部资料';
      const subText = bootstrap
        ? '平台尚未创建俱乐部，本次创建后将成为全平台唯一俱乐部，之后此入口不再出现。'
        : '全平台只允许存在一个俱乐部，本页只能编辑该俱乐部资料；不能创建第二个俱乐部。';
      const submitLabel = bootstrap
        ? (submitting ? '正在创建' : submitError ? '重试创建' : '创建并立即生效')
        : (submitting ? '正在保存' : submitError ? '重试保存' : '保存资料');
      if (viewState === 'success') {
        return `<div class="pg club-create-page" data-club-create data-mode="success">
          <p class="prototype-mock-badge">平台管理员 · 本地原型演示</p>
          ${stateView('✓', bootstrap ? '唯一俱乐部创建成功' : '俱乐部资料已保存', `${(source && source.name) || '辛庄桥小火车'} 已成为全平台唯一俱乐部，当前状态 active。`, btn('进入俱乐部主页', 'data-action="route" data-route="club/center" data-state="home"'))}
          <p class="neutral-note">本页面只演示交互状态，没有写入数据库。</p>
        </div>`;
      }
      const avatarContent = avatarUploading
        ? `<span class="avatar profile-avatar-preview club-create-avatar-preview is-uploading"><img src="${source.avatarImage || IMG.avatar}" alt="俱乐部头像上传中" /><span>62%</span></span>`
        : mediaState.avatarReady
          ? `<span class="avatar profile-avatar-preview club-create-avatar-preview"><img src="${source.avatarImage || IMG.avatar}" alt="当前俱乐部头像" /></span>`
          : '<span class="avatar profile-avatar-preview club-create-avatar-preview is-empty" aria-label="尚未设置俱乐部头像">＋</span>';
      const coverContent = coverUploading
        ? `<div class="club-background-preview is-uploading"><img src="${source.coverImage || IMG.rider}" alt="俱乐部背景图上传中" /><div class="thumb-state is-uploading">正在上传 62%<span class="progress"><i style="width:62%"></i></span></div></div>`
        : mediaState.coverReady
          ? `<div class="club-background-preview"><img src="${source.coverImage || IMG.rider}" alt="当前俱乐部背景图" /><span class="thumb-badge">${tag('neutral', '背景')}</span></div>`
          : '<div class="club-background-preview is-empty"><b>尚未设置背景图</b><small>选择后按 16:9 移动和缩放画面</small></div>';
      return `<div class="pg club-create-page" data-club-create data-mode="${state}">
        <p class="prototype-mock-badge">平台管理员 · 本地原型演示</p>
        <header class="pageheading"><div class="eyebrow">此里 · 俱乐部资料</div><h1 class="editorial">${titleText}</h1><p>${subText}</p></header>
        <section class="card club-create-avatar-card">
          ${cardHead('01', '俱乐部头像', tag('neutral', '1:1'), '用于俱乐部主页、活动归属与详情页标识')}
          <div class="profile-avatar-editor">${avatarContent}<div class="profile-avatar-panel"><p>选择后按正方形裁剪；头像与背景图分别处理。</p>${btn(mediaState.avatarReady ? '更换俱乐部头像' : '选择俱乐部头像', 'data-action="club-create-avatar"', 'btn-secondary')}</div></div>
          <p class="club-create-media-status" role="status">${avatarUploading ? '正在更新俱乐部头像…' : mediaState.avatarReady ? '头像已就绪' : '尚未设置头像'}</p>
        </section>
        <section class="card club-create-cover-card">
          ${cardHead('02', '俱乐部背景图', tag('neutral', mediaState.coverReady ? '1/1' : '0/1'), '最多 1 张；选择后可按 16:9 移动和缩放画面，建议使用横向骑行照片')}
          <div class="club-background-editor" data-aspect-ratio="16:9">
            <div class="club-background-actions">${btn(mediaState.coverReady ? '更换背景图' : '添加背景图', 'data-action="club-create-cover"', 'btn-secondary')}${mediaState.coverReady ? btn('删除背景图', 'data-action="club-create-remove-cover"', 'btn-secondary club-background-remove') : ''}</div>
            ${coverContent}
            <p class="club-background-count">${mediaState.coverReady ? '已设置 1 张背景图' : '尚未设置背景图'}</p>
          </div>
        </section>
        <section class="card club-create-basics-card">
          ${cardHead('03', '基本资料')}
          ${field('俱乐部名称', input(validationError ? '' : source.name, { ph: '例如：辛庄桥小火车', cls: validationError ? 'is-error' : '', error: validationError ? '请填写俱乐部名称' : '' }), tag('pending', '必填'))}
          ${field('所在地区', input(validationError ? '' : (source.locationLabel || source.city), { ph: '请输入所在地区', cls: validationError ? 'is-error' : '', error: validationError ? '请填写所在地区' : '' }), tag('pending', '必填'))}
          ${field('俱乐部简介', input(source.intro, { cls: 'textarea', ph: '介绍骑行节奏、安全约定与活动范围', count: `${(source.intro || '').length}/200` }))}
        </section>
        ${submitError ? `<p class="field-msg is-error club-create-submit-error" role="alert">${bootstrap ? '创建' : '保存'}失败，已保留全部内容；请重试。</p>` : ''}
        ${btn(submitLabel, submitting ? 'disabled aria-disabled="true"' : 'data-action="club-create-submit"', `btn club-create-submit${submitting ? ' is-disabled is-loading' : ''}`)}
        <p class="neutral-note">${bootstrap ? '首次创建后，本页将仅展示“编辑俱乐部资料”，不再提供新建入口。' : '全平台只允许存在一个俱乐部，本页不能创建第二个俱乐部。'}这是 Pages 交互原型，不执行真实数据库写入。</p>
      </div>`;
    },
    activities: () => {
      if (is('loading')) return `<div class="pg activities-journal"><header class="pageheading"><div class="eyebrow">此里 · 一起出发</div><h1 class="editorial">周末，交给山路。</h1></header>${skeletons(2, true)}</div>`;
      const head = `<header class="pageheading"><div class="eyebrow">此里 · 一起出发</div><h1 class="editorial">周末，交给山路。</h1><p>每一次转弯，都有值得记住的风景。</p></header>
        <div class="segment" role="tablist" aria-label="活动列表切换"><button role="tab" aria-selected="${is('history') ? 'false' : 'true'}" data-route="activities" data-state="default">近期活动</button><button role="tab" aria-selected="${is('history') ? 'true' : 'false'}" data-route="activities" data-state="history">往期影像</button></div>`;
      if (is('empty'))
        return `<div class="pg activities-journal">${head}${stateView('0', '近期暂无活动', '新的骑行发布后会出现在这里，可以先看看往期影像。', btn('查看往期影像', 'data-route="activities" data-state="history"', 'btn secondary'))}</div>`;
      if (is('error'))
        return `<div class="pg activities-journal">${head}${stateView('!', '活动加载失败', '网络不稳定，请检查网络后重试。', btn('重新加载', toast('正在重新加载')), true)}</div>`;
      const historyMode = is('history');
      const carouselItems = historyMode
        ? [activityCarouselItems[1]]
        : activityCarouselItems.slice(0, 3);
      const activityPresentation = (activity, index) => {
        if (historyMode) {
          return { state: 'history', label: '已结束', cta: '查看活动回顾', attrs: 'data-route="activity-detail"' };
        }
        if (activity.carouselState === 'closing') {
          return { state: 'closing', label: '即将满员', cta: '立即报名', attrs: 'data-route="registration-form"' };
        }
        if (index === 1) {
          return { state: 'joined', label: '我已报名', cta: '查看我的行程', attrs: 'data-route="registrations"' };
        }
        return { state: 'open', label: '报名中', cta: '查看活动', attrs: 'data-route="activity-detail"' };
      };
      return `<div class="pg activities-journal">${head}
        ${carouselItems
          .map((activity, index) => {
            const presentation = activityPresentation(activity, index);
            const host = activityHost(activity);
            const cover = journalImage(
              historyMode ? IMG.club : [IMG.mountain, IMG.lakeside, IMG.club][index] || IMG.mountain,
              `${activity.title}骑行影像`,
            );
            return `<a class="story${index === 0 ? ' story-opening' : ''}" role="button" data-action="route" ${presentation.attrs} aria-label="${activity.title}，${presentation.cta}">
              <div class="photo">${cover}<div class="shade"></div><span class="tag dark story-badge">${presentation.label}</span><div class="caption"><div class="eyebrow">${activity.date} · ${activity.time}</div><h2 class="editorial">${activity.title}</h2><p>${host.club.name}</p></div></div>
              <div class="storyfacts"><span><strong>${activity.distanceKm}</strong> km 距离</span><span><strong>${activity.elevationM}</strong> m 爬升</span><span><strong>${activity.estimatedRideTime || '待定'}</strong> 骑行</span></div>
              <div class="storymeta"><span>${host.club.name} · ${activity.start}</span><span class="go">${presentation.cta} →</span></div>
            </a>`;
          })
          .join('')}
      </div>`;
    },

    'activity-detail': () => {
      const selectedClubActivity = (clubCenterPrototype?.activities || []).find(
        (activity) => activity.id === window.prototypeActivityId,
      );
      const primary = selectedClubActivity
        ? {
            ...activities[0],
            ...selectedClubActivity,
            date: `${selectedClubActivity.date} ${selectedClubActivity.weekday}`,
            start: selectedClubActivity.meetingPoint,
          }
        : activities[0];
      const registrationModes = (window.prototypeData && window.prototypeData.registrationModes) || {};
      const modeOptions = Array.isArray(registrationModes.options) ? registrationModes.options : [];
      const modeByKey = Object.fromEntries(modeOptions.map((option) => [option.key, option]));
      const stateDrivenMode = is('open-public', 'open-public-full') ? 'open' : is('open-approval') ? 'approval' : '';
      const activityMode = stateDrivenMode || primary.registrationMode || 'approval';
      const modeMeta = modeByKey[activityMode] || modeByKey.approval || modeOptions[0] || {};
      const approved = is('', 'approved', 'copied', 'copy-failed');
      const full = is('full', 'open-public-full');
      const ended = is('ended');
      const openPublic = is('open-public', 'open-public-full');
      const openApproval = is('open-approval');
      const openMode = openPublic || openApproval;
      const modePill = `<span class="mode-pill mode-pill-${activityMode}" data-registration-mode="${activityMode}" data-activity-mode="${activityMode}">${activityMode === 'open' ? '公开报名 · 直接加入' : '审批报名 · 需审核'}</span>`;
      // 影像志改版：报名 CTA 从底部 fixedBar 迁入墨黑 .decision 块，报名模式分支、名额与起止态逻辑完整保留。
      const decisionTitle = ended ? '山路，下次见。' : approved && !openMode ? '位置已就位。' : full ? '名额已满。' : openPublic ? '山路见，直接加入。' : '山路见，先留一个位置。';
      const decisionHint = ended
        ? '活动已结束（T+1 自然结束）· 仅供查看'
        : approved && !openMode
          ? '你已通过审核，出发前请查看凭证'
          : full
            ? (openPublic ? '名额已满，不接受新的加入' : '名额已满，可关注下一场活动')
            : openPublic
              ? `公开报名 · 剩余 ${primary.capacity - primary.approved} 个名额，加入即生效`
              : openApproval
                ? `审批报名 · 剩余 ${primary.capacity - primary.approved} 个名额，提交后由管理员审核`
                : `剩余 ${primary.capacity - primary.approved} 个名额，报名后需管理员审核`;
      const decisionAction = ended
        ? btn('活动已结束', 'disabled', 'btn is-disabled')
        : approved && !openMode
          ? btn('查看我的行程', go('registrations'))
          : full
            ? btn('名额已满', 'disabled', 'btn is-disabled')
            : openPublic
              ? btn(modeMeta.cta || '立即加入', go('registration-form') + ' data-state="confirm"', 'btn mode-cta-open')
              : openApproval
                ? btn(modeMeta.cta || '提交报名申请', go('registration-form') + ' data-state="default"', 'btn mode-cta-approval')
                : btn('立即报名', go('registration-form'));
      const cornerLabel = ended ? '已结束' : approved && !openMode ? '已通过' : full ? '名额已满' : openPublic ? '直接加入' : openApproval ? '待审核' : '报名中';
      const copyToast = is('copied') ? '<div class="inline-toast" role="status"><b aria-hidden="true">✓</b>路线链接已复制</div>' : is('copy-failed') ? '<div class="inline-toast is-error" role="alert"><b aria-hidden="true">!</b>复制失败，请稍后重试</div>' : '';
      const detailHost = activityHost(primary);
      const hostNote = detailHost.historical ? '发布时俱乐部快照' : `所属俱乐部 · 发起人 ${primary.hostClub.organizer || '活动发起人'}`;
      const routeMapSvg = `<svg viewBox="0 0 320 180" role="img" aria-label="${primary.title}路线示意"><rect width="320" height="180" fill="var(--color-raised)"/><path d="M24 150 C 70 122 92 70 150 78 S 244 142 296 60" fill="none" stroke="var(--color-brand)" stroke-width="3" stroke-linecap="round"/><circle cx="24" cy="150" r="5" fill="var(--color-surface)" stroke="var(--color-action)" stroke-width="2"/><circle cx="296" cy="60" r="5" fill="var(--color-surface)" stroke="var(--color-action)" stroke-width="2"/></svg>`;
      const routeElevSvg = `<svg viewBox="0 0 320 120" role="img" aria-label="海拔示意"><path d="M16 96 L48 88 L88 72 L140 40 L176 54 L232 36 L300 84 L304 96 Z" fill="var(--color-raised)"/><path d="M16 96 L48 88 L88 72 L140 40 L176 54 L232 36 L300 84" fill="none" stroke="var(--color-action)" stroke-width="2.5"/></svg>`;
      return `<div class="pg has-bar activity-detail-pg activity-detail-journal" data-activity-mode="${activityMode}" data-registration-mode="${activityMode}">
        <div class="photo hero detail journal-detail-cover">${journalImage(IMG.mountain, `${primary.title}山地骑行封面`)}<div class="shade"></div><div class="corner"><span class="tag dark">${cornerLabel}</span></div><div class="caption detail-hero-caption"><div class="eyebrow">${primary.date} · ${primary.level}</div><h1 class="editorial">${primary.title}</h1><p>${primary.time}集合 · ${primary.start}</p></div></div>
        <div class="ink detail-fact-strip">
          ${metrics([[`${primary.distanceKm} km`, '全程距离'], [`${primary.elevationM} m`, '累计爬升'], [primary.estimatedRideTime, '预计骑行']])}
          <div class="row detail-meeting-strip"><div class="lead"><div><strong>${primary.time} 集合</strong><small>${primary.date} · ${primary.start}</small></div></div><span class="trailing">${modePill}</span></div>
        </div>
        <div class="content">
          <section class="section detail-section detail-section--intro">
            <div class="chapterhead"><h2>这次一起骑</h2><span>${detailHost.historical ? '历史归属' : '活动归属'}</span></div>
            <p>${primary.route}</p>
            <button class="row rowlink host-card host-card-club" data-action="route" data-route="club/center" data-state="home" aria-label="活动组织俱乐部：${detailHost.club.name}"><span class="lead">${clubAvatar(detailHost.club, 'md')}<div><strong>${detailHost.club.name}</strong><small>${hostNote}</small></div></span><span class="trailing">›</span></button>
            <p class="small muted">${ACTIVITY_IDENTITY_NOTE}</p>
          </section>
          <section class="section detail-section">
            <div class="chapterhead"><h2>集合与出发</h2><span>${primary.fee}</span></div>
            <dl class="detailrows"><div><dt>集合时间</dt><dd>${primary.time}</dd></div><div><dt>集合地点</dt><dd>${primary.start}</dd></div><div><dt>费用</dt><dd>${primary.fee}</dd></div></dl>
            ${btn('导航到集合点', toast('已打开集合点导航'), 'btn secondary')}
          </section>
          <section class="section detail-section">
            <div class="chapterhead"><h2>Strava 官方路线</h2><span>官方</span></div>
            ${btn('复制路线链接', 'data-action="copy-route"', 'btn secondary')}${copyToast}
            <p class="small muted">小程序内不打开第三方页面，复制组织者分享的规范化公开路线链接后可自行粘贴使用。</p>
          </section>
          <section class="section route-brief-card">
            <div class="chapterhead"><h2>山路，有迹可循</h2><span>${primary.distanceKm} km / ${primary.elevationM} m · ${primary.level}</span></div>
            <div class="map">${routeMapSvg}<span class="mapkey">路线示意 · ${primary.route}</span></div>
            <div class="elevation">${routeElevSvg}</div>
            <dl class="detailrows route-brief-metrics"><div><dt>距离</dt><dd>${primary.distanceKm} km</dd></div><div><dt>累计爬升</dt><dd>${primary.elevationM} m</dd></div><div><dt>预计骑行</dt><dd>${primary.estimatedRideTime}</dd></div></dl>
            ${btn('查看完整路线分析', go('route-analysis'), 'btn secondary route-brief-cta')}
          </section>
          <section class="section detail-section detail-riders">
            <div class="chapterhead"><h2>一起出发的骑友</h2><span>${primary.approved} / ${primary.capacity} · 昵称与已同意的头像</span></div>
            <div class="riderlist avatar-row detail-rider-strip"><button class="rider attendee-authorization-card" data-action="toast" data-message="将打开资料编辑，选择头像与骑行背景"><span class="avatar initialavatar">${(attendees[0] || '骑').slice(0, 1)}</span><small>${attendees[0]}</small><b>授权获取头像与骑行背景</b></button>${attendees
            .slice(1)
            .map((name) => `<button class="rider" data-action="rider" data-rider="${name}"><span class="avatar initialavatar">${name.slice(0, 1)}</span><small>${name}</small></button>`)
            .join('')}</div>
            <p class="small muted">头像与昵称经本人授权展示；其他骑友缺少素材时只显示昵称和报名状态。</p>
          </section>
          <section class="section detail-section">
            <div class="chapterhead"><h2>活动群二维码</h2><span></span></div>
            ${approved && !openMode ? `<div class="qr-row">${qr(3)}<p class="small muted">扫码加入活动群，出发前请留意群内通知。长按可保存。</p></div>` : `<div class="notice"><span>报名${activityMode === 'open' ? '成功' : '通过'}后可查看活动群二维码。</span></div>`}
          </section>
          <section class="section detail-section">
            <div class="chapterhead"><h2>行前约定</h2><span></span></div>
            <p>请佩戴头盔，携带补给水、备胎和基础维修工具；雨天活动另行通知。</p>
          </section>
        </div>
        <div class="decision detail-decision detail-decision--ink">
          <div class="decision-copy"><span class="decision-kicker">报名状态</span><h3 class="decision-title">${decisionTitle}</h3>
          <p class="decision-hint">${decisionHint}</p>
          ${approved || full || ended ? '' : `<p class="alert-line">${tag('warning', '⚠ 即将截止 · 10月17日 20:00')}</p>`}</div>
          ${decisionAction}
        </div>
      </div>`;
    },

    'registration-form': () => {
      const openConfirm = is('confirm', 'confirm-submitting', 'confirm-full', 'confirm-capacity-changed');
      const openSubmitting = is('confirm-submitting');
      const openFull = is('confirm-full');
      const openCapacityChanged = is('confirm-capacity-changed');
      const approvalSelected = is('selected', 'submitting');
      const approvalSubmitting = is('submitting');
      // 影像志改版：三阶段进度用 .timeline 呈现；steps(1) 的语义（当前=填写报名）保持不变。
      const timeline = `<div class="timeline" role="list" aria-label="报名流程，共三阶段"><span class="active" role="listitem" aria-current="step"><b>1</b>填写报名</span><span role="listitem"><b>2</b>组织者审核</span><span role="listitem"><b>3</b>获取凭证</span></div>`;
      const regNav = () => '';
      const profileRow = `<button class="row rowlink" data-route="profile-edit" aria-label="修改个人资料"><span class="lead"><div><strong>修改个人资料</strong><small>仅你本人与审核管理员可见</small></div></span><span class="trailing">›</span></button>`;
      if (openConfirm) {
        const action = openFull
          ? btn('名额已满', 'disabled', 'btn is-disabled')
          : openSubmitting
            ? btn('加入中', 'disabled', 'btn is-loading')
            : btn('确认加入', `data-action="submit-registration" data-registration-mode="open" data-capacity-available="${openCapacityChanged ? 'false' : 'true'}"`, 'btn mode-cta-open');
        return `<div class="pg registration-page registration-page-open registration-journal" data-registration-mode="open">
          ${regNav('确认加入')}
          <header class="pageheading"><div class="eyebrow">此里 · 公开报名</div><h1 class="editorial">山路见，直接加入。</h1><p>${primary.title} · ${primary.date} ${primary.time}</p></header>
          <div class="content tight">
            ${timeline}
            <section class="section">
              <div class="chapterhead"><h2>确认你的资料</h2><span>${openFull ? '名额已满' : '直接加入'}</span></div>
              <div class="paper">
                <dl class="detailrows"><div><dt>昵称</dt><dd>${rider.nickname}</dd></div><div><dt>真实姓名</dt><dd>${rider.realName}</dd></div><div><dt>手机号</dt><dd>${rider.phone}</dd></div><div><dt>紧急联系人</dt><dd>${rider.emergency}</dd></div></dl>
                ${profileRow}
              </div>
              <p class="small muted">资料仅你本人与组织者可见，用于活动安全联络。</p>
            </section>
            <section class="section">
              <div class="chapterhead"><h2>怎么去集合点</h2><span>默认</span></div>
              <div class="field"><label>集合方式</label>${choices(['自行前往', '需要后援车'], '自行前往')}<small>不同集合方式分别计算名额。公开报名以点击确认时的名额为准，满员将直接拒绝。</small></div>
            </section>
            <section class="section open-confirm-note">
              <div class="chapterhead"><h2>加入即生效</h2><span>总名额 ${primary.capacity}</span></div>
              <p>确认后校验门禁与名额，通过即生成凭证；不会出现待审批或已驳回状态。</p>
              ${openFull ? '<div class="notice warning"><span>名额已满，当前不接受新的加入，可关注下一场活动。</span></div>' : ''}
            </section>
            <div class="actionbar">
              <p class="small muted">${openFull ? '名额已满，不接受新的加入' : openSubmitting ? '正在校验名额并生成凭证…' : '确认后将直接加入并生成凭证'}</p>
              <div class="buttonpair">${btn('返回活动', go('activity-detail') + ' data-state="open-public"', 'btn secondary')}${action}</div>
            </div>
          </div>
        </div>`;
      }
      const action = approvalSubmitting
        ? btn('提交中', 'disabled', 'btn is-loading')
        : approvalSelected
          ? btn('提交报名申请', 'data-action="submit-registration" data-registration-mode="approval"')
          : btn('提交报名申请', 'disabled', 'btn is-disabled');
      return `<div class="pg registration-page registration-page-approval registration-journal" data-registration-mode="approval">
        ${regNav('填写报名')}
        <header class="pageheading"><div class="eyebrow">此里 · 留下一个位置</div><h1 class="editorial">下一站，山顶。</h1><p>${primary.title} · ${primary.date} ${primary.time}</p></header>
        <div class="content tight">
          ${timeline}
          <section class="section">
            <div class="chapterhead"><h2>确认你的资料</h2><span>需审批</span></div>
            <div class="paper">
              <dl class="detailrows"><div><dt>昵称</dt><dd>${rider.nickname}</dd></div><div><dt>真实姓名</dt><dd>${rider.realName}</dd></div><div><dt>手机号</dt><dd>${rider.phone}</dd></div><div><dt>紧急联系人</dt><dd>${rider.emergency}</dd></div></dl>
              ${profileRow}
            </div>
            <p class="small muted">用于审核与活动安全联络，仅你本人与审核管理员可见。</p>
          </section>
          <section class="section">
            <div class="chapterhead"><h2>怎么去集合点</h2><span>默认</span></div>
            <div class="field"><label>集合方式</label>${choices(['自行前往', '需要后援车'], '自行前往')}<small>不同集合方式分别计算名额，请按实际情况选择。名额以通过审核时状态为准；待审批不占用正式名额。</small></div>
          </section>
          <section class="section">
            <div class="chapterhead"><h2>你的骑行经验</h2><span>必选</span></div>
            <div class="field"><label>能力自评</label>${choices(['新手', '有经验', '常骑'], approvalSelected ? '有经验' : '')}${approvalSelected ? '<small>请选择最接近当前骑行能力的一项，供组织者审核参考。</small>' : '<p class="pending-note">请选择骑行经验后再提交</p>'}</div>
          </section>
          <section class="section">
            <div class="chapterhead"><h2>还有什么想说</h2><span>选填</span></div>
            <div class="field"><label>备注与安全</label>${input('', { cls: 'textarea', ph: '饮食、集合或其他备注', count: '0/500' })}<small>仅填写组织方需要提前了解的信息。</small></div>
          </section>
          <div class="notice"><span>实名与电话用于审核和现场联络，公开名单只展示昵称。</span></div>
          <div class="actionbar">
            <p class="small muted">${approvalSelected ? '资料已完整，可以提交审核' : '还差 1 项：骑行经验'}</p>
            <div class="buttonpair">${btn('返回活动', go('activity-detail') + ' data-state="open-approval"', 'btn secondary')}${action}</div>
          </div>
        </div>
      </div>`;
    },

    registrations: () => {
      const cancelledDeleted = Boolean(window.prototypeCancelledTripDeleted);
      const tripCount = is('empty') ? 0 : cancelledDeleted ? 1 : 2;
      const head = `<header class="pageheading"><div class="eyebrow">此里 · 每一次出发</div><h1 class="editorial">我的行程。</h1><p>审核状态与出发凭证，一处确认 · ${is('loading') ? '同步中' : `共 ${tripCount} 场`}</p></header>`;
      if (is('loading')) return `<div class="pg registrations-prototype">${head}${skeletons(2)}</div>`;
      if (is('empty'))
        return `<div class="pg registrations-prototype">${head}<div class="trip-summary">${metric('0', '审核中')}${metric('0', '可出发', 'is-ready')}${metric('0', '已失效')}</div>${stateView('0', '还没有行程', '报名活动后，审核进度和出发凭证都会出现在这里。', btn('去看看活动', go('activities')))}</div>`;
      const readyTrip = getTripSnapshot({ activityId: 'trip-pudong-sunset' }) || {
        title: '浦东滨江夜骑 · 鎏金落日线',
        date: '10月18日 周日',
        time: '17:30',
        start: '浦东滨江 12 号望江台',
        kind: 'club',
      };
      const cancelledTrip = getTripSnapshot({ activityId: 'trip-fengxian-cancelled' }) || {
        title: '奉贤海湾拉练',
        date: '10月11日 周日',
        time: '07:00',
        start: '奉贤海湾旅游区集合点',
        kind: 'club',
      };
      const tripHostLine = snapshotHostLine(readyTrip);
      const cancelledHostLine = snapshotHostLine(cancelledTrip);
      const registrationOutcome = is('review-pending')
        ? {
            state: 'review-pending',
            mode: 'approval',
            tag: tag('pending', '待审核'),
            guidance: '报名已提交，等待组织者确认',
            action: btn('查看报名', go('credential') + ' data-state="pending"', 'btn-secondary trip-ticket-primary'),
          }
        : is('full-waiting', 'waitlist')
          ? {
              state: 'full-waiting',
              mode: 'open',
              tag: tag('warning', '⚠ 候补中'),
              guidance: '本场名额已满，名额释放后再确认',
              action: btn('查看报名', go('credential') + ' data-state="waiting"', 'btn-secondary trip-ticket-primary'),
            }
          : is('cancelled')
            ? {
                state: 'cancelled',
                mode: 'approval',
                tag: tag('muted', '已取消'),
                guidance: '本次报名已取消，需要时可重新报名',
                action: btn('重新报名', go('registration-form') + ' data-state="selected"', 'btn trip-ticket-primary'),
              }
            : is('open-approved')
              ? {
                  state: 'open-approved',
                  mode: 'open',
                  tag: tag('success', '✓ 已报名'),
                  guidance: '公开报名已生效，可以查看出发凭证',
                  action: btn('查看凭证', go('credential'), 'btn trip-ticket-primary'),
                }
              : null;
      if (registrationOutcome) {
        const pendingCount = registrationOutcome.state === 'review-pending' ? '1' : '0';
        const readyCount = registrationOutcome.state === 'open-approved' ? '1' : '0';
        const invalidCount = registrationOutcome.state === 'cancelled' ? '1' : '0';
        return `<div class="pg registrations-prototype" data-registration-outcome="${registrationOutcome.state}">${head}
          <div class="trip-summary">${metric(pendingCount, '审核中')}${metric(readyCount, '可出发', readyCount === '1' ? 'is-ready' : '')}${metric(invalidCount, '已失效')}</div>
          <article class="trip-ticket ${registrationOutcome.state === 'cancelled' ? 'trip-ticket-cancelled' : ''}" data-registration-mode="${registrationOutcome.mode}">
            <div class="trip-ticket-top"><b class="ticket-label">骑行票据</b><span class="ticket-date">${readyTrip.date}</span>${registrationOutcome.tag}</div>
            <div class="trip-ticket-body"><h3>${readyTrip.title}</h3><p class="meta-line trip-host-line">${tripHostLine}</p><span class="mode-pill mode-pill-${registrationOutcome.mode} mode-pill-inline">${registrationOutcome.mode === 'open' ? '公开报名 · 直接加入' : '审批报名 · 需审核'}</span><div class="trip-ticket-info"><div><small>集合时间</small><b>${readyTrip.time}</b></div><div><small>集合地点</small><b>${readyTrip.start}</b></div></div><p class="status-guidance"><i></i>${registrationOutcome.guidance}</p>${registrationOutcome.action}</div>
          </article>
        </div>`;
      }
      return `<div class="pg registrations-prototype">${head}
        <div class="trip-summary">${metric('0', '审核中')}${metric('1', '可出发', 'is-ready')}${metric(cancelledDeleted ? '0' : '1', '已失效')}</div>
        <article class="trip-ticket" data-registration-mode="open"><div class="trip-ticket-top"><b class="ticket-label">骑行票据</b><span class="ticket-date">${readyTrip.date}</span>${tag('success', '✓ 已报名')}</div><div class="trip-ticket-body"><h3>${readyTrip.title}</h3><p class="meta-line trip-host-line">${tripHostLine}</p><span class="mode-pill mode-pill-open mode-pill-inline">公开报名 · 直接加入</span><div class="trip-ticket-info"><div><small>集合时间</small><b>${readyTrip.time}</b></div><div><small>集合地点</small><b>${readyTrip.start}</b></div></div><div class="ticket-meta"><span>集合方式</span><b>自行前往</b></div><p class="status-guidance"><i></i>公开报名 · 加入即生效，无审核中入口</p>${btn('查看凭证', go('credential'), 'btn trip-ticket-primary')}</div></article>
        ${cancelledDeleted ? '' : `<article class="trip-ticket trip-ticket-cancelled" data-registration-mode="approval"><div class="trip-ticket-top"><b class="ticket-label">骑行票据</b><span class="ticket-date">${cancelledTrip.date}</span>${tag('muted', '已取消')}</div><div class="trip-ticket-body"><h3>${cancelledTrip.title}</h3><p class="meta-line trip-host-line">${cancelledHostLine}</p><span class="mode-pill mode-pill-approval mode-pill-inline">审批报名 · 需审核</span><div class="trip-ticket-info"><div><small>集合时间</small><b>${cancelledTrip.time}</b></div><div><small>集合地点</small><b>${cancelledTrip.start}</b></div></div><p class="status-guidance"><i></i>可左滑或点击删除记录</p><div class="trip-ticket-actions"><button class="btn trip-ticket-delete" data-action="delete-trip">删除记录</button><button class="btn-secondary" data-action="cancelled-trip-detail">查看详情</button></div></div></article>`}
      </div>`;
    },

    credential: () => {
      const credential = getTripSnapshot({
        activityId: 'trip-pudong-sunset',
        credentialId: 'credential-1017-012',
      }) || {
        title: '浦东滨江夜骑 · 鎏金落日线',
        date: '10月18日 周日',
        time: '17:30',
        start: '浦东滨江 12 号望江台',
        address: '集合点地址以活动通知为准',
        kind: 'club',
      };
      const credHostLine = snapshotHostLine(credential);
      const credentialClub = normalizeClub(credential.kind === 'club' ? credential : null) || canonicalClub;
      const rejected = is('rejected');
      const pending = is('pending');
      const waiting = is('waiting');
      const cancelled = is('cancelled');
      const supportCar = is('support-car');
      const used = is('used');
      const activeCredential = !rejected && !pending && !waiting && !cancelled;
      const gatheringMode = supportCar ? '需要后援车' : '自行前往';
      const credentialDetails = [
        ['骑手', rider.realName],
        ['手机号', rider.phone],
        ['性别', rider.gender],
        ['活动归属', credentialClub.name],
        ['集合方式', gatheringMode],
      ];
      if (supportCar) {
        credentialDetails.push(['后援车司机', driver.name]);
        credentialDetails.push(['司机电话', driver.phone]);
        credentialDetails.push(['车辆信息', driver.car]);
      }
      const credentialStatus = rejected
        ? tag('muted', '已驳回')
        : pending
          ? tag('pending', '待审核')
          : waiting
            ? tag('warning', '⚠ 候补中')
            : cancelled
              ? tag('muted', '已取消')
              : used
                ? tag('success', '✓ 已签到')
                : tag('success', '✓ 已通过 · 准时集合');
      const inactiveCredential = pending
        ? '<div class="credential-reject"><p class="card-hint">组织者正在确认报名资料，审核通过后才会生成出发凭证。</p></div>'
        : waiting
          ? '<div class="credential-reject"><p class="card-hint">本场名额已满，当前仍在候补中，尚未获得有效出发凭证。</p></div>'
          : cancelled
            ? '<div class="credential-reject"><p class="card-hint">本次报名已取消，集合信息和凭证已失效。</p></div>'
            : '';
      return `<div class="pg credential-cinema">
        <article class="credential-ticket">
          <div class="ticket-head">${brandLogo(activeCredential ? '报名凭证' : '报名记录')}${credentialStatus}</div>
          <div class="ticket-body"><h2 class="card-title" style="margin-top:8px">${credential.title}</h2><p class="meta-line">${credential.date}</p><p class="meta-line credential-host-line">${credHostLine}</p></div>
          ${
            rejected
              ? `<div class="credential-reject"><div class="row"><span class="k">驳回原因</span><span class="v">骑行经验说明不足，请补充近期骑行经历后重新提交。</span></div><p class="card-hint">驳回原因仅你本人与审核管理员可见；修改资料后可沿用本记录重新提交。</p>${tag('warning', '⚠ 报名被驳回')}</div>`
              : activeCredential
                ? `<div class="credential-spotlight"><p class="info-kicker">集合时间</p><p class="info-big">${credential.time}</p><p class="info-kicker" style="margin-top:8px">集合地点</p><p class="info-title" style="margin-top:0">${credential.start}</p><p class="info-meta">${credential.address || '集合点地址以活动通知为准'}</p><div style="margin-top:12px">${btn('地图导航', toast('已打开集合点导航'), 'btn-inverse')}</div></div>
          <div class="ticket-body">${rows(credentialDetails)}<p class="card-hint credential-snapshot-hint">${HISTORY_IDENTITY_NOTE}</p></div>
          <div class="ticket-body credential-serial-row"><span class="k">凭证编号</span><code class="serial">RE-20261018-482913</code></div>
          <p class="card-hint credential-barcode-note">凭证编号仅文字展示，本期不做条码与扫码核销；签到由管理员在线处理。</p>`
                : inactiveCredential
          }
          ${activeCredential ? '' : `<div class="ticket-body" style="padding-bottom:16px"><p class="card-hint credential-snapshot-hint">${HISTORY_IDENTITY_NOTE}</p></div>`}
        </article>
        <div class="credential-share-action">${btn('分享活动', 'data-action="share-activity"')}<p class="card-hint">仅分享公开活动详情，不含本人的凭证、实名或电话。</p></div>
        <div class="card">${cardHead('', '队伍：风向小队')}<p class="card-hint">我是队长，可使用右上角分享邀请队员。队伍仅用于本次活动分组，与俱乐部身份独立。</p></div>
        <div style="margin-top:12px">${btn('查看路线分析', go('route-analysis'), 'btn-secondary')}</div>
        ${rejected ? `<div style="margin-top:12px">${btn('修改后重新提交', go('registration-form') + ' data-state="selected"', 'btn')}</div>` : cancelled ? `<div style="margin-top:12px">${btn('重新报名', go('registration-form') + ' data-state="selected"', 'btn')}</div>` : used ? '' : `<div style="margin-top:12px">${btn('取消报名', 'data-action="request-cancel-registration"', 'btn-secondary')}</div>`}
      </div>`;
    },

    profile: () => {
      const notice = '<p class="neutral-note">联系电话仅用于活动联络；紧急联系人仅在骑行安全需要时使用。</p>';
      if (is('guest'))
        return `<div class="pg">${brandLogo('此里')}<header class="pageheading"><div class="eyebrow">此里 · 同行从这里开始</div><h1 class="editorial">先认识你。</h1></header>${stateView('此', '微信未登录', '使用微信身份登录，报名资料仅用于活动联络与安全保障。', btn('重新登录', toast('微信授权中')))}${notice}</div>`;
      const admin = is('', 'admin');
      // 全平台只有一个俱乐部：直接展示唯一俱乐部入口，普通用户直达 home，管理员额外可见“管理俱乐部资料”。
      const singleKey = admin
        ? membershipData.admin || membershipData['single-club']
        : membershipData.member || membershipData['single-club'] || membershipData.admin;
      const singleClubId = (singleKey && singleKey.clubId) || 'club-xinzhuangqiao';
      const singleClub = clubById.get(singleClubId) || {
        id: singleClubId,
        name: identityData.singleClubLabel || '辛庄桥小火车',
        monogram: '辛',
        tone: 'ink',
      };
      const roleLabel = (singleKey && singleKey.myRoleLabel) || (admin ? '平台管理员' : '骑友');
      const summary = (singleKey && singleKey.summary) || singleClub.name;
      const clubBlock = `<a class="row rowlink" data-single-club ${go('club/center')} data-state="home" aria-label="进入俱乐部主页：${singleClub.name}">
        <span class="lead">${clubAvatar(singleClub, 'md')}<div><strong>${singleClub.name}</strong><small>我的俱乐部 · ${summary} · ${roleLabel}</small></div></span><span class="trailing">进入俱乐部主页 ›</span>
      </a>`;
      return `<div class="pg profile-journal">
        <section class="profile-hero">
          <img class="profile-background" src="${IMG.mountain}" alt="山路骑行背景" onerror="this.closest('.profile-hero').classList.add('profile-no-background');this.remove();" />
          <span class="profile-label">我的骑行名片</span>
          <button class="background-trigger" data-action="preview-profile-background" aria-label="查看完整骑行背景"></button>
          <div class="profile-identity">
            <button class="avatar-trigger" data-action="preview-profile-avatar" aria-label="查看头像"><img class="avatar" src="${IMG.avatar}" alt="${rider.nickname}的头像" /></button>
            <div><div class="eyebrow">此里 · 骑友</div><h1>${rider.nickname}</h1><p>${rider.gender} · ${rider.title}</p></div>
          </div>
        </section>
        <div class="content">
          <div class="profile-status"><span>✓ 已登录 · 当前为你的个人资料</span></div>
          ${clubBlock}
          ${admin ? `<a class="row rowlink" data-route="admin-activity-list"><span class="lead"><span class="avatar initialavatar">管</span><div><strong>活动管理</strong><small>创建、编辑、上下架与报名审批</small></div></span><span class="trailing">›</span></a>` : ''}
          ${admin ? `<a class="row rowlink" data-route="admin-club-applications"><span class="lead"><span class="avatar initialavatar">部</span><div><strong>管理俱乐部资料</strong><small>编辑唯一俱乐部的名称、简介、地区与媒体</small></div></span><span class="trailing">›</span></a>` : ''}
          <a class="row rowlink" data-route="profile-edit"><span class="lead"><span class="avatar initialavatar">料</span><div><strong>报名资料</strong><small>头像、昵称、实名、电话与紧急联系人</small></div></span><span class="trailing">›</span></a>
          <a class="row rowlink" data-route="settings"><span class="lead"><span class="avatar initialavatar">设</span><div><strong>设置</strong><small>查看当前版本与本次更新内容</small></div></span><span class="trailing">›</span></a>
          <div class="notice"><span>联系电话仅用于活动联络；紧急联系人仅在骑行安全需要时使用。资料仅你本人和报名审核员可见。</span></div>
        </div>
      </div>`;
    },

    settings: () => {
      const [version, title, summary] = releaseNotes[0];
      const admin = is('admin');
      const managementRow = (titleText, description, actionText, action) =>
        `<button class="settings-management-row" data-action="${action}"><span class="settings-management-copy"><b>${titleText}</b><small>${description}</small></span><span class="settings-management-action">${actionText} ›</span></button>`;
      const stravaRow = admin
        ? `<button class="settings-management-row settings-management-row--strava" data-action="settings-strava-sync"><span class="settings-management-copy"><b>同步 Strava 线路信息</b><small>管理授权状态，用于创建活动时直接选用线路</small></span><span class="settings-management-strava"><svg class="strava-mark" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" fill="#fc4c02"/></svg><span class="strava-wordmark">Strava</span><span class="settings-management-action">管理 ›</span></span></button>`
        : '';
      return `<div class="pg settings-page" data-viewer="${admin ? 'admin' : 'rider'}"><header class="pageheading"><div class="eyebrow">此里 · 为每次出发升级</div><h1 class="editorial">设置。</h1><p>管理活动通知、隐私与本地缓存，查看当前版本更新</p></header>
      <section class="card settings-management-card">${cardHead('01', '常用管理')}
        <div class="settings-management-list">
          ${managementRow('活动通知', '按需订阅报名审核等活动提醒，每次选择以微信授权结果为准', '订阅', 'settings-notifications')}
          ${managementRow('隐私管理', '查看微信隐私说明及已使用的信息', '查看', 'settings-privacy')}
          ${managementRow('清理缓存', '仅清理可重新下载的活动、资料和图片，不会退出登录或删除业务数据', '清理', 'settings-clear-cache')}
          ${stravaRow}
        </div>
      </section>
      <section class="card settings-release-card">${cardHead('02', 'App 更新', '', '当前版本的更新概览')}
        <div class="release release-current">
          <div class="release-meta-row"><code>V${version}</code>${tag('solid', '当前版本')}<span class="release-date">${version.split('.').slice(0, 3).join('.')}</span></div>
          <p class="release-title">${title}</p>
          <p class="release-summary">${summary}</p>
          <ul class="release-features">
            <li><span class="feature-arrow" aria-hidden="true">→</span><span>${admin ? '管理员可同步 Strava 线路信息，骑友端不出现该入口' : '创建活动的管理员可同步 Strava 线路信息，直接用于本次活动'}</span></li>
            <li><span class="feature-arrow" aria-hidden="true">→</span><span>创建活动的报名截止默认按活动开始日 00:00 自动设置</span></li>
            <li><span class="feature-arrow" aria-hidden="true">→</span><span>Strava 线路旁可通过「+」补充本地路线文件</span></li>
          </ul>
        </div>
      </section>
      <p class="neutral-note">此里 · 持续为每一次出发升级</p></div>`;
    },

    'capability-card': () => {
      return `<div class="pg capability-card-redirect" data-compat-redirect="profile">${stateView('此', '骑行名片已并入“我的”', '历史地址继续保留，当前会自动回到“我的”。', btn('返回我的', go('profile')))}</div>`;
    },

    'profile-edit': () => {
      const focus = is('focus');
      const error = is('error');
      const uploading = is('uploading');
      const uploadFailed = is('upload-fail');
      return `<div class="pg">
        <header class="pageheading"><div class="eyebrow">此里 · 报名资料</div><h1 class="editorial">让骑友认得你。</h1></header>
        <div ${uploading ? 'inert aria-busy="true"' : ''}>
        <div class="card">${cardHead('01', '更新头像')}<div class="profile-avatar-editor"><span class="avatar profile-avatar-preview"><img src="${IMG.avatar}" alt="当前微信头像" /></span><div class="profile-avatar-panel"><p>请选择微信头像，选择后立即保存，并用于个人主页和活动报名中的骑手身份展示。</p>${btn('选择微信头像', toast('已打开微信头像选择器'), 'btn-secondary')}</div></div></div>
        <div class="card">${cardHead('02', '基础资料')}${field('昵称', input(rider.nickname, { count: '4/16' }))}
          ${field('真实姓名', input(focus ? `${rider.realName}<i class="caret"></i>` : rider.realName, { cls: focus ? 'is-focus' : '' }))}
          ${field('手机号', input(error ? '138 0000 567' : rider.phone, { cls: error ? 'is-error' : '', error: error ? '手机号应为 11 位数字' : '' }))}
          ${field('性别', choices(['男', '女'], rider.gender))}
          ${field('紧急联系人', input('杜某某'))}
          ${field('紧急联系人电话', input(error ? '' : '166 0000 4323', { cls: error ? 'is-error' : '', ph: '请输入紧急联系人电话', error: error ? '请填写紧急联系人电话' : '' }))}</div>
        <div class="card">${cardHead('03', '个人背景图', tag('neutral', uploading || !error ? '1/1' : '0/1'), '最多 1 张；选择后可按 16:9 移动和缩放画面，建议使用横向照片')}
          <div class="upload-grid">
            ${uploading ? `<div class="upload-thumb"><img src="${IMG.cover}" alt="上传中" /><div class="thumb-state is-uploading">正在上传 62%<span class="progress"><i style="width:62%"></i></span></div></div>` : uploadFailed || error ? `<div class="upload-thumb"><img src="${IMG.rider}" alt="原背景图已保留" /><div class="thumb-state is-failed">上传失败<button class="btn-text" ${toast('正在重新上传，原背景图已保留')}>重试</button></div></div>` : `<div class="upload-thumb"><img src="${IMG.rider}" alt="个人背景图" /><span class="thumb-badge">${tag('neutral', '背景')}</span><button class="thumb-del" ${toast('背景图已删除')} aria-label="删除背景图"></button></div>`}
          </div></div>
        </div>
        ${uploadFailed ? '<p class="field-msg is-error" role="status">上传失败，原背景图已保留。请重试或继续使用原图。</p>' : ''}
        <p class="neutral-note">真实姓名、手机号和紧急联系人只对你和审核管理员可见，不会出现在公开名片中。</p>
        ${error ? '<p class="field-msg is-error">有 2 项需要修改</p>' : ''}
        <div style="margin-top:12px">${uploading ? btn('上传处理中', 'disabled aria-disabled="true"', 'btn is-disabled') : btn('保存资料', 'data-action="save-profile"')}</div>
      </div>`;
    },

    'admin-activity-list': () => {
      const head = `<header class="pageheading"><div class="eyebrow">此里 · 俱乐部活动</div><h1 class="editorial">我的活动。</h1><p>管理唯一俱乐部的全部活动与发布状态</p></header>
        <div class="seg"><button class="${is('rejected') ? '' : 'is-active'}" data-action="choice">全部 <small>4</small></button><button data-action="choice">已下架 <small>1</small></button><button class="${is('rejected') ? 'is-active' : ''}" data-action="choice">已驳回 <small>1</small></button><button data-action="choice">已上线 <small>1</small></button><button data-action="choice">已结束 <small>1</small></button></div>`;
      const footer = `<div class="btn-row" style="margin-top:16px">${btn('报名审批', go('admin-reviews'), 'btn-secondary')}${btn('创建活动草稿', go('admin-activity-edit') + ' data-state="create"')}</div>`;
      if (is('loading')) return `<div class="pg">${head}${skeletons(2)}</div>`;
      if (is('empty'))
        return `<div class="pg">${head}${stateView('0', '还没有活动', '创建第一场骑行活动草稿，发布后骑友即可报名。', btn('创建活动草稿', go('admin-activity-edit') + ' data-state="create"'))}</div>`;
      const rejectedActivity = { title: '夜骑安全训练', date: '10月25日 周日', time: '早上 8 点整', start: '滨江公园', distanceKm: 42, elevationM: 180, adminStatus: '已驳回', registrationMode: 'approval', approved: 0, pending: 0, signups: 0 };
      const regularActivities = [
        ...activities.map((a, index) => ({ ...a, registrationMode: index === 0 ? 'open' : 'approval', signups: a.approved + a.pending })),
        { title: '秋日环湖耐力骑', date: '10月11日 周六', time: '早上 7 点整', start: '奥森南门', distanceKm: 82, elevationM: 680, adminStatus: '已结束', registrationMode: 'open', approved: 16, pending: 0, signups: 17 },
      ];
      const list = is('rejected') ? [rejectedActivity] : [rejectedActivity, ...regularActivities];
      return `<div class="pg">${head}<div class="list-count"><span>活动列表</span><b>共 ${list.length} 场</b></div>
        ${list
          .map((a) => {
            const statusTag = a.adminStatus === '已上线' ? tag('solid', '已上线') : a.adminStatus === '已驳回' ? tag('outline', '已驳回') : a.adminStatus === '已下架' ? tag('outline', '已下架') : tag('muted', '已结束');
            const openRegistration = a.registrationMode === 'open';
            const modeTag = `<span class="mode-pill ${openRegistration ? 'mode-pill-open' : 'mode-pill-approval'} mode-pill-inline">${openRegistration ? '公开报名' : '审批报名'}</span>`;
            const registrationMetrics = openRegistration
              ? `<div class="metrics admin-metrics"><div><strong>${a.signups}</strong><span>报名</span></div><div><strong>${a.approved}</strong><span>已加入</span></div><div><strong>0</strong><span>已签到</span></div></div>`
              : `<div class="metrics admin-metrics"><div><strong>${a.signups}</strong><span>报名</span></div><div class="${a.pending ? 'is-pending' : ''}"><strong>${a.pending}</strong><span>待审核</span></div><div><strong>${a.approved}</strong><span>已通过</span></div></div>`;
            const toggle = btn(a.adminStatus === '已上线' ? '下架' : '上架', toast(a.adminStatus === '已上线' ? '活动已下架' : '活动已上架'), 'btn-secondary btn-sm');
            const manageRegistrations = btn(openRegistration ? '参与成员' : '报名审批', go('admin-reviews') + (openRegistration ? ' data-state="open-mode-members"' : ''), 'btn-secondary btn-sm');
            const actions = a.adminStatus === '已驳回' ? btn('查看驳回原因', toast('路线信息需要补充'), 'btn-secondary btn-sm') : `${btn('编辑', go('admin-activity-edit'), 'btn-secondary btn-sm')}${manageRegistrations}${toggle}`;
            return `<article class="admin-card"><div class="admin-card-head"><span>${statusTag}${modeTag}</span><span class="meta-line">${a.date} · ${a.time}</span></div><h3>${a.title}</h3><p class="meta-line">唯一俱乐部 · ${a.start}集合 · ${a.distanceKm} km · ${a.elevationM} m</p>
              ${registrationMetrics}
              <div class="btn-row">${actions}</div>
              <div class="admin-card-more">${a.adminStatus === '已下架' ? `<button class="btn-text" ${toast('草稿已删除')}>删除（仅草稿）</button>` : ''}${a.adminStatus === '已驳回' ? '' : '<button class="btn-text" data-action="copy-activity">从此活动创建</button>'}</div></article>`;
          })
          .join('')}${footer}</div>`;
    },

    'admin-activity-edit': () => {
      const create = is('create');
      const error = is('error');
      const uploading = is('uploading');
      const resubmit = is('rejected-resubmit');
      const editOpen = is('edit-open');
      const modeLocked = is('mode-locked');
      const gpxMissing = is('gpx-missing');
      const gpxFailed = is('gpx-failed');
      // Strava 路线地址子状态：空 / 输入中 / 解析中 / 无效 / 网络失败
      const linkTyping = is('link-typing');
      const linkParsing = is('link-parsing');
      const linkInvalid = is('link-invalid');
      const linkNetError = is('link-net-error');
      // Strava 账号连接子状态（创建页只提示，不在页内连接）
      const stravaDisconnected = is('strava-disconnected');
      const stravaExpiring = is('strava-expiring');
      const stravaExpired = is('strava-expired');
      // 「+」隐藏增强入口（本地路线文件）
      const boostOpen = is('boost-open') || uploading || gpxMissing || gpxFailed;
      const boostConflict = is('boost-conflict');
      const registrationMode = editOpen ? 'open' : 'approval';
      const filled = !create && !error && !linkTyping && !linkParsing && !linkInvalid && !linkNetError;
      const v = (value) => (filled || uploading ? value : '');
      const stravaConn = stravaExpired
        ? { tone: 'error', label: '已失效', note: '上次 Strava 同步已失效，粘贴链接前请先在设置中重新同步。' }
        : stravaExpiring
          ? { tone: 'warning', label: '即将失效', note: 'Strava 同步即将在 3 天后失效，可提前在设置中续期。' }
          : stravaDisconnected
            ? { tone: 'muted', label: '未连接', note: '尚未同步 Strava 账号，粘贴链接前请先在设置中完成同步。' }
            : { tone: 'success', label: '已连接', note: '连接正常，可直接粘贴线路链接解析。' };
      const linkInputDisabled = stravaExpired || stravaDisconnected;
      const linkValue = linkTyping
        ? 'https://www.strava.com/routes/12345'
        : linkInvalid
          ? 'https://example.com/share/foo'
          : (linkNetError || linkParsing)
            ? 'https://www.strava.com/routes/3271892'
            : filled || uploading
              ? primary.routeUrl
              : '';
      const linkState = linkParsing
        ? '<div class="route-link-state is-parsing" role="status"><span class="dot-spinner" aria-hidden="true"></span><span>正在解析线路信息…</span></div>'
        : linkInvalid
          ? '<div class="route-link-state is-error" role="alert"><b aria-hidden="true">!</b><span>这不是 Strava 线路链接，示例：https://www.strava.com/routes/123456</span></div>'
          : linkNetError
            ? `<div class="route-link-state is-error" role="alert"><b aria-hidden="true">!</b><span>网络异常，暂时无法解析。</span>${btn('重试解析', toast('正在重新解析线路'), 'btn-text route-link-retry')}</div>`
            : '';
      const routePreview = filled
        ? `<div class="route-link-preview">
            <div class="row" style="margin-top:8px"><span class="k">${primary.routeName.replace(' GPX', '')}</span>${tag('solid', '线路已解析')}</div>
            ${metrics([[`${primary.distanceKm} km`, '全程距离'], [`${primary.elevationM} m`, '累计爬升'], [primary.estimatedRideTime, '此里估算骑行']])}
            ${routeSvg('公开路线轮廓')}
          </div>`
        : '';
      // 「+」默认折叠；展开后在底部弹层中呈现本地路线文件（补充方式）
      const plusTrigger = `<button class="route-link-plus${boostOpen ? ' is-open' : ''}" data-action="route" data-route="admin-activity-edit" data-state="${boostOpen ? (create ? 'create' : 'edit') : 'boost-open'}" aria-expanded="${boostOpen ? 'true' : 'false'}" aria-controls="route-boost-sheet" aria-label="更多路线来源">${boostOpen ? '×' : '+'}</button>`;
      const boostInner = gpxFailed
        ? `<div class="gpx-state gpx-state-warning"><div><b>GPX 解析失败</b></div>${tag('warning', '可恢复')}</div>
            <div class="btn-row">${btn('重试解析已上传 GPX', toast('正在重新解析 GPX'), 'btn-secondary btn-sm')}${btn('放弃本次上传', toast('本次上传已放弃'), 'btn-secondary btn-sm')}</div>
            <button class="upload-tile is-wide" ${toast('已打开文件选择')}><b>+</b>重新上传 GPX</button>`
        : gpxMissing
          ? `<div class="gpx-state gpx-state-warning"><div><b>原 GPX 路线详情不可用</b></div>${tag('warning', '详情缺失')}</div>
              <button class="upload-tile is-wide" ${toast('已打开文件选择')}><b>+</b>重新上传 GPX</button>`
          : uploading
            ? `<div class="upload-tile is-wide" style="flex-direction:column;height:auto;padding:12px;gap:8px">正在读取路线… 62%<span class="progress on-light"><i style="width:62%"></i></span></div>
                ${btn('取消本次上传', toast('已取消上传'), 'btn-text')}`
            : boostConflict
              ? `<div class="boost-conflict" role="alert"><b>检测到已有解析结果</b></div>
                  <div class="btn-row">${btn('覆盖并使用文件', toast('已覆盖为本地文件'), 'btn-secondary btn-sm')}${btn('保留 Strava 结果', 'data-action="route" data-route="admin-activity-edit" data-state="edit"', 'btn-secondary btn-sm')}</div>`
              : `<button class="upload-tile is-wide" ${toast('已打开文件选择')}><b>+</b>选择本地路线文件</button>`;
      const boostSheet = boostOpen
        ? `<div class="route-boost-sheet" id="route-boost-sheet" role="dialog" aria-label="本地路线文件（补充方式）">
            <div class="route-boost-head"><b>本地路线文件（补充）</b><button class="route-boost-close" data-action="route" data-route="admin-activity-edit" data-state="${create ? 'create' : 'edit'}" aria-label="关闭">×</button></div>
            ${boostInner}
          </div>`
        : '';
      return `<div class="pg" data-registration-mode="${registrationMode}" data-boost-open="${boostOpen ? 'true' : 'false'}">
        <div class="editor-hero"><div class="editor-title">${create ? '创建活动' : '编辑活动'}</div><p class="editor-summary">填写活动信息，保存草稿后可继续完善。</p></div>
        <div class="card">${cardHead('01', '基本信息')}
          ${field('活动标题', input(error ? '' : v(primary.title), { ph: '请输入活动标题', cls: error ? 'is-error' : '', error: error ? '请填写活动标题' : '' }), tag('pending', '必填'))}
          <p class="sub-title">集合信息</p>
          ${field('集合时间', `<div class="field-2col">${input(v('2026-10-18'), { ph: '选择日期', unit: '›' })}${input(v('06:20'), { ph: '选择时间', unit: '›' })}</div>`, tag('pending', '必填'))}
          <div class="field inline-registration-mode mode-settings-card" role="radiogroup" aria-label="报名模式">
            <div class="field-label-row"><span class="field-label">报名模式</span></div>
            <div class="mode-settings-choice inline-mode-choice">
              <button class="mode-settings-option ${registrationMode === 'open' ? 'is-active' : ''}" data-mode="open" data-mode-option="open" ${modeLocked ? 'disabled aria-disabled="true"' : ''} role="radio" aria-checked="${registrationMode === 'open'}"><b>公开报名</b><small>资料与名额校验通过后直接报名成功</small></button>
              <button class="mode-settings-option ${registrationMode === 'approval' ? 'is-active' : ''}" data-mode="approval" data-mode-option="approval" ${modeLocked ? 'disabled aria-disabled="true"' : ''} role="radio" aria-checked="${registrationMode === 'approval'}"><b>审批报名</b><small>提交后等待管理员审批</small></button>
            </div>
            <p class="card-hint">报名截止自动设为活动开始日当地 00:00，无需单独填写。</p>
          </div>
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
          <div class="route-source-block">
            <div class="route-source-head"><span class="route-source-label">粘贴 Strava 线路链接</span><span class="route-source-conn tone-${stravaConn.tone}"><svg class="strava-mark" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" fill="var(--color-brand-strava)"/></svg><span class="strava-wordmark">Strava</span><span class="route-source-conn-dot" aria-hidden="true"></span>${stravaConn.label}</span></div>
            <div class="route-link-row">
              ${input(linkValue, { ph: 'https://www.strava.com/routes/123456', cls: linkInvalid ? 'is-error' : '' })}
              ${plusTrigger}
            </div>
            ${linkState}
          </div>
          ${routePreview}
          ${boostSheet}
          <p class="sub-title">活动群二维码</p><p class="card-hint">可选上传 1 张微信群二维码，便于已报名成员进群；较久未更新时会提示可能过期，请及时替换。</p>
          ${create || error ? `<button class="upload-tile is-wide" ${toast('已打开图片选择器')}><b>+</b>上传活动群二维码</button>` : `<div class="qr-row" style="margin-top:8px">${qr(3)}<div><p class="card-hint">已上传</p><p class="alert-line">${tag('warning', '二维码可能已过期，请替换为最新图片')}</p><button class="btn-text" ${toast('二维码已删除')}>删除二维码</button></div></div>`}</div>
      </div>${fixedBar('', [btn('保存草稿', toast('草稿已保存'), 'btn-secondary'), btn('发布活动', 'data-action="publish-activity"')])}`;
    },

    'admin-reviews': () => {
      if (is('open-mode-members')) {
        const members = [
          { name: rider.nickname, way: '自行前往', joinedAt: '10月14日 09:12' },
          { name: '小北', way: '需要后援车', joinedAt: '10月14日 08:47' },
          { name: '阿远', way: '自行前往', joinedAt: '10月13日 22:10' },
        ];
        return `<div class="pg admin-reviews-cinema" data-registration-mode="open">${cinemaSlate('报名审核', '13')}<header class="pageheading"><div class="eyebrow">此里 · 审核工作台</div><h1 class="editorial">每一位同行者，<br />都认真确认。</h1></header><section class="info-bar" style="margin-top:0"><div class="info-head"><h2 class="info-title">${primary.title}</h2><span class="info-tag">公开报名</span></div><p class="status-explain">公开报名活动不走审批流程，这里只管理参与成员与签到；活动仍归属唯一俱乐部。</p><div style="margin-top:12px">${btn('切换活动', toast('已打开活动选择'), 'btn-inverse is-ghost')}</div></section><div class="review-filter">${[['全部成员', members.length], ['已签到', 0], ['已取消', 1]].map(([label, n]) => `<button class="${label === '全部成员' ? 'is-active' : ''}" data-action="choice">${label}<small>${n}</small></button>`).join('')}</div><div class="list-count"><span>参与成员</span><b>共 ${members.length} 人</b></div>${members.map((m) => `<article class="review-item open-member-item"><div class="review-item-head"><span class="avatar">${m.name.slice(0, 1)}</span><div class="review-person"><h3>${m.name === rider.nickname ? rider.realName : m.name}</h3><p class="meta-line">加入时间 · ${m.joinedAt}</p></div>${tag('solid', '已加入')}</div><dl class="review-facts"><div><dt>集合方式</dt><dd>${m.way}</dd></div><div><dt>加入方式</dt><dd>公开报名 · 直接生效</dd></div></dl><div class="btn-row"><button class="btn-secondary btn-sm" data-action="toast" data-text="已记为签到">记为签到</button><button class="btn-secondary btn-sm" data-action="toast" data-text="已移出该成员">移出</button></div></article>`).join('')}<div class="card reminder-card">${cardHead('', '活动提醒', '', '仅向当前已加入的骑友发送；重复操作不会重复发送。')}${btn('发送活动提醒', toast(`提醒已发送给 ${members.length} 位骑友`), 'btn-secondary')}</div></div>`;
      }
      const head = `${cinemaSlate('报名审核', '13')}<header class="pageheading"><div class="eyebrow">此里 · 审核工作台</div><h1 class="editorial">每一位同行者，<br />都认真确认。</h1></header><section class="info-bar" style="margin-top:0"><div class="info-head"><h2 class="info-title">${primary.title}</h2><span class="info-tag ${is('empty') ? '' : 'is-pending'}">${is('empty') ? '0' : '2'} 待审核</span></div><p class="status-explain">仅审批报名进入审核；公开报名进入参与成员管理。</p><div style="margin-top:12px">${btn('切换活动', toast('已打开活动选择'), 'btn-inverse is-ghost')}</div></section>
        <div class="review-filter">${[['候补', 0], ['待审核', is('empty') ? 0 : 2], ['已通过', 18], ['已签到', 0], ['已驳回', 1], ['全部', is('empty') ? 19 : 21]].map(([label, n]) => `<button class="${label === '待审核' ? 'is-active' : ''}" data-action="choice">${label}<small>${n}</small></button>`).join('')}</div>`;
      if (is('loading')) return `<div class="pg admin-reviews-cinema" data-registration-mode="approval">${head}${skeletons(2)}</div>`;
      if (is('empty')) return `<div class="pg admin-reviews-cinema" data-registration-mode="approval">${head}${stateView('0', '当前筛选暂无报名', '新的报名提交后会出现在这里。', btn('查看已通过', toast('已切换至已通过'), 'btn-secondary'))}</div>`;
      if (is('error')) return `<div class="pg admin-reviews-cinema" data-registration-mode="approval">${head}${stateView('!', '报名列表加载失败', '网络不稳定，请稍后重试。', btn('重新加载', toast('正在重新加载')), true)}</div>`;
      const people = [
        { name: rider.nickname, img: IMG.avatar, way: '自行前往', exp: '有经验', time: '10月14日 09:12' },
        { name: '小北', img: '', way: '需要后援车', exp: '新手', time: '10月14日 08:47' },
      ];
      return `<div class="pg admin-reviews-cinema" data-registration-mode="approval">${head}<div class="list-count"><span>报名列表</span><b>共 2 人</b></div>
        ${people.map((p) => `<article class="review-item"><div class="review-item-head"><span class="avatar">${p.img ? `<img src="${p.img}" alt="${p.name}" />` : p.name.slice(0, 1)}</span><div class="review-person"><h3>${p.name === rider.nickname ? rider.realName : p.name}</h3><p class="meta-line">骑友 · ${p.name}</p></div>${tag('pending', '待审核')}</div><h4 class="review-activity">${primary.title}</h4><dl class="review-facts"><div><dt>集合方式</dt><dd>${p.way}</dd></div><div><dt>能力自评</dt><dd>${p.exp}</dd></div><div><dt>提交时间</dt><dd>${p.time}</dd></div></dl>${btn('审核报名', 'data-route="admin-review-detail"', 'review-action')}</article>`).join('')}<div class="card reminder-card">${cardHead('', '活动提醒', '', '仅向已通过的骑友发送；重复操作不会重复发送。')}${btn('发送活动提醒', toast('提醒已发送给 18 位骑友'), 'btn-secondary')}</div></div>`;
    },

    'admin-review-detail': () => {
      if (is('loading')) return `<div class="pg">${skeletons(3)}</div>`;
      const checkedIn = is('checked-in');
      const approved = is('approved', 'checked-in');
      const rejectError = is('reject-error');
      const capacityFull = is('capacity-full');
      return `<div class="pg">
        <section class="info-bar" style="margin-top:0"><div class="info-head"><span class="info-kicker">报名编号 REG-1017-018</span><span class="info-tag ${approved ? '' : 'is-pending'}">${checkedIn ? '已签到' : approved ? '已通过' : '待审核'}</span></div><h2 class="info-title">${rider.nickname} · ${primary.title}</h2><p class="status-explain">${checkedIn ? '已完成现场签到，报名记录已更新。' : approved ? '已于 10月14日 10:02 通过，骑友已收到出发凭证。' : capacityFull ? '名额已被其他报名占满，本次未通过；申请仍保持待审核状态。' : '通过后骑友会收到出发凭证；驳回需填写理由，骑友会看到。'}</p></section>
        ${capacityFull ? '<p class="pending-note">名额已满 · 请释放名额或调整容量后重新校验，系统不会误生成凭证。</p>' : ''}
        <div class="card">${cardHead('01', '报名人', tag('neutral', '管理员可见完整信息'))}${rows([['昵称', rider.nickname], ['真实姓名', rider.realName], ['性别', rider.gender], ['手机号', rider.phone], ['验证来源', '微信身份']])}</div>
        <div class="card">${cardHead('02', '报名信息')}${rows([['骑行经验', '有经验'], ['集合方式', '自行前往'], ['队伍', '风向小队'], ['报名备注', '无']])}</div>
        <div class="card">${cardHead('03', '照片', '', '资料仅用于本次活动审核，不包含第三方账号数据。')}<div class="photo-strip"><div><img src="${IMG.rider}" alt="骑行照片" /></div><div><img src="${IMG.avatar}" alt="公开头像" /></div></div></div>
        <div class="card">${cardHead('04', '审核意见', approved ? '' : tag('neutral', '驳回时必填'))}${approved ? input('资料完整，欢迎参加', { cls: 'textarea is-disabled' }) : `<textarea id="registration-reject-reason" class="input textarea ${rejectError ? 'is-error' : ''}" maxlength="200" placeholder="驳回时必填，骑友会看到这段说明"></textarea><div class="field-foot"><span>${rejectError ? '<b>驳回时请填写理由；重复点击不会绕过校验</b>' : '示例：骑行经验说明不足，请补充后重提。'}</span><span>0/200</span></div>`}</div>
      </div>${checkedIn ? fixedBar('现场签到已完成', [btn('已签到', 'disabled', 'btn is-disabled')], true) : approved ? fixedBar('骑友到达集合点后确认签到', [btn('确认签到', 'data-action="request-checkin"')], true) : fixedBar(capacityFull ? '名额已满，申请仍保持待审核' : rejectError ? '请先填写驳回理由' : '', [btn('驳回报名', 'data-action="reject-review"', 'btn-secondary'), btn(capacityFull ? '重新校验名额' : '通过报名', `data-action="approve-review" data-capacity-available="${capacityFull ? 'false' : 'true'}"`)])}`;
    },

    'route-analysis': () => {
      if (is('loading')) {
        return `<div class="pg route-analysis-page">${skeletons(3)}</div>`;
      }
      // no-waypoint：GPX 文件已解析但缺乏可信地名/经纬度，必须给出"仅剖面可用"的最小 DOM。
      if (is('no-waypoint')) {
        return `<div class="pg route-analysis-page ra-fallback ra-no-waypoint">
          <section class="ra-panel ra-fallback-head">
            <span class="ra-fallback-badge" aria-hidden="true">!</span>
            <h2>GPX 无关键点标注</h2>
            <p>这条路线只有轨迹，没有可信的地名或经纬度；无法生成地图标记与坡段分析。</p>
          </section>
          <section class="ra-panel ra-fallback-metrics">
            <h3>仍可查看</h3>
            <div class="ra-fb-metric-row">
              <div><b>168</b><i>km</i><small>总里程</small></div>
              <div><b>2360</b><i>m</i><small>累计爬升</small></div>
              <div><b>1684</b><i>m</i><small>最高海拔</small></div>
            </div>
            <p class="ra-fb-note">组织者补充关键点后，地图与坡段将自动可用。</p>
          </section>
          <section class="ra-panel ra-fallback-profile" aria-label="仅剖面可用">
            <h3>海拔剖面</h3>
            <svg class="ra-chart" data-profile-chart="no-waypoint" viewBox="0 0 343 160" preserveAspectRatio="xMidYMid meet" role="img" aria-label="无关键点路线海拔剖面图">
              <path d="M32 136 L66 128 L100 110 L134 86 L168 102 L202 62 L236 38 L270 76 L304 54 L335 118" fill="none" stroke="#d64520" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
              <text x="32" y="154" font-size="10" fill="#8a7f72">0 km</text><text x="335" y="154" font-size="10" fill="#8a7f72" text-anchor="end">168 km</text>
            </svg>
            <p class="ra-fb-note">缺少可信关键点标注，仍可按剖面曲线自行判断强度。</p>
          </section>
          <section class="ra-panel ra-fallback-cta">
            <h3>你可以</h3>
            <ul class="ra-fb-list">
              <li>复制路线链接发给组织者，请他补充集合点与补给</li>
              <li>按剖面曲线自行判断强度</li>
            </ul>
            <div class="btn-row ra-fb-btns">
              ${btn('复制路线链接', toast('路线链接已复制'), 'btn-secondary')}
              ${btn('返回活动详情', go('activity-detail'))}
            </div>
          </section>
        </div>`;
      }
      // parse-fail：GPX 文件完全无法解析，必须给出"全量降级 + 重试"
      if (is('parse-fail')) {
        return `<div class="pg route-analysis-page ra-fallback ra-parse-fail">
          <section class="ra-panel ra-fallback-head is-error">
            <span class="ra-fallback-badge is-error" aria-hidden="true">!</span>
            <h2>路线解析失败</h2>
            <p>GPX 文件损坏或未上传成功；地图、剖面、坡段均不可用。</p>
          </section>
          <section class="ra-panel ra-fallback-steps">
            <h3>你可以做</h3>
            <ol class="ra-fb-steps">
              <li>检查网络后点击"重试解析"</li>
              <li>联系组织者重新上传 GPX</li>
              <li>先返回活动详情，按描述出发</li>
            </ol>
            <div class="btn-row ra-fb-btns">
              ${btn('重试解析', 'data-action="route" data-route="route-analysis" data-state="loading"', 'btn-secondary')}
              ${btn('返回活动详情', go('activity-detail'))}
            </div>
          </section>
          <section class="ra-panel ra-fallback-meta">
            <h3>当前可见</h3>
            <ul class="ra-fb-list">
              <li>路线名：云蒙山 &amp; 喇叭沟 GPX</li>
              <li>来源：Strava 官方路线</li>
              <li>错误码：GPX_PARSE_ERR_42</li>
            </ul>
          </section>
        </div>`;
      }
      const noProfile = is('no-profile');
      const selectedSegment = is('segment-climb') ? 'climb' : '';
      const selectedPointId = is('segment-climb')
        ? 'rest-1'
        : is('climb')
          ? 'climb'
          : 'start';

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

      // 关键点：仅在存在“已验证真实地名 + 地图点位”时才会入列；经纬度只参与地图计算，不进入普通用户文案。
      // 字段：label(地名) / lat / lng(内部地图坐标) / role(用途) / caution(注意事项，可选)
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

      // ---------- 顶部地图（信息密度版 · 对齐参考页“路线走向·关键地名”模块） ----------
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
      // 内圆半径使用 Math.max 兜底，避免小半径 marker 产生负值触发 "<circle r='-x'>" 警告。
      const renderGlyph = (kind, cx, cy, r, selected) => {
        if (kind === 'start') {
          const rMid = Math.max(0.4, r - 1.6);
          const rCore = Math.max(0.2, r - 3);
          return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#211f1c"/>
            <circle cx="${cx}" cy="${cy}" r="${rMid}" fill="none" stroke="#fdfaf2" stroke-width="0.6"/>
            <circle cx="${cx}" cy="${cy}" r="${rCore}" fill="#fdfaf2"/>`;
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
      // 普通点展示骑行信息；起点卡只展示地名、必要描述与导航快捷按钮，不展示原始坐标。
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
          isStart: p.id === 'start',
          metrics: [],
        };
      })();
      const confidenceColor = { high: '#5f8e59', mid: '#d9a93a', low: '#c1392b' }[detail.confidence] || '#5f8e59';
      const detailBlock = detail.isStart
        ? `<div class="ra-map-detail ra-map-detail-start" role="status">
            <h3>${detail.title}</h3>
            ${detail.caption ? `<p class="ra-detail-caption">${detail.caption}</p>` : ''}
            <button class="btn ra-start-navigation" data-action="navigate-route-start">导航到起点</button>
          </div>`
        : `<div class="ra-map-detail" role="status">
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

            <p class="ra-map-caption">按海拔着色 · 骑行方向顺序 · 点击可查看地名与路线提示</p>

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

            <p class="ra-map-sample">脱敏演示样本 · 地名 / 施工 / 事故为示意结构 · 正式数据以主办方发布与接入服务为准</p>
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

      // ---------- 关键点时间轴（地名/用途/注意，不展示原始坐标）----------
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
          const stateName = s.pointId === 'highest' ? 'default' : s.pointId === 'rest-1' ? 'segment-climb' : s.pointId === 'climb' ? 'climb' : '';
          return `<button class="ra-sp-row" data-route="route-analysis" data-state="${stateName}">
            <span class="ra-sp-km">km ${s.km}</span>
            <span class="ra-sp-body">
              <span class="ra-sp-name">${s.name}</span>
              <span class="ra-sp-type">${s.type}</span>
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
            ? `<p class="ra-climb-highest"><em>最高点</em>${highestPoint.label} · km ${highestPoint.km} · <b>${highestPoint.m} m</b></p>`
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
    /* ================================================================
     * 规划能力 · design-only 4 页（P0×3 + P1×1）
     * 共用 planned-badge 徽标与 planned-head 分区，id 严格对应 schema.js。
     * 不进入 miniprogram；手机 UI 由 Pages SPA 渲染，仅做评审原型。
     * 2026-10-19 单俱乐部收口：原 11 页 planned-club-* 已随多俱乐部语义一同下线。
     * ================================================================ */
    'planned-privacy': () => {
      return `<div class="pg planned-page planned-privacy">
        <header class="pageheading planned-head"><div class="eyebrow">PRIVACY · 最小必要</div><h1 class="editorial">每一项授权，<br>都说清楚。</h1><p>只采集与骑行活动直接相关的信息；每一项授权都可以单独撤销。</p><span class="planned-badge">P0 · DESIGN ONLY</span></header>
        <div class="planned-privacy-summary"><b>04</b><span>项权限说明</span><i>默认关闭 · 按需请求</i></div>
        <div class="card planned-privacy-card">${cardHead('01', '定位', tag('neutral', '仅使用中'), '仅用于显示附近俱乐部与活动集合点距离，不做持续位置追踪。')}${rows([['采集范围', '当前粗略位置'], ['保存期限', '不保存'], ['当前状态', '已授权']])}<button class="btn-text" data-action="toast" data-message="已跳转到微信位置权限设置">查看权限设置 →</button></div>
        <div class="card planned-privacy-card">${cardHead('02', '相册', tag('neutral', '按需'), '仅在你主动上传头像、骑行名片背景、活动封面、GPX 文件时使用。')}${rows([['采集范围', '你主动选择的图片'], ['保存期限', '长期（随账户）'], ['当前状态', '未授权']])}<button class="btn-text" data-action="toast" data-message="已跳转到微信相册权限设置">查看权限设置 →</button></div>
        <div class="card planned-privacy-card">${cardHead('03', '通讯录', tag('neutral', '不启用'), '当前此里暂不读取通讯录。')}${rows([['采集范围', '不采集'], ['保存期限', '不保存'], ['当前状态', '未请求']])}</div>
        <div class="card planned-privacy-card">${cardHead('04', '手机号', tag('pending', '报名时'), '仅在报名活动时用于紧急联络；由微信一键授权，不保存明文。')}${rows([['采集范围', '报名活动时'], ['保存期限', '活动结束后 30 天'], ['当前状态', '按需请求']])}</div>
        <p class="neutral-note">任何时候都可以在"个人中心 → 隐私授权"回到这里，撤销单项授权。</p>
      </div>${fixedBar('同意即视为允许上述范围内的最小必要采集', [btn('仅使用必要项', toast('已选择最小必要项'), 'btn-secondary'), btn('我已阅读并授权', toast('授权完成，欢迎加入此里'))])}`;
    },

    'planned-notifications': () => {
      const segs = [
        ['全部', 7, true],
        ['报名', 3, false],
        ['审批', 2, false],
        ['俱乐部', 1, false],
        ['系统', 1, false],
      ];
      const items = [
        ['报名', '周日云蒙山 RIDE', '你的报名已通过审核，可以查看出发凭证', '3 分钟前', true],
        ['审批', '北京胡同骑行局 加入申请', '张岩提交了加入申请，等待你审批', '12 分钟前', true],
        ['俱乐部', '俱乐部管理员角色生效', '你已被设为"北京胡同骑行局"管理员', '2 小时前', true],
        ['报名', '奉贤海湾拉练', '活动已取消，报名费将原路返回（本次免费）', '昨天 18:40', false],
        ['俱乐部', '俱乐部已创建', '平台管理员已创建"周日纯化骑行"，当前状态 active', '昨天 10:12', false],
        ['系统', '隐私协议更新', '我们更新了隐私授权说明，请抽空查看', '前天', false],
      ];
      return `<div class="pg planned-page planned-notifications">
        <header class="pageheading planned-head"><div class="eyebrow">NOTICES · 只在重要时响起</div><h1 class="editorial">通知中心</h1><p>报名、审批与俱乐部变更，按发生时间归档。</p><span class="planned-badge">P0 · DESIGN ONLY</span></header>
        <div class="seg planned-seg">${segs.map(([t, n, active]) => `<button class="${active ? 'is-active' : ''}" data-action="choice">${t}<i class="planned-seg-count">${n}</i></button>`).join('')}</div>
        <div class="planned-noti-list">
          ${items.map(([kind, title, desc, time, unread]) => `
            <article class="planned-noti-card ${unread ? 'is-unread' : ''}">
              <span class="planned-noti-dot" aria-hidden="true"></span>
              <div class="planned-noti-body">
                <div class="planned-noti-head"><span class="planned-noti-kind">${kind}</span><span class="planned-noti-time">${time}</span></div>
                <h3>${title}</h3>
                <p class="meta-line">${desc}</p>
              </div>
            </article>`).join('')}
        </div>
        <p class="neutral-note">同一事件只提示一次；长按单条可标记为已读。</p>
      </div>${fixedBar('共 3 条未读', [btn('全部标记已读', toast('已全部标记为已读'), 'btn-secondary'), btn('设置通知偏好', go('settings'))])}`;
    },

    'planned-offline-error': () => {
      const server = is('server');
      return `<div class="pg planned-page planned-offline">
        <header class="pageheading planned-head planned-head--compact"><div class="eyebrow">SYSTEM STATE · ${server ? '500' : 'OFFLINE'}</div><h1 class="editorial">先停一下，<br>路线还在。</h1><span class="planned-badge">P0 · DESIGN ONLY</span></header>
        <section class="planned-offline-hero">
          <div class="planned-offline-art" aria-hidden="true">
            <svg viewBox="0 0 320 180" preserveAspectRatio="none">
              <path d="M0 140 L40 118 L80 128 L120 96 L160 112 L200 72 L240 92 L280 60 L320 86" fill="none" stroke="#fbf5ea" stroke-width="1.4" stroke-dasharray="4 4" opacity="0.55"/>
            </svg>
          </div>
          <div class="planned-offline-signal" aria-hidden="true"><i></i><i></i><i></i></div>
          <h2 class="planned-offline-title">${server ? '服务端错误' : '当前网络不可用'}</h2>
          <p class="planned-offline-sub">${server ? '我们已经收到异常上报，请稍后重试。' : '活动数据无法加载，检查 Wi-Fi 或移动网络后再试一次。'}</p>
          <code class="planned-offline-code">${server ? 'HTTP_500 / INTERNAL' : 'NET_UNREACHABLE'}</code>
        </section>
        <div class="btn-row planned-offline-btns">
          ${btn('重试', toast('正在重新加载'))}
          ${btn('返回首页', go('activities'), 'btn-secondary')}
        </div>
        <button class="btn-text planned-offline-diag" data-action="toast" data-message="已复制网络诊断日志，发送给我们">查看网络诊断</button>
        <div class="seg planned-offline-switch" style="margin-top:16px">
          <button class="${!server ? 'is-active' : ''}" data-route="planned-offline-error" data-state="default">离线</button>
          <button class="${server ? 'is-active' : ''}" data-route="planned-offline-error" data-state="server">服务端错误</button>
        </div>
      </div>`;
    },

    'planned-activity-share-poster': () => {
      return `<div class="pg planned-page planned-poster">
        <header class="pageheading planned-head"><div class="eyebrow">SHARE POSTER · 9:16</div><h1 class="editorial">把这一程，<br>留在画面里。</h1><p>基于活动封面与现有数据生成品牌海报。</p><span class="planned-badge">P1 · DESIGN ONLY</span></header>
        <div class="planned-poster-stage">
          <div class="planned-poster-canvas" role="img" aria-label="活动海报预览">
            <div class="planned-poster-cover"><img src="${IMG.cover}" alt="活动封面"/></div>
            <div class="planned-poster-mask"></div>
            <div class="planned-poster-head">
              <span class="planned-poster-brand">CILI RIDE</span>
              <span class="planned-poster-date">10 月 18 日 · 周日</span>
            </div>
            <h3 class="planned-poster-title">云蒙山 &amp; 喇叭沟 RIDE</h3>
            <p class="planned-poster-sub">望京西 → 云蒙山 → 喇叭沟门 · 高阶</p>
            <div class="planned-poster-metric-row">
              <div><b>168</b><i>km</i></div>
              <div><b>2360</b><i>m</i></div>
              <div><b>18/24</b><i>人</i></div>
            </div>
            <div class="planned-poster-qr" aria-hidden="true">${qr(2.4)}</div>
          </div>
        </div>
        <div class="card planned-poster-options">
          ${cardHead('选项', '海报选项')}
          <label class="planned-switch"><span>包含骑行照片</span><input type="checkbox" checked/><i aria-hidden="true"></i></label>
          <label class="planned-switch"><span>包含路线轮廓</span><input type="checkbox" checked/><i aria-hidden="true"></i></label>
          <label class="planned-switch"><span>隐去已报名人数</span><input type="checkbox"/><i aria-hidden="true"></i></label>
        </div>
      </div>${fixedBar('海报仅本次生成不保留', [btn('保存到相册', toast('海报已保存到相册'), 'btn-secondary'), btn('分享到微信', toast('已拉起微信分享面板'))])}`;
    },

  };

  window.pageTemplates = templates;
})();
