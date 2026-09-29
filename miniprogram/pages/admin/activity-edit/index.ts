import type { ActivityInput } from '../../../repositories/types';
import { rideService } from '../../../services/ride-service';
import { appStore } from '../../../store/app-store';

type Form = {
  title: string;
  description: string;
  capacity: string;
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
Page({
  data: {
    allowed: false,
    loading: true,
    saving: false,
    error: '',
    id: '',
    status: 'draft',
    occupiedCount: 0,
    // 当前页面暂不编辑封面与行程，必须保留加载到的原值，避免普通编辑静默清空。
    coverImage: '',
    schedule: [] as ActivityInput['schedule'],
    form: emptyForm(),
  },
  async onLoad(options: Record<string, string>) {
    await appStore.refreshIdentity(wx.cloud);
    if (appStore.role !== 'admin' || appStore.authStatus !== 'authenticated') {
      this.setData({ loading: false, error: '仅已验证管理员可访问' });
      return;
    }
    const id = typeof options.id === 'string' ? options.id : '';
    this.setData({ allowed: true, id });
    if (!id) {
      this.setData({ loading: false });
      return;
    }
    try {
      const activity = await rideService.getAdminActivity(id);
      if (!activity) throw new Error('活动不存在');
      this.setData({
        loading: false,
        status: activity.status,
        occupiedCount: activity.occupiedCount || 0,
        coverImage: activity.coverImage || '',
        schedule: activity.schedule,
        form: {
          title: activity.title,
          description: activity.description,
          capacity: String(activity.capacity),
          deadline: activity.deadline,
          startAt: activity.startAt,
          endAt: activity.endAt,
          routeStart: activity.route.start,
          routeEnd: activity.route.end,
          distanceKm: String(activity.route.distanceKm),
          elevationM: String(activity.route.elevationM),
          level: activity.route.level,
          fee: activity.fee,
          notices: activity.notices.join('\n'),
          equipment: activity.equipment.join('\n'),
        },
      });
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
  },
  async save(event: any) {
    if (this.data.saving) return;
    const nextStatus = String(
      event.currentTarget.dataset.status || this.data.status,
    ) as ActivityInput['status'];
    const f = this.data.form as Form;
    const activity: ActivityInput = {
      title: f.title,
      description: f.description,
      coverImage: this.data.coverImage,
      capacity: Number(f.capacity),
      deadline: f.deadline,
      startAt: f.startAt,
      endAt: f.endAt,
      status: nextStatus,
      route: {
        start: f.routeStart,
        end: f.routeEnd,
        distanceKm: Number(f.distanceKm),
        elevationM: Number(f.elevationM),
        level: f.level,
      },
      schedule: this.data.schedule,
      notices: lines(f.notices),
      equipment: lines(f.equipment),
      fee: f.fee,
    };
    this.setData({ saving: true, error: '' });
    try {
      const saved = await rideService.saveActivity(activity, this.data.id || undefined);
      this.setData({
        id: saved.id,
        status: saved.status,
        occupiedCount: saved.occupiedCount || 0,
        coverImage: saved.coverImage || '',
        schedule: saved.schedule,
      });
      wx.showToast({ title: '保存成功', icon: 'success' });
    } catch (error) {
      this.setData({ error: error instanceof Error ? error.message : '保存失败' });
    } finally {
      this.setData({ saving: false });
    }
  },
});
