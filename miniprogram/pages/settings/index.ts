import { setTheme, syncPageTheme } from '../../services/theme-service';

const RELEASE_NOTES = [
  {
    version: '2026.10.08.3',
    date: '2026-10-08',
    title: '头像默认展示与资料编辑简化',
    summary: '头像默认用于报名骑友展示，资料编辑页移除不再需要的展示设置。',
    latest: true,
    features: [
      '已有和新设置的有效头像默认展示在报名骑友列表',
      '移除头像展示开关，头像用途改为固定说明',
      '移除资料编辑页的展示身份与展示称号区块',
    ],
  },
  {
    version: '2026.10.08.2',
    date: '2026-10-08',
    title: '个人中心与骑友头像升级',
    summary: '个人中心减少常驻状态信息，下拉刷新和报名骑友头像反馈更加明确。',
    latest: false,
    features: [
      '骑行名片默认完整展示，资料完整后自动隐藏完整度',
      '下拉刷新时集中展示更新时间、进度与结果',
      '报名骑友始终显示头像图片，真实头像不可用时使用品牌默认头像',
    ],
  },
  {
    version: '2026.10.08.1',
    date: '2026-10-08',
    title: '编辑式骑行界面升级',
    summary: '核心页面以真实骑行内容和关键数据重新组织，活动浏览与报名判断更加直接。',
    latest: false,
    features: [
      '活动列表突出下一场主活动，并压缩后续活动信息',
      '活动详情前置路线数据、报名状态与截止时间',
      '个人中心分离骑手照片、90 天能力数据和服务入口',
      '保留深浅主题、无障碍触控尺寸与原有业务流程',
    ],
  },
  {
    version: '2026.10.02.3',
    date: '2026-10-02',
    title: '骑行名片连接 Strava 主页',
    summary: '骑行名片补充 Strava 累计数据与主页入口，近期和长期表现更容易查看。',
    latest: false,
    features: [
      '新增累计里程、骑行次数、移动时间与累计爬升',
      '保留近 90 天骑行表现，区分长期积累与近期状态',
      '支持复制本人 Strava 主页链接并在浏览器打开',
      '明确展示数据覆盖范围与最近同步时间',
    ],
  },
  {
    version: '2026.10.02.2',
    date: '2026-10-02',
    title: '主题切换与视觉可读性优化',
    summary: '深色模式切换更稳定，报名提示和骑行名片信息更易阅读。',
    latest: false,
    features: [
      '减少深色主题快速切换 Tab 时的重复重绘与白底闪烁',
      '提升报名步骤、辅助提示和骑行名片说明文字的可读性',
      '为卡片入场与按压反馈补充“减少动态效果”适配',
    ],
  },
  {
    version: '2026.10.02.1',
    date: '2026-10-02',
    title: '报名体验与骑友互动升级',
    summary: '报名、候补、组队和现场核销链路更加完整，骑友信息展示也更清晰。',
    latest: false,
    features: [
      '点击已报名骑友头像可查看公开骑行名片',
      '活动满员后支持候补排队与自动补位提醒',
      '新增扫码核销、活动海报和邀请组队能力',
      '统一关键交互尺寸与文案，后续升级内容持续在设置页同步',
    ],
  },
  {
    version: '2026.10.01.3',
    date: '2026-10-01',
    title: '设置中心上线',
    summary: '常用偏好与版本变化集中管理，个人中心更轻、更聚焦。',
    latest: false,
    features: ['“我的”右上角新增设置入口', '深浅主题切换收口到设置页', '新增可追溯的功能升级日志'],
  },
  {
    version: '2026.10.01.2',
    date: '2026-10-01',
    title: '双主题与界面升级',
    summary: '保留默认深色竞技风格，同时提供更适合户外强光的浅色模式。',
    latest: false,
    features: [
      '13 个核心页面统一语义色彩',
      '同步导航栏、TabBar 与页面背景',
      '优化按钮触控尺寸与文字对比度',
    ],
  },
  {
    version: '2026.10.01.1',
    date: '2026-10-01',
    title: '资料与报名稳定性升级',
    summary: '强化个人资料缓存、图片生命周期和活动数据时序。',
    latest: false,
    features: [
      '个人资料优先展示稳定缓存',
      '修复图片缓存与页面失效竞态',
      '完善活动审批时间和 Strava 超时处理',
    ],
  },
] as const;

Page({
  data: {
    theme: 'dark',
    themeClass: 'theme-dark',
    releaseNotes: RELEASE_NOTES,
  },
  onShow() {
    syncPageTheme(this);
  },
  switchTheme(event: { currentTarget?: { dataset?: { theme?: unknown } } }) {
    const theme = setTheme(event.currentTarget?.dataset?.theme);
    syncPageTheme(this);
    wx.showToast?.({
      title: theme === 'light' ? '已切换浅色模式' : '已切换深色模式',
      icon: 'none',
    });
  },
});
