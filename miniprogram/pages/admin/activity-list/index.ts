import { rideService } from '../../../services/ride-service';
import { syncPageTheme } from '../../../services/theme-service';
import { appStore } from '../../../store/app-store';

const emptyCloneForm = () => ({ deadline: '', startAt: '', endAt: '' });
const newRequestId = () => `clone_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
const PAGE_SIZE = 50;
type StatusFilter = 'all' | 'draft' | 'published' | 'finished';

function pageInput(statusFilter: StatusFilter, cursor?: string) {
  return {
    pageSize: PAGE_SIZE,
    ...(statusFilter === 'all' ? {} : { statusFilter }),
    ...(cursor === undefined ? {} : { cursor }),
  };
}

function displayItem(item: any) {
  return {
    ...item,
    canClone: item.status === 'finished',
    canToggleOnline: item.status === 'draft' || item.status === 'published',
    statusLabel:
      item.status === 'published' ? '已上线' : item.status === 'draft' ? '已下架' : '已结束',
    toggleLabel: item.status === 'published' ? '下架' : '上线',
  };
}

function appendUnique(current: any[], incoming: any[]) {
  const seen = new Set(current.map((item) => item.id));
  return [
    ...current,
    ...incoming.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    }),
  ];
}

Page({
  _listRevision: 0,
  _loadMorePromise: undefined as Promise<void> | undefined,
  _loadMoreCursor: '',
  _loadMoreRevision: 0,
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
    nextCursor: null as string | null,
    hasMore: false,
    loading: false,
    loadingMore: false,
    statusFilter: 'all' as StatusFilter,
  },
  async onShow() {
    const revision = this._listRevision + 1;
    this._listRevision = revision;
    this._loadMorePromise = undefined;
    this._loadMoreCursor = '';
    this._loadMoreRevision = revision;
    syncPageTheme(this);
    // 新一轮刷新已经使旧分页请求失效，先收敛其视觉状态，避免身份检查失败后一直显示加载中。
    this.setData({ loadingMore: false });
    await appStore.ensureIdentity(wx.cloud);
    if (revision !== this._listRevision) return;
    if (appStore.authStatus !== 'authenticated') {
      this.setData({
        error: '请先完成微信身份验证',
        allowed: false,
        loading: false,
        loadingMore: false,
      });
      return;
    }
    this.setData({ loading: true, loadingMore: false, error: '' });
    try {
      const page = await rideService.listAdminActivitiesPage(
        pageInput(this.data.statusFilter as StatusFilter),
      );
      if (revision !== this._listRevision) return;
      this.setData({
        items: page.items.map(displayItem),
        nextCursor: page.nextCursor,
        hasMore: page.nextCursor !== null,
        allowed: true,
        isAdmin: appStore.role === 'admin',
        error: '',
      });
    } catch (error) {
      if (revision !== this._listRevision) return;
      this.setData({ error: error instanceof Error ? error.message : '加载失败' });
    } finally {
      if (revision === this._listRevision) this.setData({ loading: false });
    }
  },
  loadMore() {
    const revision = this._listRevision;
    const cursor = this.data.nextCursor;
    const statusFilter = this.data.statusFilter as StatusFilter;
    if (!this.data.hasMore || !cursor) return Promise.resolve();
    if (
      this._loadMorePromise &&
      this._loadMoreRevision === revision &&
      this._loadMoreCursor === cursor
    )
      return this._loadMorePromise;

    this._loadMoreRevision = revision;
    this._loadMoreCursor = cursor;
    this.setData({ loadingMore: true, error: '' });
    const request = (async () => {
      try {
        const page = await rideService.listAdminActivitiesPage(pageInput(statusFilter, cursor));
        if (revision !== this._listRevision || cursor !== this.data.nextCursor) return;
        this.setData({
          items: appendUnique(this.data.items, page.items.map(displayItem)),
          nextCursor: page.nextCursor,
          hasMore: page.nextCursor !== null,
          // error 已在请求开始时清空；此处不再覆盖，保留分页期间产生的更新业务错误。
        });
      } catch (error) {
        if (revision !== this._listRevision || cursor !== this.data.nextCursor) return;
        this.setData({ error: error instanceof Error ? error.message : '加载失败' });
      } finally {
        const ownsLoadingState =
          this._loadMoreRevision === revision && this._loadMoreCursor === cursor;
        if (revision === this._listRevision && ownsLoadingState)
          this.setData({ loadingMore: false });
        if (ownsLoadingState) {
          this._loadMorePromise = undefined;
          this._loadMoreCursor = '';
        }
      }
    })();
    this._loadMorePromise = request;
    return request;
  },
  selectStatusFilter(event: any) {
    const statusFilter = String(event.currentTarget.dataset.status || '') as StatusFilter;
    if (
      !['all', 'draft', 'published', 'finished'].includes(statusFilter) ||
      statusFilter === this.data.statusFilter
    )
      return Promise.resolve();
    this.setData({ statusFilter });
    return this.onShow();
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
