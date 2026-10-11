import type { ActivityLocation, EditableActivity } from '../../../models';
import type { ActivityInput } from '../../../repositories/types';
import { rideService } from '../../../services/ride-service';
import { appStore } from '../../../store/app-store';
import { formatLocalDateTime, parseLocalDateTime } from '../../../utils/date-time';

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

const MAX_IMAGES = 3;
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
  try {
    const info: any = await wx.getFileInfo({ filePath: previewPath, digestAlgorithm: 'md5' });
    if (info?.digest) {
      return `${folder}/${info.digest}${mediaExtension(previewPath)}`;
    }
  } catch {
    // 旧基础库不支持摘要或读取失败时降级为随机路径，不阻断上传。
  }
  const random = Math.random().toString(36).slice(2, 10);
  return `${folder}/${Date.now()}-${random}${mediaExtension(previewPath)}`;
}
const isCancel = (error: unknown) =>
  typeof (error as { errMsg?: unknown })?.errMsg === 'string' &&
  (error as { errMsg: string }).errMsg.includes('cancel');

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

Page({
  unloaded: false,
  saveInFlight: false,
  data: {
    allowed: false,
    isAdmin: false,
    loading: true,
    saving: false,
    uploading: false,
    choosingLocation: false,
    error: '',
    formErrors: {} as FormErrors,
    id: '',
    version: 0,
    status: 'draft',
    originalActivity: undefined as EditableActivity | undefined,
    images: [] as string[],
    pendingImages: [] as PendingImage[],
    sessionUploadedIds: [] as string[],
    imagesTouched: false,
    coverImage: '',
    groupQrCode: '',
    groupQrCodeUploadedAt: '',
    groupQrCodeExpired: false,
    pendingGroupQrCode: undefined as PendingImage | undefined,
    routeStartLocation: undefined as ActivityLocation | undefined,
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
      this.setData({
        loading: false,
        status: activity.status,
        version: activity.version,
        originalActivity: activity,
        images,
        coverImage: images[0] || '',
        groupQrCode: activity.groupQrCode || '',
        groupQrCodeUploadedAt: activity.groupQrCodeUploadedAt || '',
        groupQrCodeExpired: groupQrExpired(activity.groupQrCodeUploadedAt),
        pendingGroupQrCode: undefined,
        routeStartLocation: activity.route.startLocation,
        form: {
          title: activity.title,
          startDate: pickerDate(startAtText),
          startTime: pickerTime(startAtText),
          routeStart: activity.route.start,
          description: activity.description,
          stravaRouteUrl: activity.route.stravaRouteUrl || '',
        } as Form,
      });
    } catch (error) {
      this.setData({
        loading: false,
        error: error instanceof Error ? error.message : '活动加载失败',
      });
    }
  },
  cleanupSessionUploads(fileList?: string[]) {
    const targets = fileList || [...this.data.sessionUploadedIds];
    if (!targets.length || !wx.cloud || typeof wx.cloud.deleteFile !== 'function') return;
    void wx.cloud.deleteFile({ fileList: targets }).catch(() => undefined);
  },
  onUnload() {
    this.unloaded = true;
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
    if (name === 'routeStart') patch.routeStartLocation = undefined;
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
    this.setData({
      images,
      pendingImages: [],
      imagesTouched: true,
      coverImage: images[0] || '',
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
    const [selected] = images.splice(index, 1);
    images.unshift(selected);
    this.setData({ images, imagesTouched: true, coverImage: images[0] });
  },
  removeImage(event: any) {
    const index = Number(event.currentTarget.dataset.index);
    if (!Number.isInteger(index) || index < 0 || index >= this.data.images.length) return;
    const removedFileId = this.data.images[index];
    const shouldDeleteFile = this.data.sessionUploadedIds.includes(removedFileId);
    const images = this.data.images.filter((_: string, itemIndex: number) => itemIndex !== index);
    const sessionUploadedIds = this.data.sessionUploadedIds.filter(
      (fileId: string) => fileId !== removedFileId,
    );
    this.setData({
      images,
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
        groupQrCodeUploadedAt: new Date().toISOString(),
        groupQrCodeExpired: false,
        pendingGroupQrCode: undefined,
      });
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
    if (this.data.saving || this.data.uploading || this.data.choosingLocation) return;
    if (this.data.pendingImages.length) {
      this.setData({ error: '请先重试或删除上传失败的图片' });
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
    const stravaRouteUrl = form.stravaRouteUrl.trim() || undefined;
    const activity: ActivityInput = {
      title,
      description: form.description,
      images,
      coverImage: images[0] || '',
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
      route: original
        ? {
            start: form.routeStart,
            end: original.route.end,
            startLocation: this.data.routeStartLocation,
            ...(original.route.endLocation ? { endLocation: original.route.endLocation } : {}),
            distanceKm: original.route.distanceKm,
            elevationM: original.route.elevationM,
            level: original.route.level,
            ...(original.route.gpxFileId ? { gpxFileId: original.route.gpxFileId } : {}),
            ...(stravaRouteUrl ? { stravaRouteUrl } : {}),
            ...(stravaRouteUrl === original.route.stravaRouteUrl
              ? {
                  ...(original.route.stravaRouteId
                    ? { stravaRouteId: original.route.stravaRouteId }
                    : {}),
                  ...(original.route.elevationProfile
                    ? { elevationProfile: original.route.elevationProfile }
                    : {}),
                  ...(original.route.routeBounds
                    ? { routeBounds: original.route.routeBounds }
                    : {}),
                  ...(original.route.popularClimbs
                    ? { popularClimbs: original.route.popularClimbs }
                    : {}),
                }
              : {}),
          }
        : {
            start: form.routeStart,
            end: '',
            ...(this.data.routeStartLocation
              ? { startLocation: this.data.routeStartLocation }
              : {}),
            distanceKm: 0,
            elevationM: 0,
            level: '',
            ...(stravaRouteUrl ? { stravaRouteUrl } : {}),
          },
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
        const savedImages = saved.images?.length
          ? saved.images.slice(0, MAX_IMAGES)
          : saved.coverImage
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
          imagesTouched: false,
          coverImage: savedImages[0] || '',
          groupQrCode: saved.groupQrCode || '',
          groupQrCodeUploadedAt: saved.groupQrCodeUploadedAt || '',
          groupQrCodeExpired: groupQrExpired(saved.groupQrCodeUploadedAt),
          pendingGroupQrCode: undefined,
          routeStartLocation: saved.route.startLocation,
        });
      };
      let saved: EditableActivity;
      if (!id && nextStatus === 'published') {
        const draft = await rideService.saveActivity({ ...activity, status: 'draft' });
        // 首次草稿已成为可恢复事实：即使发布失败，也保留其 id/version 供用户原地重试。
        applySaved(draft);
        saved = await rideService.saveActivity(
          { ...activity, status: 'published' },
          draft.id,
          draft.version,
        );
      } else {
        saved = await rideService.saveActivity(activity, id, id ? this.data.version : undefined);
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
