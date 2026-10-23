import { rideService } from '../../../services/ride-service';
import { appStore } from '../../../store/app-store';
import { formatActivityDateTime } from '../../../utils/date-time';

const emptyCloneForm = () => ({ deadline: '', startAt: '', endAt: '' });
const newRequestId = () => `clone_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
const newReviewRequestId = () => `review_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
const PAGE_SIZE = 50;
const REVIEW_CONFLICT_CODES = new Set([
  'REVIEW_CONFLICT',
  'REVIEW_ALREADY_RESOLVED',
  'REVIEW_REQUEST_CONFLICT',
]);
const errorCode = (error: unknown) =>
  typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code || '')
    : '';
// 删除按钮宽度（px），卡片位移只能在 [-DELETE_ACTION_WIDTH, 0] 之间。
const DELETE_ACTION_WIDTH = 80;
const SWIPE_LOCK_PX = 10;
type StatusFilter = 'all' | 'draft' | 'pending_review' | 'rejected' | 'published' | 'finished';

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

function promptOperationReason(
  title: string,
  placeholderText: string,
): Promise<string | undefined> {
  return new Promise((resolve) => {
    wx.showModal({
      title,
      editable: true,
      placeholderText,
      confirmText: '确认',
      success: (result: { confirm: boolean; content?: string }) => {
        if (!result.confirm) return resolve(undefined);
        const reason = String(result.content || '').trim();
        if (reason) return resolve(reason);
        wx.showToast({ title: '请填写原因', icon: 'none' });
        resolve(undefined);
      },
      fail: () => resolve(undefined),
    });
  });
}

function metricValue(...values: unknown[]) {
  const value = values.find((candidate) => Number.isInteger(candidate) && Number(candidate) >= 0);
  return value === undefined ? '—' : String(value);
}

function displayItem(item: any, isAdmin = false, managedClubIds: string[] = []) {
  const canReview =
    item.status === 'pending_review' &&
    (isAdmin || (item.clubId && managedClubIds.includes(item.clubId)));
  return {
    ...item,
    displayDate: formatActivityDateTime(item.startAt || item.date),
    registrationMetric: metricValue(item.occupiedCount),
    pendingMetric: metricValue(item.pendingRegistrationCount, item.pendingCount),
    approvedMetric: metricValue(item.approvedRegistrationCount, item.approvedCount),
    canClone: item.status === 'finished',
    canReview,
    canEdit: !['pending_review', 'finished'].includes(item.status),
    canToggleOnline: item.status === 'draft' || item.status === 'published',
    statusLabel:
      item.status === 'published'
        ? '已上线'
        : item.status === 'draft'
          ? '已下架'
          : item.status === 'pending_review'
            ? '待审核'
            : item.status === 'rejected'
              ? '已驳回'
              : '已结束',
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

function summariseMetrics(items: any[]) {
  // 单次计算头部三格汇总指标（已发布/草稿/待审核）；只统计当前已加载列表，保持与客户端一致。
  let publishedCount = 0;
  let draftCount = 0;
  let pendingCount = 0;
  for (const item of items) {
    if (item.status === 'published') publishedCount += 1;
    else if (item.status === 'draft') draftCount += 1;
    else if (item.status === 'pending_review') pendingCount += 1;
  }
  return { publishedCount, draftCount, pendingCount };
}

Page({
  _unloaded: false,
  _listRevision: 0,
  _loadMorePromise: undefined as Promise<void> | undefined,
  _loadMoreCursor: '',
  _loadMoreRevision: 0,
  // 审批 requestId 属于“活动 + 审批版本 + 决定”这一业务意图；模糊失败后必须复用，
  // 否则响应丢失时重新生成 id 会把一次点击变成第二次审批。
  _reviewIntents: new Map<string, { requestId: string; reason?: string }>(),
  // 同一活动审批过程中互斥；即使用户交替点击通过/驳回，也只允许一个请求进入服务层。
  _reviewInFlight: new Map<string, Promise<void>>(),
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
    metrics: { publishedCount: 0, draftCount: 0, pendingCount: 0 },
    error: '',
    loadError: '',
    allowed: false,
    isAdmin: false,
    managedClubIds: [] as string[],
    cloneSourceId: '',
    cloneRequestId: '',
    cloneForm: emptyCloneForm(),
    cloneError: '',
    cloning: false,
    nextCursor: null as string | null,
    hasMore: false,
    loading: false,
    loadingMore: false,
    statusFilter: 'all' as StatusFilter,
  },
  async onShow() {
    this._unloaded = false;
    const revision = this._listRevision + 1;
    this._listRevision = revision;
    const isCurrent = () => !this._unloaded && revision === this._listRevision;
    this._loadMorePromise = undefined;
    this._loadMoreCursor = '';
    this._loadMoreRevision = revision;
    // 身份和列表读取都属于本轮加载；先展示加载态，不能把身份尚未完成误判为无权限。
    this.setData({ loading: true, loadingMore: false, error: '', loadError: '' });
    let identityReady = false;
    try {
      await appStore.ensureIdentity(wx.cloud);
      identityReady = true;
      if (!isCurrent()) return;
      if (appStore.authStatus !== 'authenticated') {
        this.setData({
          error: '',
          loadError: '',
          allowed: false,
          loading: false,
          loadingMore: false,
        });
        return;
      }
      const isAdmin = appStore.role === 'admin';
      let managedClubIds: string[] = [];
      try {
        const profile = await rideService.getProfile();
        managedClubIds = (profile.clubs || [])
          .filter((club) => ['OWNER', 'ADMIN'].includes(club.role.toUpperCase()))
          .map((club) => club.clubId);
      } catch {
        // 俱乐部身份仅增强审批按钮；读取失败时仍保留原有“我的活动”能力，服务端继续兜底鉴权。
      }
      this.setData({ allowed: true, isAdmin, managedClubIds });
      const page = await rideService.listAdminActivitiesPage(
        pageInput(this.data.statusFilter as StatusFilter),
      );
      if (!isCurrent()) return;
      const nextItems = page.items.map((item) => displayItem(item, isAdmin, managedClubIds));
      this.setData({
        items: nextItems,
        metrics: summariseMetrics(nextItems),
        nextCursor: page.nextCursor,
        hasMore: page.nextCursor !== null,
        error: '',
      });
    } catch (error) {
      if (!isCurrent()) return;
      this.setData({
        loadError: !identityReady
          ? '身份初始化失败，请检查网络后重试'
          : error instanceof Error
            ? error.message
            : '活动列表加载失败，请重试',
      });
    } finally {
      if (isCurrent()) this.setData({ loading: false, loadingMore: false });
    }
  },
  retryLoad() {
    return this.onShow();
  },
  onUnload() {
    this._unloaded = true;
    this._listRevision += 1;
    this._loadMorePromise = undefined;
    this._loadMoreCursor = '';
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
        const mergedItems = appendUnique(
          this.data.items,
          page.items.map((item) => displayItem(item, this.data.isAdmin, this.data.managedClubIds)),
        );
        this.setData({
          items: mergedItems,
          metrics: summariseMetrics(mergedItems),
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
      !['all', 'draft', 'pending_review', 'rejected', 'published', 'finished'].includes(
        statusFilter,
      ) ||
      statusFilter === this.data.statusFilter
    )
      return Promise.resolve();
    this.setData({ statusFilter });
    return this.onShow();
  },
  reviewActivity(event: any) {
    const id = String(event.currentTarget.dataset.id || '');
    const decision = event.currentTarget.dataset.decision === 'reject' ? 'reject' : 'approve';
    const item = this.data.items.find((candidate: { id: string }) => candidate.id === id);
    if (!item?.canReview || !Number.isInteger(item.reviewVersion)) return Promise.resolve();
    const inFlight = this._reviewInFlight.get(id);
    if (inFlight) return inFlight;

    const intentKey = `${id}:${item.reviewVersion}:${decision}`;
    const intent = this._reviewIntents.get(intentKey) || { requestId: newReviewRequestId() };
    this._reviewIntents.set(intentKey, intent);
    const request = (async () => {
      if (decision === 'reject' && !intent.reason) {
        intent.reason = await promptOperationReason('驳回活动', '请填写明确的驳回原因');
        if (!intent.reason) {
          this._reviewIntents.delete(intentKey);
          return;
        }
      }
      this.setData({ error: '' });
      try {
        await rideService.reviewActivity(
          id,
          decision,
          item.reviewVersion,
          intent.requestId,
          intent.reason || '',
        );
        // 成功与确定冲突都结束当前意图；只有响应丢失等可重试失败保留 requestId。
        this._reviewIntents.delete(intentKey);
        wx.showToast({ title: decision === 'approve' ? '已通过' : '已驳回', icon: 'success' });
        await this.onShow();
      } catch (error) {
        if (REVIEW_CONFLICT_CODES.has(errorCode(error))) this._reviewIntents.delete(intentKey);
        this.setData({ error: error instanceof Error ? error.message : '审批失败，请刷新后重试' });
      }
    })();
    this._reviewInFlight.set(id, request);
    void request.finally(() => {
      if (this._reviewInFlight.get(id) === request) this._reviewInFlight.delete(id);
    });
    return request;
  },
  edit(event: any) {
    const id = String(event.currentTarget.dataset.id || '');
    const item = this.data.items.find((candidate: { id: string }) => candidate.id === id);
    // 卡片处于展开状态时，点击正文先收起删除按钮，不进入编辑页，避免误触。
    if (item?.swipeOpen) {
      this.closeOtherSwipes('');
      return;
    }
    // 待审核/已结束活动不可编辑；卡片正文点击与“编辑”按钮遵守同一 canEdit 口径。
    if (item && !item.canEdit) return;
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
  },
  onRowTouchMove(event: any) {
    const touchState = this._touch;
    if (!touchState.id) return;
    const touch = event.changedTouches[0] || {};
    const dx = (touch.clientX || 0) - touchState.startX;
    const dy = (touch.clientY || 0) - touchState.startY;
    let becameHorizontal = false;
    // 首次超过阈值的移动决定方向：普通点击不触发 setData，避免重绘中断后续 tap。
    if (!touchState.locked) {
      if (Math.abs(dx) < SWIPE_LOCK_PX && Math.abs(dy) < SWIPE_LOCK_PX) return;
      touchState.locked = true;
      touchState.horizontal = Math.abs(dx) > Math.abs(dy);
      becameHorizontal = touchState.horizontal;
    }
    if (!touchState.horizontal) return;
    const index = this.data.items.findIndex((item: { id: string }) => item.id === touchState.id);
    if (index < 0) return;
    if (becameHorizontal) this.closeOtherSwipes(touchState.id);
    this.setData({
      ...(becameHorizontal ? { [`items[${index}].swipeAnim`]: false } : {}),
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
    // 客户端兜底：仅草稿可删，避免删除待审核/已驳回/已结束/已上线活动绕过审批。
    // 服务端 deleteActivity 会再次以状态为准强校验。
    if (item.status !== 'draft') {
      const index = this.data.items.findIndex((candidate: { id: string }) => candidate.id === id);
      if (index >= 0) {
        this.setData({
          [`items[${index}].swipeAnim`]: true,
          [`items[${index}].swipeOffset`]: 0,
          [`items[${index}].swipeOpen`]: false,
        });
      }
      wx.showToast({ title: '仅草稿活动可删除', icon: 'none' });
      return;
    }
    const reason = await promptOperationReason('删除活动', `请输入删除“${item.title}”的原因`);
    if (!reason) return;
    const index = this.data.items.findIndex((candidate: { id: string }) => candidate.id === id);
    try {
      await rideService.deleteActivity(id, reason);
      // 删除成功后从列表移除该卡片；过滤方式不受分页数据影响。
      const remainingItems = this.data.items.filter(
        (candidate: { id: string }) => candidate.id !== id,
      );
      this.setData({
        items: remainingItems,
        metrics: summariseMetrics(remainingItems),
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
    let operationReason: string | undefined;
    if (nextStatus === 'draft') {
      operationReason = await promptOperationReason('下架活动', `请输入下架“${item.title}”的原因`);
      if (!operationReason) return;
    } else {
      const confirmed = await new Promise<boolean>((resolve) => {
        wx.showModal({
          title: `${action}活动`,
          content: `确认${action}“${item.title}”吗？`,
          success: (result: { confirm: boolean }) => resolve(result.confirm),
          fail: () => resolve(false),
        });
      });
      if (!confirmed) return;
    }
    try {
      if (operationReason) {
        await rideService.saveActivity(
          { ...item, status: nextStatus },
          item.id,
          item.version,
          undefined,
          operationReason,
        );
      } else {
        await rideService.saveActivity({ ...item, status: nextStatus }, item.id, item.version);
      }
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
      cloneError: '',
      error: '',
    });
  },
  cloneField(event: any) {
    const name = String(event.currentTarget.dataset.name || '');
    if (!['deadline', 'startAt', 'endAt'].includes(name)) return;
    this.setData({ [`cloneForm.${name}`]: event.detail.value });
  },
  keepClonePanel() {},
  cancelClone() {
    if (this.data.cloning) return;
    this.setData({
      cloneSourceId: '',
      cloneRequestId: '',
      cloneForm: emptyCloneForm(),
      cloneError: '',
      error: '',
    });
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
      // 错误渲染在弹层内部（cloneError），页面级 error 在弹层外不可见。
      this.setData({ cloneError: '请填写有效的新时间，并确保截止、开始、结束依次为未来时间' });
      return;
    }
    this.setData({ cloning: true, cloneError: '' });
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
      this.setData({ cloneError: error instanceof Error ? error.message : '创建模板草稿失败' });
    } finally {
      this.setData({ cloning: false });
    }
  },
});
