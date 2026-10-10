import type { Activity, ActivityLocation } from '../../../models';
import type { ActivityInput } from '../../../repositories/types';
import { rideService } from '../../../services/ride-service';
import { appStore } from '../../../store/app-store';
import { formatLocalDateTime, parseLocalDateTime } from '../../../utils/date-time';

type Form = {
  startAt: string;
  routeStart: string;
  description: string;
  stravaRouteUrl: string;
};
type FormField = keyof Form;
type FormErrors = Partial<Record<FormField, string>>;

const MAX_IMAGES = 3;
const DEFAULT_CAPACITY = 500;
const emptyForm = (): Form => ({
  startAt: '',
  routeStart: '',
  description: '',
  stravaRouteUrl: '',
});
const pickerDate = (value: string) => value.trim().slice(0, 10);
const pickerTime = (value: string) => value.trim().slice(11, 16);
const padDatePart = (value: number) => String(value).padStart(2, '0');
const localDateTimeText = (date: Date, time?: string) => {
  const dateText = `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`;
  return `${dateText} ${time || `${padDatePart(date.getHours())}:${padDatePart(date.getMinutes())}`}:00`;
};
const todayText = () => localDateTimeText(new Date()).slice(0, 10);
const dateAtOffset = (days: number, time: string, base = new Date()) => {
  const date = new Date(base.getFullYear(), base.getMonth(), base.getDate() + days);
  return localDateTimeText(date, time);
};
const nextSaturdayOffset = (base = new Date()) => {
  const offset = (6 - base.getDay() + 7) % 7;
  return offset || 7;
};
const mediaExtension = (path: string) => {
  const match = /\.([a-zA-Z0-9]{1,8})(?:\?|$)/.exec(path);
  return match ? `.${match[1].toLowerCase()}` : '.jpg';
};
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

function generatedTitle(startAt: string, location: string) {
  const date = new Date(startAt);
  const dateText = Number.isNaN(date.getTime())
    ? '日常骑行'
    : `${date.getMonth() + 1}月${date.getDate()}日骑行`;
  return location.trim() ? `${dateText} · ${location.trim()}`.slice(0, 100) : dateText;
}

function derivedTimes(startAt: string) {
  const start = new Date(startAt);
  const deadline = new Date(start.getTime() - 60 * 1000);
  const end = new Date(start.getTime() + 4 * 60 * 60 * 1000);
  return { deadline: deadline.toISOString(), endAt: end.toISOString() };
}

Page({
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
    title: '',
    originalActivity: undefined as Activity | undefined,
    images: [] as string[],
    imagesTouched: false,
    coverImage: '',
    routeStartLocation: undefined as ActivityLocation | undefined,
    form: emptyForm(),
  },
  async onLoad(options: Record<string, string>) {
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
      this.setData({
        loading: false,
        status: activity.status,
        version: activity.version,
        title: activity.title,
        originalActivity: activity,
        images,
        coverImage: images[0] || '',
        routeStartLocation: activity.route.startLocation,
        form: {
          startAt: formatLocalDateTime(activity.startAt),
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
  showFormError(message: string, field?: FormField) {
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
    const current = String((this.data.form as Form).startAt || '');
    const date = part === 'date' ? event.detail.value : pickerDate(current) || todayText();
    const time = part === 'time' ? event.detail.value : pickerTime(current) || '08:00';
    this.setData({ 'form.startAt': `${date} ${time}:00` });
    this.clearFieldError('startAt');
  },
  quickDateTime(event: any) {
    const preset = String(event.currentTarget.dataset.preset || '');
    const now = new Date();
    const value =
      preset === 'tomorrow-morning'
        ? dateAtOffset(1, '07:00', now)
        : preset === 'next-saturday'
          ? dateAtOffset(nextSaturdayOffset(now), '08:00', now)
          : '';
    if (!value) return;
    this.setData({ 'form.startAt': value });
    this.clearFieldError('startAt');
  },
  async chooseImages() {
    if (this.data.uploading) return;
    const remaining = MAX_IMAGES - this.data.images.length;
    if (remaining <= 0) {
      this.setData({ error: `封面照片最多 ${MAX_IMAGES} 张` });
      return;
    }
    this.setData({ uploading: true, error: '' });
    const uploaded: string[] = [];
    try {
      const selected = await wx.chooseMedia({
        count: remaining,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
      });
      const files = Array.isArray(selected.tempFiles) ? selected.tempFiles : [];
      if (!files.length) throw new Error('未选择可上传的图片');
      for (const [index, file] of files.entries()) {
        if (!file || typeof file.tempFilePath !== 'string' || !file.tempFilePath)
          throw new Error(`第 ${index + 1} 张图片无效`);
        const random = Math.random().toString(36).slice(2, 10);
        const cloudPath = `profiles/activity-media/${Date.now()}-${random}${mediaExtension(file.tempFilePath)}`;
        try {
          const result = await wx.cloud!.uploadFile({ cloudPath, filePath: file.tempFilePath });
          if (!result.fileID) throw new Error('云端未返回文件标识');
          uploaded.push(result.fileID);
        } catch {
          throw new Error(`第 ${index + 1} 张图片上传失败，请重试`);
        }
      }
      const images = [...this.data.images, ...uploaded].slice(0, MAX_IMAGES);
      this.setData({ images, imagesTouched: true, coverImage: images[0] || '' });
    } catch (error) {
      if (uploaded.length && wx.cloud && typeof wx.cloud.deleteFile === 'function')
        await wx.cloud.deleteFile({ fileList: uploaded }).catch(() => undefined);
      if (!isCancel(error))
        this.setData({ error: error instanceof Error ? error.message : '选择图片失败，请重试' });
    } finally {
      this.setData({ uploading: false });
    }
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
    const images = this.data.images.filter((_: string, itemIndex: number) => itemIndex !== index);
    this.setData({ images, imagesTouched: true, coverImage: images[0] || '' });
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
    if (nextStatus === 'draft') return true;
    if (!form.startAt.trim()) return (this.showFormError('请选择集合时间', 'startAt'), false);
    if (!form.routeStart.trim())
      return (this.showFormError('请选择或填写集合地点', 'routeStart'), false);
    return true;
  },
  async save(event: any) {
    if (this.data.saving || this.data.uploading || this.data.choosingLocation) return;
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
      startAt = form.startAt.trim() ? parseLocalDateTime(form.startAt, '集合时间') : undefined;
    } catch (error) {
      this.showFormError(error instanceof Error ? error.message : '日期时间格式错误', 'startAt');
      return;
    }
    const original = this.data.originalActivity as Activity | undefined;
    const startForDefaults =
      startAt || original?.startAt || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const defaults = derivedTimes(startForDefaults);
    const originalStartTime = original ? new Date(original.startAt).getTime() : Number.NaN;
    const startTime = new Date(startForDefaults).getTime();
    const originalEndTime = original ? new Date(original.endAt).getTime() : Number.NaN;
    const originalDeadlineTime = original ? new Date(original.deadline).getTime() : Number.NaN;
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
    const title = original?.title || generatedTitle(startForDefaults, form.routeStart);
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
    try {
      const id = this.data.id || undefined;
      const saved = await rideService.saveActivity(
        activity,
        id,
        id ? this.data.version : undefined,
      );
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
        imagesTouched: false,
        coverImage: savedImages[0] || '',
        routeStartLocation: saved.route.startLocation,
      });
      wx.showToast({ title: '保存成功', icon: 'success' });
    } catch (error) {
      this.showFormError(error instanceof Error ? error.message : '保存失败');
    } finally {
      this.setData({ saving: false });
    }
  },
});
