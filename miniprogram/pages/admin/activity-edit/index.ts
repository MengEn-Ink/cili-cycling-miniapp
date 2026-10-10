import type { ActivityInput } from '../../../repositories/types';
import { rideService } from '../../../services/ride-service';
import { appStore } from '../../../store/app-store';
import { formatLocalDateTime, parseLocalDateTime } from '../../../utils/date-time';
import type {
  ActivityLocation,
  PopularClimb,
  RouteBounds,
  RouteElevationPoint,
} from '../../../models';

type ActivityMode = 'daily' | 'premium';

type Form = {
  title: string;
  description: string;
  capacity: string;
  supportVehicleCapacity: string;
  selfDriveCapacity: string;
  driverNickname: string;
  licensePlate: string;
  contactPhone: string;
  deadline: string;
  startAt: string;
  endAt: string;
  routeStart: string;
  routeEnd: string;
  stravaRouteUrl: string;
  distanceKm: string;
  elevationM: string;
  level: string;
  fee: string;
  notices: string;
  equipment: string;
};
type FormField = keyof Form;
type FormErrors = Partial<Record<FormField | 'schedule', string>>;
const emptyForm = (): Form => ({
  title: '',
  description: '',
  capacity: '20',
  supportVehicleCapacity: '0',
  selfDriveCapacity: '20',
  driverNickname: '',
  licensePlate: '',
  contactPhone: '',
  deadline: '',
  startAt: '',
  endAt: '',
  routeStart: '',
  routeEnd: '',
  stravaRouteUrl: '',
  distanceKm: '0',
  elevationM: '0',
  level: '',
  fee: '',
  notices: '',
  equipment: '',
});
const lines = (value: string) =>
  value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);

type ScheduleRow = {
  time: string;
  title: string;
  location: string;
  remark?: string;
};

function validatedSchedule(rows: ScheduleRow[]): ScheduleRow[] {
  if (rows.length > 50) throw new Error('日程最多 50 行');
  return rows.map((row, index) => {
    const time = row.time.trim();
    const title = row.title.trim();
    const location = row.location.trim();
    const remark = typeof row.remark === 'string' ? row.remark.trim() : '';
    if (!time || !title) {
      const missing = [!time ? '时间' : '', !title ? '事项' : ''].filter(Boolean).join('、');
      throw new Error(`第 ${index + 1} 行日程缺少${missing}`);
    }
    return {
      time: time.slice(0, 20),
      title: title.slice(0, 100),
      location: location.slice(0, 200),
      ...(remark ? { remark: remark.slice(0, 500) } : {}),
    };
  });
}

function validatedFeeLines(text: string, label: string): string[] {
  const items = lines(text);
  if (items.length > 50) throw new Error(`${label}最多 50 项`);
  return items.map((item) => {
    if (item.length > 200) throw new Error(`${label}每项不能超过 200 字`);
    return item;
  });
}

const optionalNumber = (value: string) => (value.trim() ? Number(value) : undefined);
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

Page({
  data: {
    allowed: false,
    isAdmin: false,
    loading: true,
    saving: false,
    uploading: false,
    syncingRoute: false,
    error: '',
    formErrors: {} as FormErrors,
    stravaAuthorizationRequired: false,
    activityMode: 'daily' as ActivityMode,
    fromTemplate: false,
    canPublish: false,
    id: '',
    version: 0,
    status: 'draft',
    occupiedCount: 0,
    images: [] as string[],
    coverImage: '',
    schedule: [] as ScheduleRow[],
    routeGpxFileId: '',
    stravaRouteId: '',
    elevationProfile: [] as RouteElevationPoint[],
    routeBounds: undefined as RouteBounds | undefined,
    popularClimbs: [] as PopularClimb[],
    routeStartLocation: undefined as ActivityLocation | undefined,
    routeEndLocation: undefined as ActivityLocation | undefined,
    feeIncluded: [] as string[],
    feeExcluded: [] as string[],
    feeIncludedText: '',
    feeExcludedText: '',
    form: emptyForm(),
  },
  onShow() {},
  async onLoad(options: Record<string, string>) {
    await appStore.ensureIdentity(wx.cloud);
    if (appStore.authStatus !== 'authenticated') {
      this.setData({ loading: false, error: '请先完成微信身份验证' });
      return;
    }
    const id = typeof options.id === 'string' ? options.id : '';
    this.setData({
      allowed: true,
      isAdmin: appStore.role === 'admin',
      id,
      fromTemplate: options.fromTemplate === '1',
    });
    if (!id) {
      this.setData({ loading: false });
      return;
    }
    try {
      const activity = await rideService.getAdminActivity(id);
      if (!activity) throw new Error('活动不存在');
      const form: Form = {
        title: activity.title,
        description: activity.description,
        capacity: activity.capacity === undefined ? '' : String(activity.capacity),
        supportVehicleCapacity:
          activity.supportVehicleCapacity === undefined
            ? ''
            : String(activity.supportVehicleCapacity),
        selfDriveCapacity:
          activity.selfDriveCapacity === undefined ? '' : String(activity.selfDriveCapacity),
        driverNickname: activity.supportVehicleDriver?.nickname || '',
        licensePlate: activity.supportVehicleDriver?.licensePlate || '',
        contactPhone: activity.supportVehicleDriver?.contactPhone || '',
        deadline: formatLocalDateTime(activity.deadline),
        startAt: formatLocalDateTime(activity.startAt),
        endAt: formatLocalDateTime(activity.endAt),
        routeStart: activity.route.start,
        routeEnd: activity.route.end,
        stravaRouteUrl: activity.route.stravaRouteUrl || '',
        distanceKm: String(activity.route.distanceKm),
        elevationM: String(activity.route.elevationM),
        level: activity.route.level,
        fee: activity.fee || '',
        notices: activity.notices.join('\n'),
        equipment: activity.equipment.join('\n'),
      };
      const images = activity.images?.length
        ? [...activity.images]
        : activity.coverImage
          ? [activity.coverImage]
          : [];
      this.setData({
        loading: false,
        status: activity.status,
        version: activity.version,
        occupiedCount: activity.occupiedCount || 0,
        images,
        coverImage: images[0] || activity.coverImage || '',
        schedule: activity.schedule,
        routeGpxFileId: activity.route.gpxFileId || '',
        stravaRouteId: activity.route.stravaRouteId || '',
        elevationProfile: activity.route.elevationProfile || [],
        routeBounds: activity.route.routeBounds,
        popularClimbs: activity.route.popularClimbs || [],
        routeStartLocation: activity.route.startLocation,
        routeEndLocation: activity.route.endLocation,
        feeIncluded: activity.feeIncluded || [],
        feeExcluded: activity.feeExcluded || [],
        feeIncludedText: (activity.feeIncluded || []).join('\n'),
        feeExcludedText: (activity.feeExcluded || []).join('\n'),
        activityMode: (activity.supportVehicleCapacity || 0) > 0 ? 'premium' : 'daily',
        form,
      });
      this.recomputePublishReadiness();
    } catch (error) {
      this.setData({
        loading: false,
        error: error instanceof Error ? error.message : '活动加载失败',
      });
    }
  },
  showFormError(message: string, field?: FormField | 'schedule') {
    const formErrors = field ? { [field]: message } : {};
    this.setData({ error: message, formErrors });
    wx.showModal({ title: '请检查活动信息', content: message, showCancel: false });
    if (field && typeof wx.pageScrollTo === 'function')
      wx.pageScrollTo({ selector: `[data-error-anchor="${field}"]`, duration: 240 });
  },
  clearFieldError(field: FormField | 'schedule') {
    if (!(this.data.formErrors as FormErrors)[field]) return;
    const formErrors = { ...(this.data.formErrors as FormErrors) };
    delete formErrors[field];
    this.setData({ formErrors, error: Object.keys(formErrors).length ? this.data.error : '' });
  },
  selectActivityMode(event: any) {
    const activityMode = event.currentTarget.dataset.mode === 'premium' ? 'premium' : 'daily';
    const patch: Record<string, unknown> = {
      activityMode,
      error: '',
      formErrors: {},
    };
    if (activityMode === 'daily') {
      patch['form.supportVehicleCapacity'] = '0';
      patch['form.selfDriveCapacity'] = String((this.data.form as Form).capacity || '');
    } else if ((optionalNumber((this.data.form as Form).supportVehicleCapacity) || 0) === 0) {
      const capacity = optionalNumber((this.data.form as Form).capacity) || 20;
      const supportCapacity = Math.max(1, Math.floor(capacity / 2));
      patch['form.supportVehicleCapacity'] = String(supportCapacity);
      patch['form.selfDriveCapacity'] = String(capacity - supportCapacity);
    }
    this.setData(patch);
    this.recomputePublishReadiness();
  },
  field(event: any) {
    const name = event.currentTarget.dataset.name as keyof Form;
    const patch: Record<string, unknown> = { [`form.${name}`]: event.detail.value };
    if (name === 'capacity' && this.data.activityMode === 'daily')
      patch['form.selfDriveCapacity'] = event.detail.value;
    if (name === 'routeStart') patch.routeStartLocation = undefined;
    if (name === 'routeEnd') patch.routeEndLocation = undefined;
    if (name === 'stravaRouteUrl') {
      patch.stravaRouteId = '';
      patch.elevationProfile = [];
      patch.routeBounds = undefined;
      patch.popularClimbs = [];
    }
    this.setData(patch);
    this.clearFieldError(name);
    this.recomputePublishReadiness();
  },
  dateTimePicker(event: any) {
    const name = String(event.currentTarget.dataset.name || '') as FormField;
    const part = event.currentTarget.dataset.part === 'time' ? 'time' : 'date';
    if (!['deadline', 'startAt', 'endAt'].includes(name)) return;
    const current = String((this.data.form as Form)[name] || '');
    const date = part === 'date' ? event.detail.value : pickerDate(current) || todayText();
    const time = part === 'time' ? event.detail.value : pickerTime(current) || '08:00';
    this.setData({ [`form.${name}`]: `${date} ${time}:00` });
    this.clearFieldError(name);
    this.recomputePublishReadiness();
  },
  quickDateTime(event: any) {
    const name = String(event.currentTarget.dataset.name || '') as FormField;
    const preset = String(event.currentTarget.dataset.preset || '');
    if (!['deadline', 'startAt', 'endAt'].includes(name)) return;
    const now = new Date();
    let value = '';
    if (preset === 'tomorrow-morning') value = dateAtOffset(1, '07:00', now);
    if (preset === 'next-saturday') value = dateAtOffset(nextSaturdayOffset(now), '08:00', now);
    if (preset === 'tomorrow-evening') value = dateAtOffset(1, '20:00', now);
    // “开始前 1 天 20:00”和“开始后 4 小时”都依赖合法的开始时间，先统一解析一次。
    if (preset === 'start-minus-day' || preset === 'start-plus-four-hours') {
      const startText = String((this.data.form as Form).startAt || '').trim();
      const start = startText ? new Date(startText.replace(' ', 'T')) : new Date(NaN);
      // 开始时间为空或非法时明确提示，避免点击相对快捷项后静默无动作。
      if (Number.isNaN(start.getTime())) {
        wx.showToast({ title: '请先选择活动开始时间', icon: 'none' });
        return;
      }
      if (preset === 'start-minus-day') {
        start.setDate(start.getDate() - 1);
        value = localDateTimeText(start, '20:00');
      } else {
        start.setHours(start.getHours() + 4);
        value = localDateTimeText(start);
      }
    }
    if (!value) return;
    this.setData({ [`form.${name}`]: value });
    this.clearFieldError(name);
    this.recomputePublishReadiness();
  },
  assetField(event: any) {
    const name = String(event.currentTarget.dataset.name || '');
    if (name !== 'routeGpxFileId') return;
    this.setData({ [name]: event.detail.value });
    this.recomputePublishReadiness();
  },
  addScheduleRow() {
    if (this.data.schedule.length >= 50) {
      this.setData({ error: '日程最多 50 行' });
      return;
    }
    this.setData({
      schedule: [
        ...this.data.schedule,
        { time: '', title: '', location: '', remark: '' } as ScheduleRow,
      ],
    });
  },
  removeScheduleRow(event: any) {
    const index = Number(event.currentTarget.dataset.index);
    if (!Number.isInteger(index) || index < 0 || index >= this.data.schedule.length) return;
    this.setData({
      schedule: this.data.schedule.filter(
        (_: ScheduleRow, itemIndex: number) => itemIndex !== index,
      ),
    });
  },
  scheduleField(event: any) {
    const index = Number(event.currentTarget.dataset.index);
    const fieldName = String(event.currentTarget.dataset.field || '');
    if (
      !Number.isInteger(index) ||
      index < 0 ||
      index >= this.data.schedule.length ||
      !['time', 'title', 'location', 'remark'].includes(fieldName)
    )
      return;
    this.setData({ [`schedule[${index}].${fieldName}`]: event.detail.value });
    this.clearFieldError('schedule');
  },
  feeField(event: any) {
    const name = String(event.currentTarget.dataset.name || '');
    if (name !== 'feeIncludedText' && name !== 'feeExcludedText') return;
    this.setData({ [name]: event.detail.value });
    this.clearFieldError('fee');
    this.recomputePublishReadiness();
  },
  recomputePublishReadiness() {
    const f = this.data.form as Form;
    const capacity = optionalNumber(f.capacity) || 0;
    const support = optionalNumber(f.supportVehicleCapacity) || 0;
    const selfDrive = optionalNumber(f.selfDriveCapacity) || 0;
    let deadline: string | undefined;
    let start: string | undefined;
    let end: string | undefined;
    try {
      deadline = parseLocalDateTime(f.deadline, '报名截止时间');
      start = parseLocalDateTime(f.startAt, '活动开始时间');
      end = parseLocalDateTime(f.endAt, '活动结束时间');
    } catch {
      deadline = undefined;
      start = undefined;
      end = undefined;
    }
    const baseReady = Boolean(
      f.title.trim() &&
      f.routeStart.trim() &&
      f.routeEnd.trim() &&
      capacity > 0 &&
      Boolean(
        f.fee.trim() ||
        lines(this.data.feeIncludedText).length ||
        lines(this.data.feeExcludedText).length,
      ) &&
      deadline &&
      start &&
      end &&
      new Date(deadline).getTime() < new Date(start).getTime() &&
      new Date(start).getTime() < new Date(end).getTime(),
    );
    const premiumReady =
      this.data.activityMode === 'daily' ||
      (support > 0 &&
        support + selfDrive === capacity &&
        Boolean(f.driverNickname.trim() && f.licensePlate.trim() && f.contactPhone.trim()) &&
        this.data.schedule.length > 0 &&
        this.data.schedule.every((row: ScheduleRow) => row.time.trim() && row.title.trim()));
    this.setData({ canPublish: baseReady && premiumReady });
  },
  openStravaAuthorization() {
    wx.navigateTo({ url: '/pages/strava/index?reauthorize=1' });
  },
  async syncStravaRoute() {
    if (this.data.syncingRoute || this.data.saving) return;
    if (!this.data.isAdmin) {
      this.setData({ error: '仅管理员可以同步 Strava 路线' });
      return;
    }
    const routeUrl = String((this.data.form as Form).stravaRouteUrl || '');
    this.setData({ syncingRoute: true, error: '' });
    try {
      const preview = await rideService.previewStravaRoute(routeUrl);
      this.setData({
        'form.stravaRouteUrl': preview.stravaRouteUrl,
        'form.distanceKm': String(preview.distanceKm),
        'form.elevationM': String(preview.elevationM),
        stravaRouteId: preview.stravaRouteId,
        elevationProfile: preview.elevationProfile,
        routeBounds: preview.routeBounds,
        popularClimbs: preview.popularClimbs,
        stravaAuthorizationRequired: false,
      });
      wx.showToast({ title: '路线同步成功', icon: 'success' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Strava 路线同步失败';
      const scopeRequired = (error as { code?: string })?.code === 'STRAVA_SCOPE_REQUIRED';
      this.setData({
        error: scopeRequired ? 'Strava 授权已过期或权限不足，请重新授权后再同步路线。' : message,
        stravaAuthorizationRequired: scopeRequired,
      });
      if (scopeRequired) {
        wx.showModal({
          title: '需要重新授权 Strava',
          content: '当前授权缺少读取路线所需的 read 权限。请重新授权，完成后返回本页再次同步。',
          confirmText: '去重新授权',
          cancelText: '稍后处理',
          success: (result: { confirm: boolean }) => {
            if (result.confirm) wx.navigateTo({ url: '/pages/strava/index?reauthorize=1' });
          },
        });
      } else {
        this.showFormError(message, 'stravaRouteUrl');
      }
    } finally {
      this.setData({ syncingRoute: false });
    }
  },
  async chooseImages() {
    if (this.data.uploading) return;
    const remaining = 9 - this.data.images.length;
    if (remaining <= 0) {
      this.setData({ error: '活动图片最多 9 张' });
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
      const images = [...this.data.images, ...uploaded].slice(0, 9);
      this.setData({ images, coverImage: images[0] || '' });
    } catch (error) {
      // 一批图片必须整体进入表单；中途失败时回收已上传文件，避免形成无业务引用的孤儿文件。
      if (uploaded.length && wx.cloud && typeof wx.cloud.deleteFile === 'function') {
        try {
          await wx.cloud.deleteFile({ fileList: uploaded });
        } catch {
          // 清理失败不覆盖原始上传错误，云存储侧仍可按未引用文件做后续治理。
        }
      }
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
    this.setData({ images, coverImage: images[0] });
  },
  removeImage(event: any) {
    const index = Number(event.currentTarget.dataset.index);
    if (!Number.isInteger(index) || index < 0 || index >= this.data.images.length) return;
    const images = this.data.images.filter((_: string, itemIndex: number) => itemIndex !== index);
    this.setData({ images, coverImage: images[0] || '' });
  },
  async chooseRouteLocation(event: any) {
    const target = event.currentTarget.dataset.target === 'end' ? 'end' : 'start';
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
      const text = location.name || location.address;
      this.setData(
        target === 'start'
          ? { 'form.routeStart': text, routeStartLocation: location }
          : { 'form.routeEnd': text, routeEndLocation: location },
      );
      this.recomputePublishReadiness();
    } catch (error) {
      if (!isCancel(error)) this.setData({ error: '地点选择失败，请重试' });
    }
  },
  validateBeforeSave(nextStatus: ActivityInput['status']) {
    const form = this.data.form as Form;
    if (!form.title.trim()) return (this.showFormError('请填写活动标题', 'title'), false);
    if (nextStatus === 'draft') return true;
    const capacity = optionalNumber(form.capacity) || 0;
    const supportCapacity = optionalNumber(form.supportVehicleCapacity) || 0;
    const selfDriveCapacity = optionalNumber(form.selfDriveCapacity) || 0;
    if (capacity < 1) return (this.showFormError('请填写大于 0 的报名名额', 'capacity'), false);
    if (!form.deadline.trim()) return (this.showFormError('请填写报名截止时间', 'deadline'), false);
    if (!form.startAt.trim()) return (this.showFormError('请填写活动开始时间', 'startAt'), false);
    if (!form.endAt.trim()) return (this.showFormError('请填写活动结束时间', 'endAt'), false);
    if (!form.routeStart.trim())
      return (this.showFormError('请选择或填写集合点', 'routeStart'), false);
    if (!form.routeEnd.trim()) return (this.showFormError('请填写路线终点', 'routeEnd'), false);
    if (
      !form.fee.trim() &&
      !lines(this.data.feeIncludedText).length &&
      !lines(this.data.feeExcludedText).length
    )
      return (this.showFormError('请填写费用说明；免费活动可填写“免费”', 'fee'), false);
    if (this.data.activityMode === 'premium') {
      if (supportCapacity < 1)
        return (
          this.showFormError('精品局至少需要 1 个后援车名额', 'supportVehicleCapacity'),
          false
        );
      if (supportCapacity + selfDriveCapacity !== capacity)
        return (
          this.showFormError('后援车名额与自驾名额之和必须等于总名额', 'supportVehicleCapacity'),
          false
        );
      if (!form.driverNickname.trim())
        return (this.showFormError('请填写后援车师傅昵称', 'driverNickname'), false);
      if (!form.licensePlate.trim())
        return (this.showFormError('请填写后援车车牌号', 'licensePlate'), false);
      if (!form.contactPhone.trim())
        return (this.showFormError('请填写后援车联系电话', 'contactPhone'), false);
      if (!this.data.schedule.length)
        return (this.showFormError('精品局至少需要填写一条详细日程', 'schedule'), false);
    }
    return true;
  },
  async save(event: any) {
    if (this.data.saving || this.data.uploading) return;
    const nextStatus = String(
      event.currentTarget.dataset.status || this.data.status,
    ) as ActivityInput['status'];
    if (!this.validateBeforeSave(nextStatus)) return;
    const f = this.data.form as Form;
    if (f.description.length > 5000) {
      this.showFormError('活动说明不能超过 5000 字', 'description');
      return;
    }
    if (f.stravaRouteUrl && !this.data.stravaRouteId) {
      this.showFormError('请先同步 Strava 路线后再保存', 'stravaRouteUrl');
      return;
    }
    let deadline: string | undefined;
    let startAt: string | undefined;
    let endAt: string | undefined;
    try {
      deadline = parseLocalDateTime(f.deadline, '报名截止时间');
      startAt = parseLocalDateTime(f.startAt, '活动开始时间');
      endAt = parseLocalDateTime(f.endAt, '活动结束时间');
    } catch (error) {
      this.showFormError(error instanceof Error ? error.message : '日期时间格式错误', 'startAt');
      return;
    }
    const capacity = optionalNumber(f.capacity);
    const supportVehicleCapacity =
      this.data.activityMode === 'daily' ? 0 : optionalNumber(f.supportVehicleCapacity);
    const selfDriveCapacity =
      this.data.activityMode === 'daily' ? capacity : optionalNumber(f.selfDriveCapacity);
    let schedule: ScheduleRow[];
    try {
      schedule = validatedSchedule(this.data.schedule);
    } catch (error) {
      this.showFormError(error instanceof Error ? error.message : '日程校验失败', 'schedule');
      return;
    }
    let feeIncluded: string[];
    let feeExcluded: string[];
    try {
      feeIncluded = validatedFeeLines(this.data.feeIncludedText, '费用包含');
      feeExcluded = validatedFeeLines(this.data.feeExcludedText, '费用不包含');
    } catch (error) {
      this.showFormError(error instanceof Error ? error.message : '费用明细校验失败', 'fee');
      return;
    }
    const hasDriver =
      this.data.activityMode === 'premium' &&
      Boolean(f.driverNickname.trim() || f.licensePlate.trim() || f.contactPhone.trim());
    const hasFee = Boolean(f.fee.trim() || feeIncluded.length || feeExcluded.length);
    const images = [...this.data.images];
    const activity: ActivityInput = {
      title: f.title,
      description: f.description,
      images,
      coverImage: images[0] || this.data.coverImage || '',
      ...(capacity === undefined ? {} : { capacity }),
      ...(supportVehicleCapacity === undefined ? {} : { supportVehicleCapacity }),
      ...(selfDriveCapacity === undefined ? {} : { selfDriveCapacity }),
      ...(hasDriver
        ? {
            supportVehicleDriver: {
              nickname: f.driverNickname,
              licensePlate: f.licensePlate,
              contactPhone: f.contactPhone,
            },
          }
        : {}),
      ...(deadline ? { deadline } : {}),
      ...(startAt ? { startAt } : {}),
      ...(endAt ? { endAt } : {}),
      status: nextStatus,
      route: {
        start: f.routeStart,
        end: f.routeEnd,
        ...(this.data.routeStartLocation ? { startLocation: this.data.routeStartLocation } : {}),
        ...(this.data.routeEndLocation ? { endLocation: this.data.routeEndLocation } : {}),
        distanceKm: Number(f.distanceKm),
        elevationM: Number(f.elevationM),
        level: f.level,
        gpxFileId: this.data.routeGpxFileId,
        ...(this.data.stravaRouteId
          ? {
              stravaRouteId: this.data.stravaRouteId,
              stravaRouteUrl: f.stravaRouteUrl,
              elevationProfile: this.data.elevationProfile,
              routeBounds: this.data.routeBounds,
              popularClimbs: this.data.popularClimbs,
            }
          : {}),
      },
      schedule,
      notices: lines(f.notices),
      equipment: lines(f.equipment),
      ...(hasFee
        ? {
            fee: f.fee,
            feeIncluded,
            feeExcluded,
          }
        : {}),
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
        ? [...saved.images]
        : saved.coverImage
          ? [saved.coverImage]
          : [];
      this.setData({
        id: saved.id,
        version: saved.version,
        status: saved.status,
        occupiedCount: saved.occupiedCount || 0,
        images: savedImages,
        coverImage: savedImages[0] || saved.coverImage || '',
        schedule,
        routeGpxFileId: saved.route.gpxFileId || '',
        stravaRouteId: saved.route.stravaRouteId || '',
        elevationProfile: saved.route.elevationProfile || [],
        routeBounds: saved.route.routeBounds,
        popularClimbs: saved.route.popularClimbs || [],
        routeStartLocation: saved.route.startLocation,
        routeEndLocation: saved.route.endLocation,
        feeIncluded,
        feeExcluded,
        feeIncludedText: feeIncluded.join('\n'),
        feeExcludedText: feeExcluded.join('\n'),
      });
      this.recomputePublishReadiness();
      wx.showToast({ title: '保存成功', icon: 'success' });
    } catch (error) {
      this.showFormError(error instanceof Error ? error.message : '保存失败');
    } finally {
      this.setData({ saving: false });
    }
  },
});
