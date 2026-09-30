import { rideService } from '../../../services/ride-service';
import { syncPageTheme } from '../../../services/theme-service';
import { appStore } from '../../../store/app-store';

const emptyCloneForm = () => ({ deadline: '', startAt: '', endAt: '' });
const newRequestId = () => `clone_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

Page({
  data: {
    theme: 'dark',
    themeClass: 'theme-dark',
    items: [] as any[],
    error: '',
    allowed: false,
    isAdmin: false,
    cloneSourceId: '',
    cloneRequestId: '',
    cloneForm: emptyCloneForm(),
    cloning: false,
  },
  async onShow() {
    syncPageTheme(this);
    await appStore.ensureIdentity(wx.cloud);
    if (appStore.authStatus !== 'authenticated') {
      this.setData({ error: '请先完成微信身份验证', allowed: false });
      return;
    }
    try {
      this.setData({
        items: (await rideService.listAdminActivities()).map((item) => ({
          ...item,
          canClone: item.status === 'finished',
          canToggleOnline: item.status === 'draft' || item.status === 'published',
          statusLabel:
            item.status === 'published' ? '已上线' : item.status === 'draft' ? '已下架' : '已结束',
          toggleLabel: item.status === 'published' ? '下架' : '上线',
        })),
        allowed: true,
        isAdmin: appStore.role === 'admin',
        error: '',
      });
    } catch (error) {
      this.setData({ error: error instanceof Error ? error.message : '加载失败' });
    }
  },
  edit(event: any) {
    wx.navigateTo({ url: `/pages/admin/activity-edit/index?id=${event.currentTarget.dataset.id}` });
  },
  create() {
    wx.navigateTo({ url: '/pages/admin/activity-edit/index' });
  },
  reviews() {
    if (this.data.isAdmin) wx.navigateTo({ url: '/pages/admin/reviews/index' });
  },
  async toggleOnline(event: any) {
    const id = String(event.currentTarget.dataset.id || '');
    const item = this.data.items.find(
      (candidate: { id: string; canToggleOnline: boolean }) =>
        candidate.id === id && candidate.canToggleOnline,
    );
    if (!item) return;
    const nextStatus = item.status === 'published' ? 'draft' : 'published';
    const action = nextStatus === 'published' ? '上线' : '下架';
    const confirmed = await new Promise<boolean>((resolve) => {
      wx.showModal({
        title: `${action}活动`,
        content: `确认${action}“${item.title}”吗？`,
        success: (result: { confirm: boolean }) => resolve(result.confirm),
        fail: () => resolve(false),
      });
    });
    if (!confirmed) return;
    try {
      await rideService.saveActivity({ ...item, status: nextStatus }, item.id, item.version);
      wx.showToast({ title: `已${action}`, icon: 'success' });
      await this.onShow();
    } catch (error) {
      this.setData({ error: error instanceof Error ? error.message : `${action}失败` });
    }
  },
  startClone(event: any) {
    if (this.data.cloning) return;
    const sourceActivityId = String(event.currentTarget.dataset.id || '');
    const source = this.data.items.find(
      (item: { id: string; canClone: boolean }) => item.id === sourceActivityId && item.canClone,
    );
    if (!source) {
      this.setData({ error: '只能从历史活动创建草稿' });
      return;
    }
    this.setData({
      cloneSourceId: sourceActivityId,
      cloneRequestId: newRequestId(),
      cloneForm: emptyCloneForm(),
      error: '',
    });
  },
  cloneField(event: any) {
    const name = String(event.currentTarget.dataset.name || '');
    if (!['deadline', 'startAt', 'endAt'].includes(name)) return;
    this.setData({ [`cloneForm.${name}`]: event.detail.value });
  },
  cancelClone() {
    if (this.data.cloning) return;
    this.setData({ cloneSourceId: '', cloneRequestId: '', cloneForm: emptyCloneForm(), error: '' });
  },
  async confirmClone() {
    if (this.data.cloning || !this.data.cloneSourceId) return;
    const form = this.data.cloneForm;
    const deadline = new Date(form.deadline).getTime();
    const start = new Date(form.startAt).getTime();
    const end = new Date(form.endAt).getTime();
    if (
      !form.deadline ||
      !form.startAt ||
      !form.endAt ||
      !Number.isFinite(deadline) ||
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      Date.now() >= deadline ||
      deadline >= start ||
      start >= end
    ) {
      this.setData({ error: '请填写有效的新时间，并确保截止、开始、结束依次为未来时间' });
      return;
    }
    this.setData({ cloning: true, error: '' });
    try {
      const draft = await rideService.cloneActivity({
        sourceActivityId: this.data.cloneSourceId,
        requestId: this.data.cloneRequestId,
        signupDeadline: form.deadline,
        eventStart: form.startAt,
        eventEnd: form.endAt,
      });
      wx.navigateTo({
        url: `/pages/admin/activity-edit/index?id=${draft.id}&fromTemplate=1`,
      });
    } catch (error) {
      this.setData({ error: error instanceof Error ? error.message : '创建模板草稿失败' });
    } finally {
      this.setData({ cloning: false });
    }
  },
});
