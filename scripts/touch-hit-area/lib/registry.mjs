// 触控热区门禁 · 目标清单与豁免证据登记表。
//
// 设计原则：
// 1. required 条目 = 面向用户的可点控件；有效命中（视觉盒 + 透明命中层）≥44 CSS px。
// 2. exemption 条目 = 原生外壳 / 禁用态 / 纯展示徽章；每条必须带可复核证据来源，
//    证据不成立时测试直接失败，禁止以“视觉很小但无关紧要”为由放宽断言。
// 3. base 声明支持 rpx 数值、px 数值、app.wxss page 块令牌 var(--token)。
// 4. overlay = 透明命中层扩张（固定 CSS px，不随 rpx 缩放）；v=纵向，h=横向。

export const REQUIRED_TARGETS = [
  // ---------- 小程序：全局共享控件（miniprogram/app.wxss） ----------
  {
    id: 'global-primary-button',
    scope: 'miniprogram',
    selector:
      'button, .btn, .secondary, .button, .map-button, .photo-button, .photo-action, .route-action, .profile-alert-action, .meeting-location__action, .text-button, .image-action',
    files: ['miniprogram/app.wxss'],
    axis: 'v',
    base: { kind: 'token', token: '--control-height' },
    overlay: { v: 4, h: 0 },
    rationale:
      '主按钮 / 次级按钮 / 行内文字按钮 / 图片操作；96rpx 在 340px 窄屏 = 43.52px，低于 44px 下限。',
  },
  {
    id: 'global-segment-control',
    scope: 'miniprogram',
    selector: '.step, .segment, .timeline-tab, .status-filter, .filter-tab',
    files: ['miniprogram/app.wxss'],
    axis: 'v',
    base: { kind: 'token', token: '--segment-height' },
    overlay: { v: 4, h: 0 },
    rationale: '分段/筛选三列控件；92rpx 在 340px = 41.71px，仅做纵向扩张，避免相邻列横向抢点击。',
  },

  {
    id: 'global-action-bearing',
    scope: 'miniprogram',
    selector:
      '.load-more, .submit-button, .back-button, .cancel-button, .delete-button, .delete-record-button, .trip-action, .club-admin-action, .club-admin-retry, .club-manage-btn, .chapterhead-action, .consent-primary, .consent-later, .permission-card-action, .permission-reset, .save-action, .profile-progress-action, .profile-status-action, .profile-permission, .route-upload-button, .route-link-plus, .route-source-conn-link, .row.rowlink.rowbutton, .start-navigation-button, .refresh-error, .activity-retry, .club-profile-retry, .club-media-btn, .club-cover-remove, .club-profile-submit, .strava-cta, .ticket, .paper, .rider, .swipe-delete, .story, .activity-row, .background-placeholder',
    files: ['miniprogram/app.wxss'],
    axis: 'v',
    base: { kind: 'bearing', min: 44 },
    overlay: { v: 0, h: 0 },
    rationale:
      '非沸点契约锁定主按钮的可点操作/行卡由真实宿主节点以 --touch-target-min（44px）承载 min-height；固定 CSS px 不随 rpx 缩放，不改字号/字色/背景；图标型小钮另补 min-width。契约锁定 var(--control-height) 的主按钮由 global-primary-button 窄屏 media 兜底覆盖。',
  },
  {
    id: 'global-segment-bearing',
    scope: 'miniprogram',
    selector: '.step, .segment, .timeline-tab, .status-filter, .filter-tab',
    files: ['miniprogram/app.wxss'],
    axis: 'v',
    base: { kind: 'bearing', min: 44 },
    overlay: { v: 0, h: 0 },
    rationale: '分段/筛选真实宿主节点 min-height:44px 承载；仅纵向，避免相邻列横向互抢。',
  },

  // ---------- 小程序：页面本地控件 ----------
  {
    id: 'admin-edit-choice-card',
    scope: 'miniprogram',
    selector: '.choice',
    files: ['miniprogram/pages/admin/activity-edit/index.wxss'],
    axis: 'v',
    base: { kind: 'rpx', value: 124 },
    overlay: { v: 0, h: 0 },
    sanityOnly: true,
    rationale: '报名模式双选卡片；124rpx 三宽度均 ≥44px，仅防回归，不需要命中层。',
  },
  {
    id: 'admin-edit-image-action',
    scope: 'miniprogram',
    selector: '.image-action',
    files: ['miniprogram/pages/admin/activity-edit/index.wxss'],
    axis: 'v',
    base: { kind: 'rpx', value: 88 },
    overlay: { v: 4, h: 0 },
    rationale: '封面“设为封面/删除”等图片操作条；88rpx 在 340px = 39.90px。',
  },
  {
    id: 'admin-list-text-action',
    scope: 'miniprogram',
    selector: '.text-button',
    files: ['miniprogram/pages/admin/activity-list/index.wxss'],
    axis: 'v',
    base: { kind: 'rpx', value: 88 },
    overlay: { v: 4, h: 0 },
    rationale: '下架/驳回/克隆等文字操作；88rpx 在 340px = 39.90px。',
  },
  {
    id: 'detail-rider-authorize',
    scope: 'miniprogram',
    selector: '.rider-authorize',
    files: ['miniprogram/pages/activity-detail/index.wxss'],
    axis: 'both',
    base: { kind: 'rpx', value: 56 },
    overlay: { v: 10, h: 10 },
    rationale: '名片媒体授权小胶囊；56rpx 三宽度仅 25.4/28/32.1px，双向扩张到 44px+。',
  },
  {
    id: 'detail-dialog-close',
    scope: 'miniprogram',
    selector: '.dialog-close',
    files: ['miniprogram/pages/activity-detail/index.wxss'],
    axis: 'both',
    base: { kind: 'rpx', value: 64 },
    overlay: { v: 10, h: 10 },
    rationale: '名片弹窗右上角圆形关闭钮；64rpx 正方形仅 29/32/36.7px。',
  },
  {
    id: 'credential-tiny-button',
    scope: 'miniprogram',
    selector: '.btn.tiny',
    files: ['miniprogram/pages/credential/index.wxss'],
    axis: 'both',
    base: { kind: 'rpx', value: 56 },
    overlay: { v: 10, h: 10 },
    rationale: '凭证页“地图导航”小按钮；56rpx 三宽度均不足 44px。',
  },
  {
    id: 'registrations-tiny-button',
    scope: 'miniprogram',
    selector: '.btn.tiny',
    files: ['miniprogram/pages/registrations/index.wxss'],
    axis: 'both',
    base: { kind: 'rpx', value: 72 },
    overlay: { v: 10, h: 10 },
    rationale: '行程列表“删除记录/查看行程”小按钮；72rpx 三宽度 32.6/36/41.3px。',
  },
  {
    id: 'route-analysis-map-reset',
    scope: 'miniprogram',
    selector: '.map-reset',
    files: ['miniprogram/pages/route-analysis/index.wxss'],
    axis: 'both',
    base: { kind: 'rpx', value: 56 },
    overlay: { v: 10, h: 10 },
    rationale: '地图聚焦后的“查看全线”重置钮；56rpx 三宽度均不足 44px。',
  },
  {
    id: 'route-analysis-list-controls',
    scope: 'miniprogram',
    selector: '.anchor-item, .segment-item, .point',
    files: ['miniprogram/pages/route-analysis/index.wxss'],
    axis: 'v',
    base: { kind: 'rpx', value: 88 },
    overlay: { v: 4, h: 0 },
    rationale: '锚点横滑胶囊 / 坡段卡 / 停顿点行；88rpx 在 340px = 39.90px，纵向扩张。',
  },
  {
    id: 'settings-row-button',
    scope: 'miniprogram',
    selector: '.row.rowlink.rowbutton',
    files: ['miniprogram/pages/settings/index.wxss', 'miniprogram/app.wxss'],
    axis: 'v',
    base: { kind: 'rpx', value: 88 },
    overlay: { v: 4, h: 0 },
    rationale: '设置页整行按钮；纳入全局 button 命中层选择器覆盖，88rpx 在 340px = 39.90px。',
  },

  // ---------- 原型壳（docs/，px 口径） ----------
  {
    id: 'prototype-ra-map-markers',
    scope: 'prototype',
    selector: '.ra-map-svg .ra-mk',
    files: ['docs/templates.js', 'docs/styles.css'],
    axis: 'both',
    base: { kind: 'prototype-svg-glyph' },
    // 44×44 透明矩形（viewBox 单位）。实测最坏屏 340px：SVG 容器渲染宽约 290px、scale≈2.90，
    // 44px ≈ 15.17 单位；取 15.4 留余量。glyph 位置不动，仅热区中心按分区偏移。
    overlay: {
      v: 0,
      h: 0,
      svgHitSideUnits: 15.4,
      hitOffsets: {
        highest: { dx: 2.8, dy: 0 },
        descent: { dx: -2.8, dy: 0 },
      },
    },
    rationale:
      '路线分析地图 8 个关键点标记；视觉 glyph 直径约 12–16px，由透明 44×44 矩形提供完整命中盒；' +
      'highest/descent 中心轴差 10×10 单位，热区中心沿 x 轴反向偏移分区，保证两盒互不抢点。',
  },
  {
    id: 'prototype-icon-back-button',
    scope: 'prototype',
    selector: '.screen-container .iconbutton',
    files: ['docs/styles.css'],
    axis: 'both',
    base: { kind: 'px', value: 44 },
    overlay: { v: 0, h: 0 },
    sanityOnly: true,
    rationale: '壳层返回图标钮已是 44×44px，仅防回归。',
  },
  {
    id: 'prototype-filter-chip',
    scope: 'prototype',
    selector: '.chips .chip',
    files: ['docs/styles.css'],
    axis: 'v',
    base: { kind: 'px', value: 48 },
    overlay: { v: 0, h: 0 },
    sanityOnly: true,
    rationale: '筛选 chip 高 48px，仅防回归。',
  },
];

// 8 个关键点（与 docs/templates.js keyPoints 数组一一对应；测试会反查真实数组长度=8）。
export const EXPECTED_ROUTE_MARKER_IDS = [
  'start',
  'warm-end',
  'climb',
  'rest-1',
  'highest',
  'descent',
  'rest-2',
  'end',
];

/**
 * 豁免登记表。evidence.kind：
 * - 'wxml-no-handler'：同标签行不得出现 bindtap/catchtap/role="button"（纯展示徽章）。
 * - 'prototype-chrome'：原型演示外壳（非小程序发货控件）。
 * - 'native-system-chrome'：微信系统胶囊/状态栏等不由本代码控制的原生层。
 * - 'disabled-state'：运行时 disabled/loading 锁定态；宿主父控件仍须通过门禁。
 */
export const EXEMPTIONS = [
  {
    id: 'badge-tag-family',
    scope: 'miniprogram',
    selector:
      '.tag, .status-tag, .section-tag, .context-status, .default-choice-badge, .cover-badge, .image-count, .approved-mark, .route-ready-mark, .status-label, .required, .point-computed, .anchor-computed, .difficulty, .legend-dot',
    evidence: {
      kind: 'wxml-no-handler',
      wxmlDirs: ['miniprogram/pages'],
      note: '状态徽章 / 角标 / 计算值副标；无独立点击行为，视觉小不代表需要命中区。',
    },
  },
  {
    id: 'prototype-shell-chrome',
    scope: 'prototype',
    selector:
      '.statusbar, .systemnav, .capsule, .demo-footer, .site-header, .screen-nav-panel, .page-nav, .width-button, .step-button',
    evidence: {
      kind: 'prototype-chrome',
      note: '设计评审壳层导航与宽度切换控件，不进入小程序发货包；不纳入 44px 发货门禁。',
    },
  },
  {
    id: 'native-wechat-capsule',
    scope: 'miniprogram',
    selector: 'wechat-native-capsule-menu',
    evidence: {
      kind: 'native-system-chrome',
      note: '右上角胶囊由微信客户端提供，源码中不存在对应元素；无需也无法补热区。',
    },
  },
  {
    id: 'disabled-loading-lock',
    scope: 'miniprogram',
    selector: 'button[disabled], button[loading], .is-disabled',
    evidence: {
      kind: 'disabled-state',
      note: '禁用/上传中锁定态不响应点击；但其可启用宿主类（如 .btn.tiny）仍按 required 门禁检查。',
    },
  },
  {
    id: 'modal-backdrop-mask',
    scope: 'miniprogram',
    selector: '.modal-mask, .dialog-mask, .route-boost-mask',
    evidence: {
      kind: 'disabled-state',
      note: '遮罩层只负责关闭面板，面板内按钮（.dialog-close 等）单独过门禁，遮罩本身不计控件几何。',
    },
  },
];
