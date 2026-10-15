import type {
  ActivityLocation,
  EditableActivity,
  PublicRoutePreview,
  RouteGpxPreview,
} from '../../../models';
import type { ActivityInput } from '../../../repositories/types';
import { rideService } from '../../../services/ride-service';
import { appStore } from '../../../store/app-store';
import { formatLocalDateTime, parseLocalDateTime } from '../../../utils/date-time';
import { drawRouteOutline } from '../../../utils/route-outline';
import { getSharedTempFileUrlCache, type TempFileUrlCache } from '../../../utils/temp-file-url';
import {
  normalizeStravaRouteUrl,
  routeErrorMessage,
  routeUploadPath,
  sha256Hex,
  type ExternalRouteReference,
} from '../../../utils/route';
import { drawElevationProfile } from '../../activity-detail/format';

type Form = {
  title: string;
  startDate: string;
  startTime: string;
  routeStart: string;
  description: string;
  stravaRouteUrl: string;
};
type FormField = keyof Form;
type FormErrorAnchor = FormField | 'startAt';
type FormErrors = Partial<Record<FormErrorAnchor, string>>;
type PendingImage = {
  id: string;
  previewPath: string;
  status: 'uploading' | 'failed' | 'uploaded';
  fileId?: string;
  // 上传目标路径在选择时即确定：同内容图片始终指向同一对象，重试覆盖、重复选择不产生新对象。
  cloudPath?: string;
};
type PendingRouteUpload = {
  gpxFileId: string;
  gpxSha256: string;
  fileName: string;
  requestId: string;
};

const MAX_IMAGES = 3;
const MAX_GPX_BYTES = 4 * 1024 * 1024;
const GROUP_QR_EXPIRE_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_CAPACITY = 500;
const emptyForm = (): Form => ({
  title: '',
  startDate: '',
  startTime: '',
  routeStart: '',
  description: '',
  stravaRouteUrl: '',
});
const pickerDate = (value: string) => value.trim().slice(0, 10);
const pickerTime = (value: string) => value.trim().slice(11, 16);
const newCreateRequestId = () =>
  `activity_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
const newRouteRequestId = () =>
  `route_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
const errorCode = (error: unknown) =>
  typeof (error as { code?: unknown })?.code === 'string' ? (error as { code: string }).code : '';
const protocolText = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
const safeHttpsUrl = (value: unknown) =>
  typeof value === 'string' && /^https:\/\/[^\s/]+(?:\/[^\s]*)?$/i.test(value) ? value : '';
const protocolDate = (value: unknown) => {
  const text = protocolText(value);
  if (!text) return undefined;
  const timestamp = new Date(text).getTime();
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : text;
};
const protocolStringArray = (value: unknown) =>
  Array.isArray(value) ? value.map(protocolText).filter(Boolean) : [];
const stableValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, stableValue(entry)]),
  );
};
const activityContentProjection = (activity: EditableActivity | ActivityInput) => {
  const images = Array.isArray(activity.images) ? activity.images.map(protocolText) : [];
  const groupQrCode = protocolText(activity.groupQrCode);
  const route = activity.route;
  const hasTrustedDetails = Boolean(route.gpxPreviewId || route.publicRoutePreviewId);
  let externalRoute: ExternalRouteReference | undefined;
  try {
    const routeUrl = route.externalRouteUrl || route.stravaRouteUrl;
    externalRoute = routeUrl ? normalizeStravaRouteUrl(routeUrl) : undefined;
  } catch {
    externalRoute = undefined;
  }
  const feePresent =
    typeof activity.fee === 'string' ||
    Array.isArray(activity.feeIncluded) ||
    Array.isArray(activity.feeExcluded);
  const supportVehicleDriver =
    activity.supportVehicleCapacity === 0
      ? { nickname: '', licensePlate: '', contactPhone: '' }
      : activity.supportVehicleDriver
        ? {
            nickname: protocolText(activity.supportVehicleDriver.nickname),
            licensePlate: protocolText(activity.supportVehicleDriver.licensePlate).toUpperCase(),
            contactPhone: protocolText(activity.supportVehicleDriver.contactPhone),
          }
        : undefined;
  const location = (value: ActivityLocation | undefined) =>
    value
      ? {
          name: protocolText(value.name),
          address: protocolText(value.address),
          latitude: value.latitude,
          longitude: value.longitude,
        }
      : undefined;
  return {
    title: protocolText(activity.title),
    description: protocolText(activity.description),
    images,
    coverImage: protocolText(activity.coverImage) || images[0],
    groupQrCode,
    groupQrCodeUploadedAt: groupQrCode ? protocolDate(activity.groupQrCodeUploadedAt) : undefined,
    capacity: activity.capacity,
    registrationUnlimited: activity.registrationUnlimited === true ? true : undefined,
    supportVehicleCapacity: activity.supportVehicleCapacity,
    selfDriveCapacity: activity.selfDriveCapacity,
    supportVehicleDriver,
    deadline: protocolDate(activity.deadline),
    startAt: protocolDate(activity.startAt),
    endAt: protocolDate(activity.endAt),
    route: {
      start: protocolText(route.start),
      end: protocolText(route.end),
      startLocation: location(route.startLocation),
      endLocation: location(route.endLocation),
      distanceKm: route.distanceKm,
      elevationM: route.elevationM,
      estimatedMovingTimeSeconds: route.estimatedMovingTimeSeconds,
      level: protocolText(route.level),
      gpxFileId: protocolText(route.gpxFileId),
      gpxPreviewId: protocolText(route.gpxPreviewId),
      publicRoutePreviewId: protocolText(route.publicRoutePreviewId),
      gpxSha256: protocolText(route.gpxSha256),
      generatedPreviewFileId: protocolText(route.generatedPreviewFileId),
      elevationLossM: hasTrustedDetails ? route.elevationLossM : undefined,
      elevationMinM: hasTrustedDetails ? route.elevationMinM : undefined,
      elevationMaxM: hasTrustedDetails ? route.elevationMaxM : undefined,
      estimationSource: hasTrustedDetails ? route.estimationSource : undefined,
      routeOutline: hasTrustedDetails ? route.routeOutline : undefined,
      externalProvider: externalRoute?.provider,
      externalRouteId: externalRoute?.routeId,
      externalRouteUrl: externalRoute?.url,
      routeName: hasTrustedDetails ? protocolText(route.routeName) : undefined,
      elevationProfile: hasTrustedDetails ? route.elevationProfile : undefined,
      routeBounds: hasTrustedDetails ? route.routeBounds : undefined,
    },
    schedule: Array.isArray(activity.schedule)
      ? activity.schedule.map((item) => ({
          time: protocolText(item.time),
          title: protocolText(item.title),
          location: protocolText(item.location),
          remark: protocolText(item.remark),
        }))
      : [],
    notices: protocolStringArray(activity.notices),
    equipment: protocolStringArray(activity.equipment),
    fee: feePresent ? protocolText(activity.fee) : undefined,
    feeIncluded: feePresent ? protocolStringArray(activity.feeIncluded) : undefined,
    feeExcluded: feePresent ? protocolStringArray(activity.feeExcluded) : undefined,
  };
};
const activityContentFingerprint = (activity: EditableActivity | ActivityInput) =>
  JSON.stringify(stableValue(activityContentProjection(activity)));
const sameDraftSnapshot = (expected: EditableActivity, current: EditableActivity) =>
  current.id === expected.id &&
  current.version === expected.version &&
  activityContentFingerprint(current) === activityContentFingerprint(expected);
const activityConflict = () =>
  Object.assign(new Error('活动已被其他人更新，请重新加载后再试'), {
    code: 'ACTIVITY_CONFLICT',
  });
const mediaExtension = (path: string) => {
  const match = /\.([a-zA-Z0-9]{1,8})(?:\?|$)/.exec(path);
  return match ? `.${match[1].toLowerCase()}` : '.jpg';
};
// 从云文件 ID 反解对象路径（cloud://<env>/ 之后的部分），用于与新选图片的指纹比对去重。
const fileIdCloudPath = (fileId: string) => {
  const match = /^cloud:\/\/[^/]+\//.exec(fileId);
  return match ? fileId.slice(match[0].length) : '';
};
// 以文件内容 md5 作为幂等键生成确定性对象路径；取不到指纹时退回随机命名，保证上传可用性优先。
async function contentCloudPath(previewPath: string, folder = 'profiles/activity-media') {
  const ownerFolder = appStore.openid ? `${folder}/${appStore.openid}` : folder;
  try {
    const info: any = await wx.getFileInfo({ filePath: previewPath, digestAlgorithm: 'md5' });
    if (info?.digest) {
      return `${ownerFolder}/${info.digest}${mediaExtension(previewPath)}`;
    }
  } catch {
    // 旧基础库不支持摘要或读取失败时降级为随机路径，不阻断上传。
  }
  const random = Math.random().toString(36).slice(2, 10);
  return `${ownerFolder}/${Date.now()}-${random}${mediaExtension(previewPath)}`;
}
const isCancel = (error: unknown) =>
  typeof (error as { errMsg?: unknown })?.errMsg === 'string' &&
  (error as { errMsg: string }).errMsg.includes('cancel');
const userError = (message: string, code = 'ROUTE_USER_ERROR') =>
  Object.assign(new Error(message), { code });

function readFileBytes(filePath: string): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().readFile({
      filePath,
      success: (result: { data: ArrayBuffer | string }) => {
        if (typeof result.data === 'string') {
          reject(userError('这个文件不是有效的 GPX，请重新导出后上传', 'GPX_INVALID'));
          return;
        }
        resolve(new Uint8Array(result.data));
      },
      fail: reject,
    });
  });
}

function activityOfficialRoute(activity: EditableActivity): ExternalRouteReference | undefined {
  const url = activity.route.externalRouteUrl || activity.route.stravaRouteUrl || '';
  if (!url) return undefined;
  try {
    return normalizeStravaRouteUrl(url);
  } catch {
    return undefined;
  }
}

function activityRoutePreview(activity: EditableActivity): RouteGpxPreview | undefined {
  const route = activity.route;
  if (
    !route.gpxPreviewId ||
    !route.gpxFileId ||
    !route.gpxSha256 ||
    !route.routeName ||
    !Number.isFinite(route.elevationLossM) ||
    !Number.isFinite(route.elevationMinM) ||
    !Number.isFinite(route.elevationMaxM) ||
    route.estimationSource !== 'cili' ||
    !route.elevationProfile ||
    route.elevationProfile.length < 2 ||
    !route.routeOutline ||
    route.routeOutline.length < 2 ||
    !route.routeBounds
  )
    return undefined;
  return {
    previewId: route.gpxPreviewId,
    gpxFileId: route.gpxFileId,
    gpxSha256: route.gpxSha256,
    ...(route.generatedPreviewFileId
      ? { generatedPreviewFileId: route.generatedPreviewFileId }
      : {}),
    ...(route.generatedPreviewUrl ? { generatedPreviewUrl: route.generatedPreviewUrl } : {}),
    routeName: route.routeName,
    distanceKm: route.distanceKm,
    elevationM: route.elevationM,
    elevationLossM: route.elevationLossM!,
    elevationMinM: route.elevationMinM!,
    elevationMaxM: route.elevationMaxM!,
    estimatedMovingTimeSeconds: route.estimatedMovingTimeSeconds || 60,
    estimationSource: 'cili',
    elevationProfile: route.elevationProfile,
    routeOutline: route.routeOutline,
    routeBounds: route.routeBounds,
    expiresAt: '',
  };
}

function activityPublicRoutePreview(activity: EditableActivity): PublicRoutePreview | undefined {
  const route = activity.route;
  if (
    !route.publicRoutePreviewId ||
    route.externalProvider !== 'strava' ||
    !route.externalRouteId ||
    !route.externalRouteUrl ||
    !route.routeName ||
    !Number.isFinite(route.elevationLossM) ||
    !Number.isFinite(route.elevationMinM) ||
    !Number.isFinite(route.elevationMaxM) ||
    route.estimationSource !== 'cili' ||
    !route.elevationProfile ||
    route.elevationProfile.length < 2 ||
    !route.routeOutline ||
    route.routeOutline.length < 2 ||
    !route.routeBounds
  )
    return undefined;
  return {
    previewId: route.publicRoutePreviewId,
    externalProvider: 'strava',
    externalRouteId: route.externalRouteId,
    externalRouteUrl: route.externalRouteUrl,
    routeName: route.routeName,
    distanceKm: route.distanceKm,
    elevationM: route.elevationM,
    elevationLossM: route.elevationLossM!,
    elevationMinM: route.elevationMinM!,
    elevationMaxM: route.elevationMaxM!,
    estimatedMovingTimeSeconds: route.estimatedMovingTimeSeconds || 60,
    estimationSource: 'cili',
    elevationProfile: route.elevationProfile,
    routeOutline: route.routeOutline,
    routeBounds: route.routeBounds,
    expiresAt: '',
  };
}

function locationFailure(
  error: unknown,
): 'cancel' | 'system-location' | 'platform-config' | 'unknown' {
  const message =
    typeof (error as { errMsg?: unknown })?.errMsg === 'string'
      ? (error as { errMsg: string }).errMsg.toLowerCase()
      : '';
  if (message.includes('cancel')) return 'cancel';
  if (/system permission denied|location service|location unavailable|gps|定位服务/.test(message))
    return 'system-location';
  if (
    /privacy|not declared|requiredprivateinfos|api scope|api.*not.*open|errno[:= ]*112/.test(
      message,
    )
  )
    return 'platform-config';
  return 'unknown';
}

function groupQrExpired(uploadedAt?: string) {
  if (!uploadedAt) return false;
  const time = new Date(uploadedAt).getTime();
  return Number.isFinite(time) && Date.now() - time >= GROUP_QR_EXPIRE_MS;
}

function derivedTimes(startAt: string) {
  const start = new Date(startAt);
  const deadline = new Date(start.getTime() - 60 * 1000);
  const end = new Date(start.getTime() + 4 * 60 * 60 * 1000);
  return { deadline: deadline.toISOString(), endAt: end.toISOString() };
}

const formatRouteDuration = (seconds?: number) => {
  if (!Number.isFinite(seconds) || !seconds || seconds <= 0) return '待估算';
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours ? `${hours} 小时${minutes ? ` ${minutes} 分` : ''}` : `${minutes} 分钟`;
};

Page({
  unloaded: false,
  saveInFlight: false,
  createRequestId: '',
  routeRequestId: '',
  mediaPreviewRequestId: 0,
  mediaPreviewRetryIds: new Set<string>(),
  data: {
    allowed: false,
    isAdmin: false,
    loading: true,
    saving: false,
    uploading: false,
    syncingRoute: false,
    uploadingRoute: false,
    choosingLocation: false,
    error: '',
    formErrors: {} as FormErrors,
    id: '',
    version: 0,
    status: 'draft',
    originalActivity: undefined as EditableActivity | undefined,
    images: [] as string[],
    imagePreviewUrls: [] as string[],
    mediaPreviewLoading: false,
    pendingImages: [] as PendingImage[],
    sessionUploadedIds: [] as string[],
    imagesTouched: false,
    coverImage: '',
    groupQrCode: '',
    groupQrPreviewUrl: '',
    groupQrCodeUploadedAt: '',
    groupQrCodeExpired: false,
    pendingGroupQrCode: undefined as PendingImage | undefined,
    routeStartLocation: undefined as ActivityLocation | undefined,
    officialRoute: undefined as ExternalRouteReference | undefined,
    publicRoutePreview: undefined as PublicRoutePreview | undefined,
    routePreview: undefined as RouteGpxPreview | undefined,
    pendingRouteUpload: undefined as PendingRouteUpload | undefined,
    sessionRouteFileIds: [] as string[],
    routeStatusMessage: '',
    routeCoverSelected: false,
    routeTimeLabel: '',
    form: emptyForm(),
  },
  async onLoad(options: Record<string, string>) {
    this.unloaded = false;
    await appStore.ensureIdentity(wx.cloud);
    if (appStore.authStatus !== 'authenticated') {
      this.setData({ loading: false, error: '请先完成微信身份验证' });
      return;
    }
    const id = typeof options.id === 'string' ? options.id : '';
    if (typeof wx.setNavigationBarTitle === 'function') {
      wx.setNavigationBarTitle({ title: id ? '编辑活动' : '创建活动' });
    }
    this.createRequestId = id ? '' : newCreateRequestId();
    this.routeRequestId = newRouteRequestId();
    this.setData({ allowed: true, isAdmin: appStore.role === 'admin', id });
    if (!id) {
      this.setData({ loading: false });
      return;
    }
    try {
      const activity = await rideService.getAdminActivity(id);
      if (!activity) throw new Error('活动不存在');
      const images = activity.images?.length
        ? activity.images.slice(0, MAX_IMAGES)
        : activity.coverImage
          ? [activity.coverImage]
          : [];
      const startAtText = formatLocalDateTime(activity.startAt);
      const officialRoute = activityOfficialRoute(activity);
      const publicRoutePreview = activityPublicRoutePreview(activity);
      const routePreview = activityRoutePreview(activity);
      this.setData({
        loading: false,
        status: activity.status,
        version: activity.version,
        originalActivity: activity,
        images,
        imagePreviewUrls: images.map(
          (fileId) =>
            safeHttpsUrl(fileId) ||
            activity.imagePreviewUrls?.[activity.images?.indexOf(fileId) ?? -1] ||
            (fileId === activity.coverImage ? activity.coverPreviewUrl : '') ||
            '',
        ),
        coverImage: activity.coverImage || images[0] || '',
        groupQrCode: activity.groupQrCode || '',
        groupQrPreviewUrl: activity.groupQrPreviewUrl || '',
        groupQrCodeUploadedAt: activity.groupQrCodeUploadedAt || '',
        groupQrCodeExpired: groupQrExpired(activity.groupQrCodeUploadedAt),
        pendingGroupQrCode: undefined,
        routeStartLocation: activity.route.startLocation,
        officialRoute,
        publicRoutePreview,
        routePreview,
        routeStatusMessage: routePreview ? '路线详情已准备好' : '',
        routeCoverSelected: Boolean(
          routePreview?.generatedPreviewFileId &&
          activity.coverImage === routePreview.generatedPreviewFileId,
        ),
        routeTimeLabel: formatRouteDuration(
          routePreview?.estimatedMovingTimeSeconds ||
            publicRoutePreview?.estimatedMovingTimeSeconds ||
            activity.route.estimatedMovingTimeSeconds,
        ),
        form: {
          title: activity.title,
          startDate: pickerDate(startAtText),
          startTime: pickerTime(startAtText),
          routeStart: activity.route.start,
          description: activity.description,
          stravaRouteUrl: officialRoute?.url || '',
        } as Form,
      });
      void this.refreshMediaPreviews(activity);
    } catch (error) {
      this.setData({
        loading: false,
        error: error instanceof Error ? error.message : '活动加载失败',
      });
    }
  },
  onShow() {
    if (!this.data.loading) void this.refreshMediaPreviews();
  },
  ensureMediaUrlCache(): TempFileUrlCache | null {
    const cloud = wx.cloud as
      | (WxCloudApi & {
          getTempFileURL?(options: { fileList: string[] }): Promise<{
            fileList?: { fileID?: string; tempFileURL?: string }[];
          }>;
        })
      | undefined;
    if (typeof cloud?.getTempFileURL !== 'function') return null;
    const getTempFileURL = cloud.getTempFileURL;
    return getSharedTempFileUrlCache({
      getTempFileURL: (options) => getTempFileURL.call(cloud, options),
    });
  },
  async refreshMediaPreviews(authoritativeActivity?: EditableActivity) {
    const images = [...this.data.images];
    const groupQrCode = this.data.groupQrCode;
    const requestId = ++this.mediaPreviewRequestId;
    this.setData({ mediaPreviewLoading: true });
    let authoritative = authoritativeActivity;
    if (!authoritative && this.data.id) {
      try {
        authoritative = await rideService.getAdminActivity(this.data.id);
      } catch {
        // 管理端临时地址刷新失败时，继续尝试兼容旧版云函数的客户端解析。
      }
    }
    const signedByFileId = new Map<string, string>();
    const authoritativePreviewUrls = authoritative?.imagePreviewUrls;
    authoritative?.images?.forEach((fileId, index) => {
      const url = safeHttpsUrl(authoritativePreviewUrls?.[index] || '');
      if (url) signedByFileId.set(fileId, url);
    });
    if (authoritative?.coverImage) {
      const coverUrl = safeHttpsUrl(authoritative.coverPreviewUrl || '');
      if (coverUrl) signedByFileId.set(authoritative.coverImage, coverUrl);
    }
    const authoritativeGroupQrCode = authoritative?.groupQrCode;
    const authoritativeGroupQrUrl = authoritative?.groupQrPreviewUrl;
    const signedGroupQrUrl =
      authoritativeGroupQrCode === groupQrCode ? safeHttpsUrl(authoritativeGroupQrUrl || '') : '';
    const currentRoutePreview = this.data.routePreview;
    const authoritativeRoute = authoritative?.route;
    const authoritativeRoutePreviewUrl = authoritativeRoute?.generatedPreviewUrl;
    const refreshedRouteUrl =
      currentRoutePreview?.generatedPreviewFileId &&
      currentRoutePreview.generatedPreviewFileId === authoritativeRoute?.generatedPreviewFileId
        ? safeHttpsUrl(authoritativeRoutePreviewUrl || '')
        : '';
    const cloudFileIds = [...images, groupQrCode].filter(
      (value): value is string =>
        typeof value === 'string' &&
        value.startsWith('cloud://') &&
        !signedByFileId.has(value) &&
        !(value === groupQrCode && signedGroupQrUrl),
    );
    let resolved: Record<string, string> = {};
    const cache = this.ensureMediaUrlCache();
    if (cache && cloudFileIds.length) {
      try {
        resolved = await cache.resolve(cloudFileIds);
      } catch {
        // 单张预览失败不阻断活动编辑；下次 onShow 会自动重试。
      }
    }
    if (requestId !== this.mediaPreviewRequestId || this.unloaded) return;
    const latestImages = [...this.data.images];
    const latestGroupQrCode = this.data.groupQrCode;
    const latestRoutePreview = this.data.routePreview;
    const refreshedRoutePreview =
      refreshedRouteUrl &&
      latestRoutePreview?.generatedPreviewFileId === currentRoutePreview?.generatedPreviewFileId
        ? { ...latestRoutePreview, generatedPreviewUrl: refreshedRouteUrl }
        : undefined;
    const existingByFileId = new Map(
      latestImages.map((fileId: string, index: number) => [
        fileId,
        this.data.imagePreviewUrls[index] || '',
      ]),
    );
    this.setData({
      imagePreviewUrls: latestImages.map(
        (fileId) =>
          safeHttpsUrl(fileId) ||
          signedByFileId.get(fileId) ||
          resolved[fileId] ||
          existingByFileId.get(fileId) ||
          '',
      ),
      groupQrPreviewUrl:
        safeHttpsUrl(latestGroupQrCode) ||
        signedGroupQrUrl ||
        resolved[latestGroupQrCode] ||
        (latestGroupQrCode === groupQrCode ? this.data.groupQrPreviewUrl : '') ||
        '',
      mediaPreviewLoading: false,
      ...(refreshedRoutePreview ? { routePreview: refreshedRoutePreview } : {}),
    });
  },
  storedMediaPreviewLoad(event: any) {
    const fileId = event?.currentTarget?.dataset?.fileId;
    if (typeof fileId === 'string') this.mediaPreviewRetryIds.delete(fileId);
  },
  storedMediaPreviewError(event: any) {
    const fileId = event?.currentTarget?.dataset?.fileId;
    if (typeof fileId !== 'string' || !fileId) return;
    const cache = this.ensureMediaUrlCache();
    cache?.invalidate([fileId]);
    const imageIndex = this.data.images.indexOf(fileId);
    if (imageIndex >= 0) {
      const imagePreviewUrls = [...this.data.imagePreviewUrls];
      imagePreviewUrls[imageIndex] = '';
      this.setData({ imagePreviewUrls });
    }
    if (fileId === this.data.groupQrCode) this.setData({ groupQrPreviewUrl: '' });
    if (this.mediaPreviewRetryIds.has(fileId)) return;
    // 临时地址可能刚好过期；每个文件自动刷新一次，二次失败后保留可点击重试入口。
    this.mediaPreviewRetryIds.add(fileId);
    void this.refreshMediaPreviews();
  },
  retryStoredMediaPreview(event: any) {
    const fileId = event?.currentTarget?.dataset?.fileId;
    if (typeof fileId === 'string') this.mediaPreviewRetryIds.delete(fileId);
    void this.refreshMediaPreviews();
  },
  onReady() {
    void this.renderRouteVisuals();
  },
  cleanupSessionUploads(fileList?: string[]) {
    const targets = fileList || [
      ...new Set([...this.data.sessionUploadedIds, ...this.data.sessionRouteFileIds]),
    ];
    if (!targets.length || !wx.cloud || typeof wx.cloud.deleteFile !== 'function') return;
    void wx.cloud.deleteFile({ fileList: targets }).catch(() => undefined);
  },
  async createDraft(activity: ActivityInput) {
    if (!this.createRequestId) this.createRequestId = newCreateRequestId();
    try {
      return await rideService.saveActivity(
        { ...activity, status: 'draft' },
        undefined,
        undefined,
        this.createRequestId,
      );
    } catch (error) {
      if (errorCode(error) !== 'CALL_FAILED') throw error;
      return rideService.saveActivity(
        { ...activity, status: 'draft' },
        undefined,
        undefined,
        this.createRequestId,
      );
    }
  },
  async publishDraft(activity: ActivityInput, draft: EditableActivity) {
    const published = { ...activity, status: 'published' as const };
    const attemptPublish = async (canRetry: boolean): Promise<EditableActivity> => {
      try {
        return await rideService.saveActivity(published, draft.id, draft.version);
      } catch (error) {
        if (errorCode(error) !== 'CALL_FAILED') throw error;
        let current: EditableActivity;
        try {
          const readback = await rideService.getAdminActivity(draft.id);
          if (!readback) throw error;
          current = readback;
        } catch {
          throw error;
        }
        if (current.status === 'published') {
          if (
            current.id !== draft.id ||
            activityContentFingerprint(current) !== activityContentFingerprint(published)
          )
            throw activityConflict();
          return current;
        }
        if (current.status !== 'draft') throw error;
        if (!sameDraftSnapshot(draft, current)) throw activityConflict();
        if (!canRetry) throw error;
        return attemptPublish(false);
      }
    };
    return attemptPublish(true);
  },
  onUnload() {
    this.unloaded = true;
    this.mediaPreviewRequestId += 1;
    if (!this.saveInFlight) this.cleanupSessionUploads();
  },
  showFormError(message: string, field?: FormErrorAnchor) {
    const formErrors = field ? { [field]: message } : {};
    this.setData({ error: message, formErrors });
    wx.showModal({ title: '请检查活动信息', content: message, showCancel: false });
    if (field && typeof wx.pageScrollTo === 'function')
      wx.pageScrollTo({ selector: `[data-error-anchor="${field}"]`, duration: 240 });
  },
  clearFieldError(field: FormField) {
    if (!(this.data.formErrors as FormErrors)[field]) return;
    const formErrors = { ...(this.data.formErrors as FormErrors) };
    delete formErrors[field];
    this.setData({ formErrors, error: Object.keys(formErrors).length ? this.data.error : '' });
  },
  field(event: any) {
    const name = event.currentTarget.dataset.name as FormField;
    const patch: Record<string, unknown> = { [`form.${name}`]: event.detail.value };
    if (name === 'routeStart' && this.data.routeStartLocation) {
      // 地图坐标与用户可读名称是两层信息：改名称时保留点位，详情页才能继续发起导航。
      patch.routeStartLocation = {
        ...this.data.routeStartLocation,
        name: String(event.detail.value || '').trim(),
      };
    }
    this.setData(patch);
    this.clearFieldError(name);
  },
  dateTimePicker(event: any) {
    const part = event.currentTarget.dataset.part === 'time' ? 'time' : 'date';
    const field = part === 'time' ? 'startTime' : 'startDate';
    this.setData({ [`form.${field}`]: event.detail.value });
    this.clearFieldError('startAt');
  },
  async uploadPendingImage(pendingImage: PendingImage) {
    // 复用选择时确定的 cloudPath：重试与“成功但响应丢失”场景均覆盖同一对象，不产生孤立文件。
    const cloudPath = pendingImage.cloudPath || (await contentCloudPath(pendingImage.previewPath));
    try {
      const result = await wx.cloud!.uploadFile({
        cloudPath,
        filePath: pendingImage.previewPath,
      });
      if (!result.fileID) throw new Error('云端未返回文件标识');
      if (this.unloaded) {
        this.cleanupSessionUploads([result.fileID]);
        return false;
      }
      this.setData({
        sessionUploadedIds: [...this.data.sessionUploadedIds, result.fileID],
        pendingImages: this.data.pendingImages.map((item: PendingImage) =>
          item.id === pendingImage.id
            ? { ...item, status: 'uploaded' as const, fileId: result.fileID }
            : item,
        ),
      });
      return result.fileID;
    } catch {
      const pendingImages = this.data.pendingImages.map((item: PendingImage) =>
        item.id === pendingImage.id ? { ...item, status: 'failed' as const } : item,
      );
      this.setData({ pendingImages });
      return false;
    }
  },
  commitUploadedPendingImages() {
    if (
      !this.data.pendingImages.length ||
      this.data.pendingImages.some(
        (item: PendingImage) => item.status !== 'uploaded' || !item.fileId,
      )
    )
      return;
    const images = [
      ...new Set([
        ...this.data.images,
        ...this.data.pendingImages.map((item: PendingImage) => item.fileId as string),
      ]),
    ].slice(0, MAX_IMAGES);
    const previewByFileId = new Map(
      this.data.pendingImages
        .filter((item: PendingImage) => item.fileId)
        .map((item: PendingImage) => [item.fileId as string, item.previewPath]),
    );
    this.setData({
      images,
      imagePreviewUrls: images.map(
        (fileId) =>
          previewByFileId.get(fileId) ||
          this.data.imagePreviewUrls[this.data.images.indexOf(fileId)] ||
          safeHttpsUrl(fileId),
      ),
      pendingImages: [],
      imagesTouched: true,
      coverImage: images[0] || '',
    });
    void this.refreshMediaPreviews();
  },
  async addOfficialRoute() {
    if (this.data.saving || this.data.syncingRoute) return;
    this.setData({ syncingRoute: true, error: '' });
    try {
      const officialRoute = normalizeStravaRouteUrl(this.data.form.stravaRouteUrl);
      const preview = await rideService.previewPublicStravaRoute(officialRoute.url);
      await new Promise<void>((resolve) => {
        this.setData(
          {
            'form.stravaRouteUrl': preview.externalRouteUrl,
            officialRoute: {
              provider: 'strava',
              routeId: preview.externalRouteId,
              url: preview.externalRouteUrl,
            },
            publicRoutePreview: preview,
            routeTimeLabel: formatRouteDuration(preview.estimatedMovingTimeSeconds),
            error: '',
          },
          resolve,
        );
      });
      await this.renderRouteVisuals();
      wx.showToast({ title: '已解析公开路线', icon: 'success' });
    } catch (error) {
      this.setData({
        publicRoutePreview: undefined,
        error: error instanceof Error ? error.message : 'Strava 公开路线解析失败',
      });
    } finally {
      this.setData({ syncingRoute: false });
    }
  },
  async previewPendingRoute(pending: PendingRouteUpload) {
    const preview = await rideService.previewRouteGpx({
      gpxFileId: pending.gpxFileId,
      gpxSha256: pending.gpxSha256,
      fileName: pending.fileName,
      requestId: pending.requestId,
    });
    if (this.unloaded) {
      this.cleanupSessionUploads([pending.gpxFileId]);
      return;
    }
    await new Promise<void>((resolve) => {
      this.setData(
        {
          routePreview: preview,
          routeStatusMessage: '正在生成路线图',
          routeTimeLabel: formatRouteDuration(preview.estimatedMovingTimeSeconds),
          error: '',
        },
        resolve,
      );
    });
    await this.renderRouteVisuals();
    if (!this.unloaded) {
      this.setData({
        pendingRouteUpload: undefined,
        routeStatusMessage: '路线详情已准备好',
        routeTimeLabel: formatRouteDuration(preview.estimatedMovingTimeSeconds),
        error: '',
      });
    }
  },
  routeCanvas(selector: string): Promise<any | undefined> {
    if (typeof wx.createSelectorQuery !== 'function') return Promise.resolve(undefined);
    return new Promise((resolve) => {
      let query = wx.createSelectorQuery();
      if (typeof query.in === 'function') query = query.in(this);
      query
        .select(selector)
        .fields({ node: true, size: true })
        .exec((result: any[]) => resolve(result?.[0]));
    });
  },
  async renderRouteVisuals() {
    const preview = (this.data.routePreview || this.data.publicRoutePreview) as
      RouteGpxPreview | PublicRoutePreview | undefined;
    if (!preview || this.unloaded) return;
    const [outlineTarget, elevationTarget] = await Promise.all([
      this.routeCanvas('#route-outline-canvas'),
      this.routeCanvas('#route-elevation-canvas'),
    ]);
    const ratio = wx.getWindowInfo?.().pixelRatio || wx.getSystemInfoSync?.().pixelRatio || 1;
    if (outlineTarget?.node && outlineTarget.width && outlineTarget.height) {
      const canvas = outlineTarget.node;
      canvas.width = outlineTarget.width * ratio;
      canvas.height = outlineTarget.height * ratio;
      drawRouteOutline(
        canvas.getContext('2d'),
        outlineTarget.width,
        outlineTarget.height,
        preview.routeOutline,
        ratio,
        preview.routeName,
      );
      if (
        'gpxSha256' in preview &&
        !preview.generatedPreviewFileId &&
        typeof wx.canvasToTempFilePath === 'function' &&
        appStore.openid
      ) {
        const filePath = await new Promise<string>((resolve, reject) => {
          wx.canvasToTempFilePath(
            {
              canvas,
              fileType: 'png',
              quality: 1,
              success: (result: { tempFilePath: string }) => resolve(result.tempFilePath),
              fail: reject,
            },
            this,
          );
        });
        const uploaded = await wx.cloud!.uploadFile({
          cloudPath: routeUploadPath(appStore.openid, preview.gpxSha256, 'png'),
          filePath,
        });
        if (!uploaded.fileID) throw userError('路线图生成失败，请重试');
        if (this.unloaded) {
          this.cleanupSessionUploads([uploaded.fileID]);
          return;
        }
        const bound = await rideService.bindRoutePreviewImage(preview.previewId, uploaded.fileID);
        this.setData({
          routePreview: bound,
          sessionRouteFileIds: [...new Set([...this.data.sessionRouteFileIds, uploaded.fileID])],
        });
      }
    }
    if (elevationTarget?.node && elevationTarget.width && elevationTarget.height) {
      const canvas = elevationTarget.node;
      canvas.width = elevationTarget.width * ratio;
      canvas.height = elevationTarget.height * ratio;
      drawElevationProfile(
        canvas.getContext('2d'),
        elevationTarget.width,
        elevationTarget.height,
        preview.elevationProfile,
        ratio,
      );
    }
  },
  async chooseRouteGpx() {
    if (this.data.uploadingRoute || this.data.saving) return;
    this.setData({
      uploadingRoute: true,
      routeStatusMessage: '正在读取路线',
      error: '',
    });
    try {
      const selected = await wx.chooseMessageFile({
        count: 1,
        type: 'file',
        extension: ['gpx'],
      });
      const file = Array.isArray(selected.tempFiles) ? selected.tempFiles[0] : undefined;
      if (!file) throw userError('没有选中文件，请重新选择', 'NO_FILE_SELECTED');
      const fileName = typeof file.name === 'string' ? file.name : '';
      const filePath =
        typeof (file as { path?: unknown }).path === 'string'
          ? (file as { path: string }).path
          : typeof (file as { tempFilePath?: unknown }).tempFilePath === 'string'
            ? (file as { tempFilePath: string }).tempFilePath
            : '';
      if (!/^[^/\\\0]+\.gpx$/i.test(fileName) || !filePath)
        throw userError('这个文件不是有效的 GPX，请重新导出后上传', 'GPX_INVALID');
      if (typeof file.size === 'number' && file.size > MAX_GPX_BYTES)
        throw userError('文件超过 4 MB，请选择更小的 GPX', 'GPX_TOO_LARGE');
      const bytes = await readFileBytes(filePath);
      if (bytes.byteLength > MAX_GPX_BYTES)
        throw userError('文件超过 4 MB，请选择更小的 GPX', 'GPX_TOO_LARGE');
      const digest = sha256Hex(bytes);
      if (!appStore.openid) throw userError('请先完成微信身份验证');
      const upload = await wx.cloud!.uploadFile({
        cloudPath: routeUploadPath(appStore.openid, digest, 'gpx'),
        filePath,
      });
      if (!upload.fileID) throw userError('路线上传失败，请稍后重试');
      const pending: PendingRouteUpload = {
        gpxFileId: upload.fileID,
        gpxSha256: digest,
        fileName,
        requestId: this.routeRequestId || newRouteRequestId(),
      };
      this.setData({
        pendingRouteUpload: pending,
        sessionRouteFileIds: [...new Set([...this.data.sessionRouteFileIds, upload.fileID])],
      });
      await this.previewPendingRoute(pending);
    } catch (error) {
      if (isCancel(error)) {
        this.setData({ routeStatusMessage: '', error: '' });
        return;
      }
      const code = errorCode(error);
      const message =
        code === 'NO_FILE_SELECTED' && error instanceof Error
          ? error.message
          : routeErrorMessage(error);
      this.setData({ routeStatusMessage: message, error: message });
      wx.showToast({ title: message, icon: 'none', duration: 3000 });
    } finally {
      this.setData({ uploadingRoute: false });
    }
  },
  async retryRouteGpx() {
    const pending = this.data.pendingRouteUpload as PendingRouteUpload | undefined;
    if (!pending || this.data.uploadingRoute || this.data.saving) return;
    this.setData({
      uploadingRoute: true,
      routeStatusMessage: '正在读取路线',
      error: '',
    });
    try {
      await this.previewPendingRoute(pending);
    } catch (error) {
      this.setData({ routeStatusMessage: '', error: routeErrorMessage(error) });
    } finally {
      this.setData({ uploadingRoute: false });
    }
  },
  removeRouteDetails() {
    if (this.data.uploadingRoute || this.data.saving) return;
    const sessionRouteFileIds = [...this.data.sessionRouteFileIds];
    this.cleanupSessionUploads(sessionRouteFileIds);
    this.setData({
      routePreview: undefined,
      pendingRouteUpload: undefined,
      sessionRouteFileIds: [],
      routeStatusMessage: '',
      routeCoverSelected: false,
      error: '',
    });
  },
  useRouteAsCover() {
    const preview = this.data.routePreview as RouteGpxPreview | undefined;
    if (!preview?.generatedPreviewFileId) return;
    this.setData({
      routeCoverSelected: true,
      coverImage: preview.generatedPreviewFileId,
    });
  },
  async chooseImages() {
    if (this.data.uploading) return;
    const remaining = MAX_IMAGES - this.data.images.length - this.data.pendingImages.length;
    if (remaining <= 0) {
      this.setData({ error: `封面照片最多 ${MAX_IMAGES} 张` });
      return;
    }
    try {
      const selected = await wx.chooseMedia({
        count: remaining,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
      });
      const files = Array.isArray(selected.tempFiles) ? selected.tempFiles : [];
      if (!files.length) throw new Error('未选择可上传的图片');
      // 已占用对象路径集合：已提交图片反解路径 + 待处理图片路径，用于拦截重复选择。
      const usedCloudPaths = new Set<string>([
        ...this.data.images.map((fileId: string) => fileIdCloudPath(fileId)).filter(Boolean),
        ...this.data.pendingImages
          .map((item: PendingImage) => item.cloudPath || '')
          .filter(Boolean),
      ]);
      const batchCloudPaths = new Set<string>();
      const pendingImages: PendingImage[] = [];
      for (const file of files) {
        if (!file || typeof file.tempFilePath !== 'string' || !file.tempFilePath)
          throw new Error(`第 ${pendingImages.length + 1} 张图片无效`);
        const cloudPath = await contentCloudPath(file.tempFilePath);
        // 与已提交、待处理或同批图片内容相同则跳过，不重复上传、不重复占用存储。
        if (usedCloudPaths.has(cloudPath) || batchCloudPaths.has(cloudPath)) continue;
        batchCloudPaths.add(cloudPath);
        usedCloudPaths.add(cloudPath);
        pendingImages.push({
          id: `${Date.now()}-${pendingImages.length}-${Math.random().toString(36).slice(2, 8)}`,
          previewPath: file.tempFilePath,
          status: 'uploading',
          cloudPath,
        });
      }
      if (!pendingImages.length) {
        wx.showToast({ title: '图片已存在', icon: 'none' });
        return;
      }
      this.setData({
        uploading: true,
        error: '',
        pendingImages: [...this.data.pendingImages, ...pendingImages],
      });
      const results = await Promise.all(
        pendingImages.map((pendingImage: PendingImage) => this.uploadPendingImage(pendingImage)),
      );
      this.commitUploadedPendingImages();
      const failedCount = results.filter((fileId) => !fileId).length;
      if (failedCount) this.setData({ error: `${failedCount} 张图片上传失败，可单独重试或删除` });
    } catch (error) {
      if (!isCancel(error))
        this.setData({ error: error instanceof Error ? error.message : '选择图片失败，请重试' });
    } finally {
      this.setData({ uploading: false });
    }
  },
  async retryImage(event: any) {
    if (this.data.uploading) return;
    const id = String(event.currentTarget.dataset.id || '');
    const pendingImage = this.data.pendingImages.find((item: PendingImage) => item.id === id);
    if (!pendingImage) return;
    this.setData({
      uploading: true,
      error: '',
      pendingImages: this.data.pendingImages.map((item: PendingImage) =>
        item.id === id ? { ...item, status: 'uploading' as const } : item,
      ),
    });
    const fileId = await this.uploadPendingImage({ ...pendingImage, status: 'uploading' });
    if (fileId) this.commitUploadedPendingImages();
    this.setData({
      uploading: false,
      error: fileId ? '' : '图片上传失败，可再次重试或删除',
    });
  },
  removePendingImage(event: any) {
    if (this.data.uploading) return;
    const id = String(event.currentTarget.dataset.id || '');
    this.setData({
      pendingImages: this.data.pendingImages.filter((item: PendingImage) => item.id !== id),
      error: '',
    });
    this.commitUploadedPendingImages();
  },
  setCover(event: any) {
    const index = Number(event.currentTarget.dataset.index);
    if (!Number.isInteger(index) || index < 0 || index >= this.data.images.length) return;
    const images = [...this.data.images];
    const imagePreviewUrls = [...this.data.imagePreviewUrls];
    const [selected] = images.splice(index, 1);
    const [selectedPreview] = imagePreviewUrls.splice(index, 1);
    images.unshift(selected);
    imagePreviewUrls.unshift(selectedPreview || '');
    this.setData({
      images,
      imagePreviewUrls,
      imagesTouched: true,
      routeCoverSelected: false,
      coverImage: images[0],
    });
  },
  removeImage(event: any) {
    const index = Number(event.currentTarget.dataset.index);
    if (!Number.isInteger(index) || index < 0 || index >= this.data.images.length) return;
    const removedFileId = this.data.images[index];
    const shouldDeleteFile = this.data.sessionUploadedIds.includes(removedFileId);
    const images = this.data.images.filter((_: string, itemIndex: number) => itemIndex !== index);
    const imagePreviewUrls = this.data.imagePreviewUrls.filter(
      (_: string, itemIndex: number) => itemIndex !== index,
    );
    const sessionUploadedIds = this.data.sessionUploadedIds.filter(
      (fileId: string) => fileId !== removedFileId,
    );
    this.setData({
      images,
      imagePreviewUrls,
      sessionUploadedIds,
      imagesTouched: true,
      coverImage: images[0] || '',
    });
    if (shouldDeleteFile && wx.cloud && typeof wx.cloud.deleteFile === 'function')
      void wx.cloud.deleteFile({ fileList: [removedFileId] }).catch(() => undefined);
  },
  async chooseGroupQrCode() {
    if (this.data.uploading) return;
    try {
      const selected = await wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
      });
      const file = Array.isArray(selected.tempFiles) ? selected.tempFiles[0] : undefined;
      if (!file || typeof file.tempFilePath !== 'string' || !file.tempFilePath)
        throw new Error('未选择可上传的群二维码');
      const pendingGroupQrCode: PendingImage = {
        id: `${Date.now()}-group-qr`,
        previewPath: file.tempFilePath,
        status: 'uploading',
        cloudPath: await contentCloudPath(file.tempFilePath, 'profiles/activity-group-qr'),
      };
      this.setData({ uploading: true, error: '', pendingGroupQrCode });
      const result = await wx.cloud!.uploadFile({
        cloudPath: pendingGroupQrCode.cloudPath as string,
        filePath: pendingGroupQrCode.previewPath,
      });
      if (!result.fileID) throw new Error('云端未返回群二维码标识');
      if (this.unloaded) {
        this.cleanupSessionUploads([result.fileID]);
        return;
      }
      this.setData({
        sessionUploadedIds: [...this.data.sessionUploadedIds, result.fileID],
        groupQrCode: result.fileID,
        groupQrPreviewUrl: pendingGroupQrCode.previewPath,
        groupQrCodeUploadedAt: new Date().toISOString(),
        groupQrCodeExpired: false,
        pendingGroupQrCode: undefined,
      });
      void this.refreshMediaPreviews();
    } catch (error) {
      if (isCancel(error)) return;
      const current = this.data.pendingGroupQrCode;
      this.setData({
        error: error instanceof Error ? error.message : '群二维码上传失败，请重试',
        pendingGroupQrCode: current ? { ...current, status: 'failed' as const } : undefined,
      });
    } finally {
      this.setData({ uploading: false });
    }
  },
  removeGroupQrCode() {
    if (this.data.uploading) return;
    const removedFileId = this.data.groupQrCode;
    const shouldDeleteFile = this.data.sessionUploadedIds.includes(removedFileId);
    this.setData({
      groupQrCode: '',
      groupQrPreviewUrl: '',
      groupQrCodeUploadedAt: '',
      groupQrCodeExpired: false,
      pendingGroupQrCode: undefined,
      sessionUploadedIds: this.data.sessionUploadedIds.filter(
        (fileId: string) => fileId !== removedFileId,
      ),
      error: '',
    });
    if (shouldDeleteFile && wx.cloud && typeof wx.cloud.deleteFile === 'function')
      void wx.cloud.deleteFile({ fileList: [removedFileId] }).catch(() => undefined);
  },
  async retryGroupQrCode() {
    const pending = this.data.pendingGroupQrCode;
    if (!pending || this.data.uploading) return;
    this.setData({ pendingGroupQrCode: { ...pending, status: 'uploading' as const } });
    await this.chooseGroupQrCode();
  },
  async chooseRouteLocation() {
    if (this.data.saving || this.data.choosingLocation) return;
    this.setData({ choosingLocation: true, error: '' });
    try {
      const selected = await wx.chooseLocation({});
      if (
        typeof selected.latitude !== 'number' ||
        typeof selected.longitude !== 'number' ||
        !Number.isFinite(selected.latitude) ||
        !Number.isFinite(selected.longitude)
      )
        throw new Error('所选地点缺少有效坐标');
      const location: ActivityLocation = {
        name: typeof selected.name === 'string' ? selected.name : '',
        address: typeof selected.address === 'string' ? selected.address : '',
        latitude: selected.latitude,
        longitude: selected.longitude,
      };
      this.setData({
        'form.routeStart': location.name || location.address,
        routeStartLocation: location,
      });
      this.clearFieldError('routeStart');
    } catch (error) {
      const failure = locationFailure(error);
      if (failure === 'system-location')
        await wx.showModal({
          title: '无法打开地图选点',
          content: '请在系统设置中开启微信的定位权限和定位服务后重试。',
          showCancel: false,
        });
      else if (failure === 'platform-config')
        await wx.showModal({
          title: '地图选点暂不可用',
          content: '请联系管理员检查微信后台接口权限和用户隐私保护指引。',
          showCancel: false,
        });
      else if (failure !== 'cancel') this.setData({ error: '地点选择失败，请重试' });
    } finally {
      this.setData({ choosingLocation: false });
    }
  },
  validateBeforeSave(nextStatus: ActivityInput['status']) {
    const form = this.data.form as Form;
    if (!form.title.trim()) return (this.showFormError('请输入活动标题', 'title'), false);
    if (!form.startDate.trim()) return (this.showFormError('请选择集合日期', 'startAt'), false);
    if (!form.startTime.trim()) return (this.showFormError('请选择集合时间', 'startAt'), false);
    if (nextStatus === 'published' && !form.routeStart.trim())
      return (this.showFormError('请选择或填写集合地点', 'routeStart'), false);
    return true;
  },
  async save(event: any) {
    if (
      this.data.saving ||
      this.data.uploading ||
      this.data.uploadingRoute ||
      this.data.choosingLocation ||
      this.data.syncingRoute
    )
      return;
    if (this.data.pendingImages.length) {
      this.setData({ error: '请先重试或删除上传失败的图片' });
      return;
    }
    if (this.data.pendingRouteUpload) {
      this.setData({ error: '路线详情尚未准备好，请重试或移除 GPX' });
      return;
    }
    const nextStatus = String(
      event.currentTarget.dataset.status || this.data.status,
    ) as ActivityInput['status'];
    if (!this.validateBeforeSave(nextStatus)) return;
    const form = this.data.form as Form;
    if (form.description.length > 5000) {
      this.showFormError('备注说明不能超过 5000 字', 'description');
      return;
    }
    let startAt: string | undefined;
    try {
      // 日期与时间在表单中拆分，保存时再拼回完整本地时间，避免未选时间被默认值误导。
      const localStartAt =
        form.startDate.trim() && form.startTime.trim()
          ? `${form.startDate.trim()} ${form.startTime.trim()}:00`
          : '';
      startAt = localStartAt ? parseLocalDateTime(localStartAt, '集合时间') : undefined;
    } catch (error) {
      this.showFormError(error instanceof Error ? error.message : '日期时间格式错误', 'startAt');
      return;
    }
    if (!startAt) return;
    const original = this.data.originalActivity as EditableActivity | undefined;
    let officialRoute: ExternalRouteReference | undefined;
    let publicRoutePreview = this.data.publicRoutePreview as PublicRoutePreview | undefined;
    if (form.stravaRouteUrl.trim()) {
      try {
        officialRoute = normalizeStravaRouteUrl(form.stravaRouteUrl);
        if (publicRoutePreview?.externalRouteUrl !== officialRoute.url) {
          this.setData({ syncingRoute: true, error: '' });
          publicRoutePreview = await rideService.previewPublicStravaRoute(officialRoute.url);
        }
        this.setData({
          'form.stravaRouteUrl': officialRoute.url,
          officialRoute,
          publicRoutePreview,
          routeTimeLabel: formatRouteDuration(publicRoutePreview.estimatedMovingTimeSeconds),
        });
      } catch (error) {
        this.setData({ syncingRoute: false });
        this.showFormError(
          error instanceof Error ? error.message : 'Strava 公开路线解析失败',
          'stravaRouteUrl',
        );
        return;
      } finally {
        this.setData({ syncingRoute: false });
      }
    } else {
      publicRoutePreview = undefined;
    }
    const startForDefaults = startAt;
    const defaults = derivedTimes(startForDefaults);
    const originalStartTime = original?.startAt ? new Date(original.startAt).getTime() : Number.NaN;
    const startTime = new Date(startForDefaults).getTime();
    const originalEndTime = original?.endAt ? new Date(original.endAt).getTime() : Number.NaN;
    const originalDeadlineTime = original?.deadline
      ? new Date(original.deadline).getTime()
      : Number.NaN;
    const endAt =
      original && Number.isFinite(originalEndTime) && Number.isFinite(originalStartTime)
        ? new Date(startTime + Math.max(originalEndTime - originalStartTime, 60_000)).toISOString()
        : defaults.endAt;
    const deadline =
      original && Number.isFinite(originalDeadlineTime) && Number.isFinite(originalStartTime)
        ? new Date(
            startTime - Math.max(originalStartTime - originalDeadlineTime, 60_000),
          ).toISOString()
        : defaults.deadline;
    const title = form.title.trim();
    const images =
      original && !this.data.imagesTouched && original.images?.length
        ? [...original.images]
        : [...this.data.images];
    const routePreview = this.data.routePreview as RouteGpxPreview | undefined;
    const trustedRoutePreview = routePreview || publicRoutePreview;
    const route: ActivityInput['route'] = {
      start: form.routeStart,
      end: original?.route.end || '',
      ...(this.data.routeStartLocation ? { startLocation: this.data.routeStartLocation } : {}),
      ...(original?.route.endLocation ? { endLocation: original.route.endLocation } : {}),
      distanceKm: trustedRoutePreview?.distanceKm ?? original?.route.distanceKm ?? 0,
      elevationM: trustedRoutePreview?.elevationM ?? original?.route.elevationM ?? 0,
      level: original?.route.level || '',
      ...(officialRoute
        ? {
            externalProvider: 'strava',
            externalRouteId: officialRoute.routeId,
            externalRouteUrl: officialRoute.url,
          }
        : {}),
      ...(publicRoutePreview
        ? {
            publicRoutePreviewId: publicRoutePreview.previewId,
            routeName: publicRoutePreview.routeName,
            elevationLossM: publicRoutePreview.elevationLossM,
            elevationMinM: publicRoutePreview.elevationMinM,
            elevationMaxM: publicRoutePreview.elevationMaxM,
            estimatedMovingTimeSeconds: publicRoutePreview.estimatedMovingTimeSeconds,
            estimationSource: 'cili' as const,
            elevationProfile: publicRoutePreview.elevationProfile,
            routeOutline: publicRoutePreview.routeOutline,
            routeBounds: publicRoutePreview.routeBounds,
          }
        : {}),
      ...(routePreview
        ? {
            gpxPreviewId: routePreview.previewId,
            gpxFileId: routePreview.gpxFileId,
            gpxSha256: routePreview.gpxSha256,
            ...(routePreview.generatedPreviewFileId
              ? {
                  generatedPreviewFileId: routePreview.generatedPreviewFileId,
                }
              : {}),
            routeName: routePreview.routeName,
            elevationLossM: routePreview.elevationLossM,
            elevationMinM: routePreview.elevationMinM,
            elevationMaxM: routePreview.elevationMaxM,
            estimatedMovingTimeSeconds: routePreview.estimatedMovingTimeSeconds,
            estimationSource: 'cili',
            elevationProfile: routePreview.elevationProfile,
            routeOutline: routePreview.routeOutline,
            routeBounds: routePreview.routeBounds,
          }
        : {}),
    };
    const activity: ActivityInput = {
      title,
      description: form.description,
      images,
      coverImage:
        this.data.routeCoverSelected && routePreview?.generatedPreviewFileId
          ? routePreview.generatedPreviewFileId
          : images[0] || '',
      groupQrCode: this.data.groupQrCode,
      groupQrCodeUploadedAt: this.data.groupQrCode ? this.data.groupQrCodeUploadedAt : '',
      capacity: original?.capacity || DEFAULT_CAPACITY,
      registrationUnlimited: original ? original.registrationUnlimited : true,
      ...(original
        ? {
            ...(Number.isInteger(original.supportVehicleCapacity)
              ? { supportVehicleCapacity: original.supportVehicleCapacity }
              : {}),
            ...(Number.isInteger(original.selfDriveCapacity)
              ? { selfDriveCapacity: original.selfDriveCapacity }
              : {}),
          }
        : { supportVehicleCapacity: 0, selfDriveCapacity: DEFAULT_CAPACITY }),
      ...(original?.supportVehicleDriver
        ? { supportVehicleDriver: original.supportVehicleDriver }
        : {}),
      deadline,
      startAt: startForDefaults,
      endAt,
      status: nextStatus,
      route,
      schedule: original?.schedule || [],
      notices: original?.notices || [],
      equipment: original?.equipment || [],
      fee: original ? original.fee : '免费',
      feeIncluded: original?.feeIncluded || [],
      feeExcluded: original?.feeExcluded || [],
    };
    this.setData({ saving: true, error: '' });
    this.saveInFlight = true;
    try {
      const id = this.data.id || undefined;
      const applySaved = (saved: EditableActivity) => {
        const savedRoutePreview = activityRoutePreview(saved);
        const savedOfficialRoute = activityOfficialRoute(saved);
        const savedImages = saved.images?.length
          ? saved.images.slice(0, MAX_IMAGES)
          : saved.coverImage && saved.coverImage !== savedRoutePreview?.generatedPreviewFileId
            ? [saved.coverImage]
            : [];
        this.setData({
          id: saved.id,
          version: saved.version,
          status: saved.status,
          title: saved.title,
          originalActivity: saved,
          images: savedImages,
          sessionUploadedIds: [],
          sessionRouteFileIds: [],
          imagesTouched: false,
          coverImage: saved.coverImage || savedImages[0] || '',
          groupQrCode: saved.groupQrCode || '',
          groupQrCodeUploadedAt: saved.groupQrCodeUploadedAt || '',
          groupQrCodeExpired: groupQrExpired(saved.groupQrCodeUploadedAt),
          pendingGroupQrCode: undefined,
          routeStartLocation: saved.route.startLocation,
          officialRoute: savedOfficialRoute,
          routePreview: savedRoutePreview,
          pendingRouteUpload: undefined,
          routeStatusMessage: savedRoutePreview ? '路线详情已准备好' : '',
          routeCoverSelected: Boolean(
            savedRoutePreview?.generatedPreviewFileId &&
            saved.coverImage === savedRoutePreview.generatedPreviewFileId,
          ),
        });
        void this.refreshMediaPreviews(saved);
      };
      let saved: EditableActivity;
      if (!id && nextStatus === 'published') {
        const draft = await this.createDraft(activity);
        // 首次草稿已成为可恢复事实：即使发布失败，也保留其 id/version 供用户原地重试。
        applySaved(draft);
        saved = await this.publishDraft(activity, draft);
      } else if (id && this.data.status === 'draft' && nextStatus === 'published') {
        saved = await this.publishDraft(activity, {
          ...this.data.originalActivity!,
          id,
          version: this.data.version,
          status: 'draft',
        });
      } else {
        saved = id
          ? await rideService.saveActivity(activity, id, this.data.version)
          : await rideService.saveActivity(activity, undefined, undefined, this.createRequestId);
      }
      applySaved(saved);
      wx.showToast({ title: '保存成功', icon: 'success' });
    } catch (error) {
      if (this.unloaded) this.cleanupSessionUploads();
      else this.showFormError(error instanceof Error ? error.message : '保存失败');
    } finally {
      this.saveInFlight = false;
      this.setData({ saving: false });
    }
  },
});
