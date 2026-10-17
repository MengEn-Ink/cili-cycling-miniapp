import { repositoryCache } from '../../repositories/index';
import { appStore } from '../../store/app-store';
import { rideService } from '../../services/ride-service';
import type { ActivityAction } from '../../utils/activity';
import { resolveActivityAction } from '../../utils/activity';
import { genderView } from '../../utils/gender';
import { mediaSourceKind, reportMediaDiagnostic } from '../../utils/media-diagnostic';
import { sanitizeGpxFileName } from '../../utils/gpx-file';
import { prepareRouteVisualModel } from '../../utils/route-visual';
import { createNavigationSingleFlight } from '../../utils/navigation-single-flight';
import { validateRegistrationProfile } from '../../utils/validation';
import {
  drawRouteOutline as renderRouteOutline,
  hasAnalyzableRoute,
} from '../../utils/route-outline';
import {
  activityElevationProfile,
  drawElevationProfile,
  formatActivityDate,
  formatActivityTime,
  formatChinaDateTimeSeconds,
  runCanvasReveal,
} from './format';

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

function safeGpxName(value: unknown): string {
  return sanitizeGpxFileName(value, `activity-route-${Date.now()}`);
}

function platformCall<T = void>(
  method: (options: Record<string, unknown>) => unknown,
  options: Record<string, unknown>,
): Promise<T> {
  return new Promise((resolve, reject) =>
    method({ ...options, success: (result: T) => resolve(result), fail: reject }),
  );
}

function verifyGpxMd5(filePath: string, expected: string): Promise<void> {
  const fs = wx.getFileSystemManager();
  return platformCall<{ digest?: string }>(fs.getFileInfo.bind(fs), {
    filePath,
    digestAlgorithm: 'md5',
  })
    .then((info) => {
      if (info.digest !== expected) throw new Error('路线文件完整性校验失败，请重新下载');
    })
    .catch(async (error) => {
      try {
        await platformCall(fs.unlink.bind(fs), { filePath });
      } catch {
        // 清理失败不能覆盖真实的读取或完整性错误。
      }
      throw error instanceof Error && error.message.startsWith('路线文件完整性校验失败')
        ? error
        : new Error('路线临时文件读取失败，请重新下载');
    });
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
  if (
    typeof route?.gpxFileId !== 'string' ||
    !/^cloud:\/\/[^/]+\/activity-routes\/[^/]+\/[^/]+\.gpx$/.test(route.gpxFileId)
  )
    return false;
  return route.gpxSha256 === undefined || /^[a-f0-9]{64}$/.test(route.gpxSha256);
}

Page({
  navigation: createNavigationSingleFlight((options) => wx.navigateTo(options)),
  loadRequestId: 0,
  initialShowPending: false,
  loadPromise: null as { id: string; promise: Promise<void> } | null,
  unloaded: false,
  downloadBusy: false,
  elevationAnimationCancel: null as (() => void) | null,
  outlineAnimationCancel: null as (() => void) | null,
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
    currentGalleryIndex: 0,
    routeOutlineImage: '',
    routeOutline: [] as any[],
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
  onHide() {
    this.cancelVisualAnimations();
    this.navigation.release();
  },
  onUnload() {
    this.cancelVisualAnimations();
    this.unloaded = true;
    this.loadRequestId += 1;
    this.loadPromise = null;
    this.navigation.release();
  },
  safeSetData(value: Record<string, unknown>, callback?: () => void) {
    if (!this.unloaded) this.setData(value, callback);
  },
  cancelVisualAnimations() {
    this.elevationAnimationCancel?.();
    this.outlineAnimationCancel?.();
    this.elevationAnimationCancel = null;
    this.outlineAnimationCancel = null;
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
      currentGalleryIndex: 0,
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
      const elevationProfile = hasRouteDetails ? activityElevationProfile(detail.route) : [];
      const routeOutline = hasRouteDetails
        ? prepareRouteVisualModel(detail.route?.routeOutline, [], hasGpxRoute).outline
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
          routeOutline,
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
        const context = canvas.getContext('2d');
        const normalized = activityElevationProfile(this.data.item?.route);
        const draw = (progress: number) =>
          drawElevationProfile(context, target.width, target.height, normalized, ratio, progress);
        const finish = () => {
          this.elevationAnimationCancel = null;
          // 最终帧转成图片，避免原生 canvas 穿透并遮挡底部操作栏。
          this.snapshotCanvas(canvas, target.width, target.height, 'elevationImage');
        };
        this.elevationAnimationCancel?.();
        if (
          typeof canvas.requestAnimationFrame === 'function' &&
          typeof canvas.cancelAnimationFrame === 'function' &&
          (wx.getDeviceInfo?.().benchmarkLevel || 20) > 10
        )
          this.elevationAnimationCancel = runCanvasReveal(canvas, draw, finish);
        else {
          draw(1);
          finish();
        }
      });
  },
  drawRouteOutline() {
    const outline = this.data.routeOutline;
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
        const context = canvas.getContext('2d');
        const draw = (progress: number) =>
          renderRouteOutline(
            context,
            target.width,
            target.height,
            outline,
            ratio,
            this.data.item?.route?.routeName || 'GPX 路线详情',
            progress,
          );
        const finish = () => {
          this.outlineAnimationCancel = null;
          // 路线轮廓导出为普通图片，避免原生 canvas 穿透并遮挡底部操作栏。
          this.snapshotCanvas(canvas, target.width, target.height, 'routeOutlineImage');
        };
        this.outlineAnimationCancel?.();
        if (
          typeof canvas.requestAnimationFrame === 'function' &&
          typeof canvas.cancelAnimationFrame === 'function' &&
          (wx.getDeviceInfo?.().benchmarkLevel || 20) > 10
        )
          this.outlineAnimationCancel = runCanvasReveal(canvas, draw, finish);
        else {
          draw(1);
          finish();
        }
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
    this.safeSetData({ coverFailed: true, galleryImages: [], currentGalleryIndex: 0 });
  },
  galleryChange(event: any) {
    const current = Number(event.detail?.current);
    if (!Number.isInteger(current) || current < 0 || current >= this.data.galleryImages.length)
      return;
    this.safeSetData({ currentGalleryIndex: current });
  },
  galleryImageError(event: any) {
    const index = Number(event.currentTarget.dataset.index);
    if (!Number.isInteger(index) || index < 0 || index >= this.data.galleryImages.length) return;
    const galleryImages = this.data.galleryImages.filter(
      (_: string, imageIndex: number) => imageIndex !== index,
    );
    const previousIndex = this.data.currentGalleryIndex;
    const currentGalleryIndex =
      galleryImages.length === 0
        ? 0
        : index < previousIndex
          ? previousIndex - 1
          : Math.min(previousIndex, galleryImages.length - 1);
    this.safeSetData({
      galleryImages,
      currentGalleryIndex,
      coverFailed: galleryImages.length === 0,
    });
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
    this.navigation.run('/pages/admin/activity-edit/index?id=' + this.data.item.id);
  },
  adminRegistration() {
    if (!this.data.item?.id) return;
    const registration = this.data.registration;
    if (
      registration?.id &&
      ['waiting', 'pending', 'approved', 'checked_in'].includes(registration.status || '')
    ) {
      this.navigation.run('/pages/credential/index?id=' + registration.id);
      return;
    }
    const teamQuery = this.data.teamId ? '&team_id=' + encodeURIComponent(this.data.teamId) : '';
    this.navigation.run('/pages/registration-form/index?id=' + this.data.item.id + teamQuery);
  },
  openRouteAnalysis() {
    const id = this.data.item?.id;
    if (!id || !this.data.canAnalyzeRoute) return;
    this.navigation.run(`/pages/route-analysis/index?id=${encodeURIComponent(id)}`);
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
      const fileName = safeGpxName(result?.fileName);
      let downloaded: { statusCode?: number; tempFilePath?: string };
      try {
        downloaded = await platformCall(wx.downloadFile, { url: result.tempFileURL });
      } catch {
        throw new Error('路线文件网络下载失败，请检查网络后重试');
      }
      if (downloaded.statusCode !== 200)
        throw new Error(`路线文件下载失败（HTTP ${downloaded.statusCode || '未知'}）`);
      if (!downloaded.tempFilePath) throw new Error('路线文件下载完成但未生成临时文件，请重试');
      await verifyGpxMd5(downloaded.tempFilePath, result.gpxMd5);
      if (typeof wx.shareFileMessage === 'function') {
        try {
          await platformCall(wx.shareFileMessage, {
            filePath: downloaded.tempFilePath,
            fileName,
          });
          return;
        } catch {
          // 真机分享面板不可用或被用户关闭时，继续走微信文件保存兜底。
        }
      }
      if (typeof wx.saveFile !== 'function')
        throw new Error('当前微信版本不支持文件分享或保存，请升级微信后重试');
      try {
        await platformCall(wx.saveFile, { tempFilePath: downloaded.tempFilePath });
      } catch {
        throw new Error('GPX 分享失败，保存到微信文件也失败，请稍后重试');
      }
      wx.showModal({
        title: 'GPX 已保存',
        content: '已保存到微信文件，可从文件菜单继续分享',
        showCancel: false,
      });
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
        this.navigation.run('/pages/credential/index?id=' + action.registrationId);
      return;
    }
    const teamQuery = this.data.teamId ? '&team_id=' + encodeURIComponent(this.data.teamId) : '';
    if (!(await this.ensureProfileReadyForRegistration())) return;
    this.navigation.run('/pages/registration-form/index?id=' + this.data.item.id + teamQuery);
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
    if (confirm) this.navigation.run('/pages/profile-edit/index');
    return false;
  },
});
