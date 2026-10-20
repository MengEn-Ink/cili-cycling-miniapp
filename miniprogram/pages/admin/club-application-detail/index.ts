import type { ClubMediaKind } from '../../../utils/club-media';
import type { SoleClubProfile, SoleClubProfileInput } from '../../../models';
import { rideService } from '../../../services/ride-service';
import { appStore } from '../../../store/app-store';
import { chooseAndUploadClubMedia } from '../../../utils/club-media';

const INTRO_MIN = 20;
const INTRO_MAX = 500;

const EMPTY_FORM: SoleClubProfileInput = {
  name: '',
  city: '',
  introduction: '',
  avatarFileId: '',
  coverFileId: '',
};

type PageState = 'loading' | 'error' | 'bootstrap' | 'edit';

const requestId = (prefix: string) =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

function toForm(club: SoleClubProfile): SoleClubProfileInput {
  return {
    name: club.name,
    city: club.city,
    introduction: club.introduction,
    avatarFileId: club.avatarFileId,
    coverFileId: club.coverFileId,
  };
}

function validate(form: SoleClubProfileInput) {
  const checks: [keyof SoleClubProfileInput, boolean, string][] = [
    ['avatarFileId', !!form.avatarFileId, '请上传俱乐部头像'],
    [
      'name',
      form.name.trim().length >= 2 && form.name.trim().length <= 30,
      '俱乐部名称需为 2-30 个字符',
    ],
    ['city', form.city.trim().length >= 2 && form.city.trim().length <= 20, '请填写所在地区'],
    [
      'introduction',
      form.introduction.trim().length >= INTRO_MIN && form.introduction.trim().length <= INTRO_MAX,
      `俱乐部简介需为 ${INTRO_MIN}-${INTRO_MAX} 个字符`,
    ],
  ];
  const failed = checks.find((item) => !item[1]);
  return failed ? { field: failed[0], message: failed[2] } : null;
}

function errorCode(error: unknown): string {
  return String((error as { code?: string })?.code || '');
}

Page({
  saveRequestId: '',
  data: {
    pageState: 'loading' as PageState,
    form: { ...EMPTY_FORM },
    club: null as SoleClubProfile | null,
    avatarPreviewUrl: '',
    coverPreviewUrl: '',
    avatarFailed: false,
    coverFailed: false,
    introMin: INTRO_MIN,
    introMax: INTRO_MAX,
    introCount: 0,
    uploading: false,
    uploadKind: '' as '' | ClubMediaKind,
    uploadProgress: 0,
    saving: false,
    loadError: '',
    actionError: '',
    fieldError: '',
    fieldErrorKey: '',
  },
  async onLoad(_query: Record<string, string>) {
    // 入口携带 mode=bootstrap|edit 语义参数；实际态以服务端是否已有唯一俱乐部为准，
    // 避免并发下两个管理员同时进入空库创建。
    await this.load();
  },
  async load() {
    this.setData({ pageState: 'loading', loadError: '' });
    await appStore.ensureIdentity(wx.cloud);
    if (appStore.authStatus !== 'authenticated' || appStore.role !== 'admin') {
      this.setData({ pageState: 'error', loadError: '仅平台管理员可维护俱乐部资料' });
      return;
    }
    try {
      const snapshot = await rideService.getSoleClub();
      if (snapshot.exists) {
        const club = snapshot.club;
        this.setData({
          pageState: 'edit',
          club,
          form: toForm(club),
          avatarPreviewUrl: club.avatarUrl || '',
          coverPreviewUrl: club.coverUrl || '',
          avatarFailed: false,
          coverFailed: false,
          introCount: club.introduction.length,
          loadError: '',
          actionError: '',
          fieldError: '',
          fieldErrorKey: '',
        });
      } else {
        this.setData({
          pageState: 'bootstrap',
          club: null,
          form: { ...EMPTY_FORM },
          avatarPreviewUrl: '',
          coverPreviewUrl: '',
          avatarFailed: false,
          coverFailed: false,
          introCount: 0,
          loadError: '',
          actionError: '',
          fieldError: '',
          fieldErrorKey: '',
        });
      }
    } catch (error) {
      this.setData({
        pageState: 'error',
        loadError: error instanceof Error ? error.message : '俱乐部资料加载失败',
      });
    }
  },
  input(e: any) {
    const field = e.currentTarget.dataset.field as keyof SoleClubProfileInput;
    const value = String(e.detail.value ?? '');
    this.setData({
      [`form.${field}`]: value,
      ...(field === 'introduction' ? { introCount: value.length } : {}),
      fieldError: '',
      fieldErrorKey: '',
      actionError: '',
    });
  },
  chooseAvatar() {
    return this.chooseMedia('avatar');
  },
  chooseCover() {
    return this.chooseMedia('cover');
  },
  async chooseMedia(kind: ClubMediaKind) {
    if (this.data.uploading || this.data.saving || !appStore.openid || !wx.cloud) return;
    this.setData({
      uploading: true,
      uploadKind: kind,
      uploadProgress: 0,
      actionError: '',
    });
    try {
      const uploaded = await chooseAndUploadClubMedia(kind, this, (progress) => {
        this.setData({ uploadProgress: progress });
      });
      if (!uploaded) return;
      this.saveRequestId = '';
      if (kind === 'avatar') {
        this.setData({
          'form.avatarFileId': uploaded.fileId,
          avatarPreviewUrl: uploaded.previewUrl,
          avatarFailed: false,
          fieldError: '',
          fieldErrorKey: '',
        });
      } else {
        this.setData({
          'form.coverFileId': uploaded.fileId,
          coverPreviewUrl: uploaded.previewUrl,
          coverFailed: false,
          fieldError: '',
          fieldErrorKey: '',
        });
      }
    } catch (error) {
      this.setData({
        actionError: error instanceof Error ? error.message : '图片处理失败，请重新选择',
      });
    } finally {
      this.setData({ uploading: false, uploadKind: '', uploadProgress: 0 });
    }
  },
  removeCover() {
    if (this.data.uploading || this.data.saving) return;
    this.saveRequestId = '';
    this.setData({
      'form.coverFileId': '',
      coverPreviewUrl: '',
      coverFailed: false,
    });
  },
  avatarError() {
    this.setData({ avatarFailed: true });
  },
  coverError() {
    this.setData({ coverFailed: true });
  },
  ensureValid() {
    const failure = validate(this.data.form);
    if (!failure) return true;
    this.setData({ fieldErrorKey: failure.field, fieldError: failure.message });
    wx.showToast({ title: failure.message, icon: 'none' });
    return false;
  },
  async save() {
    if (this.data.saving || this.data.uploading || !this.ensureValid()) return;
    const bootstrap = this.data.pageState === 'bootstrap';
    this.saveRequestId ||= requestId(bootstrap ? 'sole_create' : 'sole_update');
    this.setData({ saving: true, actionError: '' });
    try {
      if (bootstrap) {
        await rideService.createSoleClub(this.data.form, this.saveRequestId);
      } else {
        await rideService.updateSoleClub(
          this.data.form,
          this.saveRequestId,
          this.data.club?.updatedAt || '',
        );
      }
      this.saveRequestId = '';
      this.setData({ saving: false });
      wx.showToast({ title: bootstrap ? '俱乐部已创建' : '俱乐部资料已保存', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 400);
    } catch (error) {
      const code = errorCode(error);
      const message = error instanceof Error ? error.message : '保存失败，请重试';
      this.setData({ saving: false });
      // 并发首次创建或资料被其他管理员更新：服务端为准刷新页面，同时保留中文提示。
      if (code === 'CLUB_ALREADY_EXISTS' || code === 'CLUB_PROFILE_CONFLICT') {
        await this.load();
        this.setData({
          actionError:
            code === 'CLUB_ALREADY_EXISTS'
              ? '俱乐部已创建，已为你切换到资料编辑。'
              : '俱乐部资料刚被其他管理员更新，已为你刷新。',
        });
        return;
      }
      this.setData({ actionError: message });
    }
  },
});
