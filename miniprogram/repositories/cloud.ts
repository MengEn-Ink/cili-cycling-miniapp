import type { Activity, Profile, Registration, RegistrationStatus } from '../models';
import type {
  AdminRegistrationStatusFilter,
  AdminReviewRepository,
  RegistrationSubmission,
  RideRepository,
} from './types';

type CloudApi = {
  callFunction(options: { name: string; data?: unknown }): Promise<{ result?: unknown }>;
};

export class CloudRepositoryError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'CloudRepositoryError';
  }
}
function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function invalidResponse(): never {
  throw new CloudRepositoryError('INVALID_RESPONSE', '云函数响应格式错误');
}
function unwrap<T>(value: unknown): T {
  if (!isRecord(value) || typeof value.ok !== 'boolean') return invalidResponse();
  if (value.ok === true) {
    if (!Object.prototype.hasOwnProperty.call(value, 'data')) return invalidResponse();
    return value.data as T;
  }
  if (
    !isRecord(value.error) ||
    typeof value.error.code !== 'string' ||
    !value.error.code ||
    typeof value.error.message !== 'string'
  ) {
    return invalidResponse();
  }
  throw new CloudRepositoryError(value.error.code, value.error.message);
}
function expectRecord(value: unknown): Record<string, any> {
  if (!isRecord(value)) return invalidResponse();
  return value;
}
function expectRecordArray(value: unknown): Record<string, any>[] {
  if (!Array.isArray(value) || !value.every(isRecord)) return invalidResponse();
  return value;
}
function dateText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  return '';
}
function mapActivity(raw: unknown): Activity {
  const value = expectRecord(raw);
  if (
    typeof value._id !== 'string' ||
    typeof value.title !== 'string' ||
    !['draft', 'published', 'finished'].includes(value.status) ||
    !Number.isInteger(value.capacity)
  ) {
    return invalidResponse();
  }
  const fee = value.fee;
  return {
    id: value._id,
    title: value.title,
    date: dateText(value.event_start),
    startAt: dateText(value.event_start),
    endAt: dateText(value.event_end),
    deadline: dateText(value.signup_deadline),
    status: value.status,
    capacity: value.capacity,
    occupiedCount: Number.isInteger(value.occupied_count) ? value.occupied_count : undefined,
    description: typeof value.description === 'string' ? value.description : '',
    route: {
      start: typeof value.route?.start === 'string' ? value.route.start : '',
      end: typeof value.route?.end === 'string' ? value.route.end : '',
      distanceKm: typeof value.route?.distance_km === 'number' ? value.route.distance_km : 0,
      elevationM: typeof value.route?.elevation_m === 'number' ? value.route.elevation_m : 0,
      level: typeof value.route?.level === 'string' ? value.route.level : '',
    },
    schedule: Array.isArray(value.schedule) ? value.schedule : [],
    notices: Array.isArray(value.notices) ? value.notices : [],
    equipment: Array.isArray(value.equipment) ? value.equipment : [],
    fee: typeof fee === 'string' ? fee : typeof fee?.remark === 'string' ? fee.remark : '',
  };
}
function mapRegistration(raw: unknown): Registration {
  const value = expectRecord(raw);
  if (
    typeof value._id !== 'string' ||
    typeof value.activity_id !== 'string' ||
    !['pending', 'approved', 'rejected', 'cancelled'].includes(value.status)
  ) {
    return invalidResponse();
  }
  const snapshot = isRecord(value.profile_snapshot) ? value.profile_snapshot : {};
  const strava = isRecord(value.strava_snapshot) ? value.strava_snapshot : {};
  const options = isRecord(value.options) ? value.options : {};
  const exemption = isRecord(value.exemption) ? value.exemption : {};
  const history = Array.isArray(value.review_history) ? value.review_history : [];
  const lastReview =
    history.length > 0 && isRecord(history[history.length - 1]) ? history[history.length - 1] : {};
  return {
    id: value._id,
    activityId: value.activity_id,
    status: value.status,
    profile: {
      nickname: typeof snapshot.nickname === 'string' ? snapshot.nickname : '',
      title: '',
      realName: typeof snapshot.real_name_masked === 'string' ? snapshot.real_name_masked : '',
      phone: typeof snapshot.phone_masked === 'string' ? snapshot.phone_masked : '',
      idType: '',
      idNumber: typeof snapshot.id_number_masked === 'string' ? snapshot.id_number_masked : '',
      gender: '',
      emergencyName: '',
      emergencyPhone: '',
      photos: [],
    },
    bikeMode: options.bike_mode === 'rent' ? '租车' : '自带车',
    experience:
      ({ beginner: '新手', intermediate: '有一定经验', regular: '常骑' } as Record<string, string>)[
        options.experience
      ] || '',
    remark: typeof options.remark === 'string' ? options.remark : '',
    strava: {
      status: value.strava_status === 'exempted' ? 'exempted' : 'connected',
      reason: typeof exemption.reason === 'string' ? exemption.reason : undefined,
      years: typeof strava.years_on_strava === 'number' ? strava.years_on_strava : 0,
      rides90d: typeof strava.activities_90d === 'number' ? strava.activities_90d : 0,
      longestKm: typeof strava.longest_km === 'number' ? strava.longest_km : 0,
      elevationM: typeof strava.max_elevation_m === 'number' ? strava.max_elevation_m : 0,
      speedKmh:
        typeof strava.weighted_avg_speed_kmh === 'number' ? strava.weighted_avg_speed_kmh : 0,
    },
    reviewComment: typeof lastReview.comment === 'string' ? lastReview.comment : undefined,
    serialNo: typeof value.serial_no === 'string' ? value.serial_no : undefined,
    updatedAt: dateText(value.updated_at),
  };
}
function requiredId(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value) {
    throw new CloudRepositoryError('VALIDATION_FAILED', `缺少${label}`);
  }
  return value;
}
function submissionOptions(value: RegistrationSubmission) {
  return {
    bike_mode: value.bikeMode === '租车' ? 'rent' : 'own',
    experience: (
      { 新手: 'beginner', 有一定经验: 'intermediate', 常骑: 'regular' } as Record<string, string>
    )[value.experience],
    rental_need: typeof value.rentalNeed === 'string' ? value.rentalNeed : '',
    remark: typeof value.remark === 'string' ? value.remark : '',
  };
}

export class CloudRepository implements RideRepository, AdminReviewRepository {
  constructor(private readonly injectedCloud?: CloudApi) {}

  private async call<T>(name: string, data: unknown): Promise<T> {
    const api = this.injectedCloud || (typeof wx !== 'undefined' ? wx.cloud : undefined);
    if (!api) throw new CloudRepositoryError('CLOUD_UNAVAILABLE', '当前环境不支持微信云开发');
    try {
      return unwrap<T>((await api.callFunction({ name, data })).result);
    } catch (error) {
      if (error instanceof CloudRepositoryError) throw error;
      throw new CloudRepositoryError('CALL_FAILED', '云函数调用失败');
    }
  }

  async listActivities() {
    return expectRecordArray(await this.call<unknown>('activity-read', { action: 'list' })).map(
      mapActivity,
    );
  }
  async getActivity(id: string) {
    return mapActivity(
      await this.call<unknown>('activity-read', {
        action: 'detail',
        activityId: requiredId(id, '活动 ID'),
      }),
    );
  }
  async listRegistrations() {
    return expectRecordArray(await this.call<unknown>('registration', { action: 'mine' })).map(
      mapRegistration,
    );
  }
  async getRegistration(id: string) {
    return mapRegistration(
      await this.call<unknown>('registration', {
        action: 'detail',
        registrationId: requiredId(id, '报名 ID'),
      }),
    );
  }
  async saveRegistration(value: RegistrationSubmission) {
    return mapRegistration(
      await this.call<unknown>('registration', {
        action: 'submit',
        activityId: requiredId(value.activityId, '活动 ID'),
        options: submissionOptions(value),
      }),
    );
  }
  async updateRegistration(id: string, status: RegistrationStatus, comment?: string) {
    const registrationId = requiredId(id, '报名 ID');
    if (status === 'cancelled') {
      return mapRegistration(
        await this.call<unknown>('registration', { action: 'cancel', registrationId }),
      );
    }
    if (status !== 'approved' && status !== 'rejected') {
      throw new CloudRepositoryError('INVALID_TRANSITION', '不支持的状态迁移');
    }
    return mapRegistration(
      await this.call<unknown>('admin-review', {
        action: 'review',
        registrationId,
        decision: status === 'approved' ? 'approve' : 'reject',
        reason: typeof comment === 'string' ? comment : undefined,
      }),
    );
  }
  async listReviewRegistrations(activityId: string, status?: AdminRegistrationStatusFilter) {
    const data: Record<string, unknown> = {
      action: 'list',
      activityId: requiredId(activityId, '活动 ID'),
    };
    if (status !== undefined) {
      if (!['pending', 'approved', 'rejected', 'cancelled'].includes(status)) {
        throw new CloudRepositoryError('VALIDATION_FAILED', '报名状态无效');
      }
      data.filterStatus = status;
    }
    return expectRecordArray(await this.call<unknown>('admin-review', data)).map(mapRegistration);
  }
  async getReviewRegistration(id: string) {
    return mapRegistration(
      await this.call<unknown>('admin-review', {
        action: 'detail',
        registrationId: requiredId(id, '报名 ID'),
      }),
    );
  }
  getProfile(): Promise<Profile> {
    throw new CloudRepositoryError('NOT_IMPLEMENTED', '敏感资料云端写入需 KMS 后另行实现');
  }
  saveProfile(): Promise<Profile> {
    throw new CloudRepositoryError('NOT_IMPLEMENTED', '敏感资料云端写入需 KMS 后另行实现');
  }
  setStrava(): Promise<void> {
    throw new CloudRepositoryError('NOT_IMPLEMENTED', 'Strava OAuth 尚未实现');
  }
  saveActivity(): Promise<Activity> {
    throw new CloudRepositoryError('NOT_IMPLEMENTED', '活动管理命令不在本期后端范围');
  }
}
