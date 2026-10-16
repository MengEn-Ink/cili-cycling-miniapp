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
      return `<div class="pg">
        <div class="cover"><img src="${IMG.cover}" alt="${primary.title}" /><span class="cover-count">1/3</span><div class="cover-dots"><i class="is-active"></i><i></i><i></i></div></div>
        <section class="info-bar"><div class="info-head"><span class="info-kicker">${primary.date} · ${primary.level}</span><span class="info-tag">${approved ? '已通过' : full ? '名额已满' : '报名中'}</span></div><h2 class="info-title">${primary.title}</h2><p class="info-meta"><span>${primary.time}集合</span><span>${primary.start}</span></p></section>
        ${hostCard}
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
})();
