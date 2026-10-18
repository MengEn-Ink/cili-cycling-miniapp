import type {
  ClubApplication,
  ClubApplicationInput,
  ClubDetail,
  ClubJoinMode,
  ClubMembershipSummary,
  JoinableClub,
  JoinedClubSummary,
  ManagedClubProfile,
  ManagedClubProfileInput,
} from '../../../models';
import { rideService } from '../../../services/ride-service';
import { appStore } from '../../../store/app-store';

const EMPTY_FORM: ClubApplicationInput = {
  clubName: '',
  city: '',
  introduction: '',
  applicantContact: '',
  joinMode: 'public_apply',
  expectedSize: 10,
  activityTypes: '',
  rulesSummary: '',
  avatarFileId: '',
  coverFileId: '',
};
const EMPTY_MANAGED_FORM: ManagedClubProfileInput = {
  name: '',
  city: '',
  introduction: '',
  joinMode: 'public_apply',
  avatarFileId: '',
  coverFileId: '',
  maxMembers: 50,
};
const JOIN_MODES: { value: ClubJoinMode; label: string }[] = [
  { value: 'public_apply', label: '公开加入' },
  { value: 'invite_code', label: '邀请码加入' },
  { value: 'admin_invite', label: '管理员邀请' },
];
const requestId = (prefix: string) =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
function validate(form: ClubApplicationInput) {
  const checks: [keyof ClubApplicationInput, boolean, string][] = [
    ['avatarFileId', !!form.avatarFileId, '请上传俱乐部头像'],
    [
      'clubName',
      form.clubName.trim().length >= 2 && form.clubName.trim().length <= 30,
      '俱乐部名称需为 2-30 个字符',
    ],
    ['city', form.city.trim().length >= 2 && form.city.trim().length <= 20, '请填写所在城市'],
    ['introduction', form.introduction.trim().length >= 20, '俱乐部简介至少 20 个字符'],
    [
      'applicantContact',
      form.applicantContact.trim().length >= 5,
      '请填写可联系到你的微信号或手机号',
    ],
    [
      'expectedSize',
      Number.isInteger(Number(form.expectedSize)) &&
        Number(form.expectedSize) >= 2 &&
        Number(form.expectedSize) <= 10000,
      '预计成员规模需为 2-10000 人',
    ],
    ['activityTypes', form.activityTypes.trim().length >= 2, '请填写主要活动类型'],
    ['rulesSummary', form.rulesSummary.trim().length >= 10, '俱乐部规则至少 10 个字符'],
  ];
  const failed = checks.find((item) => !item[1]);
  return failed ? { field: failed[0], message: failed[2] } : null;
}
function validateManagedClub(form: ManagedClubProfileInput, memberCount = 0) {
  const checks: [keyof ManagedClubProfileInput, boolean, string][] = [
    ['avatarFileId', !!form.avatarFileId, '请上传俱乐部头像'],
    [
      'name',
      form.name.trim().length >= 2 && form.name.trim().length <= 30,
      '俱乐部名称需为 2-30 个字符',
    ],
    ['city', form.city.trim().length >= 2 && form.city.trim().length <= 20, '请填写所在城市'],
    ['introduction', form.introduction.trim().length >= 20, '俱乐部简介至少 20 个字符'],
    [
      'maxMembers',
      Number.isInteger(Number(form.maxMembers)) &&
        Number(form.maxMembers) >= 2 &&
        Number(form.maxMembers) <= 10000 &&
        Number(form.maxMembers) >= memberCount,
      Number(form.maxMembers) < memberCount
        ? `人数上限不能低于当前 ${memberCount} 名成员`
        : '人数上限需为 2-10000 人',
    ],
  ];
  const failed = checks.find((item) => !item[1]);
  return failed ? { field: failed[0], message: failed[2] } : null;
}
function toForm(value: ClubApplication): ClubApplicationInput {
  return {
    clubName: value.clubName,
    city: value.city,
    introduction: value.introduction,
    applicantContact: value.applicantContact,
    joinMode: value.joinMode,
    expectedSize: value.expectedSize,
    activityTypes: value.activityTypes,
    rulesSummary: value.rulesSummary,
    avatarFileId: value.avatarFileId,
    coverFileId: value.coverFileId,
  };
}
function toManagedForm(value: ManagedClubProfile): ManagedClubProfileInput {
  return {
    name: value.name,
    city: value.city,
    introduction: value.introduction,
    joinMode: value.joinMode,
    avatarFileId: value.avatarFileId,
    coverFileId: value.coverFileId,
    maxMembers: value.maxMembers,
  };
}

type ClubMediaKind = 'avatar' | 'cover';
const MEDIA_SPEC = {
  avatar: { cropScale: '1:1', width: 512, height: 512 },
  cover: { cropScale: '16:9', width: 1280, height: 720 },
} as const;
function mediaCancelled(error: unknown) {
  return /cancel/i.test(String((error as { errMsg?: string })?.errMsg || ''));
}
function fixedSizeUnsupported(error: unknown) {
  return /not support|unsupported|compressedWidth|compressedHeight|invalid.*(width|height)/i.test(
    String((error as { errMsg?: string })?.errMsg || ''),
  );
}
type ClubMediaCanvasScope = NonNullable<Parameters<typeof wx.createCanvasContext>[1]>;
const CLUB_MEDIA_CANVAS_ID = 'clubMediaCanvas';
function mediaError(message: string, cause: unknown) {
  return Object.assign(new Error(message), { cause });
}
async function hasExactClubMediaSize(src: string, spec: (typeof MEDIA_SPEC)[ClubMediaKind]) {
  if (typeof wx.getImageInfo !== 'function') return false;
  try {
    const info = await new Promise<{ width?: number; height?: number }>((resolve, reject) =>
      wx.getImageInfo({ src, success: resolve, fail: reject }),
    );
    return info.width === spec.width && info.height === spec.height;
  } catch {
    return false;
  }
}
async function exportFixedClubMedia(
  src: string,
  spec: (typeof MEDIA_SPEC)[ClubMediaKind],
  scope: ClubMediaCanvasScope,
) {
  try {
    if (
      typeof wx.createCanvasContext !== 'function' ||
      typeof wx.canvasToTempFilePath !== 'function'
    )
      throw new Error('canvas unavailable');
    const context = wx.createCanvasContext(CLUB_MEDIA_CANVAS_ID, scope);
    context.clearRect(0, 0, spec.width, spec.height);
    context.drawImage(src, 0, 0, spec.width, spec.height);
    await new Promise<void>((resolve) => context.draw(false, resolve));
    const exported = await new Promise<{ tempFilePath?: string }>((resolve, reject) =>
      wx.canvasToTempFilePath(
        {
          canvasId: CLUB_MEDIA_CANVAS_ID,
          x: 0,
          y: 0,
          width: spec.width,
          height: spec.height,
          destWidth: spec.width,
          destHeight: spec.height,
          fileType: 'jpg',
          quality: 0.9,
          success: resolve,
          fail: reject,
        },
        scope,
      ),
    );
    if (!exported.tempFilePath) throw new Error('empty canvas result');
    return exported.tempFilePath;
  } catch (error) {
    throw mediaError('图片处理失败，请重新选择', error);
  }
}
async function chooseAndUploadClubMedia(
  kind: ClubMediaKind,
  openid: string,
  scope: ClubMediaCanvasScope,
) {
  const selected = await wx.chooseMedia({
    count: 1,
    mediaType: ['image'],
    sourceType: ['album', 'camera'],
  });
  const file = selected.tempFiles[0];
  if (!file?.tempFilePath) return null;
  if (typeof file.size === 'number' && file.size > 5 * 1024 * 1024)
    throw new Error('图片不能超过 5MB');
  const spec = MEDIA_SPEC[kind];
  let croppedPath: string;
  try {
    const cropped = await new Promise<{ tempFilePath?: string }>((resolve, reject) =>
      wx.cropImage({
        src: file.tempFilePath,
        cropScale: spec.cropScale,
        success: resolve,
        fail: reject,
      }),
    );
    if (!cropped.tempFilePath) throw new Error('empty crop result');
    croppedPath = cropped.tempFilePath;
  } catch (error) {
    if (mediaCancelled(error)) return null;
    throw mediaError('图片裁剪失败，请重新选择', error);
  }
  let uploadPath = croppedPath;
  let needsCanvasFallback = typeof wx.compressImage !== 'function';
  if (typeof wx.compressImage === 'function') {
    try {
      const compressed = await new Promise<{ tempFilePath?: string }>((resolve, reject) =>
        wx.compressImage({
          src: croppedPath,
          quality: 90,
          compressedWidth: spec.width,
          compressedHeight: spec.height,
          success: resolve,
          fail: reject,
        }),
      );
      if (!compressed.tempFilePath) throw new Error('empty compress result');
      if (await hasExactClubMediaSize(compressed.tempFilePath, spec)) {
        uploadPath = compressed.tempFilePath;
      } else {
        // 部分基础库会返回 success 但忽略目标尺寸；未验证尺寸时必须固定像素重导出。
        needsCanvasFallback = true;
      }
    } catch (error) {
      if (!fixedSizeUnsupported(error)) throw mediaError('图片压缩失败，请重新选择', error);
      // 旧基础库不识别固定尺寸参数时，必须经 legacy canvas 导出固定像素，不能上传原裁剪图。
      needsCanvasFallback = true;
    }
  }
  if (needsCanvasFallback) uploadPath = await exportFixedClubMedia(croppedPath, spec, scope);
  const uploaded = await wx.cloud!.uploadFile({
    cloudPath: `club-applications/${openid}/${requestId(kind)}.jpg`,
    filePath: uploadPath,
  });
  return { fileId: uploaded.fileID, previewUrl: uploadPath };
}

Page({
  submitRequestId: '',
  manageRequestId: '',
  joinRequestIds: {} as Record<string, string>,
  loadRevision: 0,
  unloaded: false,
  isCurrent(revision: number) {
    return !this.unloaded && this.loadRevision === revision;
  },
  data: {
    application: null as ClubApplication | null,
    joinableClubs: [] as JoinableClub[],
    joinedClub: null as JoinedClubSummary | null,
    joinedClubs: [] as ClubMembershipSummary[],
    selectedClub: null as ClubDetail | null,
    selectedClubId: '',
    detailMode: false,
    detailLoading: false,
    detailError: '',
    joinedClubName: '',
    discoverMode: false,
    createMode: false,
    joiningClubId: '',
    joinError: '',
    managedClub: null as ManagedClubProfile | null,
    managedClubs: [] as ManagedClubProfile[],
    managedClubId: '',
    canManageClub: false,
    manageLoadError: '',
    manageMode: false,
    managedForm: { ...EMPTY_MANAGED_FORM },
    managedJoinModeIndex: 0,
    managedAvatarPreviewUrl: '',
    managedCoverPreviewUrl: '',
    managedAvatarInitial: '俱',
    form: { ...EMPTY_FORM },
    avatarPreviewUrl: '',
    coverPreviewUrl: '',
    joinModes: JOIN_MODES,
    joinModeIndex: 0,
    loading: true,
    saving: false,
    submitting: false,
    managing: false,
    uploading: false,
    loadError: '',
    actionError: '',
    fieldError: '',
    fieldErrorKey: '',
  },
  onShow() {
    this.unloaded = false;
    void this.load();
  },
  onUnload() {
    this.unloaded = true;
    this.loadRevision += 1;
  },
  async load() {
    const revision = ++this.loadRevision;
    this.setData({ loading: true, loadError: '' });
    try {
      await appStore.ensureIdentity(wx.cloud);
      if (!this.isCurrent(revision)) return;
      if (appStore.authStatus !== 'authenticated') {
        this.setData({ loading: false, loadError: '请先完成微信登录后再进入俱乐部中心' });
        return;
      }
      const [profile, application, joinableClubs] = await Promise.all([
        rideService.getProfile(),
        rideService.getMyClubApplication(),
        rideService.listJoinableClubs(),
      ]);
      if (!this.isCurrent(revision)) return;
      const manageableMemberships = profile.clubs.filter((club) =>
        ['OWNER', 'ADMIN'].includes(String(club.role || '').toUpperCase()),
      );
      const managedResults = await Promise.allSettled(
        manageableMemberships.map((club) => rideService.getManagedClub(club.clubId)),
      );
      if (!this.isCurrent(revision)) return;
      const managedClubs = managedResults.flatMap((result) =>
        result.status === 'fulfilled' ? [result.value] : [],
      );
      const managedClub = managedClubs[0] || null;
      const manageLoadError = managedResults.some((result) => result.status === 'rejected')
        ? managedClub
          ? '部分俱乐部资料暂时无法读取，请重新加载后再试'
          : '俱乐部管理资料暂时无法读取，请重新加载后再试'
        : '';
      const form = application ? toForm(application) : { ...EMPTY_FORM };
      const managedForm = managedClub ? toManagedForm(managedClub) : { ...EMPTY_MANAGED_FORM };
      const hasClub = profile.clubs.length > 0;
      const discoverMode = !hasClub && !application && !this.data.joinedClub;
      this.setData({
        application,
        joinableClubs,
        joinedClubs: profile.clubs,
        discoverMode,
        joinedClubName: this.data.joinedClub?.club.name || profile.clubs[0]?.name || '',
        createMode: application ? ['draft', 'rejected'].includes(application.status) : false,
        managedClub,
        managedClubs,
        managedClubId: managedClub?.id || '',
        canManageClub: manageableMemberships.length > 0,
        manageLoadError,
        manageMode: false,
        managedForm,
        managedAvatarPreviewUrl: managedClub?.avatarUrl || '',
        managedCoverPreviewUrl: managedClub?.coverUrl || '',
        managedAvatarInitial: Array.from(managedClub?.name || '俱')[0] || '俱',
        managedJoinModeIndex: Math.max(
          0,
          JOIN_MODES.findIndex((item) => item.value === managedForm.joinMode),
        ),
        form,
        avatarPreviewUrl: application?.avatarUrl || '',
        coverPreviewUrl: application?.coverUrl || '',
        joinModeIndex: Math.max(
          0,
          JOIN_MODES.findIndex((item) => item.value === form.joinMode),
        ),
        loading: false,
      });
    } catch (error) {
      if (!this.isCurrent(revision)) return;
      this.setData({
        loading: false,
        loadError: error instanceof Error ? error.message : '俱乐部信息读取失败',
      });
    }
  },
  showCreateForm() {
    this.setData({ createMode: true, detailMode: false, discoverMode: false, joinError: '' });
  },
  async openClubDetail(e: any) {
    const clubId = String(e.currentTarget.dataset.id || '');
    if (!clubId || this.data.detailLoading) return;
    this.setData({
      detailMode: true,
      createMode: false,
      selectedClubId: clubId,
      detailLoading: true,
      detailError: '',
    });
    try {
      const selectedClub = await rideService.getClubDetail(clubId);
      this.setData({ selectedClub, detailLoading: false });
    } catch (error) {
      this.setData({
        detailLoading: false,
        detailError: error instanceof Error ? error.message : '俱乐部详情读取失败',
      });
    }
  },
  closeClubDetail() {
    if (this.data.detailLoading) return;
    this.setData({ detailMode: false, selectedClub: null, detailError: '' });
  },
  manageSelectedClub() {
    const selected = this.data.selectedClub;
    if (!selected?.canManage) return;
    const index = this.data.managedClubs.findIndex(
      (club: ManagedClubProfile) => club.id === selected.id,
    );
    if (index >= 0) this.selectManagedClub({ detail: { value: index } });
    this.setData({ detailMode: false });
    this.showManageForm();
  },
  browseRecommendations() {
    this.setData({ detailMode: false, createMode: false, discoverMode: true });
  },
  supplementAvatar(e: any) {
    const clubId = String(e.currentTarget.dataset.id || '');
    const index = this.data.managedClubs.findIndex(
      (club: ManagedClubProfile) => club.id === clubId,
    );
    if (index < 0) return;
    this.selectManagedClub({ detail: { value: index } });
    this.showManageForm();
  },
  selectManagedClub(e: any) {
    const managedClub = this.data.managedClubs[Number(e.detail.value)];
    if (!managedClub || this.data.managing || this.data.manageMode) return;
    this.manageRequestId = '';
    const managedForm = toManagedForm(managedClub);
    this.setData({
      managedClub,
      managedClubId: managedClub.id,
      managedForm,
      managedAvatarPreviewUrl: managedClub.avatarUrl,
      managedCoverPreviewUrl: managedClub.coverUrl,
      managedAvatarInitial: Array.from(managedClub.name)[0] || '俱',
      managedJoinModeIndex: Math.max(
        0,
        JOIN_MODES.findIndex((item) => item.value === managedForm.joinMode),
      ),
      actionError: '',
      fieldError: '',
      fieldErrorKey: '',
    });
  },
  showManageForm() {
    if (!this.data.managedClub) return;
    this.manageRequestId = '';
    this.setData({
      manageMode: true,
      managedForm: toManagedForm(this.data.managedClub),
      managedAvatarPreviewUrl: this.data.managedClub.avatarUrl,
      managedCoverPreviewUrl: this.data.managedClub.coverUrl,
      managedJoinModeIndex: Math.max(
        0,
        JOIN_MODES.findIndex((item) => item.value === this.data.managedClub?.joinMode),
      ),
      actionError: '',
      fieldError: '',
      fieldErrorKey: '',
    });
  },
  cancelManage() {
    if (this.data.managing || this.data.uploading || !this.data.managedClub) return;
    this.manageRequestId = '';
    this.setData({
      manageMode: false,
      managedForm: toManagedForm(this.data.managedClub),
      managedAvatarPreviewUrl: this.data.managedClub.avatarUrl,
      managedCoverPreviewUrl: this.data.managedClub.coverUrl,
      actionError: '',
      fieldError: '',
      fieldErrorKey: '',
    });
  },
  async joinClub(e: any) {
    if (this.data.joiningClubId) return;
    const clubId = String(e.currentTarget.dataset.id || '');
    if (!clubId) return;
    const joinRequestId =
      this.joinRequestIds[clubId] || (this.joinRequestIds[clubId] = requestId('club_join'));
    this.setData({ joiningClubId: clubId, joinError: '' });
    try {
      const joinedClub = await rideService.joinPublicClub(clubId, joinRequestId);
      delete this.joinRequestIds[clubId];
      this.setData({ joinedClub, joinedClubName: joinedClub.club.name, joiningClubId: '' });
      await this.load();
    } catch (error) {
      this.setData({
        joiningClubId: '',
        joinError: error instanceof Error ? error.message : '加入失败，请重试',
      });
    }
  },
  input(e: any) {
    const field = e.currentTarget.dataset.field as keyof ClubApplicationInput;
    const value = field === 'expectedSize' ? Number(e.detail.value) : e.detail.value;
    this.setData({ [`form.${field}`]: value, fieldError: '', fieldErrorKey: '' });
  },
  managedInput(e: any) {
    const field = e.currentTarget.dataset.field as keyof ManagedClubProfileInput;
    const value = field === 'maxMembers' ? Number(e.detail.value) : e.detail.value;
    this.manageRequestId = '';
    this.setData({ [`managedForm.${field}`]: value, fieldError: '', fieldErrorKey: '' });
  },
  expandCapacity(e: any) {
    const increment = Number(e.currentTarget.dataset.value);
    if (![50, 100, 500].includes(increment)) return;
    this.manageRequestId = '';
    this.setData({
      'managedForm.maxMembers': Math.min(
        10000,
        Number(this.data.managedForm.maxMembers) + increment,
      ),
      fieldError: '',
      fieldErrorKey: '',
    });
  },
  joinModeChange(e: any) {
    const index = Number(e.detail.value);
    const selected = JOIN_MODES[index] || JOIN_MODES[0];
    this.setData({ joinModeIndex: index, 'form.joinMode': selected.value });
  },
  managedJoinModeChange(e: any) {
    const index = Number(e.detail.value);
    const selected = JOIN_MODES[index] || JOIN_MODES[0];
    this.manageRequestId = '';
    this.setData({ managedJoinModeIndex: index, 'managedForm.joinMode': selected.value });
  },
  chooseAvatar() {
    return this.chooseClubMedia('avatar');
  },
  chooseCover() {
    return this.chooseClubMedia('cover');
  },
  async chooseClubMedia(kind: ClubMediaKind) {
    if (this.data.uploading || !appStore.openid || !wx.cloud) return;
    this.setData({ uploading: true, actionError: '' });
    try {
      const uploaded = await chooseAndUploadClubMedia(kind, appStore.openid, this);
      if (!uploaded) return;
      if (this.data.manageMode) this.manageRequestId = '';
      if (kind === 'avatar') {
        this.setData(
          this.data.manageMode
            ? {
                'managedForm.avatarFileId': uploaded.fileId,
                managedAvatarPreviewUrl: uploaded.previewUrl,
                fieldError: '',
                fieldErrorKey: '',
              }
            : {
                'form.avatarFileId': uploaded.fileId,
                avatarPreviewUrl: uploaded.previewUrl,
                fieldError: '',
                fieldErrorKey: '',
              },
        );
      } else {
        this.setData(
          this.data.manageMode
            ? {
                'managedForm.coverFileId': uploaded.fileId,
                managedCoverPreviewUrl: uploaded.previewUrl,
                fieldError: '',
                fieldErrorKey: '',
              }
            : {
                'form.coverFileId': uploaded.fileId,
                coverPreviewUrl: uploaded.previewUrl,
                fieldError: '',
                fieldErrorKey: '',
              },
        );
      }
    } catch (error) {
      if (!mediaCancelled(error))
        this.setData({
          actionError: error instanceof Error ? error.message : '图片处理失败，请重新选择',
        });
    } finally {
      this.setData({ uploading: false });
    }
  },
  ensureValid() {
    const failure = validate(this.data.form);
    if (!failure) return true;
    this.setData({ fieldErrorKey: failure.field, fieldError: failure.message });
    wx.showToast({ title: failure.message, icon: 'none' });
    return false;
  },
  ensureManagedValid() {
    const failure = validateManagedClub(
      this.data.managedForm,
      this.data.managedClub?.memberCount || 0,
    );
    if (!failure) return true;
    this.setData({ fieldErrorKey: failure.field, fieldError: failure.message });
    wx.showToast({ title: failure.message, icon: 'none' });
    return false;
  },
  async saveManagedClub() {
    if (
      this.data.managing ||
      this.data.uploading ||
      !this.data.managedClubId ||
      !this.ensureManagedValid()
    )
      return;
    const confirmed = await new Promise<boolean>((resolve) =>
      wx.showModal({
        title: '保存俱乐部资料',
        content: '保存后，成员将在个人资料和后续活动中看到更新后的俱乐部信息。',
        confirmText: '确认保存',
        success: (result: { confirm: boolean }) => resolve(result.confirm),
        fail: () => resolve(false),
      }),
    );
    if (!confirmed) return;
    this.manageRequestId ||= requestId('club_update');
    this.setData({ managing: true, actionError: '' });
    try {
      const managedClub = await rideService.updateManagedClub(
        this.data.managedClubId,
        this.data.managedForm,
        this.manageRequestId,
        this.data.managedClub?.updatedAt || '',
      );
      this.manageRequestId = '';
      this.setData({
        managedClub,
        managedClubs: this.data.managedClubs.map((item: ManagedClubProfile) =>
          item.id === managedClub.id ? managedClub : item,
        ),
        managedForm: toManagedForm(managedClub),
        managedAvatarPreviewUrl: managedClub.avatarUrl || this.data.managedAvatarPreviewUrl,
        managedCoverPreviewUrl: managedClub.coverUrl || this.data.managedCoverPreviewUrl,
        joinedClubName: managedClub.name,
        managedAvatarInitial: Array.from(managedClub.name)[0] || '俱',
        manageMode: false,
        managing: false,
      });
      wx.showToast({ title: '俱乐部资料已更新' });
    } catch (error) {
      this.setData({
        managing: false,
        actionError: error instanceof Error ? error.message : '保存失败，请重试',
      });
    }
  },
  async saveDraft() {
    if (this.data.saving || this.data.submitting || !this.ensureValid()) return;
    this.setData({ saving: true, actionError: '' });
    try {
      const application = await rideService.saveClubApplicationDraft(this.data.form);
      this.setData({
        application,
        avatarPreviewUrl: application.avatarUrl || this.data.avatarPreviewUrl,
        coverPreviewUrl: application.coverUrl || this.data.coverPreviewUrl,
        saving: false,
      });
      wx.showToast({ title: '草稿已保存' });
    } catch (error) {
      this.setData({
        saving: false,
        actionError: error instanceof Error ? error.message : '草稿保存失败，请重试',
      });
    }
  },
  async submit() {
    if (this.data.submitting || this.data.saving || !this.ensureValid()) return;
    const confirmed = await new Promise<boolean>((resolve) =>
      wx.showModal({
        title: '提交创建申请',
        content: '提交后资料将进入平台管理员审批，审批期间不可修改。确认提交吗？',
        confirmText: '确认提交',
        success: (result: { confirm: boolean }) => resolve(result.confirm),
        fail: () => resolve(false),
      }),
    );
    if (!confirmed) return;
    this.submitRequestId ||= requestId('club_submit');
    this.setData({ submitting: true, actionError: '' });
    try {
      const application = await rideService.submitClubApplication(
        this.data.form,
        this.submitRequestId,
      );
      this.submitRequestId = '';
      this.setData({
        application,
        form: toForm(application),
        avatarPreviewUrl: application.avatarUrl || this.data.avatarPreviewUrl,
        coverPreviewUrl: application.coverUrl || this.data.coverPreviewUrl,
        submitting: false,
      });
      wx.showToast({ title: '已提交审核' });
    } catch (error) {
      this.setData({
        submitting: false,
        actionError: error instanceof Error ? error.message : '提交失败，请重试',
      });
    }
  },
});
