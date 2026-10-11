import { appStore } from '../../store/app-store';
import { rideService } from '../../services/ride-service';
import type { ActivityAction } from '../../utils/activity';
import { resolveActivityAction } from '../../utils/activity';
import { genderView } from '../../utils/gender';
import { drawActivityPoster } from './poster';
import {
  drawElevationProfile,
  formatActivityDate,
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

async function posterImageSource(source: string): Promise<string> {
  if (!source.startsWith('cloud://')) return source;
  const cloudApi = wx.cloud as any;
  if (!cloudApi || typeof cloudApi.downloadFile !== 'function') throw new Error('群二维码暂不可用');
  const result = await cloudApi.downloadFile({ fileID: source });
  if (!result.tempFilePath) throw new Error('群二维码下载失败');
  return result.tempFilePath;
}

async function loadCanvasImage(canvas: any, source: string): Promise<any> {
  const image = canvas.createImage();
  const filePath = await posterImageSource(source);
  return new Promise((resolve, reject) => {
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('群二维码加载失败'));
    image.src = filePath;
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

Page({
  loadRequestId: 0,
  unloaded: false,
  exportBusy: false,
  posterBusy: false,
  data: {
    loading: true,
    activityId: '',
    error: '',
    item: null as any,
    registration: null as any,
    attendees: [] as any[],
    selectedAttendee: null as any,
    galleryImages: [] as string[],
    displayDate: '',
    startTime: '',
    endTime: '',
    deadlineTime: '',
    hasElevationProfile: false,
    coverFailed: false,
    exportingGpx: false,
    generatingPoster: false,
    teamId: '',
    activityAction: unavailableAction(),
    isAdmin: false,
    adminRegistrationLabel: '管理员报名',
    viewerStatus: { key: 'guest', label: '未登录', hint: '登录后可报名并查看报名进度' },
    attendeesVisible: false,
    groupQrVisible: false,
    groupQrLockedMessage: '报名审核通过后可查看活动群二维码',
    groupQrCodeExpired: false,
  },
  onShow() {
    if (this.data.item && this.data.activityId && !this.data.loading)
      void this.load(this.data.activityId);
  },
  onLoad(q: any) {
    this.unloaded = false;
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
  },
  onUnload() {
    this.unloaded = true;
    this.loadRequestId += 1;
  },
  safeSetData(value: Record<string, unknown>, callback?: () => void) {
    if (!this.unloaded) this.setData(value, callback);
  },
  async load(id: string) {
    const requestId = ++this.loadRequestId;
    this.safeSetData({
      loading: true,
      error: '',
      coverFailed: false,
      selectedAttendee: null,
      activityAction: unavailableAction(),
    });
    try {
      const item = await rideService.getActivity(id);
      if (requestId !== this.loadRequestId || this.unloaded) return;
      if (!item) throw new Error('活动不存在');
      const isLoggedIn = !['unavailable', 'error'].includes(appStore.authStatus);
      const registration = isLoggedIn
        ? (await rideService.listRegistrations()).find((value) => value.activityId === id)
        : undefined;
      if (requestId !== this.loadRequestId || this.unloaded) return;
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
      const elevationProfile = validElevationProfile(detail.route?.elevationProfile);
      this.safeSetData(
        {
          item: detail,
          registration,
          attendees: canSeeAttendees && Array.isArray(detail.attendees) ? detail.attendees : [],
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
          galleryImages: item.images?.length
            ? item.images
            : item.coverImage
              ? [item.coverImage]
              : [],
          displayDate: formatActivityDate(item.startAt || item.date),
          startTime: formatChinaDateTimeSeconds(item.startAt),
          endTime: formatChinaDateTimeSeconds(item.endAt),
          deadlineTime: formatChinaDateTimeSeconds(item.deadline),
          hasElevationProfile: elevationProfile.length >= 2,
          activityAction: primaryAction(item, registration, state),
          groupQrCodeExpired: groupQrExpired(detail.groupQrCodeUploadedAt),
        },
        () => this.drawElevation(),
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
  attendeeAvatarError(event: any) {
    const index = Number(event.currentTarget.dataset.index);
    if (!Number.isInteger(index) || !this.data.attendees[index]?.avatarUrl) return;
    const attendees = this.data.attendees.map((attendee: any, attendeeIndex: number) =>
      attendeeIndex === index ? { ...attendee, avatarUrl: '' } : attendee,
    );
    this.safeSetData({ attendees });
  },
  selectedAttendeeAvatarError() {
    if (!this.data.selectedAttendee?.avatarUrl) return;
    this.safeSetData({ selectedAttendee: { ...this.data.selectedAttendee, avatarUrl: '' } });
  },
  openAttendeeCard(event: any) {
    const index = Number(event.currentTarget.dataset.index);
    const attendee = this.data.attendees[index];
    if (attendee)
      this.safeSetData({ selectedAttendee: { ...attendee, ...genderView(attendee.gender) } });
  },
  closeAttendeeCard() {
    this.safeSetData({ selectedAttendee: null });
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
  openStravaRoute() {
    const url = this.data.item?.route?.stravaRouteUrl;
    if (typeof url !== 'string' || !/^https:\/\//i.test(url)) {
      wx.showToast({ title: '暂无 Strava 路线', icon: 'none' });
      return;
    }
    wx.setClipboardData({
      data: url,
      success: () => {
        if (typeof wx.showModal === 'function') {
          wx.showModal({
            title: 'Strava 路线链接已复制',
            content: '请切换到系统浏览器或 Strava 粘贴打开，即可查看和收藏完整路线。',
            showCancel: false,
            confirmText: '知道了',
          });
          return;
        }
        wx.showToast({ title: '链接已复制，请到浏览器或 Strava 打开', icon: 'none' });
      },
      fail: () => wx.showToast({ title: '复制失败，请稍后重试', icon: 'none' }),
    });
  },
  copyActivityLink() {
    const id = this.data.item?.id;
    if (!id) return;
    wx.setClipboardData({
      data: `pages/activity-detail/index?id=${encodeURIComponent(id)}`,
      success: () => wx.showToast({ title: '活动链接已复制', icon: 'success' }),
      fail: () => wx.showToast({ title: '复制失败，请稍后重试', icon: 'none' }),
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
  async exportGpx() {
    const activityId = this.data.item?.id;
    if (!activityId || this.exportBusy) return;
    this.exportBusy = true;
    this.safeSetData({ exportingGpx: true });
    try {
      const result = await rideService.exportActivityGpx(activityId);
      const bytes = base64Bytes(result?.base64);
      if (bytes < 0) throw new Error('路线文件格式错误');
      if (bytes > MAX_GPX_BYTES) throw new Error('路线文件超过 4MB，请先在 Strava 简化路线后重试');
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
        title: error instanceof Error ? error.message : 'GPX 导出失败，请稍后重试',
        icon: 'none',
      });
    } finally {
      this.exportBusy = false;
      this.safeSetData({ exportingGpx: false });
    }
  },
  async generatePoster() {
    if (!this.data.item || this.posterBusy) return;
    if (!this.data.groupQrVisible || !this.data.item.groupQrCode) {
      wx.showToast({ title: '报名审核通过后可生成含群二维码的海报', icon: 'none' });
      return;
    }
    this.posterBusy = true;
    this.safeSetData({ generatingPoster: true });
    try {
      const target = await new Promise<any>((resolve, reject) => {
        wx.createSelectorQuery()
          .select('#poster-canvas')
          .fields({ node: true, size: true })
          .exec((result: any[]) =>
            result?.[0]?.node ? resolve(result[0]) : reject(new Error('海报画布不可用')),
          );
      });
      const canvas = target.node;
      const width = 375;
      const height = 700;
      const ratio = wx.getWindowInfo?.().pixelRatio || wx.getSystemInfoSync?.().pixelRatio || 1;
      canvas.width = width * ratio;
      canvas.height = height * ratio;
      const context = canvas.getContext('2d');
      context.setTransform?.(ratio, 0, 0, ratio, 0, 0);
      const groupQrImage = await loadCanvasImage(canvas, this.data.item.groupQrCode);
      const startLocation = this.data.item.route?.startLocation;
      const approvedCount = Number.isInteger(this.data.item.approvedRegistrationCount)
        ? this.data.item.approvedRegistrationCount
        : this.data.attendees.length;
      if (
        !drawActivityPoster(context, width, height, this.data.item, {
          displayTime: this.data.startTime || '待公布',
          locationName:
            this.data.item.route?.start ||
            startLocation?.name ||
            startLocation?.address ||
            '待公布',
          locationAddress: startLocation?.address,
          approvedCount,
          attendeeNames: this.data.attendees.map((attendee: any) => attendee.displayName),
          groupQrImage,
        })
      )
        throw new Error('海报绘制失败');
      const tempFilePath = await new Promise<string>((resolve, reject) =>
        wx.canvasToTempFilePath({
          canvas,
          destWidth: width * ratio,
          destHeight: height * ratio,
          success: (result: { tempFilePath: string }) => resolve(result.tempFilePath),
          fail: reject,
        }),
      );
      await new Promise<void>((resolve, reject) =>
        wx.saveImageToPhotosAlbum({
          filePath: tempFilePath,
          success: () => resolve(),
          fail: reject,
        }),
      );
      wx.showToast({ title: '海报已保存', icon: 'success' });
    } catch (error) {
      wx.showToast({
        title: error instanceof Error ? error.message : '海报生成失败，请重试',
        icon: 'none',
      });
    } finally {
      this.posterBusy = false;
      this.safeSetData({ generatingPoster: false });
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
    wx.navigateTo({
      url: '/pages/registration-form/index?id=' + this.data.item.id + teamQuery,
    });
  },
});
