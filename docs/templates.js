(() => {
  const { activities, rider, attendees, releaseNotes } = window.prototypeData;
  const primary = activities[0];
  const trip = activities[1];

  const button = (label, action, extra = '') =>
    `<button class="prototype-button ${extra}" data-action="${action}">${label}</button>`;
  const metric = (value, label) => `<span><b>${value}</b><small>${label}</small></span>`;
  const brandLogo = (meta) =>
    `<div class="prototype-brand-logo"><img src="./brand/logo-materials/generated/logo-square-1024.png" alt="此里" /><span>${meta}</span></div>`;
  const avatar = (name) =>
    `<button class="prototype-avatar" data-action="rider" data-rider="${name}"><i>${name.slice(0, 1)}</i><small>${name}</small></button>`;
  const field = (label, value, extra = '') =>
    `<label class="form-field ${extra}"><span>${label}</span><div>${value}</div></label>`;
  const pageHead = (eyebrow, title, copy = '') =>
    `<header class="prototype-head">${brandLogo(eyebrow)}<h2>${title}</h2>${copy ? `<p>${copy}</p>` : ''}</header>`;

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
            <div class="activity-card-actions">${button('查看活动详情', 'route', index ? 'button-outline' : 'button-primary').replace('data-action="route"', 'data-action="route" data-route="activity-detail"')}${index ? button('报名活动', 'route', 'button-primary').replace('data-action="route"', 'data-action="route" data-route="registration-form"') : ''}</div></div>
          </article>`,
        )
        .join('')}</div>`,

    'activity-detail': () => `<article class="unified-detail-card">
      <div class="activity-visual detail-visual">${brandLogo('活动详情')}<span class="status-chip">${primary.level}</span><small>${primary.date}</small><h2>${primary.title}</h2><span class="route-stroke"></span></div>
      <div class="unified-detail-body"><div class="detail-metrics">${metric(`${primary.distanceKm} km`, '里程')}${metric(`${primary.elevationM} m`, '爬升')}${metric(primary.estimatedRideTime, '预计骑行')}${metric(`${primary.approved} 人`, '已通过')}</div>
      <section class="detail-decision"><div><small>报名状态</small><strong>${primary.status}</strong><p>可查看行程与活动群二维码</p></div><span><b>${primary.capacity}</b> 名额</span></section>
      <section class="black-ticket"><small>集合时间</small><strong>${primary.time}</strong><h3>${primary.start}</h3><p>请提前 10 分钟到达，完成车辆检查。</p><button data-action="toast" data-message="已打开集合点导航">导航</button></section>
      <section class="route-actions-card official-route-card"><div class="detail-section-heading"><div><b>Strava 官方路线</b><small>公开路线</small></div></div><p>查看组织者分享的公开路线，无需连接 Strava 账号。</p>${button('查看官方路线', 'route', 'button-primary button-full').replace('data-action="route"', 'data-action="route" data-route="route-view"')}</section>
      <section class="route-actions-card gpx-route-card"><div class="detail-section-heading"><div><b>${primary.routeName}</b><small>GPX 路线详情</small></div></div>
        <div class="route-native-metrics">${metric(`${primary.distanceKm} km`, '距离')}${metric(`${primary.elevationM} m`, '爬升')}${metric(`${primary.elevationLossM} m`, '下降')}${metric(`${primary.elevationMinM}–${primary.elevationMaxM} m`, '海拔')}</div>
        <div class="route-estimate"><span>此里估算</span><b>${primary.estimatedRideTime}</b></div>
        <div class="route-visual-label">路线轮廓</div><div class="route-preview-image" role="img" aria-label="${primary.routeName}路线轮廓"><i></i><span>${primary.distanceKm} KM</span></div>
        <div class="route-coordinate-list"><span><small>起点坐标</small><b>40.02, 116.47</b></span><span><small>终点坐标</small><b>40.95, 116.62</b></span></div>
        <div class="route-visual-label">海拔曲线</div><div class="route-elevation-profile" role="img" aria-label="${primary.routeName}海拔曲线"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
        <div class="gpx-download-row"><p>下载后可导入码表或骑行应用。</p><button class="is-primary" data-action="toast" data-message="GPX 下载已开始">下载 GPX</button></div>
      </section>
      <section class="detail-row"><div><b>线路信息</b><span>${primary.route}</span></div><p>全程 ${primary.distanceKm} km，爬升 ${primary.elevationM} m，建议具备长距离及连续爬升经验。</p></section>
      <section class="detail-row"><div><b>已报名人员</b><span>${primary.approved} / ${primary.capacity}</span></div><div class="avatar-row">${attendees.map(avatar).join('')}</div></section>
      <section class="group-qr-card"><div><b>活动群二维码</b><p>扫码加入活动群，出发前请留意群内通知。</p></div><button class="fake-qr" data-action="toast" data-message="活动群二维码已放大" aria-label="点击放大活动群二维码"></button></section>
      <section class="detail-row"><div><b>备注事项</b><span>${primary.fee}</span></div><p>请佩戴头盔，携带补给水、备胎和基础维修工具；雨天活动另行通知。</p></section></div></article>
      <div class="sticky-prototype-action">${button('查看我的行程', 'route', 'button-primary').replace('data-action="route"', 'data-action="route" data-route="registrations"')}</div>`,

    'route-view': () => `<section class="route-view-screen">
      <div class="route-view-status"><span>STRAVA 官方路线</span><b>公开路线</b></div>
      <div class="route-embed-shell" data-route-embed>
        <div class="route-embed-brand"><b>STRAVA</b><span>ROUTE</span></div>
        <h2>云蒙山&喇叭沟</h2><p>组织者分享的官方公开路线</p>
        <div class="route-embed-map"><span class="route-stroke"></span><i>起</i><i>终</i></div>
        <div class="route-embed-facts">${metric(`${primary.distanceKm} km`, '距离')}${metric(`${primary.elevationM} m`, '爬升')}</div>
        <button class="prototype-button button-outline button-full" data-action="toggle-route-fallback">模拟页面加载失败</button>
      </div>
      <div class="route-view-fallback" data-route-fallback hidden><small>STRAVA 官方路线</small><h2>路线暂时无法显示</h2><p>你可以复制路线链接后在浏览器或 Strava 中打开，也可以返回活动继续查看其他信息。</p><div class="button-pair"><button class="prototype-button button-primary" data-action="toast" data-message="路线链接已复制">复制路线链接</button><button class="prototype-button button-outline" data-action="route" data-route="activity-detail">返回活动</button></div></div>
      <p class="route-account-note">无需连接 Strava 账号，仅展示组织者分享的公开路线。</p>
    </section>`,

    'registration-form': () => `${pageHead('活动报名', primary.title, '第 1 步 / 共 2 步 · 确认骑行身份')}
      <div class="progress-track"><i></i></div>
      <section class="prototype-card identity-card"><div class="rider-avatar">风</div><div><small>报名身份</small><h3>${rider.nickname}</h3><p>${rider.city} · ${rider.experience}</p></div><button data-action="route" data-route="profile-edit">编辑</button></section>
      <section class="prototype-card form-section"><h3>集合方式</h3><div class="choice-grid"><button class="is-active" data-action="choice">自行前往</button><button data-action="choice">需要后援车</button></div></section>
      <section class="prototype-card form-section"><h3>骑行经验</h3><div class="choice-grid three"><button data-action="choice">新手</button><button class="is-active" data-action="choice">稳定骑行</button><button data-action="choice">进阶</button></div><p class="helper-copy">当前资料可支撑 ${primary.distanceKm} km / ${primary.elevationM} m 路线审核。</p></section>
      <label class="agreement"><input type="checkbox" checked /> 我已阅读活动说明，并确认身体状况适合参加</label>
      ${button('提交报名', 'submit-registration', 'button-primary button-full')}`,

    registrations: () => `${pageHead('此里 · 我的行程', '准时集合，轻松出发', '报名进度与出发凭证都在这里')}
      <div class="trip-summary">${metric('1', '审核中')}${metric('1', '可出发')}${metric('0', '已失效')}</div>
      <article class="trip-ticket"><div class="trip-ticket-top"><span>已通过</span><small>${trip.date}</small></div><h3>${trip.title}</h3><div class="trip-ticket-info"><div><small>集合时间</small><b>${trip.time}</b></div><div><small>集合地点</small><b>${trip.start}</b></div></div>${button('查看票据式行程凭证', 'route', 'button-outline').replace('data-action="route"', 'data-action="route" data-route="credential"')}</article>
      <article class="trip-ticket trip-ticket--pending"><div class="trip-ticket-top"><span>待审核</span><small>${primary.date}</small></div><h3>${primary.title}</h3><p>${primary.start} · ${primary.time}</p><small class="status-guidance">资料审核中，结果将在行程页同步</small></article>`,

    credential: () => `<article class="credential-ticket">
      <div class="credential-brand">${brandLogo('报名凭证')}<span>CILI-${trip.id.toUpperCase()}-012</span></div><div class="credential-status">已通过 · 准时集合</div>
      <div class="credential-main"><small>活动</small><h2>${trip.title}</h2><p>${trip.date}</p></div>
      <div class="credential-spotlight"><small>集合时间</small><strong>${trip.time}</strong><small>集合地点</small><h3>${trip.start}</h3><p>北京市门头沟区黑石头村入口</p>${button('地图导航', 'toast', 'ticket-white').replace('data-action="toast"', 'data-action="toast" data-message="已打开集合点导航"')}</div>
      <div class="credential-person"><div class="rider-avatar">风</div><div><small>报名骑手</small><b>${rider.nickname}</b><span>自行前往 · 稳定骑行</span></div></div>
      <div class="credential-code"><div class="fake-qr" aria-label="模拟签到二维码"></div><p>管理员扫码签到<br /><small>凭证编号 CILI-1017-012</small></p></div>
      <div class="credential-cut">••••••••••••••••••••••••••</div><footer>请勿转发 · 现场核验后状态更新为已签到</footer>
    </article>`,

    profile: () => `${pageHead('此里', '一起骑，去更远的地方')}
      <section class="profile-hero"><div class="rider-avatar large">风</div><div><small>${rider.title}</small><h2>${rider.nickname}</h2><p>${rider.city} · ${rider.experience}</p></div></section>
      <section class="prototype-card identity-status"><span>微信身份</span><b>已验证</b><p>报名资料与公开名片均使用当前微信身份。</p></section>
      <div class="menu-list"><button data-action="route" data-route="profile-edit"><span>报名资料</span><small>头像、昵称、性别与紧急联系人</small><b>›</b></button><button data-action="route" data-route="capability-card"><span>公开骑行名片</span><small>骑行照片和公开资料</small><b>›</b></button><button data-action="route" data-route="settings"><span>设置</span><small>版本日志与隐私设置</small><b>›</b></button></div>
      <p class="privacy-note">联系电话仅用于活动联络；紧急联系人仅在骑行安全需要时使用。</p>`,

    settings: () => `${pageHead('设置', '设置与升级日志', '隐私与版本信息')}
      <div class="menu-list compact"><button data-action="toast" data-message="缓存已清理"><span>清理本地缓存</span><b>›</b></button><button data-action="toast" data-message="隐私说明已打开"><span>隐私说明</span><b>›</b></button></div>
      <h3 class="section-label">最近更新</h3><div class="release-list">${releaseNotes.map(([version, title], index) => `<article><span>${index ? '历史版本' : '当前版本'}</span><b>${version}</b><p>${title}</p></article>`).join('')}</div>`,

    'capability-card': () => `<article class="capability-card profile-only-card"><header><span>此里公开骑行名片</span><b>CILI RIDER</b></header><div class="rider-photo-panel"><div class="route-stroke"></div><span>骑行照片</span></div><div class="capability-person"><div class="rider-avatar large">风</div><div><small>${rider.title}</small><h2>${rider.nickname}</h2><p>${rider.city}</p></div></div><div class="profile-fact-grid"><span><small>骑行经验</small><b>${rider.experience}</b></span><span><small>公开范围</small><b>活动中公开</b></span></div><footer><span>照片与资料名片</span><small>不含第三方账号数据</small></footer></article>${button('添加个人骑行照片', 'toast', 'button-outline button-full').replace('data-action="toast"', 'data-action="toast" data-message="已打开骑行照片选择器"')}`,

    'profile-edit': () => `${pageHead('骑行资料', '编辑报名身份', '隐私字段只用于活动安全保障')}
      <div class="avatar-editor"><div class="rider-avatar large">风</div><button data-action="toast" data-message="已打开头像选择器">更换头像</button></div>
      <section class="prototype-card form-section">${field('昵称', rider.nickname)}${field('所在城市', rider.city)}${field('手机号', rider.phone)}${field('骑行经验', rider.experience)}${field('紧急联系人', '已填写 · 仅管理员可见')}</section>
      <p class="privacy-note">真实姓名、手机号和紧急联系人不会出现在公开名片中。</p>${button('保存资料', 'save-profile', 'button-primary button-full')}`,

    'admin-activity-list': () => `${pageHead('管理员', '活动管理', '发布、编辑活动并处理报名审核')}
      <div class="admin-toolbar"><div class="prototype-segments"><button class="is-active">全部</button><button>已下架</button><button>已上线</button><button>已结束</button></div>${button('新建活动', 'route', 'button-primary').replace('data-action="route"', 'data-action="route" data-route="admin-activity-edit"')}</div>
      <div class="admin-list">${activities.map((activity) => `<article><div><span>${activity.adminStatus}</span><small>${activity.date} · ${activity.time}</small></div><h3>${activity.title}</h3><p>${activity.distanceKm} km · ${activity.elevationM} m · ${activity.approved}/${activity.capacity} 人</p><div class="inline-actions"><button data-action="route" data-route="admin-activity-edit">编辑</button><button data-action="route" data-route="admin-reviews">审核报名</button><button data-action="toast" data-message="${activity.adminStatus === '已上线' ? '活动已下架' : '活动已上线'}">${activity.adminStatus === '已上线' ? '下架' : '上线'}</button></div></article>`).join('')}</div>`,

    'admin-activity-edit': () => `${pageHead('管理员', '编辑活动', `${primary.title} · 草稿自动保存`)}
      <section class="prototype-card form-section">${field('活动标题', primary.title)}${field('开始时间', `2026-10-18 · ${primary.time}`)}${field('集合地点', `${primary.start} · 已选择地图点位`)}${field('备注说明', '集合提醒、补给安排和车辆检查')}</section>
      <section class="route-editor-section"><div class="route-editor-heading"><span>01</span><div><b>Strava 官方路线（可选）</b><small>这里只保存公开路线链接</small></div></div><div class="route-input">粘贴公开路线链接</div><div class="button-pair"><button data-action="toast" data-message="官方路线已添加">添加官方路线</button><button data-action="route" data-route="route-view">查看官方路线</button></div><p>已添加。参与者可查看 Strava 官方路线。</p><small>如需在活动中展示海拔曲线和完整数据，请继续上传 GPX。</small></section>
      <section class="route-editor-section route-editor-section--gpx"><div class="route-editor-heading"><span>02</span><div><b>GPX 路线详情（推荐）</b><small>原生数据 · 可下载文件</small></div></div><p>上传后可展示里程、爬升、海拔曲线和路线图，参与者也可下载原文件。</p><button class="gpx-upload-button" data-action="toast" data-message="GPX 已上传并完成解析">上传 GPX</button><div class="route-ready-panel"><div><small>路线详情已准备好</small><b>${primary.routeName}</b><span>此里估算 ${primary.estimatedRideTime}</span></div><div class="route-native-metrics compact">${metric(`${primary.distanceKm} km`, '里程')}${metric(`${primary.elevationM} m`, '爬升')}${metric(`${primary.elevationLossM} m`, '下降')}${metric(`${primary.elevationMinM}–${primary.elevationMaxM} m`, '海拔')}</div><div class="route-preview-image"><i></i><span>GPX</span></div><div class="inline-actions"><button data-action="toast" data-message="已打开 GPX 选择器">更换 GPX</button><button data-action="toast" data-message="路线详情已移除">移除路线详情</button><button data-action="toast" data-message="已设为活动背景">设为活动背景</button></div></div></section>
      <section class="prototype-card form-section">${field('人数上限', `${primary.capacity} 人`)}${field('活动群二维码', '已上传 · 点击替换')}</section>
      <div class="button-pair">${button('保存草稿', 'toast', 'button-outline').replace('data-action="toast"', 'data-action="toast" data-message="草稿已保存"')}${button('发布活动', 'publish-activity', 'button-primary')}</div>`,

    'admin-reviews': () => `${pageHead('管理员', '报名审核', `${primary.title} · 2 人待审核`)}
      <div class="prototype-segments"><button class="is-active">待审核 2</button><button>已通过 18</button><button>已驳回 1</button></div>
      <div class="review-list"><button data-action="route" data-route="admin-review-detail"><div class="rider-avatar">风</div><div><small>稳定骑行 · 自行前往</small><h3>${rider.nickname}</h3><p>报名资料已填写 · 骑行照片 2 张</p></div><b>待审核</b></button><button data-action="route" data-route="admin-review-detail"><div class="rider-avatar">北</div><div><small>新手 · 自行前往</small><h3>小北</h3><p>报名资料已填写 · 使用默认头像</p></div><b>待审核</b></button></div>`,

    'admin-review-detail': () => `${pageHead('管理员', '审核详情', `${primary.title} · 报名编号 REG-1017-018`)}
      <section class="review-profile"><div class="rider-avatar large">风</div><div><small>${rider.title}</small><h2>${rider.nickname}</h2><p>${rider.phone} · ${rider.city}</p></div><span>待审核</span></section>
      <div class="review-photo-strip"><div>骑行照片</div><div>公开头像</div></div>
      <section class="prototype-card review-facts"><div><span>集合方式</span><b>自行前往</b></div><div><span>骑行经验</span><b>${rider.experience}</b></div><div><span>紧急联系人</span><b>已填写</b></div><p>资料仅用于本次活动审核，不包含第三方账号数据。</p></section>
      ${field('审核意见', '<span class="placeholder">填写通过或驳回原因（选填）</span>', 'review-note')}
      <div class="button-pair">${button('驳回报名', 'reject-review', 'button-outline')}${button('通过报名', 'approve-review', 'button-primary')}</div>`,
  };

  window.pageTemplates = templates;
})();
