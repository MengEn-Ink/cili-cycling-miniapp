import { repositoryCache } from '../../repositories/index';
import { appStore } from '../../store/app-store';
import { rideService } from '../../services/ride-service';
import type { ActivityAction } from '../../utils/activity';
import { resolveActivityAction } from '../../utils/activity';
import { genderView } from '../../utils/gender';
import { mediaSourceKind, reportMediaDiagnostic } from '../../utils/media-diagnostic';
import { validateRegistrationProfile } from '../../utils/validation';
import { drawRouteOutline as renderRouteOutline } from '../../utils/route-outline';
import { hasAnalyzableRoute } from '../../utils/route-analysis';
import {
  drawElevationProfile,
  formatActivityDate,
  formatActivityTime,
  formatChinaDateTimeSeconds,
  validElevationProfile,
} from './format';

const MAX_GPX_BYTES = 4 * 1024 * 1024;
const GROUP_QR_EXPIRE_MS = 7 * 24 * 60 * 60 * 1000;

function groupQrExpired(uploadedAt?: string) {
  if (!uploadedAt) return false;
  const time = new Date(uploadedAt).getTime();
  return Number.isFinite(time) && Date.now() - time >= GROUP_QR_EXPIRE_MS;
}

function groupQrVisible(
  registration: { status?: string } | undefined,
  isOrganizer: boolean,
  isAdmin: boolean,
): boolean {
  return (
    isOrganizer ||
    isAdmin ||
    registration?.status === 'approved' ||
    registration?.status === 'checked_in'
  );
}

function viewerStatus(
  registration: { status?: string } | undefined,
  isLoggedIn: boolean,
  isOrganizer: boolean,
  isAdmin: boolean,
) {
  if (isAdmin) return { key: 'admin', label: '管理员', hint: '可管理活动与报名审核' };
  if (isOrganizer) return { key: 'organizer', label: '组织者', hint: '可管理活动与报名骑友' };
  if (!isLoggedIn) return { key: 'guest', label: '未登录', hint: '登录后可报名并查看报名进度' };
  switch (registration?.status) {
    case 'waiting':
      return { key: 'waiting', label: '候补中', hint: '有名额释放时将按顺序递补' };
    case 'pending':
      return { key: 'pending', label: '待审核', hint: '组织者正在审核报名资料' };
    case 'approved':
      return { key: 'approved', label: '已通过', hint: '可查看行程与活动群二维码' };
    case 'checked_in':
      return { key: 'checked_in', label: '已签到', hint: '签到完成，可查看活动群二维码' };
    case 'rejected':
      return { key: 'rejected', label: '未通过', hint: '可完善资料后重新报名' };
    case 'cancelled':
      return { key: 'cancelled', label: '已取消', hint: '报名开放时可重新报名' };
    default:
      return { key: 'unregistered', label: '未报名', hint: '提交后将进入审核' };
  }
}

function primaryAction(activity: any, registration: any, state: ReturnType<typeof viewerStatus>) {
  if (state.key === 'guest')
    return { kind: 'register', label: '登录后报名', enabled: true } as ActivityAction;
  if (state.key === 'organizer' || state.key === 'admin')
    return { kind: 'view-history', label: '管理活动', enabled: true } as ActivityAction;
  return resolveActivityAction(activity, registration);
}

function unavailableAction(): ActivityAction {
  return { kind: 'closed', label: '活动状态不可用', enabled: false };
}

function base64Bytes(value: unknown): number {
  if (typeof value !== 'string') return -1;
  const normalized = value.replace(/\s/g, '');
  if (!normalized || normalized.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(normalized))
    return -1;
  const padding = normalized.endsWith('==') ? 2 : normalized.endsWith('=') ? 1 : 0;
  return Math.floor((normalized.length * 3) / 4) - padding;
}

function safeGpxName(value: unknown): string {
  const name = typeof value === 'string' ? value.split(/[\\/]/).pop() || '' : '';
  return /^[\w.-]{1,120}\.gpx$/i.test(name) ? name : `activity-route-${Date.now()}.gpx`;
}

function platformCall(
  method: (options: Record<string, unknown>) => unknown,
  options: Record<string, unknown>,
): Promise<void> {
  return new Promise((resolve, reject) => method({ ...options, success: resolve, fail: reject }));
}

function shareCoverImage(item: any): string {
  const cover = typeof item?.coverImage === 'string' ? item.coverImage : '';
  const firstImage =
    Array.isArray(item?.images) && typeof item.images[0] === 'string' ? item.images[0] : '';
  const imageUrl = cover || firstImage;
  // 微信分享 imageUrl 不接受 cloud://，仅透传 activity-read 已换取的 http/https 临时地址。
  return /^https?:\/\//i.test(imageUrl) ? imageUrl : '';
}

function shareTeamId(data: any): string {
  return data.registration?.isTeamLeader ? data.registration.teamId : data.teamId;
}

function withShareImage<T extends { title: string }>(
  share: T,
  item: any,
): T & { imageUrl?: string } {
  const imageUrl = shareCoverImage(item);
  return imageUrl ? { ...share, imageUrl } : share;
}

function formatRideDuration(seconds?: number) {
  if (!Number.isFinite(seconds) || !seconds || seconds <= 0) return '';
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (!hours) return `${minutes} 分钟`;
  return minutes ? `${hours} 小时 ${minutes} 分` : `${hours} 小时`;
}

function officialRouteId(route: any): string {
  const valid = (provider: unknown, id: unknown, url: unknown) =>
    provider === 'strava' &&
    typeof id === 'string' &&
    /^[1-9]\d{0,19}$/.test(id) &&
    url === `https://www.strava.com/routes/${id}`;
  const hasGeneric =
    route?.externalProvider !== undefined ||
    route?.externalRouteId !== undefined ||
    route?.externalRouteUrl !== undefined;
  if (hasGeneric)
    return valid(route.externalProvider, route.externalRouteId, route.externalRouteUrl)
      ? route.externalRouteId
      : '';
  return valid('strava', route?.stravaRouteId, route?.stravaRouteUrl) ? route.stravaRouteId : '';
}

function officialRouteUrl(route: any): string {
  const id = officialRouteId(route);
  return id ? `https://www.strava.com/routes/${id}` : '';
}

function attachedGpx(route: any): boolean {
  return (
    typeof route?.gpxFileId === 'string' &&
    route.gpxFileId.startsWith('cloud://') &&
    typeof route?.gpxSha256 === 'string' &&
    /^[a-f0-9]{64}$/.test(route.gpxSha256)
  );
}

Page({
  loadRequestId: 0,
  initialShowPending: false,
  loadPromise: null as { id: string; promise: Promise<void> } | null,
  unloaded: false,
  downloadBusy: false,
  attendeeMediaRetryKeys: new Set<string>(),
  data: {
    loading: true,
    activityId: '',
    error: '',
    item: null as any,
    registration: null as any,
    attendees: [] as any[],
    selectedAttendee: null as any,
    selectedAttendeeIndex: 0,
    galleryImages: [] as string[],
    routeOutlineImage: '',
    elevationImage: '',
    colorMediaMuted: '#d4d4d4',
    colorOnMedia: '#ffffff',
    displayDate: '',
    startTime: '',
    endTime: '',
    deadlineTime: '',
    estimatedRideTime: '',
    officialRouteId: '',
    officialRouteUrl: '',
    hasRouteDetails: false,
    hasGpxRoute: false,
    hasElevationProfile: false,
    hasRouteOutline: false,
    canAnalyzeRoute: false,
    coverFailed: false,
    downloadingGpx: false,
    teamId: '',
    activityAction: unavailableAction(),
    isAdmin: false,
    adminRegistrationLabel: '管理员报名',
    viewerStatus: { key: 'guest', label: '未登录', hint: '登录后可报名并查看报名进度' },
    attendeesVisible: false,
    groupQrVisible: false,
    groupQrLockedMessage: '报名审核通过后可查看活动群二维码',
    groupQrCodeExpired: false,
    copyFeedback: '' as '' | 'success' | 'error',
  },
  onShow() {
    if (this.initialShowPending) {
      this.initialShowPending = false;
      return;
    }
    if (this.data.item && this.data.activityId && !this.data.loading)
      void this.load(this.data.activityId);
  },
  onLoad(q: any) {
    this.unloaded = false;
    this.initialShowPending = true;
    const teamId =
      typeof q.team_id === 'string' && /^team_[A-Za-z0-9_-]{8,80}$/.test(q.team_id)
        ? q.team_id
        : '';
    this.safeSetData({ teamId, activityId: q.id || '' });
    wx.showShareMenu?.({ menus: ['shareAppMessage', 'shareTimeline'] });
    void this.load(q.id || '');
  },
  onReady() {
    this.drawElevation();
    this.drawRouteOutline();
  },
  onUnload() {
    this.unloaded = true;
    this.loadRequestId += 1;
    this.loadPromise = null;
  },
  safeSetData(value: Record<string, unknown>, callback?: () => void) {
    if (!this.unloaded) this.setData(value, callback);
  },
  load(id: string) {
    const current = this.loadPromise;
    if (current?.id === id) return current.promise;
    const run = this.performLoad(id);
    const tracked = run.finally(() => {
      if (this.loadPromise?.promise === tracked) this.loadPromise = null;
    });
    this.loadPromise = { id, promise: tracked };
    return tracked;
  },
  async performLoad(id: string) {
    const requestId = ++this.loadRequestId;
    this.safeSetData({
      loading: true,
      error: '',
      coverFailed: false,
      selectedAttendee: null,
      activityAction: unavailableAction(),
    });
    try {
      const isLoggedIn = !['unavailable', 'error'].includes(appStore.authStatus);
      // 活动详情与“我的报名”彼此独立，同时请求以缩短首屏等待；游客不发起报名请求。
      const [item, registrations] = await Promise.all([
        rideService.getActivity(id),
        isLoggedIn ? rideService.listRegistrations() : Promise.resolve([]),
      ]);
      if (requestId !== this.loadRequestId || this.unloaded) return;
      if (!item) throw new Error('活动不存在');
      const registration = registrations.find((value) => value.activityId === id);
      const detail = item as any;
      const isAdmin = isLoggedIn && appStore.role === 'admin';
      let isOrganizer =
        isLoggedIn &&
        (detail.isOrganizer === true ||
          detail.viewer?.isOrganizer === true ||
          (typeof detail.createdBy === 'string' && detail.createdBy === appStore.openid));
      if (
        isLoggedIn &&
        !isAdmin &&
        !isOrganizer &&
        typeof rideService.getAdminActivity === 'function'
      ) {
        // 复用现有活动管理读取权限确认发布者身份；普通骑友的无权响应安全降级为 false。
        isOrganizer = await rideService
          .getAdminActivity(id)
          .then((activity) => Boolean(activity))
          .catch(() => false);
        if (requestId !== this.loadRequestId || this.unloaded) return;
      }
      const state = viewerStatus(registration, isLoggedIn, isOrganizer, isAdmin);
      const approvedRegistrationCount = Number.isInteger(detail.approvedRegistrationCount)
        ? detail.approvedRegistrationCount
        : Array.isArray(detail.attendees)
          ? detail.attendees.length
          : 0;
      detail.approvedRegistrationCount = approvedRegistrationCount;
      const hasActiveRegistration = ['waiting', 'pending', 'approved', 'checked_in'].includes(
        registration?.status || '',
      );
      const canSeeAttendees =
        isOrganizer ||
        isAdmin ||
        ['waiting', 'pending', 'approved', 'checked_in'].includes(registration?.status || '');
      const canSeeGroupQr = groupQrVisible(registration, isOrganizer, isAdmin);
      const hasGpxRoute = attachedGpx(detail.route);
      const hasPublicRouteDetails =
        typeof detail.route?.publicRoutePreviewId === 'string' &&
        /^[a-f0-9]{64}$/.test(detail.route.publicRoutePreviewId);
      const hasRouteDetails = hasGpxRoute || hasPublicRouteDetails;
      const elevationProfile = hasRouteDetails
        ? validElevationProfile(detail.route?.elevationProfile)
        : [];
      const routeOutline =
        hasRouteDetails && Array.isArray(detail.route?.routeOutline)
          ? detail.route.routeOutline
          : [];
      // 在数据进入视图时统一补齐性别展示信息，列表头像和滑动名片共用同一语义。
      const attendees =
        canSeeAttendees && Array.isArray(detail.attendees)
          ? detail.attendees.map((attendee: any) => ({
              ...attendee,
              ...genderView(attendee.gender),
            }))
          : [];
      this.safeSetData(
        {
          item: detail,
          registration,
          attendees,
          attendeesVisible: canSeeAttendees,
          viewerStatus: state,
          isAdmin,
          adminRegistrationLabel: hasActiveRegistration ? '查看我的报名' : '管理员报名',
          groupQrVisible: canSeeGroupQr,
          attendeeSummary: `${approvedRegistrationCount} 人已通过审核`,
          groupQrLockedMessage:
            state.key === 'guest'
              ? '登录并报名审核通过后可查看活动群二维码'
              : state.key === 'rejected' || state.key === 'cancelled'
                ? '当前报名状态不可查看，重新报名并通过审核后开放'
                : '报名审核通过后可查看活动群二维码',
          galleryImages: [...new Set([item.coverImage, ...(item.images || [])].filter(Boolean))],
          routeOutlineImage: '',
          elevationImage: '',
          displayDate: formatActivityDate(item.startAt || item.date),
          startTime: formatActivityTime(item.startAt),
          endTime: formatChinaDateTimeSeconds(item.endAt),
          deadlineTime: formatChinaDateTimeSeconds(item.deadline),
          estimatedRideTime: formatRideDuration(
            hasRouteDetails ? detail.route?.estimatedMovingTimeSeconds : undefined,
          ),
          officialRouteId: officialRouteId(detail.route),
          officialRouteUrl: officialRouteUrl(detail.route),
          hasRouteDetails,
          hasGpxRoute,
          hasElevationProfile: elevationProfile.length >= 2,
          hasRouteOutline: routeOutline.length >= 2,
          canAnalyzeRoute: hasAnalyzableRoute(detail.route),
          activityAction: primaryAction(item, registration, state),
          groupQrCodeExpired: groupQrExpired(detail.groupQrCodeUploadedAt),
        },
        () => {
          this.drawElevation();
          this.drawRouteOutline();
        },
      );
    } catch (error) {
      if (requestId !== this.loadRequestId || this.unloaded) return;
      this.safeSetData({
        error: error instanceof Error ? error.message : '详情加载失败',
        activityAction: unavailableAction(),
      });
    } finally {
      if (requestId === this.loadRequestId && !this.unloaded) this.safeSetData({ loading: false });
    }
  },
  snapshotCanvas(
    canvas: any,
    width: number,
    height: number,
    dataKey: 'routeOutlineImage' | 'elevationImage',
  ) {
    if (typeof wx.canvasToTempFilePath !== 'function') return;
    const requestId = this.loadRequestId;
    wx.canvasToTempFilePath(
      {
        canvas,
        x: 0,
        y: 0,
        width,
        height,
        destWidth: canvas.width,
        destHeight: canvas.height,
        fileType: 'png',
        success: (result: { tempFilePath?: string }) => {
          if (requestId !== this.loadRequestId || this.unloaded) return;
          if (result.tempFilePath) this.safeSetData({ [dataKey]: result.tempFilePath });
        },
      },
      this,
    );
  },
  drawElevation() {
    const profile = this.data.item?.route?.elevationProfile;
    if (!this.data.hasElevationProfile || this.unloaded) return;
    wx.createSelectorQuery()
      .select('#elevation-canvas')
      .fields({ node: true, size: true })
      .exec((result: any[]) => {
        if (this.unloaded) return;
        const target = result?.[0];
        const canvas = target?.node;
        if (!canvas || !target.width || !target.height) return;
        const ratio = wx.getWindowInfo?.().pixelRatio || wx.getSystemInfoSync?.().pixelRatio || 1;
        canvas.width = target.width * ratio;
        canvas.height = target.height * ratio;
        drawElevationProfile(canvas.getContext('2d'), target.width, target.height, profile, ratio);
        // 2D canvas 在部分真机仍会盖住 fixed 按钮，绘制后转成图片并移除原生层。
        this.snapshotCanvas(canvas, target.width, target.height, 'elevationImage');
      });
  },
  drawRouteOutline() {
    const outline = this.data.item?.route?.routeOutline;
    if (!this.data.hasRouteDetails || !this.data.hasRouteOutline || this.unloaded) return;
    wx.createSelectorQuery()
      .select('#route-outline-canvas')
      .fields({ node: true, size: true })
      .exec((result: any[]) => {
        if (this.unloaded) return;
        const target = result?.[0];
        const canvas = target?.node;
        if (!canvas || !target.width || !target.height) return;
        const ratio = wx.getWindowInfo?.().pixelRatio || wx.getSystemInfoSync?.().pixelRatio || 1;
        canvas.width = target.width * ratio;
        canvas.height = target.height * ratio;
        renderRouteOutline(
          canvas.getContext('2d'),
          target.width,
          target.height,
          outline,
          ratio,
          this.data.item?.route?.routeName || 'GPX 路线详情',
        );
        // 路线轮廓导出为普通图片，避免原生 canvas 穿透并遮挡底部操作栏。
        this.snapshotCanvas(canvas, target.width, target.height, 'routeOutlineImage');
      });
  },
  async retryAttendeeMedia(attendeeId: string, kind: 'avatar' | 'background', failedUrl: string) {
    const attendee = this.data.attendees.find((item: any) => item.id === attendeeId);
    const activityId = this.data.item?.id;
    if (!attendee || !activityId) return;
    const urlKey = kind === 'avatar' ? 'avatarUrl' : 'backgroundUrl';
    const selectedUrl =
      this.data.selectedAttendee?.id === attendeeId ? this.data.selectedAttendee[urlKey] : '';
    if (failedUrl && attendee[urlKey] !== failedUrl && selectedUrl !== failedUrl) return;
    const retryKey = `${attendeeId}:${kind}`;
    reportMediaDiagnostic(`activity-detail.attendee-${kind}`, 'load-error', {
      source: mediaSourceKind(failedUrl),
      retryAttempted: this.attendeeMediaRetryKeys.has(retryKey),
    });
    if (!this.attendeeMediaRetryKeys.has(retryKey)) {
      this.attendeeMediaRetryKeys.add(retryKey);
      const requestId = this.loadRequestId;
      repositoryCache.invalidateActivity(activityId);
      const refreshedActivity = await rideService.getActivity(activityId).catch(() => null);
      if (requestId !== this.loadRequestId || this.unloaded) return;
      const refreshedAttendee = refreshedActivity?.attendees?.find(
        (item: any) => item.id === attendeeId,
      );
      const refreshedUrl = refreshedAttendee?.[urlKey] || '';
      if (refreshedUrl && refreshedUrl !== failedUrl) {
        const attendees = this.data.attendees.map((item: any) =>
          item.id === attendeeId ? { ...item, [urlKey]: refreshedUrl } : item,
        );
        this.safeSetData({
          attendees,
          selectedAttendee:
            this.data.selectedAttendee?.id === attendeeId
              ? { ...this.data.selectedAttendee, [urlKey]: refreshedUrl }
              : this.data.selectedAttendee,
        });
        return;
      }
    }
    const attendees = this.data.attendees.map((item: any) =>
      item.id === attendeeId ? { ...item, [urlKey]: '' } : item,
    );
    this.safeSetData({
      attendees,
      selectedAttendee:
        this.data.selectedAttendee?.id === attendeeId
          ? { ...this.data.selectedAttendee, [urlKey]: '' }
          : this.data.selectedAttendee,
    });
  },
  coverImageError() {
    this.safeSetData({ coverFailed: true, galleryImages: [] });
  },
  galleryImageError(event: any) {
    const index = Number(event.currentTarget.dataset.index);
    if (!Number.isInteger(index) || index < 0 || index >= this.data.galleryImages.length) return;
    const galleryImages = this.data.galleryImages.filter(
      (_: string, imageIndex: number) => imageIndex !== index,
    );
    this.safeSetData({ galleryImages, coverFailed: galleryImages.length === 0 });
  },
  attendeeAvatarLoad(event: any) {
    const index = Number(event.currentTarget.dataset.index);
    const attendee = this.data.attendees[index];
    if (attendee) this.attendeeMediaRetryKeys.delete(`${attendee.id}:avatar`);
  },
  attendeeAvatarError(event: any) {
    const index = Number(event.currentTarget.dataset.index);
    const attendee = this.data.attendees[index];
    if (!Number.isInteger(index) || !attendee) return;
    return this.retryAttendeeMedia(
      attendee.id,
      'avatar',
      String(event.currentTarget.dataset.url || ''),
    );
  },
  selectedAttendeeBackgroundLoad(event: any) {
    const index = Number(event.currentTarget.dataset.index);
    const attendee = this.data.attendees[index] || this.data.selectedAttendee;
    if (attendee) this.attendeeMediaRetryKeys.delete(`${attendee.id}:background`);
  },
  selectedAttendeeBackgroundError(event: any) {
    const index = Number(event.currentTarget.dataset.index);
    const attendee = this.data.attendees[index] || this.data.selectedAttendee;
    if (!attendee) return;
    return this.retryAttendeeMedia(
      attendee.id,
      'background',
      String(event.currentTarget.dataset.url || ''),
    );
  },
  openAttendeeCard(event: any) {
    const index = Number(event.currentTarget.dataset.index);
    const attendee = this.data.attendees[index];
    if (attendee)
      this.safeSetData({
        selectedAttendee: { ...attendee, ...genderView(attendee.gender) },
        selectedAttendeeIndex: index,
      });
  },
  attendeeCardChange(event: any) {
    const index = Number(event.detail?.current);
    const attendee = this.data.attendees[index];
    if (Number.isInteger(index) && attendee)
      this.safeSetData({
        selectedAttendee: { ...attendee, ...genderView(attendee.gender) },
        selectedAttendeeIndex: index,
      });
  },
  closeAttendeeCard() {
    this.safeSetData({ selectedAttendee: null, selectedAttendeeIndex: 0 });
  },
  keepAttendeeCard() {},
  navigate(event: any) {
    const target = event.currentTarget.dataset.target === 'end' ? 'endLocation' : 'startLocation';
    const location = this.data.item?.route?.[target];
    if (!location) return;
    wx.openLocation({
      latitude: location.latitude,
      longitude: location.longitude,
      name: location.name,
      address: location.address,
      scale: 16,
    });
  },
  editActivity() {
    if (!this.data.item?.id) return;
    wx.navigateTo({ url: '/pages/admin/activity-edit/index?id=' + this.data.item.id });
  },
  adminRegistration() {
    if (!this.data.item?.id) return;
    const registration = this.data.registration;
    if (
      registration?.id &&
      ['waiting', 'pending', 'approved', 'checked_in'].includes(registration.status || '')
    ) {
      wx.navigateTo({ url: '/pages/credential/index?id=' + registration.id });
      return;
    }
    const teamQuery = this.data.teamId ? '&team_id=' + encodeURIComponent(this.data.teamId) : '';
    wx.navigateTo({
      url: '/pages/registration-form/index?id=' + this.data.item.id + teamQuery,
    });
  },
  openRouteAnalysis() {
    const id = this.data.item?.id;
    if (!id || !this.data.canAnalyzeRoute) return;
    wx.navigateTo({ url: `/pages/route-analysis/index?id=${encodeURIComponent(id)}` });
  },
  previewGroupQr() {
    const source =
      typeof this.data.item?.groupQrCode === 'string' ? this.data.item.groupQrCode.trim() : '';
    if (!this.data.groupQrVisible || !source) return;
    wx.previewImage({
      current: source,
      urls: [source],
      fail: () => wx.showToast({ title: '二维码预览失败，请重试', icon: 'none' }),
    });
  },
  previewRouteImage() {
    const rawSource = this.data.routeOutlineImage || this.data.item?.route?.generatedPreviewUrl;
    const source = typeof rawSource === 'string' ? rawSource.trim() : '';
    if (!source) return;
    wx.previewImage({
      current: source,
      urls: [source],
      fail: () => wx.showToast({ title: '路线预览图打开失败，请重试', icon: 'none' }),
    });
  },
  copyOfficialRoute() {
    const routeUrl = this.data.officialRouteUrl;
    if (!routeUrl) return;
    this.setData({ copyFeedback: '' });
    wx.setClipboardData({
      data: routeUrl,
      success: () => {
        this.setData({ copyFeedback: 'success' });
        wx.showToast({ title: '路线链接已复制', icon: 'success', duration: 2000 });
      },
      fail: () => {
        this.setData({ copyFeedback: 'error' });
        wx.showToast({ title: '复制失败，请稍后重试', icon: 'none', duration: 2000 });
      },
    });
  },
  onShareAppMessage() {
    const item = this.data.item;
    const teamId = shareTeamId(this.data);
    const teamQuery = teamId ? `&team_id=${encodeURIComponent(teamId)}` : '';
    return withShareImage(
      {
        title: item?.title || '骑行活动详情',
        path: `pages/activity-detail/index?id=${encodeURIComponent(item?.id || '')}${teamQuery}`,
      },
      item,
    );
  },
  onShareTimeline() {
    const item = this.data.item;
    const teamId = shareTeamId(this.data);
    const teamQuery = teamId ? `&team_id=${encodeURIComponent(teamId)}` : '';
    return withShareImage(
      {
        title: item?.title || '骑行活动详情',
        query: `id=${encodeURIComponent(item?.id || '')}${teamQuery}`,
      },
      item,
    );
  },
  async downloadGpx() {
    const activityId = this.data.item?.id;
    if (!activityId || !this.data.hasGpxRoute || this.downloadBusy) return;
    this.downloadBusy = true;
    this.safeSetData({ downloadingGpx: true });
    try {
      const result = await rideService.downloadRouteGpx(activityId);
      const bytes = base64Bytes(result?.base64);
      if (bytes < 0) throw new Error('路线文件格式错误');
      if (bytes > MAX_GPX_BYTES) throw new Error('路线文件超过 4MB，请联系活动组织者更新');
      const fileName = safeGpxName(result?.fileName);
      const filePath = `${wx.env.USER_DATA_PATH}/${fileName}`;
      const fileSystem = wx.getFileSystemManager();
      await platformCall(fileSystem.writeFile.bind(fileSystem), {
        filePath,
        data: result.base64,
        encoding: 'base64',
      });
      if (typeof wx.shareFileMessage === 'function') {
        await platformCall(wx.shareFileMessage, { filePath, fileName });
      } else {
        await platformCall(wx.saveFile, { tempFilePath: filePath });
        wx.showToast({ title: 'GPX 已保存', icon: 'success' });
      }
    } catch (error) {
      wx.showToast({
        title: error instanceof Error ? error.message : 'GPX 下载失败，请稍后重试',
        icon: 'none',
      });
    } finally {
      this.downloadBusy = false;
      this.safeSetData({ downloadingGpx: false });
    }
  },
  async go() {
    const action = this.data.activityAction as ActivityAction;
    if (!action.enabled || !this.data.item) return;
    if (this.data.viewerStatus.key === 'guest') {
      const attempt = await appStore.ensureIdentity(wx.cloud);
      if (attempt.status === 'authenticated') await this.load(this.data.item.id);
      else wx.showToast?.({ title: '登录未完成，请稍后重试', icon: 'none' });
      return;
    }
    if (this.data.viewerStatus.key === 'organizer') {
      this.editActivity();
      return;
    }
    if (this.data.viewerStatus.key === 'admin') {
      this.adminRegistration();
      return;
    }
    if (action.kind === 'view-registration' || action.kind === 'view-history') {
      if (action.registrationId)
        wx.navigateTo({ url: '/pages/credential/index?id=' + action.registrationId });
      return;
    }
    const teamQuery = this.data.teamId ? '&team_id=' + encodeURIComponent(this.data.teamId) : '';
    if (!(await this.ensureProfileReadyForRegistration())) return;
    wx.navigateTo({
      url: '/pages/registration-form/index?id=' + this.data.item.id + teamQuery,
    });
  },
  async ensureProfileReadyForRegistration(): Promise<boolean> {
    // 报名入口前置校验：资料未完整时引导去补全，避免进入表单后才发现按钮被禁用而无反馈。
    let profile;
    try {
      profile = await rideService.getProfile();
    } catch {
      // 资料拉取失败不拦截报名，交由表单内再次校验兜底。
      return true;
    }
    const errors = validateRegistrationProfile({ ...profile, ...genderView(profile.gender) });
    if (!errors.length) return true;
    const confirm = await new Promise<boolean>((resolve) => {
      wx.showModal({
        title: '资料未完善',
        content: '报名前需先补全资料：\n' + errors.join('、'),
        confirmText: '去完善',
        cancelText: '暂不',
        success: (result: { confirm: boolean }) => resolve(result.confirm),
        fail: () => resolve(false),
      });
    });
    if (confirm) wx.navigateTo({ url: '/pages/profile-edit/index' });
    return false;
  },
});
