import type {
  Activity,
  EditableActivity,
  PersonalCapabilityCard,
  Profile,
  ProfileUpdate,
  Registration,
  RegistrationStatus,
  StravaReadiness,
  StravaStatus,
} from '../models';
import { activities, profile, registrations } from '../mock/fixtures';
import { transition } from '../utils/registration';
import type {
  ActivityInput,
  CloneActivityInput,
  RegistrationSubmission,
  RideRepository,
} from './types';
type S = {
  activities: (Activity | EditableActivity)[];
  registrations: Registration[];
  profile: Profile;
  stravaStatus: StravaStatus;
};
const KEY = 'ride-mock-v1';
const init = (): S => ({ activities, registrations, profile, stravaStatus: 'connected' });
const nextAvatarRevision = (value: unknown) =>
  (Number.isInteger(value) && Number(value) >= 0 ? Number(value) : 0) + 1;
function displayGatheringMode(
  value: RegistrationSubmission['gatheringMode'],
): Registration['gatheringMode'] {
  return ({ self_drive: '自驾', support_vehicle: '需要后援车' } as const)[value] || '';
}
export class MockRepository implements RideRepository {
  read(): S {
    return wx.getStorageSync(KEY) || init();
  }
  write(s: S) {
    wx.setStorageSync(KEY, s);
  }
  async listAdminActivities() {
    return this.read().activities;
  }
  async getAdminActivity(id: string) {
    return this.read().activities.find((x) => x.id === id);
  }
  async listActivities() {
    return this.read().activities.filter(
      (item): item is Activity =>
        item.status !== 'draft' &&
        typeof item.capacity === 'number' &&
        typeof item.startAt === 'string' &&
        typeof item.endAt === 'string' &&
        typeof item.deadline === 'string' &&
        typeof item.fee === 'string',
    );
  }
  async getActivity(id: string) {
    return (await this.listActivities()).find((x) => x.id === id);
  }
  async listRegistrations() {
    return this.read().registrations;
  }
  async getRegistration(id: string) {
    return this.read().registrations.find((x) => x.id === id);
  }
  async listReviewRegistrations(activityId: string, status?: RegistrationStatus) {
    return this.read().registrations.filter(
      (x) => x.activityId === activityId && (!status || x.status === status),
    );
  }
  async getReviewRegistration(id: string) {
    return this.getRegistration(id);
  }
  async saveRegistration(v: RegistrationSubmission) {
    const s = this.read(),
      old = s.registrations.find((x) => x.activityId === v.activityId);
    const submitted = {
      gatheringMode: displayGatheringMode(v.gatheringMode),
      experience: v.experience,
      remark: typeof v.remark === 'string' ? v.remark : '',
    };
    if (old) {
      old.status = transition(old.status, 'pending');
      Object.assign(old, submitted);
      old.updatedAt = '刚刚';
      this.write(s);
      return old;
    }
    const x: Registration = {
      id: 'r' + Date.now(),
      activityId: v.activityId,
      status: 'pending',
      profile: s.profile,
      ...submitted,
      strava: {
        status: s.stravaStatus,
        years: 4,
        rides90d: 32,
        longestKm: 168,
        elevationM: 1850,
        speedKmh: 27.4,
      },
      updatedAt: '刚刚',
    };
    s.registrations.unshift(x);
    this.write(s);
    return x;
  }
  async getReviewNotificationTemplateIds(): Promise<string[]> {
    return [];
  }
  async requestReviewNotificationSubscription(templateIds: string[]): Promise<void> {
    void templateIds;
  }
  async updateRegistration(id: string, status: RegistrationStatus, c?: string) {
    if (status === 'cancelled') return this.cancelRegistration(id);
    if (status === 'approved' || status === 'rejected')
      return this.reviewRegistration(id, status, c);
    return this.changeRegistration(id, status, c);
  }
  async cancelRegistration(id: string) {
    return this.changeRegistration(id, 'cancelled');
  }
  async reviewRegistration(id: string, decision: 'approved' | 'rejected', reason?: string) {
    return this.changeRegistration(id, decision, reason);
  }
  async enqueueActivityReminders(activityId: string) {
    const total = this.read().registrations.filter(
      (item) => item.activityId === activityId && item.status === 'approved',
    ).length;
    return { queued: total, duplicates: 0, total };
  }
  async checkInRegistration(id: string) {
    const s = this.read();
    const registration = s.registrations.find((item) => item.id === id);
    if (!registration) throw Error('报名不存在');
    if (registration.status === 'checked_in') return registration;
    registration.status = transition(registration.status, 'checked_in');
    registration.checkedInAt = '刚刚';
    registration.updatedAt = '刚刚';
    this.write(s);
    return registration;
  }
  private async changeRegistration(id: string, status: RegistrationStatus, c?: string) {
    const s = this.read(),
      x = s.registrations.find((v) => v.id === id);
    if (!x) throw Error('报名不存在');
    x.status = transition(x.status, status);
    x.reviewComment = c;
    x.updatedAt = '刚刚';
    if (status === 'approved') x.serialNo = 'RE-MOCK-' + Date.now().toString().slice(-6);
    this.write(s);
    return x;
  }
  async getProfile() {
    return this.read().profile;
  }
  async getProfileMediaUploadPath() {
    return 'profiles/00000000000000000000000000000000/00000000-0000-4000-8000-000000000000.jpg';
  }
  async getPersonalCapabilityCard(): Promise<PersonalCapabilityCard> {
    const currentProfile = this.read().profile;
    return {
      state: 'ready',
      generatedAt: '2026-09-29T04:10:00.000Z',
      profile: {
        displayName: currentProfile.nickname || '此里骑手',
        gender: currentProfile.gender || '',
        ...(currentProfile.avatarId
          ? { avatarUrl: 'https://temporary.example/mock-avatar.jpg' }
          : {}),
      },
      backgrounds: [
        {
          url: 'https://temporary.example/mock-rider.jpg',
          source: 'user_photo',
          category: 'ride',
        },
      ],
      summary: {
        totalKm90d: 1200,
        rides90d: 32,
        longestKm: 168,
        elevationM90d: 9000,
        weightedAvgSpeedKmh: 27.4,
      },
      coverage: {
        from: '2026-07-01T04:00:00.000Z',
        to: '2026-09-29T04:00:00.000Z',
        complete: true,
      },
      syncedAt: '2026-09-29T04:05:00.000Z',
    };
  }
  async registerProfileMedia() {}
  async reportProfileMediaOrphan() {}
  async setAvatar(source: 'wechat' | 'custom', fileId: string) {
    const state = this.read();
    state.profile = {
      ...state.profile,
      avatarId: fileId,
      avatarSource: source,
      avatarRevision: nextAvatarRevision(state.profile.avatarRevision),
    };
    this.write(state);
    return state.profile;
  }
  async importStravaAvatar() {
    const state = this.read();
    state.profile = {
      ...state.profile,
      avatarId: 'cloud://mock/profiles/current-user/strava-avatar.jpg',
      avatarSource: 'strava',
      avatarRevision: nextAvatarRevision(state.profile.avatarRevision),
    };
    this.write(state);
    return state.profile;
  }
  async updateProfile(patch: ProfileUpdate) {
    const current = this.read().profile;
    const p = { ...current, ...patch, photos: patch.photos || current.photos } as Profile;
    const s = this.read();
    s.profile = p;
    this.write(s);
    return p;
  }
  async getPhoneNumber() {
    return this.read().profile;
  }
  async getStravaStatus() {
    return { connected: this.read().stravaStatus === 'connected' };
  }
  async getStravaReadiness(): Promise<StravaReadiness> {
    if (this.read().stravaStatus !== 'connected') {
      return {
        state: 'disconnected',
        canRegister: false,
        avatarAvailable: false,
        athleteName: null,
        snapshot: null,
        error: null,
      };
    }
    return {
      state: 'ready',
      canRegister: true,
      avatarAvailable: true,
      athleteName: 'Mock Rider',
      snapshot: {
        totalKm: 1200,
        rides90d: 32,
        longestKm: 168,
        elevationM: 9000,
        speedKmh: 27.4,
        latestActivityAt: '2026-09-28T04:00:00.000Z',
        syncedAt: '2026-09-29T04:00:00.000Z',
        coverage: {
          from: '2026-07-01T04:00:00.000Z',
          to: '2026-09-29T04:00:00.000Z',
          complete: true,
        },
      },
      error: null,
    };
  }
  async ensureStravaReady() {
    const s = this.read();
    s.stravaStatus = 'connected';
    this.write(s);
    return this.getStravaReadiness();
  }
  async startStrava() {
    return { authorizationUrl: 'https://example.test/mock', expiresAt: new Date().toISOString() };
  }
  async cancelStravaAuthorization() {
    const s = this.read();
    s.stravaStatus = 'pending';
    this.write(s);
  }
  async syncStrava() {
    return this.getStravaReadiness();
  }
  async previewStravaRoute(routeUrl: string) {
    const match = /\/routes\/(\d+)/.exec(routeUrl);
    if (!match) throw new Error('请输入有效的 Strava 路线 URL');
    return {
      stravaRouteId: match[1],
      stravaRouteUrl: `https://www.strava.com/routes/${match[1]}`,
      distanceKm: 80,
      elevationM: 600,
      elevationProfile: [],
      routeBounds: { south: 22.5, west: 113.8, north: 22.8, east: 114.2 },
      popularClimbs: [],
    };
  }
  async getStravaRouteGpx(activityId: string, routeId: string) {
    return {
      base64: '',
      filename: `${activityId}-strava-route-${routeId}.gpx`,
      contentType: 'application/gpx+xml' as const,
    };
  }
  async exportActivityGpx(activityId: string) {
    return {
      base64: 'PD94bWwgdmVyc2lvbj0iMS4wIj8+PGdweC8+',
      fileName: `${activityId}-route.gpx`,
    };
  }
  async disconnectStrava() {
    const s = this.read();
    s.stravaStatus = 'pending';
    this.write(s);
  }
  async saveActivity(value: ActivityInput, id?: string, expectedVersion?: number) {
    const current = id ? this.read().activities.find((item) => item.id === id) : undefined;
    if (current && current.version !== expectedVersion) throw new Error('活动已被其他人更新');
    const a: EditableActivity = {
      ...value,
      id: id || `a${Date.now()}`,
      version: current ? current.version + 1 : 1,
      ...(value.startAt === undefined ? {} : { date: value.startAt }),
      occupiedCount: id ? current?.occupiedCount || 0 : 0,
    };
    const s = this.read(),
      i = s.activities.findIndex((x) => x.id === a.id);
    if (i < 0) s.activities.unshift(a);
    else s.activities.splice(i, 1, a);
    this.write(s);
    return a;
  }
  async cloneActivity(input: CloneActivityInput) {
    if (
      !/^[A-Za-z0-9_-]{1,128}$/.test(input?.sourceActivityId || '') ||
      !/^[A-Za-z0-9_-]{8,128}$/.test(input?.requestId || '')
    )
      throw new Error('复制参数格式错误');
    const s = this.read();
    const id = `activity_clone_${input.requestId}`;
    const existing = s.activities.find((item) => item.id === id);
    if (existing) return existing;
    const source = s.activities.find((item) => item.id === input.sourceActivityId);
    if (!source) throw new Error('源活动不存在');
    if (source.status !== 'finished') throw new Error('只能从历史活动创建草稿');
    const draft: EditableActivity = {
      id,
      version: 1,
      title: source.title,
      status: 'draft',
      ...(source.capacity === undefined ? {} : { capacity: source.capacity }),
      occupiedCount: 0,
      description: source.description,
      route: {
        start: source.route.start,
        end: source.route.end,
        distanceKm: source.route.distanceKm,
        elevationM: source.route.elevationM,
        level: source.route.level,
      },
      schedule: source.schedule.map((item) => ({ ...item })),
      notices: [...source.notices],
      equipment: [...source.equipment],
      ...(source.fee === undefined ? {} : { fee: source.fee }),
      ...(source.feeIncluded === undefined ? {} : { feeIncluded: [...source.feeIncluded] }),
      ...(source.feeExcluded === undefined ? {} : { feeExcluded: [...source.feeExcluded] }),
      ...(input.signupDeadline === undefined ? {} : { deadline: input.signupDeadline }),
      ...(input.eventStart === undefined
        ? {}
        : { date: input.eventStart, startAt: input.eventStart }),
      ...(input.eventEnd === undefined ? {} : { endAt: input.eventEnd }),
    };
    s.activities.unshift(draft);
    this.write(s);
    return draft;
  }
}
