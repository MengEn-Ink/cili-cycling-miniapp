(() => {
  const { activities, rider, attendees, releaseNotes } = window.prototypeData;
  const primary = activities[0];

  const button = (label, action, extra = '') =>
    `<button class="prototype-button ${extra}" data-action="${action}">${label}</button>`;
  const metric = (value, label) => `<span><b>${value}</b><small>${label}</small></span>`;
  const avatar = (name) =>
    `<button class="prototype-avatar" data-action="rider" data-rider="${name}"><i>${name.slice(0, 1)}</i><small>${name}</small></button>`;
  const field = (label, value, extra = '') =>
    `<label class="form-field ${extra}"><span>${label}</span><div>${value}</div></label>`;
  const pageHead = (eyebrow, title, copy = '') =>
    `<header class="prototype-head"><small>${eyebrow}</small><h2>${title}</h2>${copy ? `<p>${copy}</p>` : ''}</header>`;

  const templates = {
    activities: () => `${pageHead('此里骑行活动', '选一场骑行，一起出发', '路线、时间、集合点，一眼看清')}
      <div class="prototype-segments"><button class="is-active" data-action="filter" data-filter="future">即将开始</button><button data-action="filter" data-filter="history">历史活动</button></div>
      <div class="ticket-heading"><b>近期活动</b><span>1 / 2</span></div>
      <div class="prototype-stack" data-activity-list>${activities
        .map(
          (activity, index) => `<article class="activity-ticket ${index ? 'is-secondary' : ''}">
            <div class="activity-visual"><span class="route-stroke"></span><b>${activity.status}</b></div>
            <div class="activity-ticket-body"><small>${activity.date} · ${activity.time}</small><h3>${activity.title}</h3><p>${activity.start}集合</p>
            <div class="dark-metrics">${metric(`${activity.distanceKm} km`, '里程')}${metric(`${activity.elevationM} m`, '爬升')}${metric(activity.level, '难度')}</div>
            ${button('查看活动详情', 'route', 'button-primary').replace('data-action="route"', 'data-action="route" data-route="activity-detail"')}</div>
          </article>`,
        )
        .join('')}</div>`,

    'activity-detail': () => `<article class="unified-detail-card">
      <div class="activity-visual detail-visual"><span class="status-chip">${primary.status}</span><small>${primary.date} · ${primary.time}</small><h2>${primary.title}</h2><span class="route-stroke"></span></div>
      <div class="unified-detail-body"><div class="detail-metrics">${metric(`${primary.distanceKm} km`, '里程')}${metric(`${primary.elevationM} m`, '爬升')}${metric(primary.level, '难度')}</div>
      <section class="black-ticket"><small>集合时间</small><strong>${primary.time}</strong><h3>${primary.start}集合</h3><p>请提前 10 分钟到达，完成车辆检查。</p><button data-action="toast" data-message="已打开集合点导航">地图导航</button></section>
      <section class="detail-row"><div><b>线路信息</b><span>${primary.route}</span></div><p>全程 ${primary.distanceKm} km，累计爬升 ${primary.elevationM} m，建议具备中长距离骑行经验。</p></section>
      <section class="detail-row"><div><b>已报名人员</b><span>${primary.occupied} / ${primary.capacity}</span></div><div class="avatar-row">${attendees.map(avatar).join('')}</div></section>
      <section class="detail-row"><div><b>备注事项</b><span>${primary.fee}</span></div><p>请佩戴头盔，携带补给水、备胎和基础维修工具；雨天活动另行通知。</p></section></div></article>
      <div class="sticky-prototype-action">${button('立即报名', 'route', 'button-primary').replace('data-action="route"', 'data-action="route" data-route="registration-form"')}</div>`,

    'registration-form': () => `${pageHead('活动报名', primary.title, '第 1 步 / 共 2 步 · 确认骑行身份')}
      <div class="progress-track"><i></i></div>
      <section class="prototype-card identity-card"><div class="rider-avatar">风</div><div><small>报名身份</small><h3>${rider.nickname}</h3><p>${rider.city} · ${rider.experience}</p></div><button data-action="route" data-route="profile-edit">编辑</button></section>
      <section class="prototype-card form-section"><h3>集合方式</h3><div class="choice-grid"><button class="is-active" data-action="choice">自行前往</button><button data-action="choice">需要后援车</button></div></section>
      <section class="prototype-card form-section"><h3>骑行经验</h3><div class="choice-grid three"><button data-action="choice">新手</button><button class="is-active" data-action="choice">稳定骑行</button><button data-action="choice">进阶</button></div><p class="helper-copy">当前资料可支撑 ${primary.distanceKm} km / ${primary.elevationM} m 路线审核。</p></section>
      <label class="agreement"><input type="checkbox" checked /> 我已阅读活动说明，并确认身体状况适合参加</label>
      ${button('提交报名', 'submit-registration', 'button-primary button-full')}`,

    registrations: () => `${pageHead('此里 · 我的行程', '准时集合，轻松出发', '报名进度与出发凭证都在这里')}
      <div class="trip-summary">${metric('1', '待出发')}${metric('1', '审核中')}${metric('6', '已完成')}</div>
      <div class="prototype-segments"><button class="is-active">待出发</button><button>历史行程</button></div>
      <article class="trip-ticket"><div class="trip-ticket-top"><span>已通过</span><small>${primary.date}</small></div><h3>${primary.title}</h3><div class="trip-ticket-info"><div><small>集合时间</small><b>${primary.time}</b></div><div><small>集合地点</small><b>${primary.start}</b></div></div>${button('查看票据式行程凭证', 'route', 'button-outline').replace('data-action="route"', 'data-action="route" data-route="credential"')}</article>
      <article class="trip-ticket trip-ticket--pending"><div class="trip-ticket-top"><span>待审核</span><small>${activities[1].date}</small></div><h3>${activities[1].title}</h3><p>${activities[1].start} · ${activities[1].time}</p></article>`,

    credential: () => `<article class="credential-ticket">
      <div class="credential-brand"><b>此里 CILI</b><span>出发凭证</span></div><div class="credential-status">已通过 · 准时集合</div>
      <div class="credential-main"><small>活动</small><h2>${primary.title}</h2><p>${primary.date}</p></div>
      <div class="credential-spotlight"><small>集合时间</small><strong>${primary.time}</strong><small>集合地点</small><h3>${primary.start}</h3><p>北京市朝阳区温榆河绿道西入口</p>${button('地图导航', 'toast', 'ticket-white').replace('data-action="toast"', 'data-action="toast" data-message="已打开集合点导航"')}</div>
      <div class="credential-person"><div class="rider-avatar">风</div><div><small>报名骑手</small><b>${rider.nickname}</b><span>自行前往 · 稳定骑行</span></div></div>
      <div class="credential-code"><div class="fake-qr" aria-label="模拟签到二维码"></div><p>管理员扫码签到<br /><small>凭证编号 CILI-1017-018</small></p></div>
      <div class="credential-cut">••••••••••••••••••••••••••</div><footer>请勿转发 · 现场核验后状态更新为已签到</footer>
    </article>`,

    profile: () => `${pageHead('此里', '一起骑，去更远的地方')}
      <section class="profile-hero"><div class="rider-avatar large">风</div><div><small>${rider.title}</small><h2>${rider.nickname}</h2><p>${rider.city} · ${rider.experience}</p></div></section>
      <div class="profile-metrics">${metric(rider.rides90d, '近 90 天骑行')}${metric(`${rider.longestKm} km`, '最长距离')}${metric(`${rider.elevationM} m`, '累计爬升')}</div>
      <div class="menu-list"><button data-action="route" data-route="profile-edit"><span>骑行资料</span><small>头像、昵称与紧急信息</small><b>›</b></button><button data-action="route" data-route="strava"><span>Strava 授权</span><small>已连接，数据同步正常</small><b>›</b></button><button data-action="route" data-route="capability-card"><span>公开骑行名片</span><small>近 90 天能力指标</small><b>›</b></button><button data-action="route" data-route="settings"><span>设置</span><small>版本日志与隐私设置</small><b>›</b></button></div>`,

    settings: () => `${pageHead('设置', '设置与升级日志', '授权、隐私与版本信息')}
      <section class="prototype-card settings-status"><div><small>Strava 状态</small><b>已连接，可重新授权或解绑</b></div><button data-action="route" data-route="strava">管理</button></section>
      <div class="menu-list compact"><button data-action="toast" data-message="缓存已清理"><span>清理本地缓存</span><b>›</b></button><button data-action="toast" data-message="隐私说明已打开"><span>隐私说明</span><b>›</b></button></div>
      <h3 class="section-label">最近更新</h3><div class="release-list">${releaseNotes.map(([version, title], index) => `<article><span>${index ? '历史版本' : '当前版本'}</span><b>${version}</b><p>${title}</p></article>`).join('')}</div>`,

    'capability-card': () => `<article class="capability-card"><header><span>此里骑行能力名片</span><b>CILI RIDER</b></header><div class="capability-person"><div class="rider-avatar large">风</div><div><small>${rider.title}</small><h2>${rider.nickname}</h2><p>${rider.city}</p></div></div><div class="capability-metrics">${metric(rider.rides90d, '近 90 天次数')}${metric(`${rider.longestKm} km`, '最长距离')}${metric(`${rider.speedKmh}`, '加权均速 km/h')}${metric(`${rider.elevationM} m`, '累计爬升')}</div><footer><span>STRAVA 数据已同步</span><small>更新于 2026.10.12</small></footer></article>${button('分享骑行名片', 'toast', 'button-primary button-full').replace('data-action="toast"', 'data-action="toast" data-message="已生成分享卡片"')}`,

    'profile-edit': () => `${pageHead('骑行资料', '编辑报名身份', '隐私字段只用于活动安全保障')}
      <div class="avatar-editor"><div class="rider-avatar large">风</div><button data-action="toast" data-message="已打开头像选择器">更换头像</button></div>
      <section class="prototype-card form-section">${field('昵称', rider.nickname)}${field('所在城市', rider.city)}${field('手机号', rider.phone)}${field('骑行经验', rider.experience)}${field('紧急联系人', '已填写 · 仅管理员可见')}</section>
      <p class="privacy-note">真实姓名、手机号和紧急联系人不会出现在公开名片中。</p>${button('保存资料', 'save-profile', 'button-primary button-full')}`,

    'admin-activity-list': () => `${pageHead('管理员', '活动管理', '发布、编辑活动并处理报名审核')}
      <div class="admin-toolbar"><div class="prototype-segments"><button class="is-active">全部</button><button>进行中</button><button>已结束</button></div>${button('新建活动', 'route', 'button-primary').replace('data-action="route"', 'data-action="route" data-route="admin-activity-edit"')}</div>
      <div class="admin-list">${activities.map((activity, index) => `<article><div><span>${index ? '草稿' : '已发布'}</span><small>${activity.date} · ${activity.time}</small></div><h3>${activity.title}</h3><p>${activity.distanceKm} km · ${activity.elevationM} m · ${activity.occupied}/${activity.capacity} 人</p><div class="inline-actions"><button data-action="route" data-route="admin-activity-edit">编辑</button><button data-action="route" data-route="admin-reviews">审核报名</button></div></article>`).join('')}</div>`,

    'admin-activity-edit': () => `${pageHead('管理员', '编辑活动', '秋日环湖耐力骑 · 草稿自动保存')}
      <section class="prototype-card form-section">${field('活动标题', primary.title)}${field('开始时间', '2026-10-17 07:30')}${field('集合地点', `${primary.start} · 已选择地图点位`)}${field('线路', primary.route)}<div class="field-grid">${field('里程', `${primary.distanceKm} km`)}${field('爬升', `${primary.elevationM} m`)}</div>${field('难度', primary.level)}${field('人数上限', `${primary.capacity} 人`)}${field('活动费用', primary.fee)}${field('活动照片', '3 张 · 首张作为详情背景')}</section>
      <div class="button-pair">${button('保存草稿', 'toast', 'button-outline').replace('data-action="toast"', 'data-action="toast" data-message="草稿已保存"')}${button('发布活动', 'publish-activity', 'button-primary')}</div>`,

    'admin-reviews': () => `${pageHead('管理员', '报名审核', `${primary.title} · 2 人待审核`)}
      <div class="prototype-segments"><button class="is-active">待审核 2</button><button>已通过 18</button><button>已驳回 1</button></div>
      <div class="review-list"><button data-action="route" data-route="admin-review-detail"><div class="rider-avatar">风</div><div><small>稳定骑行 · 自行前往</small><h3>${rider.nickname}</h3><p>${rider.rides90d} 次 / ${rider.longestKm} km / 均速 ${rider.speedKmh} km/h</p></div><b>待审核</b></button><button data-action="route" data-route="admin-review-detail"><div class="rider-avatar">北</div><div><small>新手 · 自行前往</small><h3>小北</h3><p>6 次 / 42 km / 均速 21.3 km/h</p></div><b>待审核</b></button></div>`,

    'admin-review-detail': () => `${pageHead('管理员', '审核详情', `${primary.title} · 报名编号 REG-1017-018`)}
      <section class="review-profile"><div class="rider-avatar large">风</div><div><small>${rider.title}</small><h2>${rider.nickname}</h2><p>${rider.phone} · ${rider.city}</p></div><span>待审核</span></section>
      <div class="capability-metrics review-metrics">${metric(rider.rides90d, '90 天次数')}${metric(`${rider.longestKm} km`, '最长距离')}${metric(`${rider.speedKmh}`, '加权均速')}${metric(`${rider.elevationM} m`, '累计爬升')}</div>
      <section class="prototype-card review-facts"><div><span>集合方式</span><b>自行前往</b></div><div><span>骑行经验</span><b>${rider.experience}</b></div><div><span>紧急联系人</span><b>已填写</b></div></section>
      ${field('审核意见', '<span class="placeholder">填写通过或驳回原因（选填）</span>', 'review-note')}
      <div class="button-pair">${button('驳回报名', 'reject-review', 'button-outline')}${button('通过报名', 'approve-review', 'button-primary')}</div>`,
  };

  window.pageTemplates = templates;
})();
