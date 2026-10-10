import type { StravaReadiness } from '../../models';
import { runPageTask } from '../../services/page-service';
import { rideService } from '../../services/ride-service';

const RELEASE_NOTES = [
  {
    version: '2026.10.10.19',
    date: '2026-10-10',
    title: '资料编辑与骑行名片可读性补强',
    summary: '补齐第二批页面残留的浅底低对比文字，修正骑行名片同步按钮的无效颜色。',
    latest: true,
    features: [
      '资料编辑页步骤小标题与头像占位文字改为深色高对比墨色',
      '骑行名片「同步」按钮文字颜色改用有效主题色，不再依赖未定义变量',
      '延续上一版浅底可读性收口，深色照片名片与媒体面保持不变',
    ],
  },
  {
    version: '2026.10.10.18',
    date: '2026-10-10',
    title: '明亮界面可读性与日志收敛',
    summary: '修复多页浅底上荧光色与近白文字看不清的问题，升级日志只展示最近 5 条。',
    latest: false,
    features: [
      '报名、活动详情、我的行程、管理端等页面的荧光黄文案改为深色高对比墨色',
      '错误重试、选点、重新授权等按钮文字在浅底上清晰可读',
      '设置页功能升级日志仅保留最近 5 条，历史记录在代码与 Git 中留存',
    ],
  },
  {
    version: '2026.10.10.17',
    date: '2026-10-10',
    title: '代码格式与门禁对齐',
    summary: '按 Prettier 规则重新格式化本轮产品代码，不改变运行行为。',
    latest: false,
    features: [
      '个人中心头像预览、单背景槽位和明亮主题相关文件通过格式门禁',
      '保持 CI 的 `format:check` 与 `check:release-notes` 一致',
    ],
  },
  {
    version: '2026.10.10.16',
    date: '2026-10-10',
    title: '个人中心头像可预览',
    summary: '个人中心头像补齐点击预览，非法或缺失图片 fail closed。',
    features: [
      '点击头像使用微信原生预览查看大图',
      '仅接受合法 HTTPS 临时 URL，cloud://、http:// 或空值不触发预览',
      '保留原有背景图预览和 aria-label 可读性',
    ],
  },
  {
    version: '2026.10.10.15',
    date: '2026-10-10',
    title: '个人背景图单槽位协议',
    summary: '客户端改用 background_photo 单槽位，不再静默截断历史相册。',
    features: [
      '编辑资料页只写 background_photo 槽位，服务端拒绝新旧协议混用',
      '存量多图账号打开后，历史相册只读保留，不会在首次保存时丢失',
      '个人中心与管理员审核均用新槽位做媒体引用判定',
    ],
  },
  {
    version: '2026.10.10.14',
    date: '2026-10-10',
    title: '报名凭证页统一明亮主题',
    summary: '清理报名凭证页深色硬编码色，所有文字与控件回到明亮 token。',
    features: [
      '活动名称、报名凭证、集合信息、时间线文字对比度全面达标',
      '"已通过"胶囊与审批意见改为明亮描边与可读灰字',
      '底部"取消报名"按钮使用统一 48px 控件高度与硬阴影描边',
    ],
  },
  {
    version: '2026.10.10.13',
    date: '2026-10-10',
    title: '活动地图选点恢复',
    summary: '补齐活动起终点选点失败提示和保存竞态保护。',
    features: [
      '取消选点不再误报错误，系统定位关闭时给出明确恢复指引',
      '接口或隐私配置异常时提示管理员检查后台配置',
      '选点与保存互斥，避免晚到坐标覆盖已提交表单',
    ],
  },
  {
    version: '2026.10.10.12',
    date: '2026-10-10',
    title: 'Strava 状态读取恢复',
    summary: '兼容云数据库明确的缺记录响应，已连接账号可正常读取授权状态。',
    latest: false,
    features: [
      '没有历史授权尝试记录时不再误报服务暂时不可用',
      '仅兼容平台明确标记为文档不存在的响应，其他数据库错误继续失败关闭',
      '已连接凭证、骑行快照与授权恢复动作保持原有安全语义',
    ],
  },
  {
    version: '2026.10.10.11',
    date: '2026-10-10',
    title: 'Strava 状态诊断增强',
    summary: '增强授权状态故障的服务端阶段诊断，保持用户侧错误信息简洁且不泄露敏感数据。',
    latest: false,
    features: [
      '授权状态失败时记录清理或读取阶段，缩短异常定位时间',
      '诊断日志仅保留稳定错误码，不记录账号、令牌或数据库错误正文',
      '用户侧继续显示统一恢复提示，既有授权与解绑流程保持不变',
    ],
  },
  {
    version: '2026.10.10.10',
    date: '2026-10-10',
    title: '统一明亮界面',
    summary: '移除旧版深浅主题分叉，首批核心页面统一为适合户外阅读的明亮高对比界面。',
    latest: false,
    features: [
      '活动、详情、创建、行程、个人中心和设置统一 16px 页面边距与卡片节奏',
      '按钮和输入统一 48px 触控高度，活动筛选统一 40px 分段控件',
      '保留照片媒体层、真实业务状态、分页、授权和异常恢复能力',
    ],
  },
  {
    version: '2026.10.10.9',
    date: '2026-10-10',
    title: '我的行程完整保留',
    summary: '全部报名可稳定加载，已完成、下架或活动信息缺失的历史行程不会消失。',
    latest: false,
    features: [
      '报名超过 50 条时自动连续加载，跨页顺序稳定且不重复',
      '已完成、下架、软删和活动信息缺失的报名继续显示可解释的历史详情',
      '公开活动列表暂时不可用时不再影响我的行程，缺失活动仍可安全取消报名',
    ],
  },
  {
    version: '2026.10.10.8',
    date: '2026-10-10',
    title: '骑行名片指标恢复深色媒体面',
    summary: '修正全局浅色卡片样式覆盖名片指标的问题，核心骑行数据不再出现白字白底。',
    latest: false,
    features: [
      '指标子项显式保持透明背景，延续名片深色媒体面',
      '数值、单位与标签继续使用媒体文字色，提升户外可读性',
      '新增样式层叠契约，防止全局同名选择器再次覆盖',
    ],
  },
  {
    version: '2026.10.10.7',
    date: '2026-10-10',
    title: '浅色主题运行态可读性补强',
    summary: '根据开发者工具运行态复核，提升行程序号、活动管理标题和骑行名片指标的对比度。',
    latest: false,
    features: [
      '我的行程 RIDE 序号在浅色卡片上提升到正文级可读对比度',
      '活动管理卡片标题跟随主题正文色，不再出现浅字白底',
      '骑行名片指标使用不透明媒体底色与媒体文字色，避免浅色照片穿透',
    ],
  },
  {
    version: '2026.10.10.6',
    date: '2026-10-10',
    title: 'Strava 加入年限闰日校准',
    summary: '闰日注册的 Strava 账号在平年 2 月末按完整周年展示，不再少算一年。',
    latest: false,
    features: [
      '2 月 29 日注册的账号在平年 2 月 28 日正确计入周年',
      '周年前一天仍保持未满对应年限，避免提前增加',
      '普通日期和闰年 2 月 29 日的既有计算保持不变',
    ],
  },
  {
    version: '2026.10.10.5',
    date: '2026-10-10',
    title: '活动时间快捷选择更明确',
    summary: '依赖开始时间的相对快捷项在缺少开始时间时给出明确提示，不再静默无反应。',
    latest: false,
    features: [
      '“开始后 4 小时”“开始前 1 天 20:00”在未填开始时间时提示先选择开始时间',
      '相对快捷项跨月、跨年与跨天计算保持正确，无时间漂移',
      '快捷填入的日期时间可正常随活动创建或编辑保存',
    ],
  },
  {
    version: '2026.10.10.4',
    date: '2026-10-10',
    title: '浅色主题全页可读性升级',
    summary: '统一输入、状态、卡片与辅助文案的语义色彩，提升浅色模式下的全页对比度。',
    latest: false,
    features: [
      '个人中心、资料编辑、我的行程、活动详情与活动卡片统一高对比文字层级',
      '输入占位符、错误提示、禁用操作与状态徽标使用可读语义色',
      '补齐活动编辑、报名、凭证与骑行名片等风险页面的浅色主题保护',
    ],
  },
  {
    version: '2026.10.10.3',
    date: '2026-10-10',
    title: '活动管理分页稳定性升级',
    summary: '活动管理列表支持稳定分批加载，并隔离快速刷新、筛选与加载更多的迟到响应。',
    latest: false,
    features: [
      '活动超过 100 条时可持续加载，不遗漏同一开始时间的活动',
      '管理员与成员过滤在数据库分页前生效，旧草稿仍可安全查看',
      '刷新、筛选与加载更多使用单请求隔离，避免重复拼接或旧结果覆盖',
    ],
  },
  {
    version: '2026.10.10.2',
    date: '2026-10-10',
    title: 'Strava 授权生命周期安全升级',
    summary: '解绑、拒绝授权与异常恢复使用稳定服务端语义，并隔离过期授权回调。',
    latest: false,
    features: [
      '本地断开后旧授权链接无法恢复凭证，并清理不再引用的 Strava 媒体',
      '多次授权仅允许最新尝试生效，拒绝授权后不再停留在等待状态',
      '按重试、重新授权、本地断开或联系支持提供明确恢复入口',
      '本地断开不会撤销 Strava 网站中的外部授权',
    ],
  },
  {
    version: '2026.10.10.1',
    date: '2026-10-10',
    title: '活动首页时间线分页升级',
    summary: '活动首页默认展示未来与进行中活动，并可稳定分页回看历史活动。',
    latest: false,
    features: [
      '默认展示未来活动，正在进行的骑行不会提前移入历史',
      '历史活动按结束时间倒序分页，支持持续加载',
      '切换、刷新和加载更多相互隔离，迟到请求不会覆盖当前列表',
    ],
  },
  {
    version: '2026.10.09.5',
    date: '2026-10-09',
    title: '活动创建与个人体验稳定性升级',
    summary: '简化活动创建，保留历史行程，集中管理 Strava，并完善个人图片与浅色主题体验。',
    latest: false,
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

const VISIBLE_RELEASE_NOTES = RELEASE_NOTES.slice(0, 5);

Page({
  stravaStatusRequestId: 0,
  data: {
    releaseNotes: VISIBLE_RELEASE_NOTES,
    stravaLoading: true,
    stravaLoadError: '',
    stravaReadiness: null as StravaReadiness | null,
    stravaStatusText: '正在读取授权状态',
  },
  onShow() {
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
});
