import type { Activity, Profile, Registration, RegistrationStatus, StravaStatus } from '../models';
import { activities, profile, registrations } from '../mock/fixtures';
import { transition } from '../utils/registration';
import type { RideRepository } from './types';
type S = {
  activities: Activity[];
  registrations: Registration[];
  profile: Profile;
  stravaStatus: StravaStatus;
};
const KEY = 'ride-mock-v1';
const init = (): S => ({ activities, registrations, profile, stravaStatus: 'connected' });
export class MockRepository implements RideRepository {
  read(): S {
    return wx.getStorageSync(KEY) || init();
  }
  write(s: S) {
    wx.setStorageSync(KEY, s);
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
  async saveRegistration(v: any) {
    const s = this.read(),
      old = s.registrations.find((x) => x.activityId === v.activityId);
    if (old) {
      old.status = transition(old.status, 'pending');
      old.updatedAt = '刚刚';
      this.write(s);
      return old;
    }
    const x: Registration = {
      id: 'r' + Date.now(),
      ...v,
      status: 'pending',
      strava: {
        status: v.stravaStatus,
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
  async updateRegistration(id: string, status: RegistrationStatus, c?: string) {
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
  async saveProfile(p: Profile) {
    const s = this.read();
    s.profile = p;
    this.write(s);
    return p;
  }
  async setStrava(v: StravaStatus) {
    const s = this.read();
    s.stravaStatus = v;
    this.write(s);
  }
  async saveActivity(a: Activity) {
    const s = this.read(),
      i = s.activities.findIndex((x) => x.id === a.id);
    if (i < 0) s.activities.unshift(a);
    else s.activities.splice(i, 1, a);
    this.write(s);
    return a;
  }
}
