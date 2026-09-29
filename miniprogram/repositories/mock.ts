import type {
  Activity,
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
import type { ActivityInput, RegistrationSubmission, RideRepository } from './types';
type S = {
  activities: Activity[];
  registrations: Registration[];
  profile: Profile;
  stravaStatus: StravaStatus;
};
const KEY = 'ride-mock-v1';
const init = (): S => ({ activities, registrations, profile, stravaStatus: 'connected' });
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
    return this.getActivity(id);
  }
  async listActivities() {
    return this.read().activities;
  }
  async getActivity(id: string) {
    return this.read().activities.find((x) => x.id === id);
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
    return {
      state: 'ready',
      generatedAt: '2026-09-29T04:10:00.000Z',
      profile: {
        displayName: this.read().profile.nickname || '此里骑手',
        title: this.read().profile.title || '',
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
        athleteName: null,
        snapshot: null,
        error: null,
      };
    }
    return {
      state: 'ready',
      canRegister: true,
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
    return this.getStravaStatus();
  }
  async disconnectStrava() {
    const s = this.read();
    s.stravaStatus = 'pending';
    this.write(s);
  }
  async saveActivity(value: ActivityInput, id?: string, expectedVersion?: number) {
    const current = id ? this.read().activities.find((item) => item.id === id) : undefined;
    if (current && current.version !== expectedVersion) throw new Error('活动已被其他人更新');
    const a: Activity = {
      ...value,
      id: id || `a${Date.now()}`,
      version: current ? current.version + 1 : 1,
      date: value.startAt,
      occupiedCount: id ? current?.occupiedCount || 0 : 0,
    };
    const s = this.read(),
      i = s.activities.findIndex((x) => x.id === a.id);
    if (i < 0) s.activities.unshift(a);
    else s.activities.splice(i, 1, a);
    this.write(s);
    return a;
  }
}
