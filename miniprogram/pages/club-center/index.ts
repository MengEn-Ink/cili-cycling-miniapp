import type {
  ClubApplication,
  ClubApplicationInput,
  ClubJoinMode,
  JoinableClub,
  JoinedClubSummary,
} from '../../models';
import { rideService } from '../../services/ride-service';
import { appStore } from '../../store/app-store';

const EMPTY_FORM: ClubApplicationInput = {
  clubName: '',
  city: '',
  introduction: '',
  applicantContact: '',
  joinMode: 'public_apply',
  expectedSize: 10,
  activityTypes: '',
  rulesSummary: '',
  coverFileId: '',
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
    ['coverFileId', !!form.coverFileId, '请上传俱乐部封面'],
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
    coverFileId: value.coverFileId,
  };
}

Page({
  submitRequestId: '',
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
    joinedClubName: '',
    discoverMode: false,
    createMode: false,
    joiningClubId: '',
    joinError: '',
    form: { ...EMPTY_FORM },
    coverPreviewUrl: '',
    joinModes: JOIN_MODES,
    joinModeIndex: 0,
    loading: true,
    saving: false,
    submitting: false,
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
        this.setData({ loading: false, loadError: '请先完成微信登录后再申请创建俱乐部' });
        return;
      }
      const [profile, application, joinableClubs] = await Promise.all([
        rideService.getProfile(),
        rideService.getMyClubApplication(),
        rideService.listJoinableClubs(),
      ]);
      if (!this.isCurrent(revision)) return;
      const form = application ? toForm(application) : { ...EMPTY_FORM };
      const hasClub = profile.clubs.length > 0;
      const discoverMode = !hasClub && !application && !this.data.joinedClub;
      this.setData({
        application,
        joinableClubs,
        discoverMode,
        joinedClubName: this.data.joinedClub?.club.name || profile.clubs[0]?.name || '',
        createMode: application ? ['draft', 'rejected'].includes(application.status) : false,
        form,
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
        loadError: error instanceof Error ? error.message : '申请读取失败',
      });
    }
  },
  showCreateForm() {
    this.setData({ createMode: true, discoverMode: false, joinError: '' });
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
  joinModeChange(e: any) {
    const index = Number(e.detail.value);
    const selected = JOIN_MODES[index] || JOIN_MODES[0];
    this.setData({ joinModeIndex: index, 'form.joinMode': selected.value });
  },
  async chooseCover() {
    if (this.data.uploading || !appStore.openid || !wx.cloud) return;
    try {
      const selected = await wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
      });
      const file = selected.tempFiles[0];
      if (!file?.tempFilePath) return;
      if (typeof file.size === 'number' && file.size > 5 * 1024 * 1024)
        throw new Error('封面图片不能超过 5MB');
      this.setData({ uploading: true, actionError: '' });
      const uploaded = await wx.cloud.uploadFile({
        cloudPath: `club-applications/${appStore.openid}/${requestId('cover')}.jpg`,
        filePath: file.tempFilePath,
      });
      this.setData({
        'form.coverFileId': uploaded.fileID,
        coverPreviewUrl: file.tempFilePath,
        uploading: false,
        fieldError: '',
        fieldErrorKey: '',
      });
    } catch (error) {
      this.setData({
        uploading: false,
        actionError: error instanceof Error ? error.message : '封面上传失败，请重试',
      });
    }
  },
  ensureValid() {
    const failure = validate(this.data.form);
    if (!failure) return true;
    this.setData({ fieldErrorKey: failure.field, fieldError: failure.message });
    wx.showToast({ title: failure.message, icon: 'none' });
    return false;
  },
  async saveDraft() {
    if (this.data.saving || this.data.submitting || !this.ensureValid()) return;
    this.setData({ saving: true, actionError: '' });
    try {
      const application = await rideService.saveClubApplicationDraft(this.data.form);
      this.setData({
        application,
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
