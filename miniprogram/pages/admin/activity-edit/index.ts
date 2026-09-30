import type { ActivityInput } from '../../../repositories/types';
import { rideService } from '../../../services/ride-service';
import { appStore } from '../../../store/app-store';
import { formatLocalDateTime, parseLocalDateTime } from '../../../utils/date-time';
import type { ActivityLocation } from '../../../models';

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
  distanceKm: string;
  elevationM: string;
  level: string;
  fee: string;
  notices: string;
  equipment: string;
};
const emptyForm = (): Form => ({
  title: '',
  description: '',
  capacity: '20',
  supportVehicleCapacity: '10',
  selfDriveCapacity: '10',
  driverNickname: '',
  licensePlate: '',
  contactPhone: '',
  deadline: '',
  startAt: '',
  endAt: '',
  routeStart: '',
  routeEnd: '',
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
const optionalNumber = (value: string) => (value.trim() ? Number(value) : undefined);
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
    error: '',
    fromTemplate: false,
    canPublish: false,
    id: '',
    version: 0,
    status: 'draft',
    occupiedCount: 0,
    images: [] as string[],
    coverImage: '',
    schedule: [] as ActivityInput['schedule'],
    routeGpxFileId: '',
    routeStartLocation: undefined as ActivityLocation | undefined,
    routeEndLocation: undefined as ActivityLocation | undefined,
    feeIncluded: [] as string[],
    feeExcluded: [] as string[],
    form: emptyForm(),
  },
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
        routeStartLocation: activity.route.startLocation,
        routeEndLocation: activity.route.endLocation,
        feeIncluded: activity.feeIncluded || [],
        feeExcluded: activity.feeExcluded || [],
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
  field(event: any) {
    const name = event.currentTarget.dataset.name as keyof Form;
    const patch: Record<string, unknown> = { [`form.${name}`]: event.detail.value };
    if (name === 'routeStart') patch.routeStartLocation = undefined;
    if (name === 'routeEnd') patch.routeEndLocation = undefined;
    this.setData(patch);
    this.recomputePublishReadiness();
  },
  assetField(event: any) {
    const name = String(event.currentTarget.dataset.name || '');
    if (name !== 'routeGpxFileId') return;
    this.setData({ [name]: event.detail.value });
    this.recomputePublishReadiness();
  },
  recomputePublishReadiness() {
    const f = this.data.form as Form;
    const support = optionalNumber(f.supportVehicleCapacity) || 0;
    let start: string | undefined;
    let end: string | undefined;
    try {
      start = parseLocalDateTime(f.startAt, '活动开始时间');
      end = parseLocalDateTime(f.endAt, '活动结束时间');
    } catch {
      start = undefined;
      end = undefined;
    }
    const driverReady =
      support === 0 ||
      Boolean(f.driverNickname.trim() && f.licensePlate.trim() && f.contactPhone.trim());
    const canPublish = Boolean(
      f.title.trim() &&
      f.routeStart.trim() &&
      f.routeEnd.trim() &&
      start &&
      end &&
      new Date(start).getTime() < new Date(end).getTime() &&
      driverReady,
    );
    this.setData({ canPublish });
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
  async save(event: any) {
    if (this.data.saving || this.data.uploading) return;
    const nextStatus = String(
      event.currentTarget.dataset.status || this.data.status,
    ) as ActivityInput['status'];
    if (this.data.status === 'draft' && nextStatus === 'published' && !this.data.canPublish) {
      this.setData({ error: '发布前请完成重新确认清单' });
      return;
    }
    const f = this.data.form as Form;
    if (f.description.length > 5000) {
      this.setData({ error: '活动说明不能超过 5000 字' });
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
      this.setData({ error: error instanceof Error ? error.message : '日期时间格式错误' });
      return;
    }
    const capacity = optionalNumber(f.capacity);
    const supportVehicleCapacity = optionalNumber(f.supportVehicleCapacity);
    const selfDriveCapacity = optionalNumber(f.selfDriveCapacity);
    const hasDriver = Boolean(
      f.driverNickname.trim() || f.licensePlate.trim() || f.contactPhone.trim(),
    );
    const hasFee = Boolean(
      f.fee.trim() || this.data.feeIncluded.length || this.data.feeExcluded.length,
    );
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
      },
      schedule: this.data.schedule,
      notices: lines(f.notices),
      equipment: lines(f.equipment),
      ...(hasFee
        ? {
            fee: f.fee,
            feeIncluded: this.data.feeIncluded,
            feeExcluded: this.data.feeExcluded,
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
        schedule: saved.schedule,
        routeGpxFileId: saved.route.gpxFileId || '',
        routeStartLocation: saved.route.startLocation,
        routeEndLocation: saved.route.endLocation,
        feeIncluded: saved.feeIncluded || [],
        feeExcluded: saved.feeExcluded || [],
      });
      this.recomputePublishReadiness();
      wx.showToast({ title: '保存成功', icon: 'success' });
    } catch (error) {
      this.setData({ error: error instanceof Error ? error.message : '保存失败' });
    } finally {
      this.setData({ saving: false });
    }
  },
});
