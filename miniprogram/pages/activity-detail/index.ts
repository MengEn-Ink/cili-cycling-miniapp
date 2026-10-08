import { rideService } from '../../services/ride-service';
import { syncPageTheme } from '../../services/theme-service';
import type { ActivityAction } from '../../utils/activity';
import { resolveActivityAction } from '../../utils/activity';
import { drawActivityPoster } from './poster';
import {
  drawElevationProfile,
  formatActivityDate,
  formatChinaDateTimeSeconds,
  validElevationProfile,
} from './format';

const MAX_GPX_BYTES = 4 * 1024 * 1024;
const DEFAULT_ATTENDEE_AVATAR = '/assets/profile/avatars/cili-orange.png';

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

Page({
  loadRequestId: 0,
  unloaded: false,
  exportBusy: false,
  posterBusy: false,
  data: {
    theme: 'dark',
    themeClass: 'theme-dark',
    loading: true,
    error: '',
    item: null as any,
    registration: null as any,
    attendees: [] as any[],
    selectedAttendee: null as any,
    defaultAttendeeAvatar: DEFAULT_ATTENDEE_AVATAR,
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
  },
  onShow() {
    syncPageTheme(this);
  },
  onLoad(q: any) {
    this.unloaded = false;
    const teamId =
      typeof q.team_id === 'string' && /^team_[A-Za-z0-9_-]{8,80}$/.test(q.team_id)
        ? q.team_id
        : '';
    this.safeSetData({ teamId });
    wx.showShareMenu?.({ menus: ['shareAppMessage'] });
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
      const registration = (await rideService.listRegistrations()).find(
        (value) => value.activityId === id,
      );
      if (requestId !== this.loadRequestId || this.unloaded) return;
      const detail = item as any;
      const elevationProfile = validElevationProfile(detail.route?.elevationProfile);
      this.safeSetData(
        {
          item: detail,
          registration,
          attendees: Array.isArray(detail.attendees) ? detail.attendees : [],
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
          activityAction: resolveActivityAction(item, registration),
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
    if (attendee) this.safeSetData({ selectedAttendee: attendee });
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
  openStravaRoute() {
    const url = this.data.item?.route?.stravaRouteUrl;
    if (typeof url !== 'string' || !/^https:\/\//i.test(url)) {
      wx.showToast({ title: '暂无 Strava 路线', icon: 'none' });
      return;
    }
    wx.setClipboardData({
      data: url,
      success: () => wx.showToast({ title: '链接已复制，请到系统浏览器打开', icon: 'none' }),
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
    const teamId = this.data.registration?.isTeamLeader
      ? this.data.registration.teamId
      : this.data.teamId;
    const teamQuery = teamId ? `&team_id=${encodeURIComponent(teamId)}` : '';
    return {
      title: item?.title || '骑行活动详情',
      path: `pages/activity-detail/index?id=${encodeURIComponent(item?.id || '')}${teamQuery}`,
    };
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
      const height = 600;
      const ratio = wx.getWindowInfo?.().pixelRatio || wx.getSystemInfoSync?.().pixelRatio || 1;
      canvas.width = width * ratio;
      canvas.height = height * ratio;
      const context = canvas.getContext('2d');
      context.setTransform?.(ratio, 0, 0, ratio, 0, 0);
      if (!drawActivityPoster(context, width, height, this.data.item))
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
  go() {
    const action = this.data.activityAction as ActivityAction;
    if (!action.enabled || !this.data.item) return;
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
