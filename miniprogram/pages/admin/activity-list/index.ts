import { rideService } from '../../../services/ride-service';
import { appStore } from '../../../store/app-store';

const emptyCloneForm = () => ({ deadline: '', startAt: '', endAt: '' });
const newRequestId = () => `clone_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
const PAGE_SIZE = 50;
// 删除按钮宽度（px），卡片位移只能在 [-DELETE_ACTION_WIDTH, 0] 之间。
const DELETE_ACTION_WIDTH = 80;
const SWIPE_LOCK_PX = 10;
type StatusFilter = 'all' | 'draft' | 'published' | 'finished';

function clampSwipeOffset(value: number) {
  return Math.max(-DELETE_ACTION_WIDTH, Math.min(0, value));
}

function pageInput(statusFilter: StatusFilter, cursor?: string) {
  return {
    pageSize: PAGE_SIZE,
    ...(statusFilter === 'all' ? {} : { statusFilter }),
    ...(cursor === undefined ? {} : { cursor }),
  };
}

function deleteErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : '删除失败';
  return /报名/.test(message) ? '活动仍有待处理报名，请先到报名审批处理后再删除' : message;
}

function displayItem(item: any) {
  return {
    ...item,
    canClone: item.status === 'finished',
    canToggleOnline: item.status === 'draft' || item.status === 'published',
    statusLabel:
      item.status === 'published' ? '已上线' : item.status === 'draft' ? '已下架' : '已结束',
    toggleLabel: item.status === 'published' ? '下架' : '上线',
    // 每张卡片各自维护滑动位移与展开状态，手势期间关闭动画、松手后开启动画吸附。
    swipeOffset: 0,
    swipeOpen: false,
    swipeAnim: false,
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
  // 当前手势状态：锁定方向后只响应水平滑动，避免与页面纵向滚动冲突。
  _touch: {
    id: '',
    startX: 0,
    startY: 0,
    baseOffset: 0,
    horizontal: false,
    locked: false,
  },
  data: {
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
    const id = String(event.currentTarget.dataset.id || '');
    const item = this.data.items.find((candidate: { id: string }) => candidate.id === id);
    // 卡片处于展开状态时，点击正文先收起删除按钮，不进入编辑页，避免误触。
    if (item?.swipeOpen) {
      this.closeOtherSwipes('');
      return;
    }
    wx.navigateTo({ url: `/pages/admin/activity-edit/index?id=${id}` });
  },
  onRowTouchStart(event: any) {
    const id = String(event.currentTarget.dataset.id || '');
    const index = this.data.items.findIndex((item: { id: string }) => item.id === id);
    if (index < 0) return;
    const touch = event.changedTouches[0] || {};
    this._touch = {
      id,
      startX: touch.clientX || 0,
      startY: touch.clientY || 0,
      baseOffset: this.data.items[index].swipeOffset || 0,
      horizontal: false,
      locked: false,
    };
    // 新手势关闭过渡动画，保证跟手无延迟；同时收起其他已展开卡片。
    this.setData({ [`items[${index}].swipeAnim`]: false });
    this.closeOtherSwipes(id);
  },
  onRowTouchMove(event: any) {
    const touchState = this._touch;
    if (!touchState.id) return;
    const touch = event.changedTouches[0] || {};
    const dx = (touch.clientX || 0) - touchState.startX;
    const dy = (touch.clientY || 0) - touchState.startY;
    // 首次超过阈值的移动决定方向：纵向交还给页面滚动，横向才接管。
    if (!touchState.locked) {
      if (Math.abs(dx) < SWIPE_LOCK_PX && Math.abs(dy) < SWIPE_LOCK_PX) return;
      touchState.locked = true;
      touchState.horizontal = Math.abs(dx) > Math.abs(dy);
    }
    if (!touchState.horizontal) return;
    const index = this.data.items.findIndex((item: { id: string }) => item.id === touchState.id);
    if (index < 0) return;
    this.setData({
      [`items[${index}].swipeOffset`]: clampSwipeOffset(touchState.baseOffset + dx),
    });
  },
  onRowTouchEnd() {
    const touchState = this._touch;
    if (!touchState.id) return;
    const index = this.data.items.findIndex((item: { id: string }) => item.id === touchState.id);
    this._touch = {
      id: '',
      startX: 0,
      startY: 0,
      baseOffset: 0,
      horizontal: false,
      locked: false,
    };
    if (index < 0 || !touchState.horizontal) return;
    // 松手后开启动画吸附：越过半幅则完全展开，否则收起。
    const shouldOpen = Number(this.data.items[index].swipeOffset) <= -DELETE_ACTION_WIDTH / 2;
    this.setData({
      [`items[${index}].swipeAnim`]: true,
      [`items[${index}].swipeOffset`]: shouldOpen ? -DELETE_ACTION_WIDTH : 0,
      [`items[${index}].swipeOpen`]: shouldOpen,
    });
  },
  closeOtherSwipes(activeId: string) {
    const patch: Record<string, unknown> = {};
    this.data.items.forEach((item: { id: string; swipeOpen: boolean }, index: number) => {
      if (item.id !== activeId && item.swipeOpen) {
        patch[`items[${index}].swipeAnim`] = true;
        patch[`items[${index}].swipeOffset`] = 0;
        patch[`items[${index}].swipeOpen`] = false;
      }
    });
    if (Object.keys(patch).length) this.setData(patch);
  },
  async confirmDelete(event: any) {
    const id = String(event.currentTarget.dataset.id || '');
    const item = this.data.items.find(
      (candidate: { id: string; title: string }) => candidate.id === id,
    );
    if (!item) return;
    const confirmed = await new Promise<boolean>((resolve) => {
      wx.showModal({
        title: '删除活动',
        content: `确认删除“${item.title}”吗？存在报名时将无法删除。`,
        confirmText: '删除',
        success: (result: { confirm: boolean }) => resolve(result.confirm),
        fail: () => resolve(false),
      });
    });
    if (!confirmed) return;
    const index = this.data.items.findIndex((candidate: { id: string }) => candidate.id === id);
    try {
      await rideService.deleteActivity(id);
      // 删除成功后从列表移除该卡片；过滤方式不受分页数据影响。
      this.setData({
        items: this.data.items.filter((candidate: { id: string }) => candidate.id !== id),
        error: '',
      });
      wx.showToast({ title: '已删除', icon: 'success' });
    } catch (error) {
      // 删除失败（越权、有报名、活动不存在）时收起卡片并展示服务端原因。
      if (index >= 0) {
        this.setData({
          [`items[${index}].swipeAnim`]: true,
          [`items[${index}].swipeOffset`]: 0,
          [`items[${index}].swipeOpen`]: false,
        });
      }
      this.setData({ error: deleteErrorMessage(error) });
    }
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
