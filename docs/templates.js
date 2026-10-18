(() => {
  const {
    activities,
    rider,
    driver,
    attendees,
    releaseNotes,
    orgApproval,
    clubIdentity,
    clubMembership,
    tripClubSnapshots,
    clubCenterPrototype,
  } = window.prototypeData;
  const primary = activities[0];
  const identityData = clubIdentity || {};
  const membershipData = clubMembership || {};
  const snapshotData = tripClubSnapshots || {};
  const PUBLIC_ACTIVITY_LABEL = identityData.publicLabel || '此里公开活动';
  const PUBLIC_ACTIVITY_NOTE =
    identityData.publicNote || '未关联俱乐部，由此里平台直接托管。';
  const ACTIVITY_IDENTITY_NOTE =
    identityData.snapshotNote ||
    '活动列表与详情优先使用当前俱乐部资料；资料不可用时回退发布快照。';
  const HISTORY_IDENTITY_NOTE =
    identityData.historySnapshotNote ||
    '历史行程与凭证保留发布或成行时的活动归属，不随当前成员关系变化。';
  const IMG = {
    cover: './assets/prototype/img-cover.jpg',
    rider: './assets/prototype/img-rider.jpg',
    avatar: './assets/prototype/img-avatar.jpg',
  };

  // 当前页面状态由 app.js 写入 window.prototypeState；未写入时取 schema 中的第一个状态
  const st = () => window.prototypeState || '';
  const is = (...names) => names.includes(st());

  /* ---------- 俱乐部身份：当前资料、历史快照、头像与头像组 ---------- */
  // 当前资料优先；当前资料不可用时回退到活动发布/成行快照。缺少组织数据时始终按公开活动兜底。
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
  const clubAvatar = (club, size = 'md') => {
    const normalized = normalizeClub(club) || {
      name: PUBLIC_ACTIVITY_LABEL,
      monogram: '公开',
      tone: 'public',
    };
    return `<span class="club-avatar club-avatar-${size} club-avatar-${normalized.tone}" role="img" aria-label="${normalized.name}头像"><b>${normalized.monogram.slice(0, 2)}</b></span>`;
  };
  const clubBadgeLine = (club, extra = '', historical = false) => {
    const normalized = normalizeClub(club);
    if (!normalized) return publicActivityLine(PUBLIC_ACTIVITY_LABEL, extra);
    return `<span class="club-identity">${clubAvatar(normalized, 'sm')}<span class="club-identity-name"><b>${normalized.shortName}</b>${extra ? `<small>${extra}</small>` : ''}</span>${historical ? tag('neutral', '历史归属') : ''}</span>`;
  };
  const publicActivityLine = (label = PUBLIC_ACTIVITY_LABEL, extra = '') =>
    `<span class="club-identity is-public"><span class="club-avatar club-avatar-sm club-avatar-public" aria-hidden="true"><b>公开</b></span><span class="club-identity-name"><b>${label || PUBLIC_ACTIVITY_LABEL}</b>${extra ? `<small>${extra}</small>` : ''}</span></span>`;
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
    return { kind: 'public', label: PUBLIC_ACTIVITY_LABEL, historical: false };
  };
  const getTripSnapshot = ({ activityId, credentialId = '' }) =>
    (credentialId && snapshotData.byCredentialId && snapshotData.byCredentialId[credentialId]) ||
    (activityId && snapshotData.byActivityId && snapshotData.byActivityId[activityId]) ||
    null;
  const snapshotHostLine = (snapshot) => {
    if (!snapshot || snapshot.kind !== 'club') {
      return publicActivityLine(
        (snapshot && snapshot.publicLabel) || PUBLIC_ACTIVITY_LABEL,
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
  // 多俱乐部头像组：仅统计有效成员关系，最多 4 个头像，溢出显示 +N。
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
    'club-center': () => {
      // 俱乐部中心：顶部大背景 + 叠压头像；容量区无白卡；活动 / 成员 / 俱乐部资料三页签。
      // Mock 数据来自 schema.js 中的 clubCenterPrototype；真实业务由服务端返回。
      const fallbackData = {
        club: {
          name: '示例俱乐部',
          monogram: '示',
          regionLabel: 'BJ',
          locationLabel: '北京',
          verified: false,
          coverImage: '',
          coverAlt: '俱乐部封面',
        },
        viewer: { roleLabel: '成员', memberCount: 0, capacity: 0 },
        activity: null,
        members: [],
        moreMenuForAdmin: [],
        moreMenuForMember: [],
      };
      const data = clubCenterPrototype || fallbackData;
      const club = data.club || fallbackData.club;
      const viewer = data.viewer || fallbackData.viewer;
      const activity = data.activity;
      const members = Array.isArray(data.members) ? data.members : [];
      // 状态允许用 "<tab>--<overlay>" 结构叠加：切换 tab 时保留 overlay（more-open / bg-fallback）；
      // 重试或关闭菜单只去掉 overlay，不丢失当前 tab。
      const rawState = st();
      const stateSegments = rawState ? rawState.split('--') : [];
      const hasSegment = (name) => stateSegments.includes(name);
      const baseSegment = stateSegments[0] || 'default';
      const loading = hasSegment('loading');
      const errorState = hasSegment('error');
      const bgFallback = hasSegment('bg-fallback');
      const moreOpen = hasSegment('more-open');
      const activitiesEmpty = hasSegment('activities-empty');
      const activeTab = hasSegment('members')
        ? 'members'
        : hasSegment('profile')
          ? 'profile'
          : 'activities';
      const canEditProfile = viewer.roleToken === 'OWNER' || viewer.roleToken === 'ADMIN';
      const moreMenuItems = canEditProfile
        ? data.moreMenuForAdmin || []
        : data.moreMenuForMember || [];
      // more 按钮点击要在当前 activeTab 上叠加 / 去除 "--more-open"
      const moreToggleState = moreOpen
        ? activeTab === 'activities'
          ? 'default'
          : activeTab
        : activeTab === 'activities'
          ? 'more-open'
          : `${activeTab}--more-open`;
      // 关闭 / 重试回到当前 activeTab 的裸状态
      const activeTabBaseState = activeTab === 'activities' ? 'default' : activeTab;
      void baseSegment;

      // 顶部大背景：加载失败时降级为墨黑画布 + 路线线稿
      const bgContent = bgFallback || errorState
        ? `<div class="club-center-cover is-fallback" role="img" aria-label="背景图加载失败，已切换为墨黑占位">
            <svg viewBox="0 0 360 220" preserveAspectRatio="none" aria-hidden="true"><path d="M-10 180 C 60 160, 100 100, 170 112 S 260 190, 380 140" style="fill:none;stroke:var(--color-media-muted);stroke-width:2"/><path d="M-10 200 C 70 180, 110 136, 170 144 S 260 200, 380 170" style="fill:none;stroke:var(--color-media-muted);stroke-width:1.5"/><path d="M20 168 C 80 152, 104 110, 150 118" style="fill:none;stroke:var(--color-brand);stroke-width:3;stroke-linecap:round"/></svg>
            <span class="club-center-cover-brand">CILI CLUB</span>
            <button class="club-center-cover-retry" data-action="club-center-retry-cover" data-restore-state="${activeTabBaseState}" type="button" aria-label="重新加载背景图">重新加载</button>
          </div>`
        : `<div class="club-center-cover" role="img" aria-label="${club.coverAlt || club.name + '封面'}">
            <img src="${club.coverImage}" alt="${club.coverAlt || club.name + '封面'}" data-club-center-cover onerror="window.clubCenterOnCoverError && window.clubCenterOnCoverError(event)" />
            <span class="club-center-cover-chip" aria-hidden="true">CLUB</span>
            <span class="club-center-cover-loc"><i aria-hidden="true"></i>${club.locationLabel}</span>
          </div>`;

      const header = `
        <header class="club-center-hero">
          ${bgContent}
          <div class="club-center-topbar">
            <button class="club-center-icon-btn" data-action="back" aria-label="返回上一页">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
            <div class="club-center-topbar-actions">
              <button class="club-center-icon-btn" data-action="toast" data-message="分享菜单仅为原型示意" aria-label="分享俱乐部">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a3 3 0 1 0-2.83-4H15a3 3 0 0 0-.17 1l-6 3.5a3 3 0 1 0 0 7l6 3.5a3 3 0 1 0 .17-1l-6-3.5a3 3 0 0 0 0-2l6-3.5a3 3 0 0 0 3 0z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </button>
              <button class="club-center-icon-btn" data-action="route" data-route="club-center" data-state="${moreToggleState}" aria-haspopup="menu" aria-expanded="${moreOpen ? 'true' : 'false'}" aria-controls="club-center-more-menu" aria-label="更多操作">
                <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="18" cy="12" r="1.6" fill="currentColor"/></svg>
              </button>
            </div>
          </div>
          <div class="club-center-identity">
            <span class="club-center-avatar club-avatar-ink" aria-hidden="true">
              <b>${club.monogram}</b>
              <span class="club-center-avatar-region">${club.regionLabel}</span>
            </span>
            <div class="club-center-identity-text">
              <h2 class="club-center-name">
                <span>${club.name}</span>
                ${club.verified ? `<span class="club-center-verified" aria-label="已认证俱乐部" role="img"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 14.4 4.6 18 4.2 18.6 7.8 22 9.2 20.6 12 22 14.8 18.6 16.2 18 19.8 14.4 19.4 12 22 9.6 19.4 6 19.8 5.4 16.2 2 14.8 3.4 12 2 9.2 5.4 7.8 6 4.2 9.6 4.6Z" fill="var(--color-brand)"/><path d="M8.5 12.5 11 15 15.5 10" fill="none" stroke="var(--color-on-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>` : ''}
              </h2>
              <p class="club-center-location"><svg viewBox="0 0 16 16" aria-hidden="true" class="club-center-pin"><path d="M8 2a4 4 0 0 1 4 4c0 3-4 8-4 8s-4-5-4-8a4 4 0 0 1 4-4z" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="8" cy="6" r="1.3" fill="currentColor"/></svg>${club.locationLabel}</p>
            </div>
          </div>
          <div class="club-center-capacity" role="group" aria-label="俱乐部容量总览">
            <div class="club-center-capacity-cell is-role">
              <span class="club-center-capacity-icon" aria-hidden="true"><svg viewBox="0 0 20 20"><path d="M10 2l2.4 5 5.6.5-4.3 3.8 1.4 5.6L10 14l-5.1 2.9 1.4-5.6L2 7.5 7.6 7Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg></span>
              <span class="club-center-capacity-text"><small>身份</small><b>${viewer.roleLabel}</b></span>
            </div>
            <div class="club-center-capacity-cell">
              <span class="club-center-capacity-text"><small>用户数</small><b><em>${viewer.memberCount}</em>人</b></span>
            </div>
            <div class="club-center-capacity-cell is-end">
              <span class="club-center-capacity-text"><small>容量</small><b><em>${viewer.capacity}</em>人</b></span>
            </div>
          </div>
        </header>`;

      const activityPanel = loading
        ? `<div class="club-center-skeleton" aria-live="polite">${skeletons(2, true)}</div>`
        : errorState
          ? stateView('!', '活动加载失败', '网络不稳定，请稍后重试；可切换到成员或俱乐部资料页签。', btn('重新加载', 'data-action="route" data-route="club-center" data-state="default"'), true)
          : activitiesEmpty || !activity
            ? stateView('0', '暂无即将开始的活动', '当前俱乐部还没有发布活动。完成首次骑行后将在此沉淀。', btn('查看历史活动', toast('已切换至历史活动（原型示意）'), 'btn-secondary'))
            : `
              <article class="club-center-activity" aria-labelledby="club-center-activity-title">
                <div class="club-center-activity-date" aria-hidden="true">
                  <span class="club-center-activity-month">${activity.month}</span>
                  <strong class="club-center-activity-day">${activity.day}</strong>
                  <span class="club-center-activity-weekday">${activity.weekday} · ${activity.time}</span>
                </div>
                <div class="club-center-activity-body">
                  <div class="club-center-activity-tags">
                    ${tag('success', '○ ' + activity.status)}
                    <span class="club-center-activity-intensity">${activity.difficulty}</span>
                  </div>
                  <h3 class="club-center-activity-title" id="club-center-activity-title">${activity.title}</h3>
                  <p class="club-center-activity-meta"><svg viewBox="0 0 16 16" class="club-center-pin" aria-hidden="true"><path d="M8 2a4 4 0 0 1 4 4c0 3-4 8-4 8s-4-5-4-8a4 4 0 0 1 4-4z" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>${activity.meetPoint}</p>
                  <div class="club-center-activity-metrics">
                    <span><b>${activity.distanceKm}</b><i>km</i></span>
                    <span class="club-center-activity-sep" aria-hidden="true"></span>
                    <span><b>${activity.elevationM.toLocaleString('en-US')}</b><i>m↑</i></span>
                    <span class="club-center-activity-sep" aria-hidden="true"></span>
                    <span><svg viewBox="0 0 16 16" class="club-center-person" aria-hidden="true"><circle cx="8" cy="5" r="2.4" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M3 13c0-2.4 2.2-4 5-4s5 1.6 5 4" fill="none" stroke="currentColor" stroke-width="1.4"/></svg><b>${activity.signupCount}</b> 人</span>
                  </div>
                </div>
                <div class="club-center-activity-footer">
                  <span class="club-center-activity-note"><span class="club-center-activity-badge" aria-hidden="true">辛</span>${activity.note}</span>
                  <button class="btn club-center-signup" data-action="toast" data-message="报名已提交，等待负责人确认（原型示意）">立即报名 →</button>
                </div>
              </article>
              <button class="club-center-history" type="button" data-action="toast" data-message="历史活动将在真实上线后呈现（原型示意）" aria-label="查看历史活动">
                <span class="club-center-history-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 7v5l3.2 2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></span>
                <span class="club-center-history-text"><b>暂无历史活动</b><small>完成首次骑行后将在此沉淀</small></span>
                <span class="chev" aria-hidden="true">›</span>
              </button>`;

      const membersPanel = `
        <section class="club-center-members" aria-label="俱乐部成员">
          <header class="club-center-members-head">
            <div><h3>成员</h3><span class="club-center-members-count">${members.length} 位</span></div>
            <button class="club-center-members-all" type="button" data-action="route" data-route="club-center" data-state="members" aria-label="查看全部成员">
              查看全部 ${members.length} 位 <span class="chev" aria-hidden="true">›</span>
            </button>
          </header>
          <div class="club-center-members-body">
            <span class="club-center-members-avatars" aria-hidden="true">${members
              .slice(0, 4)
              .map((m) => `<span class="club-avatar club-avatar-sm club-avatar-${m.tone || 'ink'}"><b>${m.monogram}</b></span>`)
              .join('')}</span>
            <p class="club-center-members-hint"><b>当前 ${members.length} 位成员</b><small>点击"查看全部"查看成员信息</small></p>
            <button class="btn-secondary club-center-members-view" type="button" data-action="route" data-route="club-center" data-state="members">
              <svg viewBox="0 0 16 16" aria-hidden="true" class="club-center-person"><circle cx="8" cy="5" r="2.4" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M3 13c0-2.4 2.2-4 5-4s5 1.6 5 4" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>
              成员
            </button>
          </div>
        </section>`;

      const membersListPanel = `
        <section class="club-center-members-list" aria-label="全部成员">
          <h3 class="section-label">全部成员 · ${members.length} 位</h3>
          <ul class="club-center-members-ul">
            ${members
              .map(
                (m) => `<li class="club-center-member-row">
                  <span class="club-avatar club-avatar-md club-avatar-${m.tone || 'ink'}"><b>${m.monogram}</b></span>
                  <div class="club-center-member-info"><b>${m.nickname}</b><small>${m.roleLabel}</small></div>
                  <span class="tag tag-neutral">仅查看</span>
                </li>`,
              )
              .join('')}
          </ul>
          <p class="neutral-note">本页仅提供成员查看入口，不包含邀请、剔除等运营动作；相关能力由管理页承载。</p>
        </section>`;

      const profilePanel = `
        <section class="club-center-profile" aria-label="俱乐部资料">
          <h3 class="section-label">俱乐部资料</h3>
          ${rows([
            ['俱乐部名称', club.name],
            ['所在城市', club.locationLabel],
            ['认证状态', club.verified ? '已认证' : '未认证'],
            ['当前成员', `${viewer.memberCount} 人`],
            ['容量上限', `${viewer.capacity} 人`],
            ['我的身份', viewer.roleLabel],
          ])}
          ${canEditProfile
            ? `<p class="neutral-note">负责人可在右上角「更多」菜单中编辑俱乐部资料；本页只做查看。</p>`
            : `<p class="neutral-note">普通成员仅可查看俱乐部资料，无编辑入口。</p>`}
        </section>`;

      const activePanel =
        activeTab === 'members'
          ? members.length === 0
            ? stateView('0', '暂无成员', '当前俱乐部还没有成员加入；成员列表将在此展示。')
            : membersListPanel
          : activeTab === 'profile'
            ? profilePanel
            : activityPanel;

      const panelHiddenAttr = (name) => (activeTab === name ? '' : 'hidden');

      const tabs = `
        <div class="club-center-tabs" role="tablist" aria-label="俱乐部内容切换" data-active-tab="${activeTab}" data-club-center-tabs>
          <button class="club-center-tab ${activeTab === 'activities' ? 'is-active' : ''}" role="tab" aria-selected="${activeTab === 'activities'}" aria-controls="club-center-panel-activities" id="club-center-tab-activities" tabindex="${activeTab === 'activities' ? 0 : -1}" data-action="route" data-route="club-center" data-state="default" data-tab="activities" data-club-center-tab>
            活动${activity && !activitiesEmpty && !loading && !errorState ? '<small class="club-center-tab-badge" aria-label="当前有一场活动">·1</small>' : ''}
          </button>
          <button class="club-center-tab ${activeTab === 'members' ? 'is-active' : ''}" role="tab" aria-selected="${activeTab === 'members'}" aria-controls="club-center-panel-members" id="club-center-tab-members" tabindex="${activeTab === 'members' ? 0 : -1}" data-action="route" data-route="club-center" data-state="members" data-tab="members" data-club-center-tab>
            成员 <small>${members.length}</small>
          </button>
          <button class="club-center-tab ${activeTab === 'profile' ? 'is-active' : ''}" role="tab" aria-selected="${activeTab === 'profile'}" aria-controls="club-center-panel-profile" id="club-center-tab-profile" tabindex="${activeTab === 'profile' ? 0 : -1}" data-action="route" data-route="club-center" data-state="profile" data-tab="profile" data-club-center-tab>
            俱乐部资料
          </button>
          <span class="club-center-tabs-tail" aria-hidden="true">
            <svg viewBox="0 0 20 20"><circle cx="9" cy="9" r="5.4" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M13.4 13.4L17 17" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
          </span>
        </div>`;

      const moreMenu = moreOpen
        ? `<div class="club-center-more-menu" id="club-center-more-menu" role="menu" aria-label="俱乐部更多操作">
            ${moreMenuItems
              .map((item) => {
                const action = item.key === 'edit-profile'
                  ? 'data-action="toast" data-message="已进入俱乐部资料编辑（原型示意）"'
                  : item.key === 'manage-capacity'
                    ? 'data-action="toast" data-message="容量上限编辑（原型示意）"'
                    : 'data-action="toast" data-message="已记录反馈（原型示意）"';
                return `<button type="button" class="club-center-more-item" role="menuitem" ${action}>
                  <b>${item.label}</b><small>${item.hint}</small>
                </button>`;
              })
              .join('')}
            <button type="button" class="club-center-more-close" role="menuitem" data-action="route" data-route="club-center" data-state="${activeTabBaseState}">关闭菜单</button>
          </div>`
        : '';

      return `<div class="pg club-center-page" data-club-center>
        <p class="prototype-mock-badge" aria-label="原型 Mock 数据标识">设计原型 · Mock 数据</p>
        ${header}
        ${tabs}
        <section id="club-center-panel-activities" role="tabpanel" aria-labelledby="club-center-tab-activities" class="club-center-panel" ${panelHiddenAttr('activities')}>${activeTab === 'activities' ? activePanel : ''}</section>
        <section id="club-center-panel-members" role="tabpanel" aria-labelledby="club-center-tab-members" class="club-center-panel" ${panelHiddenAttr('members')}>${activeTab === 'members' ? activePanel : ''}</section>
        <section id="club-center-panel-profile" role="tabpanel" aria-labelledby="club-center-tab-profile" class="club-center-panel" ${panelHiddenAttr('profile')}>${activeTab === 'profile' ? activePanel : ''}</section>
        ${activeTab === 'activities' && !loading && !errorState && activity ? membersPanel : ''}
        ${moreMenu}
      </div>`;
    },
    'admin-club-applications': () => templates['admin-approval-inbox'](),
    'admin-club-application-detail': () => templates['approval-detail'](),
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
          .map((a, i) => {
            const host = activityHost(a);
            const hostLine =
              host.kind === 'club'
                ? clubBadgeLine(
                    host.club,
                    host.historical ? '发布时快照' : '俱乐部活动',
                    host.historical,
                  )
                : publicActivityLine(host.label, '平台公开');
            return `<article class="activity-card">
            <div class="cover">${i ? emptyMedia().replace('rider-card-media is-empty', 'cover-empty') : `<img src="${IMG.cover}" alt="${a.title}" />`}${i ? tag('pending', '我已报名 · 待审核') : tag('solid', '报名中')}</div>
            <div class="activity-card-body"><p class="meta-line">${a.date} · ${a.time}</p><h3>${a.title}</h3><p class="meta-line activity-host-line">${hostLine}</p><p class="meta-line">${a.start}集合 · ${a.level}</p>${i ? '' : `<p class="alert-line">${tag('warning', '⚠ 名额紧张')}</p>`}
            ${metrics([[`${a.distanceKm} km`, '里程'], [`${a.elevationM} m`, '爬升'], [`${a.approved}/${a.capacity}`, '名额']], 'three')}
            <div class="btn-row">${btn('查看详情', go('activity-detail'), 'btn-secondary')}${i ? btn('查看行程', go('registrations')) : btn('报名活动', 'data-route="registration-form"')}</div></div>
          </article>`;
          })
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
      const detailHost = activityHost(primary);
      const hostCard =
        detailHost.kind === 'club'
          ? `<article class="card host-card host-card-club">
            ${cardHead('', '主办方', tag('neutral', detailHost.historical ? '历史归属' : '俱乐部活动'))}
            <div class="host-card-body">${clubAvatar(detailHost.club, 'md')}<div class="host-card-text"><b>${detailHost.club.name}</b><p class="meta-line">${detailHost.historical ? '发布时俱乐部快照' : `所属俱乐部 · 发起人 ${primary.hostClub.organizer || '活动发起人'}`}</p></div></div>
            <p class="card-hint">${ACTIVITY_IDENTITY_NOTE}</p>
          </article>`
          : `<article class="card host-card host-card-public">
            ${cardHead('', '主办方', tag('neutral', '公开活动'))}
            <div class="host-card-body"><span class="club-avatar club-avatar-md club-avatar-public" aria-hidden="true"><b>公开</b></span><div class="host-card-text"><b>${PUBLIC_ACTIVITY_LABEL}</b><p class="meta-line">${primary.organizer || '平台公开发起 · 由此里平台托管'}</p></div></div>
            <p class="card-hint">${PUBLIC_ACTIVITY_NOTE}</p>
          </article>`;
      return `<div class="pg has-bar">
        <div class="cover"><img src="${IMG.cover}" alt="${primary.title}" /><span class="cover-count">1/3</span><div class="cover-dots"><i class="is-active"></i><i></i><i></i></div></div>
        <section class="info-bar"><div class="info-head"><span class="info-kicker">${primary.date} · ${primary.level}</span><span class="info-tag">${approved ? '已通过' : full ? '名额已满' : '报名中'}</span></div><h2 class="info-title">${primary.title}</h2><p class="info-meta"><span>${primary.time}集合</span><span>${primary.start}</span></p></section>
        ${hostCard}
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
      const readyTrip = getTripSnapshot({ activityId: 'trip-pudong-sunset' }) || {
        title: '浦东滨江夜骑 · 鎏金落日线',
        date: '10月18日 周日',
        time: '17:30',
        start: '浦东滨江 12 号望江台',
        kind: 'public',
      };
      const cancelledTrip = getTripSnapshot({ activityId: 'trip-fengxian-cancelled' }) || {
        title: '奉贤海湾拉练',
        date: '10月11日 周日',
        time: '07:00',
        start: '奉贤海湾旅游区集合点',
        kind: 'public',
      };
      const tripHostLine = snapshotHostLine(readyTrip);
      const cancelledHostLine = snapshotHostLine(cancelledTrip);
      return `<div class="pg registrations-prototype">${head}
        <div class="trip-summary">${metric('0', '审核中')}${metric('1', '可出发', 'is-ready')}${metric(cancelledDeleted ? '0' : '1', '已失效')}</div>
        <article class="trip-ticket"><div class="trip-ticket-top"><b class="ticket-label">骑行票据</b><span class="ticket-date">${readyTrip.date}</span>${tag('success', '✓ 已通过')}</div><div class="trip-ticket-body"><h3>${readyTrip.title}</h3><p class="meta-line trip-host-line">${tripHostLine}</p><div class="trip-ticket-info"><div><small>集合时间</small><b>${readyTrip.time}</b></div><div><small>集合地点</small><b>${readyTrip.start}</b></div></div><div class="ticket-meta"><span>集合方式</span><b>自行前往</b></div><p class="status-guidance"><i></i>凭证已就绪，出发当天向组织者出示</p>${btn('查看凭证', go('credential'), 'btn trip-ticket-primary')}</div></article>
        ${cancelledDeleted ? '' : `<article class="trip-ticket trip-ticket-cancelled"><div class="trip-ticket-top"><b class="ticket-label">骑行票据</b><span class="ticket-date">${cancelledTrip.date}</span>${tag('muted', '已取消')}</div><div class="trip-ticket-body"><h3>${cancelledTrip.title}</h3><p class="meta-line trip-host-line">${cancelledHostLine}</p><div class="trip-ticket-info"><div><small>集合时间</small><b>${cancelledTrip.time}</b></div><div><small>集合地点</small><b>${cancelledTrip.start}</b></div></div><p class="status-guidance"><i></i>可左滑或点击删除记录</p><div class="trip-ticket-actions"><button class="btn trip-ticket-delete" data-action="delete-trip">删除记录</button><button class="btn-secondary" data-action="cancelled-trip-detail">查看详情</button></div></div></article>`}
      </div>`;
    },

    credential: () => {
      const hasPhoto = !is('no-photo');
      const credential = getTripSnapshot({
        activityId: 'trip-pudong-sunset',
        credentialId: 'credential-1017-012',
      }) || {
        title: '浦东滨江夜骑 · 鎏金落日线',
        date: '10月18日 周日',
        time: '17:30',
        start: '浦东滨江 12 号望江台',
        address: '集合点地址以活动通知为准',
        kind: 'public',
      };
      const credHostLine = snapshotHostLine(credential);
      const credentialClub = normalizeClub(credential.kind === 'club' ? credential : null);
      return `<div class="pg">
        <p class="section-label credential-rider-heading">公开骑行名片</p>
        ${riderCard(hasPhoto, hasPhoto ? '' : `<p class="neutral-note" style="margin:0 16px 12px">添加一张骑行照片，名片会更有辨识度。</p><div style="padding:0 16px 16px">${btn('添加骑行照片', go('profile-edit'), 'btn-secondary')}</div>`)}
        <article class="credential-ticket">
          <div class="ticket-head">${brandLogo('报名凭证')}<code>CILI-1017-012</code></div>
          <div class="ticket-body">${tag('success', '✓ 已通过 · 准时集合')}<h2 class="card-title" style="margin-top:8px">${credential.title}</h2><p class="meta-line">${credential.date}</p><p class="meta-line credential-host-line">${credHostLine}</p></div>
          <div class="credential-spotlight"><p class="info-kicker">集合时间</p><p class="info-big">${credential.time}</p><p class="info-kicker" style="margin-top:8px">集合地点</p><p class="info-title" style="margin-top:0">${credential.start}</p><p class="info-meta">${credential.address || '集合点地址以活动通知为准'}</p><div style="margin-top:12px">${btn('地图导航', toast('已打开集合点导航'), 'btn-inverse')}</div></div>
          <div class="ticket-body">${rows([
            ['骑手', rider.realName],
            ['性别', rider.gender],
            ['活动归属', credentialClub ? `${credentialClub.name}（俱乐部活动）` : PUBLIC_ACTIVITY_LABEL],
            ['集合方式', '自行前往'],
          ])}<p class="card-hint credential-snapshot-hint">${HISTORY_IDENTITY_NOTE}</p></div>
        </article>
        <div class="card">${cardHead('', '队伍：风向小队')}<p class="card-hint">我是队长，可使用右上角分享邀请队员。队伍仅用于本次活动分组，与俱乐部身份独立。</p></div>
        <div style="margin-top:12px">${btn('查看路线分析', go('route-analysis'), 'btn-secondary')}</div>
        <div style="margin-top:12px">${btn('取消报名', toast('已取消报名'), 'btn-secondary')}</div>
      </div>`;
    },

    profile: () => {
      const notice = '<p class="neutral-note">联系电话仅用于活动联络；紧急联系人仅在骑行安全需要时使用。</p>';
      if (is('guest'))
        return `<div class="pg">${brandLogo('此里')}<h2 class="page-title">一起骑，去更远的地方</h2>${stateView('此', '微信未登录', '使用微信身份登录，报名资料仅用于活动联络与安全保障。', btn('重新登录', toast('微信授权中')))}${notice}</div>`;
      const admin = is('', 'admin');
      // 俱乐部呈现：默认 single-club；no-club 显示空态；multi-club 显示头像组
      let clubBlock = '';
      if (is('no-club')) {
        const noKey = membershipData['no-club'] || {
          summary: '暂未加入俱乐部',
          hint: '仍可参与此里公开活动。',
        };
        clubBlock = `<section class="profile-club-card is-empty">
          <div class="profile-club-head"><b class="section-label">我的俱乐部</b><span class="meta-line">${noKey.summary}</span></div>
          <p class="card-hint profile-club-empty">${noKey.hint}</p>
          ${btn('发现附近俱乐部', toast('已展开附近俱乐部'), 'btn-secondary')}
        </section>`;
      } else if (is('multi-club')) {
        const multi = membershipData['multi-club'] || { memberships: [], hint: '' };
        const activeIds = activeMembershipIds(multi);
        clubBlock = `<section class="profile-club-card is-multi">
          <div class="profile-club-head"><b class="section-label">我的俱乐部</b><span class="meta-line">已加入 ${activeIds.length} 个俱乐部</span></div>
          <div class="profile-club-multi">${clubAvatarStack(activeIds)}<p class="card-hint profile-club-hint">${multi.hint}</p></div>
          ${btn('查看全部俱乐部', toast('已打开我的俱乐部列表'), 'btn-secondary')}
        </section>`;
      } else {
        const singleKey = is('member')
          ? membershipData.member
          : membershipData['single-club'] || membershipData.admin;
        const singleIds = activeMembershipIds(singleKey);
        const singleClub = singleIds[0] ? clubById.get(singleIds[0]) : null;
        clubBlock = singleClub
          ? `<section class="profile-club-card is-single">
              <div class="profile-club-head"><b class="section-label">我的俱乐部</b><span class="meta-line">${singleKey.summary}</span></div>
              <div class="profile-club-single">${clubAvatar(singleClub, 'md')}<div class="profile-club-text"><b>${singleClub.name}</b><p class="meta-line">本人角色 · ${singleKey.myRoleLabel}</p></div></div>
              <p class="card-hint">${singleKey.hint}</p>
            </section>`
          : '';
      }
      return `<div class="pg">${brandLogo('此里 · 一起骑，去更远的地方')}
        <section class="profile-hero-card"><img src="${IMG.rider}" alt="骑行背景照片" /><div class="profile-hero-shade"></div><div class="profile-hero-identity"><span class="avatar lg ring"><img src="${IMG.avatar}" alt="${rider.nickname}" /></span><div><h2>${rider.nickname}</h2><p>${rider.title}</p><p class="auth-line">微信已登录</p></div></div></section>
        ${clubBlock}
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
        <div class="card">${cardHead('04', '审核意见', approved ? '' : tag('neutral', '驳回时必填'))}${approved ? input('资料完整，欢迎参加', { cls: 'textarea is-disabled' }) : `<textarea id="registration-reject-reason" class="input textarea ${rejectError ? 'is-error' : ''}" maxlength="200" placeholder="驳回时必填，骑友会看到这段说明"></textarea><div class="field-foot"><span>${rejectError ? '<b>驳回时请填写理由；重复点击不会绕过校验</b>' : '示例：骑行经验说明不足，请补充后重提。'}</span><span>0/200</span></div>`}</div>
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
    /* ================================================================
     * 组织地基与审批（M0 待实施）：8 页原型
     * 产品假设：非成员不能投稿；一个有效 OWNER/ADMIN 通过即可；审批不自动超时；
     *          平台所有者本人公开活动显式确认；俱乐部停用时未来活动冻结待处置。
     * 所有权限以服务端判权为准，本原型只表达 UI 层的角色—目标—路由联动。
     * ================================================================ */

    'org-overview': () => {
      const identity = is('admin') ? 'admin' : is('owner') ? 'owner' : is('platform') ? 'platform' : 'member';
      const row = orgApproval.identities.find(([id]) => id === identity) || orgApproval.identities[0];
      const [, idName, idDesc] = row;
      const identityOrder = ['member', 'admin', 'owner', 'platform'];
      // 对每个发布目标：按身份返回 { route, badge, cta, note }
      const routes = {
        'club-application': {
          member: { badge: tag('pending', '提交审核'), cta: '提交后进入平台所有者待办', note: '通过前不创建正式俱乐部；驳回必有原因，可修改重提。' },
          admin: { badge: tag('pending', '提交审核'), cta: '按普通成员走审批', note: '俱乐部管理员身份不授予审批俱乐部申请的权限。' },
          owner: { badge: tag('pending', '提交审核'), cta: '按普通成员走审批', note: '俱乐部所有者不能跨俱乐部直建。' },
          platform: { badge: tag('solid', '显式确认创建'), cta: '需要显式“确认创建”动作并留审计', note: '即使是平台所有者，也不走接口静默直建。' },
        },
        'club-activity': {
          member: { badge: tag('pending', '提交俱乐部审核'), cta: '任一有效 OWNER / ADMIN 通过即发布', note: '非成员不能发起；审批不设自动超时。' },
          admin: { badge: tag('success', '✓ 发布后立即上线'), cta: '以俱乐部管理员身份直接发布', note: '服务端写入 role_auto_publish 审计；关键修改原子切换版本。' },
          owner: { badge: tag('success', '✓ 发布后立即上线'), cta: '以俱乐部所有者身份直接发布', note: '仅限所属俱乐部；改为公开或俱乐部停用时需重新审批。' },
          platform: { badge: tag('neutral', '监管权限'), cta: '仅在俱乐部无可用审批人时兜底介入', note: '平台所有者不介入正常俱乐部审批。' },
        },
        'public-activity': {
          member: { badge: tag('pending', '提交平台审核'), cta: '通过前不进入公开活动池', note: '驳回必有原因；版本过期需重新提交。' },
          admin: { badge: tag('pending', '提交平台审核'), cta: '俱乐部管理员身份不扩展到公开活动', note: '只在所属俱乐部内有默认发布权。' },
          owner: { badge: tag('pending', '提交平台审核'), cta: '俱乐部所有者身份不扩展到公开活动', note: '只在所属俱乐部内有默认发布权。' },
          platform: { badge: tag('solid', '显式确认后发布'), cta: '不生成自审待办', note: '必须留下与人工审批等价的审计记录。' },
        },
      };
      const route = (key, title, iconLabel, desc) => {
        const r = routes[key][identity];
        return `<div class="card org-route-card">
          ${cardHead('', title, r.badge, desc)}
          <div class="org-route-body">
            <div class="org-route-flow">
              <span class="org-flow-step"><b>发起</b><small>${iconLabel}</small></span>
              <span class="org-flow-arrow" aria-hidden="true">→</span>
              <span class="org-flow-step"><b>${key === 'club-activity' && (identity === 'admin' || identity === 'owner') ? '服务端判权' : key === 'club-application' && identity === 'platform' ? '显式确认' : '待办入列'}</b><small>${key === 'club-activity' && (identity === 'admin' || identity === 'owner') ? 'role_auto_publish' : key === 'club-application' ? (identity === 'platform' ? '留审计' : '平台所有者') : key === 'public-activity' ? (identity === 'platform' ? '留审计' : '平台所有者') : '俱乐部管理员'}</small></span>
              <span class="org-flow-arrow" aria-hidden="true">→</span>
              <span class="org-flow-step"><b>${key === 'club-activity' && (identity === 'admin' || identity === 'owner') ? '已发布' : key === 'club-application' && identity === 'platform' ? '已创建' : '通过前隐藏'}</b><small>${key === 'club-activity' && (identity === 'admin' || identity === 'owner') ? '写入审计' : '按可见性展示'}</small></span>
            </div>
            <p class="card-hint"><b>${r.cta}</b> · ${r.note}</p>
          </div>
        </div>`;
      };
      return `<div class="pg">
        <section class="info-bar" style="margin-top:0"><div class="info-head"><span class="info-kicker">当前身份</span><span class="info-tag">${idName}</span></div><h2 class="info-title">角色 → 发布目标 → 审批路由</h2><p class="info-meta"><span>${idDesc}</span></p></section>
        <p class="section-label">切换身份视角（仅前端表达）</p>
        <div class="seg">${identityOrder.map((key) => `<button class="${key === identity ? 'is-active' : ''}" data-action="route" data-route="org-overview" data-state="${key}">${(orgApproval.identities.find(([id]) => id === key) || [])[1]}</button>`).join('')}</div>
        ${route('club-application', '俱乐部创建申请', '任意已登录用户', '所有申请统一进入平台所有者审批；平台所有者本人也要显式确认。')}
        ${route('club-activity', '俱乐部活动', '俱乐部有效成员', '普通成员走所属俱乐部审批；管理员本人在所属俱乐部默认发布。')}
        ${route('public-activity', '公开活动', '任意已登录用户', 'club_id 为空；由平台所有者审批后进入公开活动池。')}
        <div class="card org-principle">
          ${cardHead('', '小圈子阶段推荐默认规则')}
          <ul class="org-rules">
            ${orgApproval.productAssumptions.map((item) => `<li>${item}</li>`).join('')}
          </ul>
          <p class="card-hint">以上为产品假设，已采纳；在 M0 实施期间，服务端判权与审计写入是不变量。</p>
        </div>
        <p class="neutral-note">本页为设计原型，不代表后端已实现；完整状态机、边界与验收标准见 2026-10-17 需求文档。</p>
        ${btn('进入我的俱乐部申请', go('club-applications'), 'btn-secondary')}
      </div>`;
    },

    'club-applications': () => {
      const list = orgApproval.clubApplicationExamples;
      const filterOrder = ['all', 'empty', 'draft', 'pending_review', 'rejected', 'approved'];
      const activeFilter = filterOrder.includes(st()) ? st() : 'all';
      const emptyState = activeFilter === 'empty';
      const headSeg = `<div class="seg org-seg">${[
        ['全部', 'all', 4],
        ['草稿', 'draft', 1],
        ['待审核', 'pending_review', 1],
        ['已通过', 'approved', 1],
        ['已驳回', 'rejected', 1],
      ]
        .map(([label, state, n]) => `<button class="${activeFilter === state ? 'is-active' : ''}" data-action="route" data-route="club-applications" data-state="${state}">${label}<small>${n}</small></button>`)
        .join('')}</div>`;
      const head = `<section class="info-bar" style="margin-top:0"><div class="info-head"><span class="info-kicker">我的身份</span><span class="info-tag">普通骑友 · 申请人</span></div><h2 class="info-title">我的俱乐部申请</h2><p class="info-meta"><span>${emptyState ? '尚未提交任何俱乐部申请' : `共 ${list.length} 份申请`}</span></p></section>
        ${headSeg}`;
      if (emptyState) {
        return `<div class="pg">${head}${stateView('0', '还没有俱乐部申请', '提交俱乐部申请后，平台所有者将审批名称、城市和加入方式等关键信息。', btn('创建俱乐部申请', go('club-application-edit') + ' data-state="create"'))}</div>`;
      }
      const stateTag = (state) => {
        if (state === 'draft') return tag('neutral', '草稿');
        if (state === 'pending_review') return tag('pending', '待审核');
        if (state === 'rejected') return tag('warning', '⚠ 已驳回');
        if (state === 'approved') return tag('success', '✓ 已通过');
        if (state === 'withdrawn') return tag('muted', '已撤回');
        return tag('neutral', state);
      };
      const card = (app) => {
        const action = app.state === 'draft'
          ? btn('继续编辑', go('club-application-edit') + ' data-state="edit"', 'btn-secondary btn-sm')
          : app.state === 'pending_review'
            ? btn('查看进度', toast('已切换到审核进度'), 'btn-secondary btn-sm')
            : app.state === 'rejected'
              ? btn('查看原因并修改', go('club-application-edit') + ' data-state="edit"', 'btn-sm')
              : btn('进入俱乐部', toast('已进入正式俱乐部主页'), 'btn-secondary btn-sm');
        const extraMeta =
          app.state === 'rejected'
            ? `<div class="org-reject-reason"><b>驳回原因（平台所有者 · ${app.rejectedAt}）</b><p>${app.rejectReason}</p></div>`
            : app.state === 'approved'
              ? `<p class="alert-line">${tag('success', '✓ 正式俱乐部已创建 · CLB-0023')}</p>`
              : app.state === 'pending_review'
                ? `<p class="card-hint">提交时间 ${app.submittedAt} · 版本 ${app.version}</p>`
                : `<p class="card-hint">最后编辑 ${app.updatedAt || app.submittedAt} · 版本 ${app.version}</p>`;
        return `<article class="card org-app-card">
          <div class="org-app-head">${stateTag(app.state)}<span class="meta-line">${app.city || '—'} · ${app.state === 'draft' ? '最后编辑' : '提交'} ${app.updatedAt || app.submittedAt}</span></div>
          <h3 class="card-title">${app.name}</h3>
          <p class="meta-line">规范化名 <code>${app.normalized}</code> · 版本 ${app.version}</p>
          <p class="card-hint" style="margin-top:6px">${app.summary}</p>
          ${extraMeta}
          <div class="btn-row org-app-actions">${action}${app.state === 'pending_review' ? btn('撤回申请', toast('申请已撤回为草稿'), 'btn-text') : ''}</div>
        </article>`;
      };
      const filtered = activeFilter === 'draft' ? list.filter((a) => a.state === 'draft')
        : activeFilter === 'pending_review' ? list.filter((a) => a.state === 'pending_review')
        : activeFilter === 'rejected' ? list.filter((a) => a.state === 'rejected')
        : activeFilter === 'approved' ? list.filter((a) => a.state === 'approved')
        : list;
      return `<div class="pg">${head}
        <div class="list-count"><span>当前筛选</span><b>${filtered.length} 份</b></div>
        ${filtered.length ? filtered.map(card).join('') : stateView('0', '当前筛选暂无申请', '可切换到其他状态查看，或创建新的申请。', btn('创建俱乐部申请', go('club-application-edit') + ' data-state="create"', 'btn-secondary'))}
        <div style="margin-top:16px">${btn('创建新申请', go('club-application-edit') + ' data-state="create"')}</div>
      </div>`;
    },

    'club-application-edit': () => {
      const create = is('create');
      const nameConflict = is('name-conflict');
      const error = is('error');
      const confirming = is('submit-confirm');
      const example = {
        name: '望京巡游骑行俱乐部',
        normalized: '望京巡游骑行',
        city: '北京',
        summary: '以望京为集合核心的周末日常骑',
        joinMode: '管理员邀请',
        size: '60 人',
        activityType: '日常巡游',
        rules: '佩戴头盔，服从领队指令；临时取消需提前 6 小时通知。',
        contact: '138 0000 5678',
      };
      const nameValue = error ? '' : nameConflict ? '黑石头骑行' : example.name;
      const nameNormalized = error ? '' : nameConflict ? '黑石头骑行' : example.normalized;
      const conflictHint = nameConflict
        ? `<p class="field-msg org-name-conflict"><b>⚠ 已有同名申请</b> 黑石头骑行 · 审核中（v2） · 不自动合并，由平台所有者判断</p>`
        : nameNormalized
          ? `<p class="field-msg"><b>规范化名</b> <code>${nameNormalized}</code> · 用于重名检测</p>`
          : '';
      const confirmModal = confirming
        ? `<div class="org-confirm-modal" role="dialog" aria-labelledby="submit-confirm-title"><div class="modal-sheet"><button class="modal-close" data-action="route" data-route="club-application-edit" data-state="edit" aria-label="关闭">×</button><h3 class="card-title" id="submit-confirm-title">提交申请审核？</h3><p class="card-hint">以下是与表单完全一致的静态原型示例数据；提交后进入平台所有者待办，审批通过前不会创建正式俱乐部。</p>${rows([
            ['名称', example.name],
            ['规范化', example.normalized],
            ['城市', example.city],
            ['加入方式', example.joinMode],
            ['预计规模', example.size],
          ])}<p class="pending-note">平台所有者审批后创建正式俱乐部与 OWNER 关系；驳回会返回原因并保留草稿。</p><div class="btn-row"><button class="btn-secondary" data-action="route" data-route="club-application-edit" data-state="edit">再检查一下</button><button class="btn" data-action="submit-club-application">确认提交</button></div></div></div>`
        : '';
      return `<div class="pg">
        <p class="neutral-note" style="margin-top:0">${error ? '缺失必填项演示：请补全标红字段后再提交。' : create ? '新建页已填入静态原型示例数据，便于核对必填校验与提交摘要；不代表真实保存。' : nameConflict ? '名称与现有申请相似，提交不被阻断，但请在简介中说明差异。' : '草稿已保存 · 自动保存开启'}</p>
        <div class="card">${cardHead('01', '基本信息')}
          ${field('俱乐部名称', input(nameValue, { ph: '例如：望京巡游骑行俱乐部', cls: error ? 'is-error' : '', error: error ? '请填写俱乐部名称' : '' }) + conflictHint, tag('pending', '必填'))}
          ${field('所在城市', input(error ? '' : example.city, { ph: '选择城市', unit: '›', cls: error ? 'is-error' : '', error: error ? '请选择城市' : '' }), tag('pending', '必填'))}
          ${field('一句话简介', input(error ? '' : example.summary, { ph: '20 字内', count: error ? '0/40' : '18/40' }))}
          <p class="sub-title">俱乐部封面</p>
          <div class="upload-grid">
            ${error ? `<button class="upload-tile" ${toast('已打开图片选择器')}><b>+</b>添加封面</button>` : `<div class="upload-thumb"><img src="${IMG.cover}" alt="俱乐部封面" /><span class="thumb-badge">${tag('neutral', '封面')}</span><button class="thumb-del" ${toast('封面已删除')} aria-label="删除封面"></button></div>`}
          </div></div>
        <div class="card">${cardHead('02', '加入方式与规模')}
          ${field('加入方式', choices(['公开申请', '邀请码', '管理员邀请'], error ? '' : example.joinMode))}
          ${field('预计成员规模', input(error ? '' : example.size, { ph: '选择规模', unit: '›' }))}
          ${field('主要活动类型', choices(['日常巡游', '长距离', '爬坡训练', '新手友好'], error ? '' : example.activityType))}
        </div>
        <div class="card">${cardHead('03', '规则与承诺', tag('neutral', '选填'))}
          ${field('俱乐部规则摘要', input(error ? '' : example.rules, { cls: 'textarea', ph: '简要规则、群规或安全约定', count: error ? '0/500' : '32/500' }))}
          ${field('申请人联系方式', input(example.contact, { ph: '手机号或微信', cls: 'is-disabled' }))}
          <p class="card-hint">联系方式仅平台所有者可见；审批通过后由本人在俱乐部管理页更新。</p>
        </div>
        <p class="neutral-note">本原型不写数据库；提交后仅在前端展示“已切换到待审核”。所有权限以服务端判权为准。</p>
      </div>${fixedBar(error ? '还有 2 项必填未完成' : nameConflict ? '提交后由平台所有者人工判定是否重复' : '准备就绪，可提交', [btn('保存草稿', toast('草稿已保存'), 'btn-secondary'), error ? btn('请先补全必填项', 'disabled', 'btn is-disabled') : btn('提交审核', 'data-action="confirm-club-application"')])}${confirmModal}`;
    },

    'activity-publish-target': () => {
      const rawState = st() || 'member-club';
      const [stateId, selectedClubFromState] = rawState.split('--');
      // 身份 + 目标：解析角色、所选俱乐部与是否可直发
      const parse = {
        'member-club': { role: 'MEMBER', target: 'club', defaultClubId: 'club-0019', note: '普通成员投稿到所属俱乐部，等待该俱乐部管理员审批。' },
        'member-public': { role: 'MEMBER', target: 'public', note: '普通成员的公开活动需平台所有者审批后进入公开池。' },
        'admin-club': { role: 'ADMIN', target: 'club', defaultClubId: 'club-0019', note: '管理员本人在所属俱乐部活动服务端默认发布并写审计。' },
        'admin-public': { role: 'ADMIN', target: 'public', note: '俱乐部管理员发起公开活动不享有直发权限，需进入平台所有者审批池。' },
        'admin-other-club': { role: 'ADMIN', target: 'club', defaultClubId: 'club-0012', note: '尝试在非所属俱乐部发起，服务端会拒绝；原型只做展示。' },
        'platform-public': { role: 'PLATFORM_OWNER', target: 'public', note: '平台所有者的公开活动需显式“确认并发布”并留审计。' },
      };
      const baseInfo = parse[stateId] || parse['member-club'];
      const selectedClubId = selectedClubFromState || baseInfo.defaultClubId;
      const selectedClub = orgApproval.clubs.find((club) => club.id === selectedClubId);
      const clubEligible = baseInfo.target === 'club'
        && selectedClub?.status === 'active'
        && (baseInfo.role === 'MEMBER' || selectedClub.role === 'ADMIN' || selectedClub.role === 'OWNER')
        ? selectedClub.id
        : null;
      const info = { ...baseInfo, clubEligible };
      const identityLabel = { MEMBER: '普通成员', ADMIN: '俱乐部管理员', PLATFORM_OWNER: '平台所有者' }[info.role];
      // 预览路由
      let previewHint;
      let primaryBtn;
      if (info.target === 'club' && info.role === 'ADMIN' && info.clubEligible) {
        previewHint = '服务端判权：以俱乐部管理员身份直接发布，写入 role_auto_publish 审计';
        primaryBtn = btn('管理员直接发布', 'data-action="publish-target-admin"');
      } else if (info.target === 'club' && !info.clubEligible) {
        previewHint = selectedClub?.status === 'suspended'
          ? '所选俱乐部已停用，不能提交或直接发布'
          : '当前身份对所选俱乐部无发布资格（原型不执行真实提交）';
        primaryBtn = btn('无权发起', 'disabled', 'btn is-disabled');
      } else if (info.target === 'club' && info.role === 'MEMBER') {
        previewHint = `服务端判权：进入 ${selectedClub.name} 审批池，任一有效 OWNER / ADMIN 通过即发布`;
        primaryBtn = btn('提交俱乐部审核', `data-action="publish-target-submit" data-pending-state="pending-club--${info.clubEligible}"`);
      } else if (info.target === 'public' && info.role === 'PLATFORM_OWNER') {
        previewHint = '服务端判权：显式确认后直接发布，写入等价审批审计';
        primaryBtn = btn('确认并发布', 'data-action="publish-target-platform"');
      } else {
        previewHint = '服务端判权：进入平台公开活动审批池，通过前不进入公开列表';
        primaryBtn = btn('提交平台审核', 'data-action="publish-target-submit" data-pending-state="pending-public"');
      }
      const clubOptions = orgApproval.clubs
        .map((c) => {
          const selected = c.id === selectedClubId;
          const roleBadge = c.role === 'OWNER' ? tag('success', 'OWNER') : c.role === 'ADMIN' ? tag('solid', 'ADMIN') : tag('neutral', '成员');
          const statusBadge = c.status === 'suspended' ? tag('warning', '⚠ 已停用') : '';
          const optionEligible = c.status === 'active'
            && (info.role === 'MEMBER' || c.role === 'ADMIN' || c.role === 'OWNER');
          const eligibility = c.status === 'suspended'
            ? '俱乐部已停用，选择后不可提交'
            : optionEligible && info.role === 'ADMIN'
              ? '✓ 可直接发布（服务端判权）'
              : optionEligible
                ? '✓ 可发起（提交审核）'
                : '非所属管理员，选择后不可提交';
          return `<label class="org-club-option ${selected ? 'is-selected' : ''} ${optionEligible ? '' : 'is-locked'}" data-action="route" data-route="activity-publish-target" data-state="${stateId}--${c.id}">
            <span class="org-club-name"><b>${c.name}</b><small>${c.city}</small></span>
            <span class="org-club-meta">${roleBadge}${statusBadge}</span>
            <span class="org-club-eligibility">${eligibility}</span>
          </label>`;
        })
        .join('');
      const targetCard = (key, title, eyebrow, desc, selected, eligible) => `<label class="card org-target-card ${selected ? 'is-selected' : ''} ${eligible ? '' : 'is-locked'}" data-action="route" data-route="activity-publish-target" data-state="${key === 'club' ? (info.role === 'ADMIN' ? 'admin-club' : info.role === 'PLATFORM_OWNER' ? 'platform-public' : 'member-club') : (info.role === 'PLATFORM_OWNER' ? 'platform-public' : info.role === 'ADMIN' ? 'admin-public' : 'member-public')}">
        <div class="org-target-head"><span class="org-target-radio" aria-hidden="true"></span><div><p class="info-kicker">${eyebrow}</p><h3 class="card-title">${title}</h3></div>${eligible ? tag('success', '✓ 可发起') : tag('warning', '⚠ 需先加入')}</div>
        <p class="card-hint">${desc}</p>
      </label>`;
      return `<div class="pg">
        <section class="info-bar" style="margin-top:0"><div class="info-head"><span class="info-kicker">当前身份</span><span class="info-tag">${identityLabel}</span></div><h2 class="info-title">选择发布目标</h2><p class="info-meta"><span>${info.note}</span></p></section>
        <p class="section-label">模拟不同角色与目标</p>
        <div class="seg org-seg">${[
          ['member-club', '普通成员 · 俱乐部'],
          ['member-public', '普通成员 · 公开'],
          ['admin-club', '管理员 · 本俱乐部'],
          ['admin-public', '管理员 · 公开'],
          ['admin-other-club', '管理员 · 其他俱乐部'],
          ['platform-public', '平台所有者 · 公开'],
        ].map(([key, label]) => `<button class="${stateId === key ? 'is-active' : ''}" data-action="route" data-route="activity-publish-target" data-state="${key}">${label}</button>`).join('')}</div>
        ${targetCard('club', '俱乐部活动', '关联俱乐部 · club_id 有值', '仅成员可发起；普通成员需审批；OWNER / ADMIN 服务端默认发布。', info.target === 'club', Boolean(info.clubEligible))}
        ${info.target === 'club' ? `<div class="card org-club-picker">${cardHead('', '选择所属俱乐部', '', '仅能选择当前身份下的有效俱乐部；非成员俱乐部不显示。')}<div class="org-club-list">${clubOptions}</div></div>` : ''}
        ${targetCard('public', '公开活动', 'club_id 为空', '不关联俱乐部，面向全平台可见；由平台所有者审批后进入公开池。', info.target === 'public', true)}
        <div class="card">${cardHead('', '提交后将发生', tag('neutral', '服务端判权'), '以下预览由前端根据角色拼接，实际路由仍以服务端为准。')}
          <div class="org-route-preview">
            <div><p class="info-kicker">approval_mode</p><b>${info.target === 'club' && (info.role === 'ADMIN' || info.role === 'OWNER') ? 'role_auto_publish' : info.target === 'public' && info.role === 'PLATFORM_OWNER' ? 'manual_approval（显式确认）' : 'manual_approval'}</b></div>
            <div><p class="info-kicker">review_scope / target</p><b>${info.target === 'club' ? `club / ${info.clubEligible || '—'}` : 'public / —'}</b></div>
            <div><p class="info-kicker">需要审批人</p><b>${info.target === 'club' && info.role === 'MEMBER' ? '任一所属俱乐部 OWNER / ADMIN' : info.target === 'club' && (info.role === 'ADMIN' || info.role === 'OWNER') ? '服务端实时验权' : '平台所有者'}</b></div>
          </div>
        </div>
        <p class="neutral-note">服务端会在提交时实时校验角色与俱乐部归属，并在待审期间保存 <code>review_scope</code>、<code>review_target_id</code>、<code>review_version</code>，审批时再次比对一致性。</p>
      </div>${fixedBar(previewHint, [btn('返回编辑', toast('已返回活动编辑'), 'btn-secondary'), primaryBtn], info.target === 'club' && (info.role === 'ADMIN' || info.role === 'OWNER'))}`;
    },

    'admin-approval-inbox': () => {
      const stateId = st() || 'admin-club-activity';
      const emptyState = stateId === 'empty';
      const platformView = stateId.startsWith('platform-');
      const tab = stateId.endsWith('club-application') ? 'club-application'
        : stateId.endsWith('public-activity') ? 'public-activity'
          : 'club-activity';
      const items = emptyState ? [] : tab === 'club-application' ? orgApproval.todoClubApplication
        : tab === 'public-activity' ? orgApproval.todoPublicActivity
          : orgApproval.todoClubActivity;
      const counts = orgApproval.todoCounts;
      const identityLabel = platformView ? '平台所有者' : '俱乐部管理员 · 周日纯化骑行';
      const permittedCount = platformView ? counts.clubApplication + counts.publicActivity : counts.clubActivity;
      const tabs = [
        ['club-activity', '俱乐部活动', counts.clubActivity, !platformView, '仅所属俱乐部管理员可进入'],
        ['club-application', '俱乐部申请', counts.clubApplication, platformView, '仅平台所有者可进入'],
        ['public-activity', '公开活动', counts.publicActivity, platformView, '仅平台所有者可进入'],
      ];
      const head = `<section class="info-bar" style="margin-top:0"><div class="info-head"><span class="info-kicker">当前身份</span><span class="info-tag">${identityLabel}</span></div><h2 class="info-title">审批待办</h2><p class="info-meta"><span>当前身份可处理 ${permittedCount} 项；切换标签不会改变身份。</span></p></section>
        <p class="section-label">切换待办身份视角（显式操作）</p>
        <div class="seg org-role-seg"><button class="${platformView ? '' : 'is-active'}" data-action="route" data-route="admin-approval-inbox" data-state="admin-club-activity">俱乐部管理员</button><button class="${platformView ? 'is-active' : ''}" data-action="route" data-route="admin-approval-inbox" data-state="platform-club-application">平台所有者</button></div>
        <div class="seg org-inbox-seg">${tabs.map(([key, label, n, enabled, reason]) => `<button class="${tab === key ? 'is-active' : ''} ${enabled ? '' : 'is-disabled'}" ${enabled ? `data-action="route" data-route="admin-approval-inbox" data-state="${platformView ? `platform-${key}` : `admin-${key}`}"` : `disabled aria-disabled="true" title="${reason}"`}>${label}<small>${n}</small></button>`).join('')}</div>
        <p class="neutral-note">${platformView ? '平台所有者只能进入俱乐部申请与公开活动待办；俱乐部活动由所属俱乐部管理员处理。' : '俱乐部管理员只能进入所属俱乐部活动待办；俱乐部申请与公开活动仅平台所有者可见。'}</p>`;
      if (emptyState) {
        return `<div class="pg">${head}${stateView('0', '当前身份暂无待办', '这是当前身份下的真实空数据，不代表无权访问的类目。新的待审提交不会自动超时通过或驳回。', btn('返回管理员待办', go('admin-approval-inbox') + ' data-state="admin-club-activity"', 'btn-secondary'))}</div>`;
      }
      const kindTag = (k) => k === 'club-activity' ? tag('solid', '俱乐部活动')
        : k === 'club-application' ? tag('pending', '俱乐部申请')
          : tag('neutral', '公开活动');
      const itemCard = (item) => `<article class="card org-todo-card">
        <div class="org-todo-head">${kindTag(item.kind)}<span class="meta-line">${item.waited}</span></div>
        <h3 class="card-title" style="margin-top:6px">${item.title || item.club}</h3>
        <p class="meta-line">${item.club ? `${item.club} · ` : ''}发起人 ${item.submitter}${item.role ? `（${item.role}）` : ''} · 版本 ${item.version}</p>
        <p class="card-hint" style="margin-top:6px">${item.summary}</p>
        ${item.kind === 'club-activity' ? `<p class="card-hint org-todo-coreviewers">你所在俱乐部还有 1 名可审人；谁先处理终态生效。</p>` : ''}
        <div class="btn-row">${btn('进入审批', go('approval-detail') + ` data-state="${item.kind}-${item.version}--${item.id}"`, 'btn-sm')}</div>
      </article>`;
      return `<div class="pg">${head}
        <div class="list-count"><span>当前筛选</span><b>共 ${items.length} 项</b></div>
        ${items.map(itemCard).join('')}
        ${tab === 'club-activity' ? `<p class="neutral-note">本列表只显示所属俱乐部的待办；A 俱乐部管理员看不到 B 俱乐部待审。</p>` : ''}
      </div>`;
    },

    'approval-detail': () => {
      const rawState = st() || 'club-activity-v1--activity-202';
      const stateParts = rawState.split('--');
      const contextKey = stateParts[0];
      const objectId = stateParts[1];
      const objectVersion = contextKey.match(/-(v\d+)$/)?.[1];
      const objectType = contextKey.replace(/-v\d+$/, '');
      const reviewItems = [...orgApproval.todoClubActivity, ...orgApproval.todoClubApplication, ...orgApproval.todoPublicActivity];
      const matchedItem = reviewItems.find((item) => item.kind === objectType && (!objectId || item.id === objectId) && item.version === objectVersion);
      const diff = orgApproval.approvalDiff;
      const fallbackItem = {
        id: 'activity-201',
        kind: 'club-activity',
        club: diff.club,
        title: diff.activity,
        submitter: diff.submitter,
        role: 'MEMBER',
        version: diff.version,
        reviewScope: 'club',
        waited: diff.submittedAt,
        summary: '140 km / 1600 m 爬升；集合 06:30 望京西；驳回后重提第二版。',
      };
      const item = matchedItem || fallbackItem;
      const taken = rawState === 'taken';
      const expired = rawState === 'version-expired';
      const rejectError = rawState === 'reject-error' || stateParts.includes('reject-error');
      const isClubActivity = item.kind === 'club-activity';
      const showDiff = isClubActivity && item.version === 'v2';
      const typeInfo = item.kind === 'club-application'
        ? { label: '俱乐部申请', scope: 'platform', targetId: 'platform-owner' }
        : item.kind === 'public-activity'
          ? { label: '公开活动', scope: 'public', targetId: 'platform-owner' }
          : { label: '俱乐部活动', scope: 'club', targetId: item.reviewTargetId || 'club-0023' };
      const displayTitle = item.title || item.club;
      const topBanner = taken
        ? `<div class="org-banner is-taken"><b>⚠ 已被他人处理</b> 该版本已于 10月17日 00:02 由“风向骑手（OWNER）”通过。</div>`
        : expired
          ? `<div class="org-banner is-expired"><b>⚠ 版本已过期</b> 发起人已于 10月16日 23:40 提交新版本 <code>v3</code>，当前版本不能再处理。</div>`
          : '';
      const diffRows = `<div class="org-diff">
        <div class="org-diff-head"><span>字段</span><span>线上版本（${diff.previousVersion}）</span><span>当前版本（${diff.version}）</span></div>
        ${diff.fields
          .map((f) => `<div class="org-diff-row ${f.changed ? 'is-changed' : ''}"><span class="org-diff-label">${f.label}</span><span class="org-diff-before">${f.before}</span><span class="org-diff-after">${f.after}</span></div>`)
          .join('')}
      </div>`;
      const buttonsDisabled = taken || expired;
      const outcomeContext = `${item.kind}-${item.version}--${item.id}`;
      const rejectLabel = item.kind === 'club-application' ? '驳回申请' : item.kind === 'public-activity' ? '驳回公开活动' : '驳回活动版本';
      const approveLabel = item.kind === 'club-application' ? '通过并创建俱乐部' : item.kind === 'public-activity' ? '通过并发布公开活动' : '通过并发布俱乐部活动';
      return `<div class="pg">
        <section class="info-bar" style="margin-top:0"><div class="info-head"><span class="info-kicker">${typeInfo.label} · ${displayTitle}</span><span class="info-tag ${buttonsDisabled ? '' : 'is-pending'}">${taken ? '已被他人处理' : expired ? '版本已过期' : '待审核'}</span></div><h2 class="info-title">${item.submitter} 的${typeInfo.label}审批 · ${item.version}</h2><p class="info-meta"><span>${item.waited}</span><span>review_scope ${typeInfo.scope} · review_target_id ${typeInfo.targetId}</span></p></section>
        ${topBanner}
        ${showDiff ? `<div class="card">${cardHead('01', '版本差异', tag('warning', '关键修改'), '只有标红的字段相比线上版本发生变化；审批通过将以当前版本原子替换。')}${diffRows}</div>` : `<div class="card">${cardHead('01', `${typeInfo.label}内容快照`, tag('neutral', item.version))}
          <p class="card-hint">${item.summary}</p>${rows([['审批对象类型', item.kind], ['审批对象 ID', item.id], ['标题 / 名称', displayTitle], ['版本', item.version]])}</div>`}
        <div class="card">${cardHead('02', '提交人与角色快照', tag('neutral', '来自服务端'))}${rows([['提交人', `${item.submitter}${item.role ? `（${item.role}）` : ''}`], ['审批对象类型', item.kind], ['审批对象 ID', item.id], ['review_scope', typeInfo.scope], ['review_target_id', typeInfo.targetId], ['review_version', item.version], ['上次驳回', showDiff ? diff.prevRejectReason : '—']])}</div>
        <div class="card">${cardHead('03', '审核意见', buttonsDisabled ? tag('muted', '只读') : tag('neutral', '驳回时必填'))}${
          buttonsDisabled
            ? input('不能在当前状态下填写审核意见', { cls: 'textarea is-disabled' })
            : `<textarea id="org-reject-reason" class="input textarea ${rejectError ? 'is-error' : ''}" maxlength="200" placeholder="驳回时必填，发起人会看到这段说明"></textarea><div class="field-foot"><span>${rejectError ? '<b>驳回时请填写理由；重复点击不会绕过校验</b>' : '示例：集合地点不够具体，请补充到出口。'}</span><span>0/200</span></div>`
        }</div>
        <p class="neutral-note">同一 <code>review_version</code> 只能有一个终态结果；并发审批时第一个合法终态生效，其他请求返回“已被他人处理”。</p>
      </div>${
        buttonsDisabled
          ? fixedBar(expired ? '当前版本已过期，无法处理' : '当前版本已有终态', [btn('查看审计记录', toast('已切换到发布结果（审计）'), 'btn-secondary'), btn('返回待办', go('admin-approval-inbox'))], true)
          : fixedBar(rejectError ? '请先填写驳回理由' : '', [btn(rejectLabel, `data-action="org-reject" data-outcome-context="${outcomeContext}"`, 'btn-secondary'), btn(approveLabel, `data-action="org-approve" data-outcome-context="${outcomeContext}"`)])
      }`;
    },

    'approval-outcome': () => {
      const stateId = st() || 'manual';
      const [baseState, outcomeContextKey, outcomeObjectId] = stateId.split('--');
      const outcomeVersion = outcomeContextKey?.match(/-(v\d+)$/)?.[1];
      const outcomeType = outcomeContextKey?.replace(/-v\d+$/, '');
      const outcomeItems = [...orgApproval.todoClubActivity, ...orgApproval.todoClubApplication, ...orgApproval.todoPublicActivity];
      const outcomeItem = outcomeItems.find((item) => item.kind === outcomeType && item.id === outcomeObjectId && item.version === outcomeVersion);
      const audit = orgApproval.auditTemplate;
      const auto = orgApproval.roleAutoPublishSample;
      let modeBadge, modeTitle, timeline, auditPayload;
      const pending = stateId.startsWith('pending-club') || stateId === 'pending-public';
      if (pending) {
        const pendingClub = stateId.startsWith('pending-club');
        const pendingTargetId = pendingClub ? stateId.split('--')[1] || 'club-0019' : '—';
        modeBadge = tag('pending', '待审核');
        modeTitle = `${pendingClub ? '俱乐部活动' : '公开活动'}提交成功 · 当前状态 pending_review`;
        timeline = [
          { time: '刚刚', title: '提交审核', detail: `普通成员已提交${pendingClub ? '俱乐部活动' : '公开活动'}版本 v1`, highlight: true },
          { time: '等待处理', title: '进入审批池', detail: pendingClub ? '由所选俱乐部 OWNER / ADMIN 审批' : '由平台所有者审批' },
          { time: '尚未发生', title: '审批通过后发布', detail: '当前不会上线，也没有 approved_by 或发布时间' },
        ];
        auditPayload = {
          actor: '风向骑手（MEMBER）',
          targetType: pendingClub ? 'club_activity' : 'public_activity',
          beforeStatus: 'draft',
          afterStatus: 'pending_review',
          approvalMode: 'manual_approval',
          approvedBy: '—（尚未审批）',
          approvedRole: pendingClub ? '等待 OWNER / ADMIN' : '等待 PLATFORM_OWNER',
          reviewScope: pendingClub ? 'club' : 'public',
          reviewTargetId: pendingTargetId,
          reviewVersion: 'v1',
          idempotencyKey: pendingClub ? 'rev-club-31c92f0a' : 'rev-public-41d03a1b',
          createdAt: '刚刚',
        };
      } else if (stateId === 'role-auto') {
        modeBadge = tag('success', '✓ 角色自动发布');
        modeTitle = `${auto.actor} 在 ${auto.club} 发布本人活动`;
        timeline = [
          { time: auto.publishedAt, title: '发起 + 服务端判权', detail: `发起人 ${auto.actor} · 服务端实时校验所属俱乐部与角色快照` },
          { time: auto.publishedAt, title: '默认发布', detail: `approval_mode=${auto.approvalMode} · approved_role=${auto.approvedRole} · 不生成自审待办`, highlight: true },
          { time: auto.publishedAt, title: '写入审计', detail: `review_scope=${auto.reviewScope} · review_target_id=${auto.reviewTargetId} · idempotency_key 尾8位 ${auto.idempotencyKey.slice(-8)}` },
        ];
        auditPayload = { ...auto, action: 'publish', beforeStatus: 'draft', afterStatus: 'published' };
      } else if (stateId === 'platform-owner-public') {
        modeBadge = tag('success', '✓ 显式确认');
        modeTitle = '平台所有者发起公开活动 · 显式确认后发布';
        timeline = [
          { time: '10月17日 00:08', title: '发起', detail: '平台所有者进入公开活动编辑并点击“发布”' },
          { time: '10月17日 00:09', title: '显式确认', detail: '模态框二次确认“确认并发布” · 不生成自审待办', highlight: true },
          { time: '10月17日 00:09', title: '写入等价审计', detail: 'approval_mode=manual_approval · approved_by=self · approved_role=PLATFORM_OWNER' },
        ];
        auditPayload = {
          actor: '平台所有者',
          targetType: 'public_activity',
          beforeStatus: 'draft',
          afterStatus: 'published',
          approvalMode: 'manual_approval',
          approvedBy: 'self',
          approvedRole: 'PLATFORM_OWNER',
          reviewScope: 'public',
          reviewTargetId: '—',
          reviewVersion: 'v1',
          idempotencyKey: 'pub-platform-7a21',
          createdAt: '10月17日 00:09',
        };
      } else if (baseState === 'manual' && outcomeItem) {
        const application = outcomeItem.kind === 'club-application';
        const publicActivity = outcomeItem.kind === 'public-activity';
        const label = application ? '俱乐部申请' : publicActivity ? '公开活动' : '俱乐部活动';
        const reviewer = application || publicActivity ? '平台所有者（PLATFORM_OWNER）' : '风向骑手（OWNER）';
        modeBadge = tag('success', application ? '✓ 已创建俱乐部' : '✓ 已发布');
        modeTitle = application
          ? `申请已通过并创建俱乐部 · ${outcomeItem.club}`
          : `${label}已通过并发布 · ${outcomeItem.title}`;
        timeline = [
          { time: outcomeItem.waited, title: `提交${label}审核`, detail: `${outcomeItem.submitter} 提交 ${outcomeItem.version}` },
          { time: '刚刚', title: application ? '通过并创建俱乐部' : '通过并发布', detail: `${reviewer} · 审批对象 ${outcomeItem.id}`, highlight: true },
          { time: '刚刚', title: '写入审计', detail: `review_scope=${application ? 'platform' : publicActivity ? 'public' : 'club'} · review_version=${outcomeItem.version}` },
        ];
        auditPayload = {
          actor: outcomeItem.submitter,
          targetType: outcomeItem.kind.replace('-', '_'),
          targetId: outcomeItem.id,
          beforeStatus: 'pending_review',
          afterStatus: application ? 'approved' : 'published',
          approvalMode: 'manual_approval',
          approvedBy: reviewer,
          approvedRole: application || publicActivity ? 'PLATFORM_OWNER' : 'OWNER',
          reviewScope: application ? 'platform' : publicActivity ? 'public' : 'club',
          reviewTargetId: application || publicActivity ? 'platform-owner' : outcomeItem.reviewTargetId || 'club-0023',
          reviewVersion: outcomeItem.version,
          idempotencyKey: `approve-${outcomeItem.id}`,
          createdAt: '刚刚',
        };
      } else if (baseState === 'rejected' && outcomeItem) {
        const application = outcomeItem.kind === 'club-application';
        const publicActivity = outcomeItem.kind === 'public-activity';
        const label = application ? '俱乐部申请' : publicActivity ? '公开活动' : '俱乐部活动';
        const reviewScope = application ? 'platform' : publicActivity ? 'public' : 'club';
        const reviewTargetId = application || publicActivity ? 'platform-owner' : outcomeItem.reviewTargetId || 'club-0023';
        modeBadge = tag('warning', '⚠ 已驳回');
        modeTitle = `${label}已驳回 · ${outcomeItem.title || outcomeItem.club}`;
        timeline = [
          { time: outcomeItem.waited, title: `提交${label}审核`, detail: `${outcomeItem.submitter} 提交 ${outcomeItem.version}` },
          { time: '刚刚', title: `驳回${label}`, detail: `审批对象 ${outcomeItem.id} · 驳回理由已记录`, highlight: true },
          { time: '刚刚', title: '写入审计', detail: `review_scope=${reviewScope} · review_target_id=${reviewTargetId} · review_version=${outcomeItem.version}` },
        ];
        auditPayload = {
          actor: outcomeItem.submitter,
          targetType: outcomeItem.kind.replace('-', '_'),
          targetId: outcomeItem.id,
          beforeStatus: 'pending_review',
          afterStatus: 'rejected',
          approvalMode: 'manual_approval',
          approvedBy: application || publicActivity ? '平台所有者（PLATFORM_OWNER）' : '风向骑手（OWNER）',
          approvedRole: application || publicActivity ? 'PLATFORM_OWNER' : 'OWNER',
          reviewScope,
          reviewTargetId,
          reviewVersion: outcomeItem.version,
          idempotencyKey: `reject-${outcomeItem.id}`,
          createdAt: '刚刚',
        };
      } else if (baseState === 'rejected') {
        modeBadge = tag('warning', '⚠ 已驳回');
        modeTitle = `${audit.actor} 的审批请求被驳回`;
        timeline = [
          { time: '10月16日 22:10', title: '提交审核', detail: `${audit.actor} 提交版本 ${audit.reviewVersion}` },
          { time: '10月16日 23:04', title: '驳回', detail: `${audit.approvedBy} · 原因“撤离点填写格式不符合要求，需精确到具体位置”`, highlight: true },
          { time: '10月16日 23:04', title: '写入审计', detail: `beforeStatus=pending_review · afterStatus=rejected · reason 已记录` },
        ];
        auditPayload = { ...audit, afterStatus: 'rejected', approvalMode: 'manual_approval' };
      } else {
        modeBadge = tag('success', '✓ 人工审批通过');
        modeTitle = `${audit.actor} 的审批请求人工审批通过`;
        timeline = [
          { time: '10月16日 23:04', title: '提交审核', detail: `${audit.actor} 提交版本 ${audit.reviewVersion}` },
          { time: '10月17日 00:12', title: '人工审批通过', detail: `${audit.approvedBy} · 保留历史意见与角色快照`, highlight: true },
          { time: '10月17日 00:12', title: '发布 + 写入审计', detail: `approval_mode=manual_approval · idempotency_key 尾8位 ${audit.idempotencyKey.slice(-8)}` },
        ];
        auditPayload = audit;
      }
      const stateSwitch = `<div class="seg org-outcome-seg">${[
        ['pending-club', '俱乐部待审核'],
        ['pending-public', '公开待审核'],
        ['manual', '人工审批'],
        ['role-auto', 'role_auto_publish'],
        ['platform-owner-public', '平台所有者公开活动'],
        ['rejected', '已驳回'],
      ].map(([key, label]) => `<button class="${baseState === key || (key === 'pending-club' && stateId.startsWith('pending-club')) ? 'is-active' : ''}" data-action="route" data-route="approval-outcome" data-state="${key}">${label}</button>`).join('')}</div>`;
      return `<div class="pg">
        <section class="info-bar" style="margin-top:0"><div class="info-head"><span class="info-kicker">approval_mode 可视化</span>${modeBadge}</div><h2 class="info-title">${modeTitle}</h2><p class="info-meta"><span>原型只展示字段清单，不写数据库。</span></p></section>
        ${stateSwitch}
        <div class="card">${cardHead('01', '发布事实', tag('neutral', '只读'))}
          ${rows([
            ['approval_mode', `<code>${auditPayload.approvalMode}</code>`],
            ['created_by', auditPayload.createdBy || auditPayload.actor],
            ['approved_by', auditPayload.approvedBy],
            ['approved_role', auditPayload.approvedRole],
            ['review_scope', auditPayload.reviewScope],
            ['review_target_id', auditPayload.reviewTargetId],
            ['review_version', auditPayload.reviewVersion],
            ['idempotency_key', `<code>…${auditPayload.idempotencyKey.slice(-8)}</code>`],
          ])}
        </div>
        <div class="card">${cardHead('02', '审批流', tag('neutral', '时间线'))}
          <ol class="org-timeline">
            ${timeline.map((t) => `<li class="${t.highlight ? 'is-highlight' : ''}"><span class="org-timeline-dot" aria-hidden="true"></span><div><b>${t.title}</b><small>${t.time}</small><p>${t.detail}</p></div></li>`).join('')}
          </ol>
        </div>
        <div class="card">${cardHead('03', '审计载荷字段（示意）', tag('neutral', '前端只读'))}
          <pre class="org-audit-json">${JSON.stringify({
            actor: auditPayload.actor,
            action: pending ? 'submit_for_review' : baseState === 'rejected' ? 'reject' : baseState === 'role-auto' ? 'auto_publish' : 'approve',
            target_type: auditPayload.targetType || 'activity_review',
            target_id: auditPayload.targetId || auditPayload.reviewTargetId,
            review_target_id: auditPayload.reviewTargetId,
            before_status: auditPayload.beforeStatus || 'pending_review',
            after_status: auditPayload.afterStatus,
            approval_mode: auditPayload.approvalMode,
            created_by: auditPayload.createdBy || auditPayload.actor,
            approved_by: auditPayload.approvedBy,
            approved_role: auditPayload.approvedRole,
            review_scope: auditPayload.reviewScope,
            review_version: auditPayload.reviewVersion,
            idempotency_key: `***${auditPayload.idempotencyKey.slice(-8)}`,
            created_at: auditPayload.createdAt || auditPayload.publishedAt,
          }, null, 2)}</pre>
          <p class="card-hint">实际审计还会记录 trace id、通知外发状态；本原型只展示关键字段清单。</p>
        </div>
      </div>${pending
        ? fixedBar('审批通过前活动链接不可用', [btn('返回活动编辑', toast('已返回活动编辑'), 'btn-secondary'), btn('查看审核进度', toast('当前仍在等待审批'))])
        : baseState === 'rejected'
          ? fixedBar('', [btn('返回待办', go('admin-approval-inbox'))])
          : fixedBar('', [btn('复制活动链接', toast('活动链接已复制'), 'btn-secondary'), btn('返回待办', go('admin-approval-inbox'))])}`;
    },

    'approval-exceptions': () => {
      const stateId = st() || 'club-suspended';
      const scenes = {
        'club-suspended': {
          title: '俱乐部已停用',
          lead: '周日纯化骑行 已被平台所有者停用于 10月16日 20:12',
          detail: '俱乐部内未来活动将冻结为“待处置”，不批量自动取消；本次活动需要你选择后续动作。',
          facts: [
            ['俱乐部', '周日纯化骑行（已停用）'],
            ['活动', '10月19日 周日 · 纯化长距离慢速骑'],
            ['当前状态', 'pending_review（已冻结）'],
            ['停用原因', '平台公告 · 等待俱乐部补充安全材料'],
          ],
          actions: [
            ['取消活动', 'btn-secondary', '已取消活动并通知报名用户'],
            ['转为公开活动重审', 'btn', '已转公开活动审批池'],
          ],
          note: '俱乐部恢复后，仍冻结的活动可由平台所有者选择继续审批或取消。',
        },
        'role-expired': {
          title: '角色已失效',
          lead: '你的 OWNER 身份已被收回于 10月16日 18:30',
          detail: '当前请求将按普通成员路由处理；若活动需要默认发布，请联系新 OWNER。',
          facts: [
            ['历史角色', 'OWNER'],
            ['当前角色', 'MEMBER'],
            ['触发动作', '尝试在周日纯化骑行发起俱乐部活动'],
            ['服务端判权', '将本次提交降级为普通成员路由，进入该俱乐部审批池'],
          ],
          actions: [
            ['返回编辑', 'btn-secondary', '已返回活动编辑'],
            ['仍按普通成员提交', 'btn', '已按普通成员路由提交审核'],
          ],
          note: '客户端缓存的旧角色不授予权限；默认发布只在服务端实时验权通过时发生。',
        },
        'version-expired': {
          title: '版本已过期',
          lead: '发起人于 10月16日 23:40 提交了新版本 v3',
          detail: '当前你在审批的是旧版 v2，不能再处理；可查看最新版本或返回待办。',
          facts: [
            ['活动', '10月19日 周日 · 纯化长距离慢速骑'],
            ['你在审批的版本', 'v2'],
            ['最新版本', 'v3（pending_review）'],
            ['服务端行为', '对 v2 的任何通过 / 驳回请求返回“版本已过期”'],
          ],
          actions: [
            ['查看最新版本', 'btn-secondary', '已切换到最新版本'],
            ['返回待办', 'btn', '已返回待办'],
          ],
          note: '审批时服务端会再次校验 review_version 与当前活动一致，避免发起人在待审期间换俱乐部或改公开范围后沿用旧审批。',
        },
        'already-processed': {
          title: '已被他人处理',
          lead: '风向骑手（OWNER）于 10月17日 00:02 通过了该版本',
          detail: '同一 review_version 只能有一个终态结果；并发审批时第一个合法终态生效。',
          facts: [
            ['activity', '10月19日 周日 · 纯化长距离慢速骑'],
            ['review_version', 'v2'],
            ['终态', 'published'],
            ['处理人', '风向骑手（OWNER）'],
            ['你所在俱乐部可审人', '2 名'],
          ],
          actions: [
            ['查看审计记录', 'btn-secondary', '已查看审计'],
            ['返回待办', 'btn', '已返回待办'],
          ],
          note: '通知系统已向其他可审人同步“待办已结束”；本次请求幂等保护不会重复生效。',
        },
      };
      const scene = scenes[stateId] || scenes['club-suspended'];
      const stateSwitch = `<div class="seg org-outcome-seg">${[
        ['club-suspended', '俱乐部停用'],
        ['role-expired', '角色失效'],
        ['version-expired', '版本过期'],
        ['already-processed', '已被他人处理'],
      ].map(([key, label]) => `<button class="${stateId === key ? 'is-active' : ''}" data-action="route" data-route="approval-exceptions" data-state="${key}">${label}</button>`).join('')}</div>`;
      return `<div class="pg">
        <div class="org-exception-head">
          <span class="org-exception-badge">${tag('warning', '⚠ 关键异常')}</span>
          <h2 class="page-title">${scene.title}</h2>
          <p class="pending-note">${scene.lead}</p>
        </div>
        ${stateSwitch}
        <div class="card">${cardHead('01', '异常事实', tag('neutral', '来自服务端'))}<p class="card-hint">${scene.detail}</p>${rows(scene.facts)}</div>
        <p class="neutral-note">${scene.note}</p>
      </div>${fixedBar('下一步操作', [
        btn(scene.actions[0][0], toast(scene.actions[0][2]), scene.actions[0][1]),
        btn(scene.actions[1][0], toast(scene.actions[1][2]), scene.actions[1][1]),
      ])}`;
    },
  };

  window.pageTemplates = templates;

  // 导出 club-center 的运行时状态变换，供 app.js 与运行时测试复用。
  // 原则：overlay（more-open / bg-fallback）与 activeTab 正交，切换 overlay 不动 tab；切换 tab 可选择保留 overlay。
  const CLUB_CENTER_TABS = ['activities', 'members', 'profile'];
  const CLUB_CENTER_OVERLAYS = ['more-open', 'bg-fallback', 'loading', 'error', 'activities-empty'];
  const clubCenterParseState = (state) => {
    const segments = (state || '').split('--').filter(Boolean);
    let tab = 'activities';
    const overlays = [];
    for (const segment of segments) {
      if (segment === 'default') continue;
      if (CLUB_CENTER_TABS.includes(segment)) tab = segment;
      else overlays.push(segment);
    }
    return { tab, overlays };
  };
  const clubCenterComposeState = (tab, overlays) => {
    const base = tab === 'activities' ? 'default' : tab;
    const ordered = CLUB_CENTER_OVERLAYS.filter((o) => overlays.includes(o));
    if (ordered.length === 0) return base;
    if (tab === 'activities' && ordered.length === 1) return ordered[0];
    return [base, ...ordered].join('--');
  };
  const clubCenterNextTab = (state, key) => {
    const { tab, overlays } = clubCenterParseState(state);
    const index = CLUB_CENTER_TABS.indexOf(tab);
    let next = tab;
    if (key === 'ArrowRight') next = CLUB_CENTER_TABS[(index + 1) % CLUB_CENTER_TABS.length];
    else if (key === 'ArrowLeft')
      next = CLUB_CENTER_TABS[(index - 1 + CLUB_CENTER_TABS.length) % CLUB_CENTER_TABS.length];
    else if (key === 'Home') next = CLUB_CENTER_TABS[0];
    else if (key === 'End') next = CLUB_CENTER_TABS[CLUB_CENTER_TABS.length - 1];
    else return null;
    // 切换 tab 时清掉 more-open 浮层（符合"点击 tab 关闭菜单"），保留 bg-fallback / loading / error / activities-empty。
    const keepOverlays = overlays.filter((o) => o !== 'more-open');
    return {
      tab: next,
      state: clubCenterComposeState(next, keepOverlays),
      tabId: `club-center-tab-${next}`,
    };
  };
  const clubCenterToggleMore = (state) => {
    const { tab, overlays } = clubCenterParseState(state);
    const nextOverlays = overlays.includes('more-open')
      ? overlays.filter((o) => o !== 'more-open')
      : [...overlays.filter((o) => o !== 'more-open'), 'more-open'];
    return clubCenterComposeState(tab, nextOverlays);
  };
  const clubCenterCoverError = (state) => {
    const { tab, overlays } = clubCenterParseState(state);
    if (overlays.includes('bg-fallback')) return clubCenterComposeState(tab, overlays);
    return clubCenterComposeState(tab, [...overlays, 'bg-fallback']);
  };
  const clubCenterRetryCover = (state) => {
    const { tab, overlays } = clubCenterParseState(state);
    return clubCenterComposeState(
      tab,
      overlays.filter((o) => o !== 'bg-fallback'),
    );
  };
  window.clubCenterStateMachine = {
    parseState: clubCenterParseState,
    composeState: clubCenterComposeState,
    nextTab: clubCenterNextTab,
    toggleMore: clubCenterToggleMore,
    coverError: clubCenterCoverError,
    retryCover: clubCenterRetryCover,
    TABS: CLUB_CENTER_TABS,
    OVERLAYS: CLUB_CENTER_OVERLAYS,
  };
})();
