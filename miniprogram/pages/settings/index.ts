import type { StravaReadiness } from '../../models';
import { runPageTask } from '../../services/page-service';
import { rideService } from '../../services/ride-service';
import { setTheme, syncPageTheme } from '../../services/theme-service';

const RELEASE_NOTES = [
  {
    version: '2026.10.09.5',
    date: '2026-10-09',
    title: '活动创建与个人体验稳定性升级',
    summary: '简化活动创建，保留历史行程，集中管理 Strava，并完善个人图片与浅色主题体验。',
    latest: true,
    features: [
      '活动创建区分日常与精品局，支持日期时间和地点快捷选择',
      '必填遗漏通过弹窗、顶部摘要、字段高亮和自动定位同步提醒',
      '已完成或下架活动继续保留在用户行程中',
      '个人背景图限制为一张，头像和背景图均可点击预览',
      '设置页集中处理 Strava 重新授权、解绑与授权异常恢复',
    ],
  },
  {
    version: '2026.10.09.4',
    date: '2026-10-09',
    title: '活动创建分为日常与精品局',
    summary: '日常活动精简到最少报名信息，精品局按需展开后援车与日程，错误提示可就近定位。',
    latest: false,
    features: [
      '创建活动可选择“日常活动”或“精品局活动”，按类型展示必需信息',
      '必填遗漏通过弹窗、顶部摘要、字段高亮和自动定位同步提醒',
      'Strava 路线权限不足时提供重新授权入口并强制确认读取权限',
    ],
  },
  {
    version: '2026.10.09.3',
    date: '2026-10-09',
    title: '活动首页区分未来与历史活动',
    summary: '活动首页新增时间筛选，默认聚焦未来活动，历史活动按最近结束优先展示。',
    latest: false,
    features: [
      '活动首页新增“未来活动”和“历史活动”双入口，切换时同步更新标题与列表',
      '未来活动按开始时间正序展示，进行中的活动仍保留在未来活动中',
      '历史活动按开始时间倒序展示，并提供独立空状态提示',
    ],
  },
  {
    version: '2026.10.09.2',
    date: '2026-10-09',
    title: '个人中心聚焦近期骑行与 STRAVA 年限',
    summary: '个人中心仅展示近 90 天骑行数据，并按 Strava 注册年份展示加入年限。',
    latest: false,
    features: [
      '个人中心移除累计骑行指标，只保留近 90 天里程、次数、最长、爬升与均速',
      '连接 Strava 后展示“加入 STRAVA N 年”，0 年显示未满 1 年',
      '注册时间为 Strava 辅助数据，获取失败不影响 90 天同步与报名资格',
    ],
  },
  {
    version: '2026.10.09.1',
    date: '2026-10-09',
    title: '报名与活动信息简化',
    summary: '移除条码与扫码核销，报名明确标注性别，活动编辑补齐日程与费用明细。',
    latest: false,
    features: [
      '报名凭证与审批详情均展示性别，现场由管理员手动确认签到',
      '活动编辑支持日程行编辑与费用包含、费用不包含清单',
      '个人名片与骑友卡按性别区分视觉，且始终保留文字标签',
    ],
  },
  {
    version: '2026.10.08.5',
    date: '2026-10-08',
    title: '浅色高对比视觉系统',
    summary: '浅色模式统一为白、黑灰与克制橙色，修正文字、居中、日期换行和操作可读性。',
    latest: false,
    features: [
      '统一活动、行程、个人中心、表单与管理页面的浅色视觉层级',
      '修正页面导航栏、指标、按钮和标题的视觉居中',
      '提升次级文字、输入控件和日期信息在窄屏下的可读性',
    ],
  },
  {
    version: '2026.10.08.4',
    date: '2026-10-08',
    title: '骑行名片与浅色主题校准',
    summary: '个人中心补齐累计骑行数据，并修正刷新反馈和浅色主题状态配色。',
    latest: false,
    features: [
      '个人中心同时展示 Strava 累计骑行与近 90 天表现',
      '避免离开页面后的旧刷新结果覆盖当前状态',
      '统一状态标签、无图详情和禁用按钮的浅色主题对比度',
    ],
  },
  {
    version: '2026.10.08.3',
    date: '2026-10-08',
    title: '头像默认展示与资料编辑简化',
    summary: '头像默认用于报名骑友展示，资料编辑页移除不再需要的展示设置。',
    latest: false,
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

const stravaStatusText = (readiness: StravaReadiness | null) => {
  if (!readiness) return '暂时无法读取授权状态';
  if (readiness.state === 'ready') return '已连接，可重新授权或解绑';
  if (readiness.state === 'authorizing') return '等待在浏览器完成授权';
  if (readiness.state === 'syncing') return '授权成功，正在准备骑行数据';
  if (readiness.state === 'failed') return readiness.error?.message || '授权异常，请重新授权';
  return '未连接 Strava';
};

Page({
  stravaStatusRequestId: 0,
  data: {
    theme: 'dark',
    themeClass: 'theme-dark',
    releaseNotes: RELEASE_NOTES,
    stravaLoading: true,
    stravaLoadError: '',
    stravaReadiness: null as StravaReadiness | null,
    stravaStatusText: '正在读取授权状态',
  },
  onShow() {
    syncPageTheme(this);
    void this.loadStravaStatus();
  },
  onHide() {
    this.stravaStatusRequestId += 1;
  },
  onUnload() {
    this.stravaStatusRequestId += 1;
  },
  async loadStravaStatus() {
    const requestId = ++this.stravaStatusRequestId;
    this.setData({ stravaLoading: true, stravaLoadError: '' });
    const status = await runPageTask(() => rideService.getStravaReadiness(), 'Strava 状态加载失败');
    if (requestId !== this.stravaStatusRequestId) return;
    if (!status.data) {
      this.setData({
        stravaLoading: false,
        stravaLoadError: status.error,
        stravaReadiness: null,
        stravaStatusText: '暂时无法读取授权状态',
      });
      return;
    }
    this.setData({
      stravaLoading: false,
      stravaLoadError: '',
      stravaReadiness: status.data,
      stravaStatusText: stravaStatusText(status.data),
    });
  },
  openStrava(event: { currentTarget?: { dataset?: { action?: unknown } } }) {
    const action = event.currentTarget?.dataset?.action;
    const query = action === 'reauthorize' ? '?reauthorize=1' : '';
    wx.navigateTo({ url: `/pages/strava/index${query}` });
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
