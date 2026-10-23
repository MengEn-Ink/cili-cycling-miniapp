import { CLIENT_RELEASE_VERSION } from '../../config/release';
import { repositoryCache } from '../../repositories/index';
import type { StravaRouteReadiness } from '../../repositories/types';
import { rideService } from '../../services/ride-service';
import { appStore } from '../../store/app-store';
import { clearProfilePageCache } from '../../utils/profile-page-cache';
import { clearSharedTempFileUrlCache } from '../../utils/temp-file-url';

const MAX_SUBSCRIPTION_TEMPLATES = 3;

// 顶部为当前版本且唯一 latest；设置页只渲染第一条，历史版本供发布核对。
const RELEASE_NOTES = [
  {
    version: CLIENT_RELEASE_VERSION,
    date: '2026-10-22',
    title: '骑行影像志 16 页高保真一比一验收与交互契约守护',
    summary:
      '16 页在 340 / 375 / 430 三档宽度完成逐页走查，并新增 DOM/交互契约测试守护设计稿一致性。',
    latest: true,
    features: [
      '活动、报名、凭证与管理 16 页在小屏 340px、标准 375px 与大屏 430px 下排版自洽，无横向溢出与遮挡',
      '每页建立机器可校验的 DOM/交互契约，禁止旧主题 class 回归并锁定关键 bind*/open-type 行为',
      '设置页与管理页同步校验版本号与更新说明，确保此后视觉与交互漂移会被 CI 兜底拦截',
    ],
  },
  {
    version: '2026.10.22.3',
    date: '2026-10-22',
    title: '影像志排版与设计稿逐页对齐',
    summary: '16 个核心页面统一使用设计稿的字体、颜色、间距与圆角规范。',
    latest: false,
    features: [
      '活动、报名、行程、凭证与个人资料页统一摄影编辑式标题排版',
      '设置与管理页面同步宋体标题、系统正文字体和等宽数字样式',
      'Pages 设计稿与小程序共享同一套视觉规范，后续更新不再产生视觉漂移',
    ],
  },
  {
    version: '2026.10.22.2',
    date: '2026-10-22',
    title: '骑行影像志，头像和背景合为我的名片',
    summary: '活动、资料、报名、凭证和管理页面采用更舒展的骑行影像志布局。',
    latest: false,
    features: [
      '头像与骑行背景合为「我的」顶部名片，资料编辑保留头像即时保存',
      '报名、设置与管理表单改为暖纸单列长屏，标签常驻且操作区更易触达',
      '出发凭证使用文字票据，只分享公开活动详情，不分享个人凭证信息',
      '统一界面底层样式，让影像志布局的配色与间距更一致',
    ],
  },
  {
    version: '2026.10.21.7',
    date: '2026-10-22',
    title: '活动发现与报名反馈更清晰',
    summary: '活动可快速切换紧凑浏览，详情、报名和凭证状态的信息更聚焦。',
    latest: false,
    features: [
      '活动列表新增沉浸与紧凑两种浏览方式，快速比较日期、路线和强度',
      '活动详情基于现有发布者、俱乐部与路线数据展示组织归属和难度说明',
      '报名提交增加加载、成功与失败反馈，避免重复操作',
      '报名凭证按候补、审核、通过、签到、未通过和取消状态说明下一步',
    ],
  },
  {
    version: '2026.10.21.6',
    date: '2026-10-21',
    title: '活动路线与骑友资料加载更轻快',
    summary: '活动详情聚焦关键路线指标，并复用完整路线分析；骑友头像和背景仅在本人提供后展示。',
    latest: false,
    features: [
      '活动详情移除重复的路线轮廓和海拔绘制，保留关键指标与完整路线分析入口',
      '本人可从报名卡片进入资料页选择头像和骑行背景，其他骑友缺少素材时不再显示默认图',
      '活动详情优先展示缓存并后台刷新，媒体失效仅刷新对应图片',
      '进入活动详情时预加载完整路线分析分包',
    ],
  },
  {
    version: '2026.10.21.5',
    date: '2026-10-21',
    title: '设置页集中管理 Strava 线路同步',
    summary:
      '仅管理员可在设置页统一管理 Strava 线路同步；创建活动页收敛为粘贴线路地址，本地文件补充能力隐藏在 ＋ 中。',
    latest: false,
    features: [
      '仅管理员可见「同步 Strava 线路信息」入口，普通骑友设置页不再出现相关内容',
      '创建活动页只保留 Strava 线路地址输入，若尚未连接会提示去设置完成',
      '上传本地路线文件改为路线地址旁的 ＋ 补充入口，默认不打扰',
      '活动归属默认属于唯一俱乐部，不再需要选择；报名截止自动设为活动当天零点',
    ],
  },
  {
    version: '2026.10.21.4',
    date: '2026-10-21',
    title: '路线导航与报名流程更准确',
    summary: '地图定位、活动报名与创建流程同步优化，关键信息更清晰。',
    latest: false,
    features: [
      '路线坐标统一按地图标准转换，起点可通过地名直接发起导航',
      '公开活动报名后直接成功，审核活动仍由管理员确认',
      '活动报名截止时间自动设为活动当天零点，创建时无需重复填写',
      '报名详情操作按钮留出舒适间距，避免误触',
    ],
  },
  {
    version: '2026.10.21.3',
    date: '2026-10-21',
    title: 'Strava 路线导入恢复',
    summary: '连接 Strava 后可直接粘贴官方路线链接导入 GPX，并继续支持手动上传。',
    latest: false,
    features: [
      '活动编辑页支持安全连接 Strava 并刷新授权状态',
      '粘贴 Strava 路线链接即可下载、解析并预览 GPX',
      '手动上传 GPX 继续保留，Strava 不可用时可随时降级',
    ],
  },
  {
    version: '2026.10.21.2',
    date: '2026-10-21',
    title: '俱乐部主页活动一目了然',
    summary: '俱乐部主页信息层次更清晰，并可直接查看近期骑行活动。',
    latest: false,
    features: [
      '俱乐部封面、身份与简介分区展示，重要信息更易阅读',
      '主页新增近期活动列表，日期、集合地、里程与报名状态一目了然',
      '活动加载不稳定时可单独重试，不影响查看俱乐部资料',
    ],
  },
  {
    version: '2026.10.21.1',
    date: '2026-10-21',
    title: '活动发布全流程恢复',
    summary: '修复有限名额活动无法创建的问题，并完成历史数据清理与全流程验收。',
    latest: false,
    features: [
      '有限名额活动无需填写已下线的路线终点也能正常创建和发布',
      '活动草稿、发布、报名、取消和删除链路已完成真实环境验证',
      '已结束活动及其关联报名和路线记录支持安全清理与结果回读',
    ],
  },
  {
    version: '2026.10.20.8',
    date: '2026-10-20',
    title: '出发准备与设置管理升级',
    summary: '活动填写更稳妥，路线可继续恢复，并补齐通知、隐私与安全缓存管理。',
    latest: false,
    features: [
      '活动时间填写增加校验，减少无效时间影响发布',
      '未完成的路线处理可恢复，返回后继续操作更省心',
      '设置页新增通知订阅、隐私管理和安全缓存清理',
      '优化常用数据读取与异常处理，使用更稳定顺畅',
    ],
  },
  {
    version: '2026.10.20.7',
    date: '2026-10-20',
    title: '活动详情重点信息更突出',
    summary: '活动详情重点信息更醒目，编辑预览尺寸更统一。',
    latest: false,
    features: [
      '墨黑决策块突出报名与集合重点',
      '统一路线与群二维码预览尺寸',
      '状态保留颜色和文字双提示',
    ],
  },
  {
    version: '2026.10.20.6',
    date: '2026-10-20',
    title: '唯一俱乐部主页上线',
    summary: '从“我的”直达唯一俱乐部主页，查看公开资料、当前身份与活动入口。',
    latest: false,
    features: [
      '俱乐部主页统一展示背景图、头像、名称、地区、简介和当前身份',
      '普通骑友可只读查看；平台管理员可从主页进入唯一俱乐部资料维护',
      '平台尚未创建俱乐部时显示清晰空态，多条存量数据会提示先完成迁移',
    ],
  },
  {
    version: '2026.10.20.5',
    date: '2026-10-20',
    title: '俱乐部管理更清晰',
    summary: '全平台只有一个俱乐部，管理入口聚焦唯一俱乐部的资料概览与维护。',
    latest: false,
    features: [
      '俱乐部管理入口改为唯一俱乐部资料概览，头像、名称、地区与状态一目了然',
      '平台尚未创建俱乐部时，可由管理员完成唯一一次创建，创建后只能编辑资料',
      '资料维护固定为头像、背景图与基本信息三段，多人同时保存时会给出中文提示',
    ],
  },
  {
    version: '2026.10.20.4',
    date: '2026-10-20',
    title: '骑行名片、个人中心与路线分析修复',
    summary: '名片升级为大幅海报，个人中心提示更清晰，路线分析只展示真实地点。',
    latest: false,
    features: [
      '个人中心新增“骑行名片”入口：大幅海报、压边头像与公开信息一眼看清',
      '合并个人中心重复的失败提示，只保留一次重试；俱乐部头像加载失败也有占位',
      '路线分析不再按里程虚构休息点或坐标，计算内容会明确标注为计算值',
    ],
  },
  {
    version: '2026.10.20.3',
    date: '2026-10-20',
    title: '管理端审核与活动安全修复',
    summary: '修复活动删除、报名审批和群二维码提示等管理端问题，审核更稳妥。',
    latest: false,
    features: [
      '只有草稿活动可以删除，避免待审核活动被误删而绕开审批；已驳回活动会在卡片上显示驳回原因',
      '报名审批列表显示骑友真实姓名与完整手机号，切换活动时保持当前选中；报名超过 100 人时会提示仅展示最近 100 条',
      '审批详情改用通过后生成的凭证编号、审核照片可点击放大；群二维码过期提醒改由系统统一判断，信息不足时不再误报',
    ],
  },
  {
    version: '2026.10.20.2',
    date: '2026-10-20',
    title: '报名凭证与活动详情更可靠',
    summary: '出发凭证补充退回原因和联系电话，活动详情刷新更稳，长地址和编号完整展示。',
    latest: false,
    features: [
      '报名被退回时，出发凭证会直接展示未通过原因，方便修改后重新报名',
      '凭证补充本人手机号和后援车司机联系电话，编号与长地址不再被截断',
      '活动详情返回页面时会安静刷新，网络不好可直接重试且不会清空已加载内容',
    ],
  },
  {
    version: '2026.10.19.5',
    date: '2026-10-19',
    title: '俱乐部图片上传更稳定',
    summary: '俱乐部头像和背景图在不同微信版本中都能更可靠地完成上传。',
    latest: false,
    features: [
      '头像和背景图继续使用统一的安全上传链路',
      '图片固定尺寸处理不可用时会自动切换可靠方案',
      '异常图片仍会在上传登记时校验并清理，不会写入俱乐部资料',
    ],
  },
  {
    version: '2026.10.19.4',
    date: '2026-10-19',
    title: '图片清理更可靠',
    summary: '统一图片在替换或清理时处理更稳定，减少旧图片残留和显示异常。',
    latest: false,
    features: [
      '路线预览图现在也会按统一规则完成清理',
      '活动中的俱乐部头像更新后不再保留失效图片',
      '大量旧图片会分批稳妥处理，减少清理中断和残留',
    ],
  },
  {
    version: '2026.10.19.3',
    date: '2026-10-19',
    title: '创建申请可撤回修改',
    summary: '俱乐部创建申请在审核中也能安全撤回，资料会保留为草稿继续编辑。',
    latest: false,
    features: [
      '审核中的创建申请新增撤回入口，并会在操作前再次确认',
      '撤回成功后完整保留已填资料，可修改后重新提交',
      '网络波动导致撤回失败时会保留原状态，并可直接重试',
    ],
  },
  {
    version: '2026.10.19.2',
    date: '2026-10-19',
    title: '俱乐部活动投稿与审核',
    summary: '俱乐部成员现在可以投稿活动，由负责人或管理员审核后再公开展示。',
    latest: false,
    features: [
      '成员可从活动编辑页选择已加入的俱乐部并提交审核',
      '俱乐部负责人和管理员可在活动列表通过或驳回投稿',
      '审核中的活动不会提前出现在公开活动列表',
    ],
  },
  {
    version: '2026.10.19.1',
    date: '2026-10-19',
    title: '图片上传链路全面统一',
    summary: '头像、背景、活动照片、群二维码与路线预览图现在使用同一套可靠上传流程。',
    latest: false,
    features: [
      '网络波动时会自动重试，并显示连续的上传进度',
      '活动路线预览图也会完成安全校验后再保存',
      '旧图片继续正常显示，替换图片时会自动使用新流程',
    ],
  },
  {
    version: '2026.10.18.8',
    date: '2026-10-18',
    title: '界面风格统一',
    summary: '按钮、卡片、输入框和标签采用更统一、更利落的骑行海报风格。',
    latest: false,
    features: [
      '统一朱红、米白与墨黑的界面配色，重点信息更容易辨认',
      '收紧卡片与控件圆角，页面层级更清晰',
      '路线完整分析继续保留适合地图和海拔数据的紧凑布局',
    ],
  },
  {
    version: '2026.10.18.7',
    date: '2026-10-18',
    title: '图片上传稳定性升级',
    summary: '头像、背景、活动照片与群二维码现在使用一致的可靠上传流程。',
    latest: false,
    features: [
      '网络波动时会自动重试，并显示连续的上传进度',
      '活动路线预览图也会完成安全校验后再保存',
      '旧图片继续正常显示，替换图片时会自动使用新流程',
    ],
  },
  {
    version: '2026.10.18.6',
    date: '2026-10-18',
    title: '俱乐部图片上传兼容性修复',
    summary: '修复部分真机上选择俱乐部头像或背景后无法完成上传的问题。',
    latest: false,
    features: [
      '提升俱乐部头像与背景照片在不同手机上的处理稳定性',
      '微信版本不支持图片裁剪时会提示升级，旧图片保持不变',
      '头像与背景仍按原有比例裁剪并保持清晰尺寸',
    ],
  },
  {
    version: '2026.10.18.5',
    date: '2026-10-18',
    title: '俱乐部推荐与图片体验修复',
    summary: '已加入的俱乐部不再重复推荐，头像与背景照片现在独立选择和展示。',
    latest: false,
    features: [
      '推荐列表会自动排除已经加入的俱乐部',
      '新建和编辑俱乐部时可分别裁剪头像与背景照片',
      '详情背景缺失时显示品牌占位，不再拉伸头像',
    ],
  },
  {
    version: '2026.10.18.4',
    date: '2026-10-18',
    title: '俱乐部首页与人数上限',
    summary: '俱乐部首页现在统一展示已加入和推荐俱乐部，并支持管理员设置人数上限。',
    latest: false,
    features: [
      '已加入俱乐部可整卡查看详情，管理员可继续修改资料',
      '新建俱乐部头像改为必填，历史缺头像会温和提醒补充',
      '创建和管理资料支持人数上限，加入满员俱乐部时会明确提示',
    ],
  },
  {
    version: '2026.10.18.3',
    date: '2026-10-18',
    title: '俱乐部资料保存稳定性修复',
    summary: '俱乐部负责人和管理员保存资料时，现在能更稳定地识别最新版本。',
    latest: false,
    features: [
      '修复线上时间格式差异导致资料保存被误判为冲突的问题',
      '保留多管理员并发保护，避免旧页面覆盖他人刚保存的资料',
      '资料管理入口、可编辑字段和失败重试体验保持不变',
    ],
  },
] as const;

function openPrivacyContract(): Promise<void> {
  const open = typeof wx !== 'undefined' ? wx.openPrivacyContract : undefined;
  if (typeof open !== 'function')
    return Promise.reject(new Error('当前微信版本暂不支持隐私管理，请升级微信后重试'));
  return new Promise((resolve, reject) => {
    open({ success: () => resolve(), fail: (error: unknown) => reject(error) });
  });
}

type StravaRowCopy = {
  description: string;
  action: string;
  statusLabel: string;
};
const STRAVA_COPY: Record<'connected' | 'disconnected' | 'pending' | 'error', StravaRowCopy> = {
  disconnected: {
    description: '尚未连接 Strava，连接后可直接粘贴线路地址同步',
    action: '连接 Strava',
    statusLabel: '尚未连接',
  },
  connected: {
    description: '已连接',
    action: '管理同步',
    statusLabel: '已连接',
  },
  pending: {
    description: '授权链接已复制，请在浏览器完成后返回',
    action: '已复制授权链接 · 刷新状态',
    statusLabel: '等待浏览器完成',
  },
  error: {
    description: '暂时无法获取同步状态，可稍后重试',
    action: '重试',
    statusLabel: '暂时不可用',
  },
};

Page({
  data: {
    releaseNotes: RELEASE_NOTES,
    currentRelease: RELEASE_NOTES[0],
    actionPending: false,
    isAdmin: false,
    stravaState: 'disconnected' as 'connected' | 'disconnected' | 'pending' | 'error',
    stravaAthleteName: '',
    stravaDescription: STRAVA_COPY.disconnected.description,
    stravaAction: STRAVA_COPY.disconnected.action,
    stravaStatusLabel: STRAVA_COPY.disconnected.statusLabel,
    stravaAuthorizationUrl: '',
    notificationHint: '',
    notificationHintTone: 'info' as 'info' | 'success' | 'warning',
  },
  stravaPollTimer: undefined as ReturnType<typeof setInterval> | undefined,
  onShow() {
    const isAdmin = appStore.authStatus === 'authenticated' && appStore.role === 'admin';
    this.setData({ isAdmin });
    if (isAdmin) void this.loadStravaStatus();
  },
  onUnload() {
    if (this.stravaPollTimer !== undefined) {
      clearInterval(this.stravaPollTimer);
      this.stravaPollTimer = undefined;
    }
  },
  applyStravaReadiness(readiness: StravaRouteReadiness) {
    const connected = readiness.state === 'connected';
    const state: 'connected' | 'disconnected' = connected ? 'connected' : 'disconnected';
    const copy = STRAVA_COPY[state];
    this.setData({
      stravaState: state,
      stravaAthleteName: readiness.athleteName,
      stravaDescription:
        connected && readiness.athleteName ? `已连接 ${readiness.athleteName}` : copy.description,
      stravaAction: copy.action,
      stravaStatusLabel: copy.statusLabel,
    });
    if (connected && this.stravaPollTimer !== undefined) {
      clearInterval(this.stravaPollTimer);
      this.stravaPollTimer = undefined;
      this.setData({ stravaAuthorizationUrl: '' });
    }
  },
  async loadStravaStatus() {
    if (!this.data.isAdmin) return;
    try {
      const readiness = await rideService.getStravaRouteReadiness();
      this.applyStravaReadiness(readiness);
    } catch {
      this.setData({
        stravaState: 'error',
        stravaDescription: STRAVA_COPY.error.description,
        stravaAction: STRAVA_COPY.error.action,
        stravaStatusLabel: STRAVA_COPY.error.statusLabel,
      });
    }
  },
  async openStravaSync() {
    if (!this.data.isAdmin || this.data.actionPending) return;
    if (this.data.stravaState === 'connected') {
      // 已连接：刷新状态并反馈
      this.setData({ actionPending: true });
      try {
        await this.loadStravaStatus();
        wx.showToast({ title: 'Strava 已连接', icon: 'success' });
      } finally {
        this.setData({ actionPending: false });
      }
      return;
    }
    if (this.data.stravaState === 'pending' && this.data.stravaAuthorizationUrl) {
      // 已经发起过授权：直接复用链接 + 刷新状态
      await wx.setClipboardData({ data: this.data.stravaAuthorizationUrl });
      await this.loadStravaStatus();
      return;
    }
    this.setData({
      actionPending: true,
      stravaState: 'pending',
      stravaDescription: '正在生成授权链接…',
      stravaAction: STRAVA_COPY.pending.action,
      stravaStatusLabel: STRAVA_COPY.pending.statusLabel,
    });
    try {
      const authorization = await rideService.startStravaRouteAuthorization();
      this.setData({
        stravaAuthorizationUrl: authorization.authorizationUrl,
        stravaDescription: STRAVA_COPY.pending.description,
      });
      await wx.setClipboardData({ data: authorization.authorizationUrl });
      if (this.stravaPollTimer !== undefined) clearInterval(this.stravaPollTimer);
      this.stravaPollTimer = setInterval(() => void this.loadStravaStatus(), 2000);
      wx.showToast({ title: '授权链接已复制', icon: 'success' });
    } catch {
      this.setData({
        stravaState: 'error',
        stravaDescription: STRAVA_COPY.error.description,
        stravaAction: STRAVA_COPY.error.action,
        stravaStatusLabel: STRAVA_COPY.error.statusLabel,
      });
    } finally {
      this.setData({ actionPending: false });
    }
  },
  async manageNotifications() {
    if (this.data.actionPending) return;
    this.setData({ actionPending: true, notificationHint: '' });
    try {
      const templateIds = (await rideService.getReviewNotificationTemplateIds())
        .filter((item, index, values) => Boolean(item && values.indexOf(item) === index))
        .slice(0, MAX_SUBSCRIPTION_TEMPLATES);
      if (!templateIds.length) {
        wx.showToast({ title: '暂无可订阅的活动通知', icon: 'none' });
        this.setData({
          notificationHint: '暂无可订阅的活动通知，稍后再来看看。',
          notificationHintTone: 'warning',
        });
        return;
      }
      await rideService.requestReviewNotificationSubscription(templateIds);
      wx.showToast({ title: '已完成本次订阅选择', icon: 'success' });
      this.setData({
        notificationHint: '已完成本次订阅选择，下一次仍会由微信询问。',
        notificationHintTone: 'success',
      });
    } catch {
      wx.showToast({ title: '暂时无法打开通知订阅，请稍后重试', icon: 'none' });
      this.setData({
        notificationHint: '暂时无法打开通知订阅，请稍后重试。',
        notificationHintTone: 'warning',
      });
    } finally {
      this.setData({ actionPending: false });
    }
  },
  async managePrivacy() {
    if (this.data.actionPending) return;
    this.setData({ actionPending: true });
    try {
      await openPrivacyContract();
    } catch {
      wx.showModal({
        title: '暂时无法打开隐私管理',
        content: '请升级微信后重试，或通过小程序右上角“…”查看隐私保护指引。',
        showCancel: false,
      });
    } finally {
      this.setData({ actionPending: false });
    }
  },
  clearSafeCache() {
    if (this.data.actionPending) return;
    wx.showModal({
      title: '清理缓存',
      content:
        '只会清理可重新下载的活动、资料和图片缓存，不会退出登录，也不会删除报名、行程或个人资料。',
      confirmText: '确认清理',
      success: (result: { confirm?: boolean }) => {
        if (!result.confirm) return;
        this.setData({ actionPending: true });
        try {
          repositoryCache.clear();
          clearProfilePageCache();
          clearSharedTempFileUrlCache();
          wx.showToast({ title: '缓存已清理', icon: 'success' });
        } catch {
          wx.showToast({ title: '部分缓存未能清理，请稍后重试', icon: 'none' });
        } finally {
          this.setData({ actionPending: false });
        }
      },
    });
  },
});
