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
  ActivityListFilter,
  ActivityInput,
  CloneActivityInput,
  PublicActivityPage,
  PublicActivityView,
  RegistrationSubmission,
  RideRepository,
} from './types';
type S = {
  activities: (Activity | EditableActivity)[];
  registrations: Registration[];
  profile: Profile;
  stravaStatus: StravaStatus;
};
type MockStoredActivity = (Activity | EditableActivity) & {
  isDeleted?: boolean;
  is_deleted?: boolean;
};
const KEY = 'ride-mock-v1';
const init = (): S => ({ activities, registrations, profile, stravaStatus: 'connected' });
const nextAvatarRevision = (value: unknown) =>
  (Number.isInteger(value) && Number(value) >= 0 ? Number(value) : 0) + 1;
const MOCK_PAGE_SIZE = 20;
const BASE64URL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
type MockCursor = {
  version: 1;
  view: PublicActivityView;
  asOf: string;
  boundary: { time: string; id: string };
};
function validationError(message: string): Error & { code: string } {
  return Object.assign(new Error(message), {
    name: 'CloudRepositoryError',
    code: 'VALIDATION_FAILED',
  });
}
function utf8Bytes(value: string): number[] {
  const bytes: number[] = [];
  for (const character of value) {
    const point = character.codePointAt(0) ?? 0xfffd;
    if (point <= 0x7f) bytes.push(point);
    else if (point <= 0x7ff) bytes.push(0xc0 | (point >> 6), 0x80 | (point & 0x3f));
    else if (point <= 0xffff)
      bytes.push(0xe0 | (point >> 12), 0x80 | ((point >> 6) & 0x3f), 0x80 | (point & 0x3f));
    else
      bytes.push(
        0xf0 | (point >> 18),
        0x80 | ((point >> 12) & 0x3f),
        0x80 | ((point >> 6) & 0x3f),
        0x80 | (point & 0x3f),
      );
  }
  return bytes;
}
function base64urlEncode(value: string): string {
  const bytes = utf8Bytes(value);
  let encoded = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index];
    const second = bytes[index + 1];
    const third = bytes[index + 2];
    encoded += BASE64URL_ALPHABET[first >> 2];
    encoded += BASE64URL_ALPHABET[((first & 3) << 4) | ((second ?? 0) >> 4)];
    if (second !== undefined)
      encoded += BASE64URL_ALPHABET[((second & 15) << 2) | ((third ?? 0) >> 6)];
    if (third !== undefined) encoded += BASE64URL_ALPHABET[third & 63];
  }
  return encoded;
}
function base64urlDecode(value: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1)
    throw validationError('活动分页游标无效');
  const bytes: number[] = [];
  for (let index = 0; index < value.length; index += 4) {
    const chunk = [...value.slice(index, index + 4)].map((character) =>
      BASE64URL_ALPHABET.indexOf(character),
    );
    const [first, second, third, fourth] = chunk;
    bytes.push((first << 2) | (second >> 4));
    if (third !== undefined) bytes.push(((second & 15) << 4) | (third >> 2));
    if (fourth !== undefined) bytes.push(((third & 3) << 6) | fourth);
  }
  try {
    return decodeURIComponent(
      bytes.map((byte) => `%${byte.toString(16).padStart(2, '0')}`).join(''),
    );
  } catch {
    throw validationError('活动分页游标无效');
  }
}
function encodeMockCursor(cursor: MockCursor): string {
  const encoded = base64urlEncode(JSON.stringify(cursor));
  if (encoded.length > 512) throw validationError('活动分页游标无效');
  return encoded;
}
function decodeMockCursor(value: string, view: PublicActivityView): MockCursor {
  if (value.length < 1 || value.length > 512) throw validationError('活动分页游标无效');
  let parsed: unknown;
  try {
    parsed = JSON.parse(base64urlDecode(value));
  } catch {
    throw validationError('活动分页游标无效');
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    Array.isArray(parsed) ||
    Object.keys(parsed).sort().join(',') !== 'asOf,boundary,version,view'
  )
    throw validationError('活动分页游标无效');
  const cursor = parsed as Partial<MockCursor>;
  if (
    cursor.version !== 1 ||
    cursor.view !== view ||
    typeof cursor.asOf !== 'string' ||
    !Number.isFinite(new Date(cursor.asOf).getTime()) ||
    typeof cursor.boundary !== 'object' ||
    cursor.boundary === null ||
    Object.keys(cursor.boundary).sort().join(',') !== 'id,time' ||
    typeof cursor.boundary.time !== 'string' ||
    !Number.isFinite(new Date(cursor.boundary.time).getTime()) ||
    typeof cursor.boundary.id !== 'string' ||
    !cursor.boundary.id
  )
    throw validationError('活动分页游标无效');
  return cursor as MockCursor;
}
function compareText(left: string, right: string): number {
  const a = utf8Bytes(left);
  const b = utf8Bytes(right);
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    if (a[index] !== b[index]) return a[index] < b[index] ? -1 : 1;
  }
  return Math.sign(a.length - b.length);
}
function finiteTime(value: unknown): number | null {
  if (typeof value !== 'string' || !value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}
function isPublicTimelineCandidate(item: MockStoredActivity): boolean {
  const start = finiteTime(item.startAt);
  const end = finiteTime(item.endAt);
  return (
    (item.status === 'published' || item.status === 'finished') &&
    item.isDeleted !== true &&
    item.is_deleted !== true &&
    start !== null &&
    end !== null &&
    start < end
  );
}
function deriveMockPublicActivity(item: MockStoredActivity, asOf: string): Activity {
  const startAt = item.startAt as string;
  const endAt = item.endAt as string;
  const output: Activity = {
    ...(item as Activity),
    date: typeof item.date === 'string' ? item.date : startAt,
    startAt,
    endAt,
    deadline: typeof item.deadline === 'string' ? item.deadline : '',
    capacity: Number.isInteger(item.capacity) ? Number(item.capacity) : 0,
    fee: typeof item.fee === 'string' ? item.fee : '',
    serverNow: asOf,
  };
  delete output.registrationState;
  delete output.closedReason;
  delete output.registrationSetupPending;
  delete output.waitlistOnly;
  const snapshot = new Date(asOf).getTime();
  const start = new Date(startAt).getTime();
  const end = new Date(endAt).getTime();
  const deadline = finiteTime(output.deadline);
  if (item.status === 'finished' || end <= snapshot)
    return { ...output, registrationState: 'closed', closedReason: 'finished' };
  if (deadline !== null && deadline <= snapshot)
    return { ...output, registrationState: 'closed', closedReason: 'deadline' };
  const setupReady =
    output.capacity > 0 && deadline !== null && deadline < start && output.fee.trim().length > 0;
  if (!setupReady)
    return {
      ...output,
      registrationState: 'closed',
      closedReason: 'unavailable',
      registrationSetupPending: true,
    };
  const waitlistOnly =
    Number.isInteger(output.occupiedCount) && Number(output.occupiedCount) >= output.capacity;
  return {
    ...output,
    registrationState: 'open',
    closedReason: null,
    ...(waitlistOnly ? { waitlistOnly: true } : {}),
  };
}
function activityKey(item: Activity, view: PublicActivityView): { time: string; id: string } {
  return { time: view === 'future' ? item.startAt : item.endAt, id: item.id };
}
function compareActivityKey(
  left: { time: string; id: string },
  right: { time: string; id: string },
): number {
  const timeDifference = new Date(left.time).getTime() - new Date(right.time).getTime();
  return timeDifference === 0 ? compareText(left.id, right.id) : Math.sign(timeDifference);
}
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
  async listAdminActivitiesPage(input: {
    pageSize: number;
    cursor?: string;
    statusFilter?: 'all' | 'draft' | 'published' | 'finished';
  }) {
    if (!Number.isInteger(input.pageSize) || input.pageSize < 1 || input.pageSize > 50)
      throw new Error('分页大小格式错误');
    const statusFilter = input.statusFilter || 'all';
    if (!['all', 'draft', 'published', 'finished'].includes(statusFilter))
      throw new Error('活动状态筛选格式错误');
    let offset = 0;
    if (input.cursor !== undefined) {
      const match = /^mock_(all|draft|published|finished)_([1-9]\d*)$/.exec(input.cursor);
      if (!match || match[1] !== statusFilter) throw new Error('分页游标格式错误');
      offset = Number(match[2]);
      if (!Number.isSafeInteger(offset)) throw new Error('分页游标格式错误');
    }
    const activities = this.read().activities.filter(
      (item) => statusFilter === 'all' || item.status === statusFilter,
    );
    const items = activities.slice(offset, offset + input.pageSize);
    const nextOffset = offset + items.length;
    return {
      items,
      nextCursor: nextOffset < activities.length ? `mock_${statusFilter}_${nextOffset}` : null,
    };
  }
  async getAdminActivity(id: string) {
    return this.read().activities.find((x) => x.id === id);
  }
  async listActivities(filter?: ActivityListFilter) {
    const visible = this.read().activities.filter(
      (item): item is Activity =>
        item.status !== 'draft' &&
        typeof item.capacity === 'number' &&
        typeof item.startAt === 'string' &&
        typeof item.endAt === 'string' &&
        typeof item.deadline === 'string' &&
        typeof item.fee === 'string',
    );
    if (filter === undefined) return visible;
    const now = Date.now();
    const isHistory = (item: Activity) => {
      const endAt = new Date(item.endAt).getTime();
      return item.status === 'finished' || (Number.isFinite(endAt) && endAt <= now);
    };
    return visible
      .filter((item) => (filter === 'history' ? isHistory(item) : !isHistory(item)))
      .sort((left, right) => {
        const difference = new Date(left.startAt).getTime() - new Date(right.startAt).getTime();
        return filter === 'history' ? -difference : difference;
      });
  }
  async listActivityPage(view: PublicActivityView, cursor?: string): Promise<PublicActivityPage> {
    if (view !== 'future' && view !== 'history') throw validationError('活动视图无效');
    if (cursor !== undefined && typeof cursor !== 'string')
      throw validationError('活动分页游标无效');
    const decoded = cursor === undefined ? undefined : decodeMockCursor(cursor, view);
    const asOf = decoded?.asOf || new Date().toISOString();
    const snapshot = new Date(asOf).getTime();
    const visible = (this.read().activities as MockStoredActivity[])
      .filter(isPublicTimelineCandidate)
      .map((item) => deriveMockPublicActivity(item, asOf));
    const matches = visible.filter((item) => {
      const endAt = new Date(item.endAt).getTime();
      const history = item.status === 'finished' || (Number.isFinite(endAt) && endAt <= snapshot);
      return view === 'history' ? history : !history;
    });
    const direction = view === 'history' ? -1 : 1;
    const sorted = matches.sort(
      (left, right) =>
        direction * compareActivityKey(activityKey(left, view), activityKey(right, view)),
    );
    const remaining = decoded
      ? sorted.filter(
          (item) => direction * compareActivityKey(activityKey(item, view), decoded.boundary) > 0,
        )
      : sorted;
    const items = remaining.slice(0, MOCK_PAGE_SIZE);
    const hasMore = remaining.length > items.length;
    return {
      items,
      nextCursor:
        hasMore && items.length > 0
          ? encodeMockCursor({
              version: 1,
              view,
              asOf,
              boundary: activityKey(items[items.length - 1], view),
            })
          : null,
      asOf,
    };
  }
  async getActivity(id: string) {
    return (await this.listActivities()).find((x) => x.id === id);
  }
  async listRegistrations() {
    return this.read().registrations;
  }
  async listRegistrationPage() {
    return { items: this.read().registrations, nextCursor: null };
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
