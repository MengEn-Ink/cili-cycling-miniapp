import type { ActivityInput } from '../../../repositories/types';
import { rideService } from '../../../services/ride-service';
import { appStore } from '../../../store/app-store';
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
Page({
  data: {
    allowed: false,
    isAdmin: false,
    loading: true,
    saving: false,
    error: '',
    fromTemplate: false,
    canPublish: false,
    id: '',
    version: 0,
    status: 'draft',
    occupiedCount: 0,
    // 独立保存未映射到普通文本表单的媒体和行程值，避免编辑时静默清空。
    coverImage: '',
    schedule: [] as ActivityInput['schedule'],
    routeGpxFileId: '',
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
        deadline: activity.deadline || '',
        startAt: activity.startAt || '',
        endAt: activity.endAt || '',
        routeStart: activity.route.start,
        routeEnd: activity.route.end,
        distanceKm: String(activity.route.distanceKm),
        elevationM: String(activity.route.elevationM),
        level: activity.route.level,
        fee: activity.fee || '',
        notices: activity.notices.join('\n'),
        equipment: activity.equipment.join('\n'),
      };
      this.setData({
        loading: false,
        status: activity.status,
        version: activity.version,
        occupiedCount: activity.occupiedCount || 0,
        coverImage: activity.coverImage || '',
        schedule: activity.schedule,
        routeGpxFileId: activity.route.gpxFileId || '',
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
    this.setData({ [`form.${name}`]: event.detail.value });
    this.recomputePublishReadiness();
  },
  assetField(event: any) {
    const name = String(event.currentTarget.dataset.name || '');
    if (!['coverImage', 'routeGpxFileId'].includes(name)) return;
    this.setData({ [name]: event.detail.value });
    this.recomputePublishReadiness();
  },
  recomputePublishReadiness() {
    const f = this.data.form as Form;
    const support = optionalNumber(f.supportVehicleCapacity) || 0;
    const start = new Date(f.startAt).getTime();
    const end = new Date(f.endAt).getTime();
    const driverReady =
      support === 0 ||
      Boolean(f.driverNickname.trim() && f.licensePlate.trim() && f.contactPhone.trim());
    const canPublish = Boolean(
      f.title.trim() &&
      f.routeStart.trim() &&
      f.routeEnd.trim() &&
      Number.isFinite(start) &&
      Number.isFinite(end) &&
      start < end &&
      driverReady,
    );
    this.setData({ canPublish });
  },
  async save(event: any) {
    if (this.data.saving) return;
    const nextStatus = String(
      event.currentTarget.dataset.status || this.data.status,
    ) as ActivityInput['status'];
    if (this.data.status === 'draft' && nextStatus === 'published' && !this.data.canPublish) {
      this.setData({ error: '发布前请完成重新确认清单' });
      return;
    }
    const f = this.data.form as Form;
    const capacity = optionalNumber(f.capacity);
    const supportVehicleCapacity = optionalNumber(f.supportVehicleCapacity);
    const selfDriveCapacity = optionalNumber(f.selfDriveCapacity);
    const hasDriver = Boolean(
      f.driverNickname.trim() || f.licensePlate.trim() || f.contactPhone.trim(),
    );
    const hasFee = Boolean(
      f.fee.trim() || this.data.feeIncluded.length || this.data.feeExcluded.length,
    );
    const activity: ActivityInput = {
      title: f.title,
      description: f.description,
      coverImage: this.data.coverImage,
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
      ...(f.deadline.trim() ? { deadline: f.deadline } : {}),
      ...(f.startAt.trim() ? { startAt: f.startAt } : {}),
      ...(f.endAt.trim() ? { endAt: f.endAt } : {}),
      status: nextStatus,
      route: {
        start: f.routeStart,
        end: f.routeEnd,
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
      this.setData({
        id: saved.id,
        version: saved.version,
        status: saved.status,
        occupiedCount: saved.occupiedCount || 0,
        coverImage: saved.coverImage || '',
        schedule: saved.schedule,
        routeGpxFileId: saved.route.gpxFileId || '',
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
