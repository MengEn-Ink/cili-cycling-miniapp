import type {
  Activity,
  AvatarSource,
  ClientAvatarSource,
  EditableActivity,
  PersonalCapabilityCard,
  PersonalCapabilityCardState,
  Profile,
  ProfileUpdate,
  Registration,
  RegistrationStatus,
  StravaConnection,
  StravaCoverage,
  StravaReadiness,
  StravaReadinessState,
  StravaRouteGpx,
  StravaRoutePreview,
} from '../models';
import type {
  ActivityInput,
  AdminRegistrationStatusFilter,
  AdminReviewRepository,
  CloneActivityInput,
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
  if (value.ok) {
    if (!Object.prototype.hasOwnProperty.call(value, 'data')) return invalidResponse();
    return value.data as T;
  }
  if (
    !isRecord(value.error) ||
    typeof value.error.code !== 'string' ||
    !value.error.code ||
    typeof value.error.message !== 'string'
  )
    return invalidResponse();
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
function httpsUrl(value: unknown): string {
  return typeof value === 'string' && /^https:\/\/[^\s/]+(?:\/[^\s]*)?$/i.test(value) ? value : '';
}
function requiredId(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value)
    throw new CloudRepositoryError('VALIDATION_FAILED', `缺少${label}`);
  return value;
}
function clientAvatarSource(value: unknown): ClientAvatarSource {
  if (value !== 'wechat' && value !== 'custom')
    throw new CloudRepositoryError('VALIDATION_FAILED', '头像来源无效');
  return value;
}
function boundedId(value: unknown, label: string, min: number, max: number): string {
  if (
    typeof value !== 'string' ||
    value.length < min ||
    value.length > max ||
    !/^[A-Za-z0-9_-]+$/.test(value)
  )
    throw new CloudRepositoryError('VALIDATION_FAILED', `${label}格式错误`);
  return value;
}
function finiteNumberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
function nullableFiniteNumber(value: unknown): number | null {
  if (value === null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return invalidResponse();
}
function nullableDateText(value: unknown): string | null {
  if (value === null) return null;
  const text = dateText(value);
  return text || null;
}
function strictDateText(value: unknown): string {
  const text = dateText(value);
  if (!text || !Number.isFinite(new Date(text).getTime())) return invalidResponse();
  return text;
}
function hasOwn(value: Record<string, any>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}
function mapCoverage(raw: Record<string, any>, strict: boolean): StravaCoverage | null {
  const keys = ['coverage_from', 'coverage_to', 'coverage_complete'];
  if (!keys.some((key) => hasOwn(raw, key))) return null;
  const from = strict ? strictDateText(raw.coverage_from) : dateText(raw.coverage_from);
  const to = strict ? strictDateText(raw.coverage_to) : dateText(raw.coverage_to);
  if (!from || !to || typeof raw.coverage_complete !== 'boolean') {
    if (strict) return invalidResponse();
    return null;
  }
  return { from, to, complete: raw.coverage_complete };
}
function registrationDecision(raw: Record<string, any>) {
  const state = raw.registration_state;
  const reason = raw.closed_reason;
  const serverNow = strictDateText(raw.server_now);
  const validOpen = state === 'open' && reason === null;
  const validClosed =
    state === 'closed' &&
    ['finished', 'deadline', 'full', 'incomplete', 'unavailable'].includes(reason);
  if (!validOpen && !validClosed) return invalidResponse();
  return { registrationState: state, closedReason: reason, serverNow };
}
function mapActivityLocation(raw: unknown) {
  if (!isRecord(raw)) return undefined;
  if (
    typeof raw.name !== 'string' ||
    typeof raw.address !== 'string' ||
    typeof raw.latitude !== 'number' ||
    !Number.isFinite(raw.latitude) ||
    raw.latitude < -90 ||
    raw.latitude > 90 ||
    typeof raw.longitude !== 'number' ||
    !Number.isFinite(raw.longitude) ||
    raw.longitude < -180 ||
    raw.longitude > 180
  )
    return undefined;
  return {
    name: raw.name,
    address: raw.address,
    latitude: raw.latitude,
    longitude: raw.longitude,
  };
}
function mapPublicAttendees(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .slice(0, 24)
    .map((attendee) => {
      const card = isRecord(attendee.card) ? attendee.card : {};
      return {
        id: typeof attendee.id === 'string' ? attendee.id : '',
        displayName: typeof attendee.display_name === 'string' ? attendee.display_name : '',
        title: typeof attendee.title === 'string' ? attendee.title : '',
        avatarUrl: httpsUrl(attendee.avatar_url),
        status: (attendee.status === 'checked_in' ? 'checked_in' : 'approved') as
          'approved' | 'checked_in',
        card: {
          rides90d: finiteNumberOrNull(card.rides90d),
          longestKm: finiteNumberOrNull(card.longestKm),
          elevationM: finiteNumberOrNull(card.elevationM),
          speedKmh: finiteNumberOrNull(card.speedKmh),
        },
      };
    });
}
function mapActivityRouteExtras(raw: unknown) {
  if (!isRecord(raw)) return {};
  const points = Array.isArray(raw.elevation_profile)
    ? raw.elevation_profile
        .filter(isRecord)
        .map((point) => ({ distanceKm: point.distance_km, elevationM: point.elevation_m }))
        .filter(
          (point) =>
            typeof point.distanceKm === 'number' &&
            Number.isFinite(point.distanceKm) &&
            typeof point.elevationM === 'number' &&
            Number.isFinite(point.elevationM),
        )
    : [];
  const climbs = Array.isArray(raw.popular_climbs)
    ? raw.popular_climbs.filter(isRecord).map((climb) => ({
        id: typeof climb.id === 'string' ? climb.id : '',
        name: typeof climb.name === 'string' ? climb.name : '',
        distanceKm: finiteNumberOrNull(climb.distance_km) || 0,
        elevationGainM: finiteNumberOrNull(climb.elevation_gain_m) || 0,
        averageGrade: finiteNumberOrNull(climb.average_grade) || 0,
        maxGrade: finiteNumberOrNull(climb.max_grade) || 0,
        climbCategory: finiteNumberOrNull(climb.climb_category) || 0,
        popularity: finiteNumberOrNull(climb.popularity) || 0,
        popularityLabel: typeof climb.popularity_label === 'string' ? climb.popularity_label : '',
      }))
    : [];
  const bounds = isRecord(raw.route_bounds)
    ? {
        south: raw.route_bounds.south,
        west: raw.route_bounds.west,
        north: raw.route_bounds.north,
        east: raw.route_bounds.east,
      }
    : undefined;
  const safeBounds =
    bounds &&
    Object.values(bounds).every((item) => typeof item === 'number' && Number.isFinite(item))
      ? bounds
      : undefined;
  return {
    ...(typeof raw.strava_route_id === 'string' ? { stravaRouteId: raw.strava_route_id } : {}),
    ...(httpsUrl(raw.strava_route_url) ? { stravaRouteUrl: httpsUrl(raw.strava_route_url) } : {}),
    ...(Array.isArray(raw.elevation_profile) ? { elevationProfile: points.slice(0, 80) } : {}),
    ...(safeBounds ? { routeBounds: safeBounds } : {}),
    ...(Array.isArray(raw.popular_climbs) ? { popularClimbs: climbs.slice(0, 3) } : {}),
  };
}
function mapStravaRoutePreview(raw: unknown): StravaRoutePreview {
  const value = expectRecord(raw);
  const route = mapActivityRouteExtras(value) as Partial<StravaRoutePreview>;
  const bounds = isRecord(value.route_bounds)
    ? {
        south: value.route_bounds.south,
        west: value.route_bounds.west,
        north: value.route_bounds.north,
        east: value.route_bounds.east,
      }
    : undefined;
  if (
    !route.stravaRouteId ||
    !/^\d{1,20}$/.test(route.stravaRouteId) ||
    !route.stravaRouteUrl ||
    !/^https:\/\/www\.strava\.com\/routes\/\d+\/?$/i.test(route.stravaRouteUrl) ||
    !Array.isArray(route.elevationProfile) ||
    route.elevationProfile.length < 2 ||
    !Array.isArray(value.elevation_profile) ||
    value.elevation_profile.length > 80 ||
    !Array.isArray(route.popularClimbs) ||
    !Array.isArray(value.popular_climbs) ||
    value.popular_climbs.length > 3 ||
    !bounds ||
    !Object.values(bounds).every((item) => typeof item === 'number' && Number.isFinite(item)) ||
    bounds.south < -90 ||
    bounds.north > 90 ||
    bounds.west < -180 ||
    bounds.east > 180 ||
    bounds.south > bounds.north ||
    bounds.west > bounds.east ||
    typeof value.distance_km !== 'number' ||
    !Number.isFinite(value.distance_km) ||
    value.distance_km < 0 ||
    value.distance_km > 20000 ||
    typeof value.elevation_m !== 'number' ||
    !Number.isFinite(value.elevation_m) ||
    value.elevation_m < 0 ||
    value.elevation_m > 100000
  )
    return invalidResponse();
  return {
    stravaRouteId: route.stravaRouteId,
    stravaRouteUrl: route.stravaRouteUrl,
    distanceKm: value.distance_km,
    elevationM: value.elevation_m,
    elevationProfile: route.elevationProfile,
    routeBounds: bounds,
    popularClimbs: route.popularClimbs,
  };
}
function mapRouteGpx(raw: unknown): StravaRouteGpx {
  const value = expectRecord(raw);
  if (
    typeof value.base64 !== 'string' ||
    value.base64.length > Math.ceil((4 * 1024 * 1024) / 3) * 4 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(value.base64) ||
    typeof value.filename !== 'string' ||
    value.filename.length > 160 ||
    !/^[A-Za-z0-9_-]+\.gpx$/.test(value.filename) ||
    value.content_type !== 'application/gpx+xml'
  )
    return invalidResponse();
  return { base64: value.base64, filename: value.filename, contentType: value.content_type };
}
function mapActivity(raw: unknown, requireRegistrationDecision = false): Activity {
  const value = expectRecord(raw);
  if (
    typeof value._id !== 'string' ||
    typeof value.title !== 'string' ||
    !['draft', 'published', 'finished'].includes(value.status)
  )
    return invalidResponse();
  const fee = value.fee;
  const images = Array.isArray(value.images)
    ? value.images.filter((item: unknown) => typeof item === 'string').slice(0, 9)
    : [];
  const mapped = {
    id: value._id,
    version: Number.isInteger(value.version) && value.version >= 1 ? value.version : 0,
    title: value.title,
    date: dateText(value.event_start),
    startAt: dateText(value.event_start),
    endAt: dateText(value.event_end),
    deadline: dateText(value.signup_deadline),
    status: value.status,
    capacity: Number.isInteger(value.capacity) ? value.capacity : 0,
    ...(Number.isInteger(value.support_vehicle_capacity)
      ? { supportVehicleCapacity: value.support_vehicle_capacity }
      : {}),
    ...(Number.isInteger(value.self_drive_capacity)
      ? { selfDriveCapacity: value.self_drive_capacity }
      : {}),
    ...(Number.isInteger(value.support_vehicle_remaining)
      ? { supportVehicleRemaining: value.support_vehicle_remaining }
      : {}),
    ...(Number.isInteger(value.self_drive_remaining)
      ? { selfDriveRemaining: value.self_drive_remaining }
      : {}),
    ...(isRecord(value.support_vehicle_driver)
      ? {
          supportVehicleDriver: {
            nickname:
              typeof value.support_vehicle_driver.nickname === 'string'
                ? value.support_vehicle_driver.nickname
                : '',
            licensePlate:
              typeof value.support_vehicle_driver.license_plate === 'string'
                ? value.support_vehicle_driver.license_plate
                : '',
            contactPhone:
              typeof value.support_vehicle_driver.contact_phone === 'string'
                ? value.support_vehicle_driver.contact_phone
                : '',
          },
        }
      : {}),
    occupiedCount: Number.isInteger(value.occupied_count) ? value.occupied_count : undefined,
    registrationState: ['open', 'closed'].includes(value.registration_state)
      ? value.registration_state
      : undefined,
    closedReason: ['finished', 'deadline', 'full', 'incomplete', 'unavailable'].includes(
      value.closed_reason,
    )
      ? value.closed_reason
      : undefined,
    ...(value.registration_setup_pending === true ? { registrationSetupPending: true } : {}),
    description: typeof value.description === 'string' ? value.description : '',
    ...(Array.isArray(value.images) ? { images } : {}),
    coverImage: images[0] || (typeof value.cover_image === 'string' ? value.cover_image : ''),
    route: {
      start: typeof value.route?.start === 'string' ? value.route.start : '',
      end: typeof value.route?.end === 'string' ? value.route.end : '',
      ...(mapActivityLocation(value.route?.start_location)
        ? { startLocation: mapActivityLocation(value.route?.start_location) }
        : {}),
      ...(mapActivityLocation(value.route?.end_location)
        ? { endLocation: mapActivityLocation(value.route?.end_location) }
        : {}),
      distanceKm: typeof value.route?.distance_km === 'number' ? value.route.distance_km : 0,
      elevationM: typeof value.route?.elevation_m === 'number' ? value.route.elevation_m : 0,
      level: typeof value.route?.level === 'string' ? value.route.level : '',
      gpxFileId: typeof value.route?.gpx_file_id === 'string' ? value.route.gpx_file_id : '',
      ...mapActivityRouteExtras(value.route),
    },
    ...(Array.isArray(value.attendees) ? { attendees: mapPublicAttendees(value.attendees) } : {}),
    schedule: Array.isArray(value.schedule) ? value.schedule : [],
    notices: Array.isArray(value.notices) ? value.notices : [],
    equipment: Array.isArray(value.equipment) ? value.equipment : [],
    fee: typeof fee === 'string' ? fee : typeof fee?.remark === 'string' ? fee.remark : '',
    ...(isRecord(fee)
      ? {
          feeIncluded: Array.isArray(fee.included)
            ? fee.included.filter((item: unknown) => typeof item === 'string')
            : [],
          feeExcluded: Array.isArray(fee.excluded)
            ? fee.excluded.filter((item: unknown) => typeof item === 'string')
            : [],
        }
      : {}),
  };
  return requireRegistrationDecision ? { ...mapped, ...registrationDecision(value) } : mapped;
}
function mapEditableActivity(raw: unknown, requireCloneDraft = false): EditableActivity {
  const value = expectRecord(raw);
  if (
    typeof value._id !== 'string' ||
    !value._id ||
    (value.version !== undefined && (!Number.isInteger(value.version) || value.version < 1)) ||
    typeof value.title !== 'string' ||
    !['draft', 'published', 'finished'].includes(value.status) ||
    (value.capacity !== undefined && !Number.isInteger(value.capacity)) ||
    (requireCloneDraft && value.status !== 'draft')
  )
    return invalidResponse();
  const mapped = mapActivity(
    {
      ...value,
      capacity: value.capacity === undefined ? 0 : value.capacity,
    },
    false,
  ) as EditableActivity;
  if (value.capacity === undefined) delete mapped.capacity;
  if (value.signup_deadline === undefined) delete mapped.deadline;
  if (value.event_start === undefined) {
    delete mapped.date;
    delete mapped.startAt;
  }
  if (value.event_end === undefined) delete mapped.endAt;
  if (value.fee === undefined) delete mapped.fee;
  return mapped;
}
function mapProfile(raw: unknown): Profile {
  const value = expectRecord(raw);
  if (typeof value.nickname !== 'string' || typeof value.completeness !== 'number')
    return invalidResponse();
  const status = isRecord(value.sensitive_status) ? value.sensitive_status : {};
  if (value.avatar_file_id !== undefined && typeof value.avatar_file_id !== 'string')
    return invalidResponse();
  if (
    value.avatar_revision !== undefined &&
    (!Number.isInteger(value.avatar_revision) || value.avatar_revision < 0)
  )
    return invalidResponse();
  if (
    value.avatar_visibility !== undefined &&
    !['public', 'private'].includes(String(value.avatar_visibility))
  )
    return invalidResponse();
  if (
    value.avatar_visibility_revision !== undefined &&
    value.avatar_visibility_revision !== null &&
    (!Number.isInteger(value.avatar_visibility_revision) || value.avatar_visibility_revision < 0)
  )
    return invalidResponse();
  const avatarId = typeof value.avatar_file_id === 'string' ? value.avatar_file_id : '';
  const avatarSource = value.avatar_source;
  if (
    (avatarId && !['wechat', 'strava', 'custom'].includes(avatarSource)) ||
    (!avatarId && avatarSource !== undefined)
  )
    return invalidResponse();
  return {
    avatarRevision: Number.isInteger(value.avatar_revision) ? value.avatar_revision : 0,
    avatarVisibility: value.avatar_visibility === 'public' ? 'public' : 'private',
    avatarVisibilityRevision: Number.isInteger(value.avatar_visibility_revision)
      ? Number(value.avatar_visibility_revision)
      : null,
    nickname: value.nickname,
    title: typeof value.title === 'string' ? value.title : '',
    avatarId,
    ...(avatarId ? { avatarSource: avatarSource as AvatarSource } : {}),
    hasCompletedGuidance: value.has_completed_guidance === true,
    realName: typeof value.real_name_masked === 'string' ? value.real_name_masked : '',
    phone: typeof value.phone_masked === 'string' ? value.phone_masked : '',
    gender: typeof value.gender === 'string' ? value.gender : '',
    emergencyName: typeof value.emergency_name === 'string' ? value.emergency_name : '',
    emergencyPhone:
      typeof value.emergency_phone_masked === 'string' ? value.emergency_phone_masked : '',
    photos: Array.isArray(value.photos)
      ? value.photos.filter(isRecord).map((photo) => ({
          id: String(photo.file_id || ''),
          category: String(photo.category || ''),
        }))
      : [],
    completeness: value.completeness,
    sensitiveStatus: {
      realName: status.real_name === true,
      phone: status.phone === true,
      phoneVerified: status.phone_verified === true,
      phoneSource: ['wechat', 'manual', 'legacy'].includes(String(status.phone_source))
        ? (status.phone_source as 'wechat' | 'manual' | 'legacy')
        : '',
      emergencyPhone: status.emergency_phone === true,
    },
  };
}
function mapPersonalCapabilityCard(raw: unknown): PersonalCapabilityCard {
  const value = expectRecord(raw);
  const states: PersonalCapabilityCardState[] = [
    'ready',
    'partial',
    'syncing',
    'failed',
    'disconnected',
  ];
  if (!states.includes(value.state)) return invalidResponse();

  const generatedAt = strictDateText(value.generated_at);
  const profile = expectRecord(value.profile);
  if (typeof profile.display_name !== 'string' || typeof profile.title !== 'string')
    return invalidResponse();

  if (!Array.isArray(value.backgrounds)) return invalidResponse();
  const backgrounds = value.backgrounds.map((item: unknown) => {
    const background = expectRecord(item);
    const url = httpsUrl(background.url);
    if (
      !url ||
      !['user_photo', 'avatar'].includes(background.source) ||
      typeof background.category !== 'string'
    )
      return invalidResponse();
    return {
      url,
      source: background.source as 'user_photo' | 'avatar',
      category: background.category,
    };
  });

  const summary = expectRecord(value.summary);
  const coverageRaw = value.coverage;
  let coverage = null;
  if (coverageRaw !== null) {
    const record = expectRecord(coverageRaw);
    if (typeof record.complete !== 'boolean') return invalidResponse();
    coverage = {
      from: strictDateText(record.from),
      to: strictDateText(record.to),
      complete: record.complete,
    };
  }
  const syncedAt = value.synced_at === null ? null : strictDateText(value.synced_at);

  return {
    state: value.state,
    generatedAt,
    profile: {
      displayName: profile.display_name,
      title: profile.title,
      avatarUrl: httpsUrl(profile.avatar_url),
    },
    backgrounds,
    summary: {
      totalKm90d: nullableFiniteNumber(summary.total_km_90d),
      rides90d: nullableFiniteNumber(summary.rides_90d),
      longestKm: nullableFiniteNumber(summary.longest_km),
      elevationM90d: nullableFiniteNumber(summary.elevation_m_90d),
      weightedAvgSpeedKmh: nullableFiniteNumber(summary.weighted_avg_speed_kmh),
    },
    coverage,
    syncedAt,
    needsStravaReauth: value.needs_strava_reauth === true,
  };
}
function mapRegistration(raw: unknown): Registration {
  const value = expectRecord(raw);
  if (
    typeof value._id !== 'string' ||
    typeof value.activity_id !== 'string' ||
    !['pending', 'approved', 'checked_in', 'rejected', 'cancelled'].includes(value.status)
  )
    return invalidResponse();
  const snapshot = isRecord(value.profile_snapshot) ? value.profile_snapshot : {};
  const strava = isRecord(value.strava_snapshot) ? value.strava_snapshot : {};
  const options = isRecord(value.options) ? value.options : {};
  const capability = isRecord(value.capability_profile) ? value.capability_profile : {};
  const exemption = isRecord(value.exemption) ? value.exemption : {};
  const history = Array.isArray(value.review_history) ? value.review_history : [];
  const lastReview =
    history.length > 0 && isRecord(history[history.length - 1]) ? history[history.length - 1] : {};
  return {
    id: value._id,
    activityId: value.activity_id,
    status: value.status,
    profile: {
      avatarRevision: 0,
      nickname:
        typeof capability.nickname === 'string'
          ? capability.nickname
          : typeof snapshot.nickname === 'string'
            ? snapshot.nickname
            : '',
      title: typeof capability.title === 'string' ? capability.title : '',
      realName: typeof snapshot.real_name_masked === 'string' ? snapshot.real_name_masked : '',
      phone: typeof snapshot.phone_masked === 'string' ? snapshot.phone_masked : '',
      gender: '',
      emergencyName: '',
      emergencyPhone: '',
      photos: Array.isArray(capability.photos)
        ? capability.photos
            .filter(isRecord)
            .map((photo) => ({
              id: httpsUrl(photo.url),
              category: typeof photo.category === 'string' ? photo.category : '',
            }))
            .filter((photo) => photo.id)
        : [],
      avatarId: httpsUrl(capability.avatar_url),
      sensitiveStatus: {
        realName: typeof snapshot.real_name_masked === 'string' && !!snapshot.real_name_masked,
        phone: typeof snapshot.phone_masked === 'string' && !!snapshot.phone_masked,
        phoneVerified: capability.phone_verified === true,
        phoneSource: ['wechat', 'manual', 'legacy'].includes(String(capability.phone_source))
          ? (capability.phone_source as 'wechat' | 'manual' | 'legacy')
          : '',
        emergencyPhone: false,
      },
    },
    gatheringMode:
      ({ self_drive: '自驾', support_vehicle: '需要后援车' } as const)[
        options.gathering_mode as 'self_drive' | 'support_vehicle'
      ] || '',
    experience:
      ({ beginner: '新手', intermediate: '有一定经验', regular: '常骑' } as Record<string, string>)[
        options.experience
      ] || '',
    remark: typeof options.remark === 'string' ? options.remark : '',
    strava: {
      status:
        value.strava_status === 'exempted'
          ? 'exempted'
          : value.strava_status === 'syncing'
            ? 'syncing'
            : value.strava_status === 'failed'
              ? 'failed'
              : value.strava_status === 'connected'
                ? 'connected'
                : 'pending',
      reason: typeof exemption.reason === 'string' ? exemption.reason : undefined,
      years: finiteNumberOrNull(strava.years_on_strava),
      totalKm: finiteNumberOrNull(strava.total_km),
      rides90d: finiteNumberOrNull(strava.activities_90d),
      longestKm: finiteNumberOrNull(strava.longest_km),
      elevationM: finiteNumberOrNull(strava.total_elevation_m),
      speedKmh: finiteNumberOrNull(strava.weighted_avg_speed_kmh),
      latestActivityAt: nullableDateText(strava.latest_activity_at ?? null),
      syncedAt: dateText(strava.synced_at),
      coverage: mapCoverage(strava, false),
    },
    reviewComment: typeof lastReview.comment === 'string' ? lastReview.comment : undefined,
    serialNo: typeof value.serial_no === 'string' ? value.serial_no : undefined,
    checkedInAt: dateText(value.checked_in_at) || undefined,
    updatedAt: dateText(value.updated_at),
  };
}
function mapStrava(raw: unknown): StravaConnection {
  const value = expectRecord(raw);
  if (typeof value.connected !== 'boolean') {
    const readiness = mapStravaReadiness(value);
    return {
      connected: ['syncing', 'ready', 'failed'].includes(readiness.state),
      athleteName: readiness.athleteName ?? undefined,
      snapshot: readiness.snapshot ?? undefined,
    };
  }
  const snapshot = isRecord(value.snapshot) ? value.snapshot : undefined;
  return {
    connected: value.connected,
    athleteName: typeof value.athlete_name === 'string' ? value.athlete_name : undefined,
    snapshot: snapshot
      ? {
          totalKm: typeof snapshot.total_km === 'number' ? snapshot.total_km : 0,
          rides90d: typeof snapshot.activities_90d === 'number' ? snapshot.activities_90d : 0,
          longestKm: typeof snapshot.longest_km === 'number' ? snapshot.longest_km : 0,
          elevationM:
            typeof snapshot.total_elevation_m === 'number' ? snapshot.total_elevation_m : 0,
          speedKmh:
            typeof snapshot.weighted_avg_speed_kmh === 'number'
              ? snapshot.weighted_avg_speed_kmh
              : 0,
          latestActivityAt: dateText(snapshot.latest_activity_at),
          syncedAt: dateText(snapshot.synced_at),
          coverage: mapCoverage(snapshot, false),
        }
      : undefined,
  };
}
function mapStravaReadiness(raw: unknown): StravaReadiness {
  const value = expectRecord(raw);
  // 兼容云函数滚动部署期间的旧版 connected 契约，避免前端先发布时整页不可用。
  if (typeof value.connected === 'boolean') {
    const legacy = mapStrava(value);
    const connectedWithSnapshot = legacy.connected && Boolean(legacy.snapshot);
    return {
      state: legacy.connected ? (connectedWithSnapshot ? 'ready' : 'syncing') : 'disconnected',
      canRegister: connectedWithSnapshot,
      avatarAvailable: false,
      athleteName: legacy.athleteName ?? null,
      snapshot: legacy.snapshot ?? null,
      error: null,
    };
  }
  const states: StravaReadinessState[] = [
    'disconnected',
    'authorizing',
    'syncing',
    'ready',
    'failed',
  ];
  if (
    !states.includes(value.state) ||
    typeof value.can_register !== 'boolean' ||
    (value.avatar_available !== undefined && typeof value.avatar_available !== 'boolean')
  )
    return invalidResponse();
  if (value.athlete_name !== null && typeof value.athlete_name !== 'string')
    return invalidResponse();

  let snapshot = null;
  if (value.snapshot !== null) {
    const rawSnapshot = expectRecord(value.snapshot);
    const syncedAt = strictDateText(rawSnapshot.synced_at);
    const latestActivityAt =
      rawSnapshot.latest_activity_at === null
        ? null
        : strictDateText(rawSnapshot.latest_activity_at);
    snapshot = {
      totalKm: nullableFiniteNumber(rawSnapshot.total_km),
      rides90d: nullableFiniteNumber(rawSnapshot.activities_90d),
      longestKm: nullableFiniteNumber(rawSnapshot.longest_km),
      elevationM: nullableFiniteNumber(rawSnapshot.total_elevation_m),
      speedKmh: nullableFiniteNumber(rawSnapshot.weighted_avg_speed_kmh),
      latestActivityAt,
      syncedAt,
      coverage: mapCoverage(rawSnapshot, true),
    };
  }

  let error = null;
  if (value.error !== null) {
    const rawError = expectRecord(value.error);
    if (
      typeof rawError.code !== 'string' ||
      !rawError.code ||
      typeof rawError.message !== 'string' ||
      typeof rawError.retryable !== 'boolean'
    )
      return invalidResponse();
    error = {
      code: rawError.code,
      message: rawError.message,
      retryable: rawError.retryable,
    };
  }

  return {
    state: value.state,
    canRegister: value.can_register,
    avatarAvailable: value.avatar_available === true,
    athleteName: value.athlete_name,
    snapshot,
    error,
  };
}
function submissionOptions(value: RegistrationSubmission) {
  return {
    gathering_mode: ['self_drive', 'support_vehicle'].includes(value.gatheringMode)
      ? value.gatheringMode
      : undefined,
    experience: (
      { 新手: 'beginner', 有一定经验: 'intermediate', 常骑: 'regular' } as Record<string, string>
    )[value.experience],
    remark: typeof value.remark === 'string' ? value.remark : '',
  };
}
function activityPayload(value: ActivityInput) {
  const images = Array.isArray(value.images)
    ? value.images.filter((item) => typeof item === 'string').slice(0, 9)
    : [];
  const locationPayload = (location: ActivityInput['route']['startLocation']) =>
    location &&
    typeof location.name === 'string' &&
    typeof location.address === 'string' &&
    typeof location.latitude === 'number' &&
    Number.isFinite(location.latitude) &&
    typeof location.longitude === 'number' &&
    Number.isFinite(location.longitude)
      ? {
          name: location.name,
          address: location.address,
          latitude: location.latitude,
          longitude: location.longitude,
        }
      : undefined;
  return {
    title: typeof value.title === 'string' ? value.title : '',
    ...(Array.isArray(value.images) ? { images } : {}),
    cover_image: images[0] || (typeof value.coverImage === 'string' ? value.coverImage : ''),
    description: typeof value.description === 'string' ? value.description : '',
    schedule: Array.isArray(value.schedule)
      ? value.schedule.map((item) => ({
          time: item.time,
          title: item.title,
          location: item.location,
          ...(typeof item.remark === 'string' ? { remark: item.remark } : {}),
        }))
      : [],
    route: {
      start: typeof value.route?.start === 'string' ? value.route.start : '',
      end: typeof value.route?.end === 'string' ? value.route.end : '',
      ...(locationPayload(value.route?.startLocation)
        ? { start_location: locationPayload(value.route.startLocation) }
        : {}),
      ...(locationPayload(value.route?.endLocation)
        ? { end_location: locationPayload(value.route.endLocation) }
        : {}),
      distance_km: value.route?.distanceKm,
      elevation_m: value.route?.elevationM,
      level: typeof value.route?.level === 'string' ? value.route.level : '',
      ...(typeof value.route?.gpxFileId === 'string' ? { gpx_file_id: value.route.gpxFileId } : {}),
      ...(typeof value.route?.stravaRouteId === 'string'
        ? { strava_route_id: value.route.stravaRouteId }
        : {}),
      ...(httpsUrl(value.route?.stravaRouteUrl)
        ? { strava_route_url: httpsUrl(value.route.stravaRouteUrl) }
        : {}),
      ...(Array.isArray(value.route?.elevationProfile)
        ? {
            elevation_profile: value.route.elevationProfile.map((point) => ({
              distance_km: point.distanceKm,
              elevation_m: point.elevationM,
            })),
          }
        : {}),
      ...(value.route?.routeBounds
        ? {
            route_bounds: {
              south: value.route.routeBounds.south,
              west: value.route.routeBounds.west,
              north: value.route.routeBounds.north,
              east: value.route.routeBounds.east,
            },
          }
        : {}),
      ...(Array.isArray(value.route?.popularClimbs)
        ? {
            popular_climbs: value.route.popularClimbs.map((climb) => ({
              id: climb.id,
              name: climb.name,
              distance_km: climb.distanceKm,
              elevation_gain_m: climb.elevationGainM,
              average_grade: climb.averageGrade,
              max_grade: climb.maxGrade,
              climb_category: climb.climbCategory,
              popularity: climb.popularity,
              popularity_label: climb.popularityLabel,
            })),
          }
        : {}),
    },
    notices: Array.isArray(value.notices)
      ? value.notices.filter((item) => typeof item === 'string')
      : [],
    equipment: Array.isArray(value.equipment)
      ? value.equipment.filter((item) => typeof item === 'string')
      : [],
    ...(Array.isArray(value.feeIncluded) || Array.isArray(value.feeExcluded)
      ? {
          fee: {
            included: Array.isArray(value.feeIncluded)
              ? value.feeIncluded.filter((item) => typeof item === 'string')
              : [],
            excluded: Array.isArray(value.feeExcluded)
              ? value.feeExcluded.filter((item) => typeof item === 'string')
              : [],
            remark: typeof value.fee === 'string' ? value.fee : '',
          },
        }
      : typeof value.fee === 'string'
        ? { fee: value.fee }
        : {}),
    ...(Number.isInteger(value.capacity) ? { capacity: value.capacity } : {}),
    ...(Number.isInteger(value.supportVehicleCapacity)
      ? { support_vehicle_capacity: value.supportVehicleCapacity }
      : {}),
    ...(Number.isInteger(value.selfDriveCapacity)
      ? { self_drive_capacity: value.selfDriveCapacity }
      : {}),
    ...(isRecord(value.supportVehicleDriver)
      ? {
          support_vehicle_driver: {
            nickname:
              typeof value.supportVehicleDriver.nickname === 'string'
                ? value.supportVehicleDriver.nickname
                : '',
            license_plate:
              typeof value.supportVehicleDriver.licensePlate === 'string'
                ? value.supportVehicleDriver.licensePlate
                : '',
            contact_phone:
              typeof value.supportVehicleDriver.contactPhone === 'string'
                ? value.supportVehicleDriver.contactPhone
                : '',
          },
        }
      : {}),
    ...(typeof value.deadline === 'string' ? { signup_deadline: value.deadline } : {}),
    ...(typeof value.startAt === 'string' ? { event_start: value.startAt } : {}),
    ...(typeof value.endAt === 'string' ? { event_end: value.endAt } : {}),
    status: value.status,
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
  async listAdminActivities() {
    return expectRecordArray(await this.call('activity-admin', { action: 'list' })).map((item) =>
      mapEditableActivity(item),
    );
  }
  async getAdminActivity(id: string) {
    return mapEditableActivity(
      await this.call('activity-admin', {
        action: 'detail',
        activityId: requiredId(id, '活动 ID'),
      }),
    );
  }
  async saveActivity(value: ActivityInput, id?: string, expectedVersion?: number) {
    const data: Record<string, unknown> = { action: 'save', activity: activityPayload(value) };
    if (id !== undefined) {
      data.activityId = requiredId(id, '活动 ID');
      if (!Number.isInteger(expectedVersion) || Number(expectedVersion) < 0)
        throw new CloudRepositoryError('VALIDATION_FAILED', '活动版本格式错误');
      data.expectedVersion = expectedVersion;
    }
    return mapEditableActivity(await this.call('activity-admin', data));
  }
  async cloneActivity(input: CloneActivityInput) {
    const sourceActivityId = boundedId(input?.sourceActivityId, '源活动 ID', 1, 128);
    const requestId = boundedId(input?.requestId, '请求 ID', 8, 128);
    const data: Record<string, unknown> = {
      action: 'clone',
      sourceActivityId,
      requestId,
    };
    for (const [from, to] of [
      ['signupDeadline', 'signupDeadline'],
      ['eventStart', 'eventStart'],
      ['eventEnd', 'eventEnd'],
    ] as const) {
      const value = input[from];
      if (value !== undefined) {
        if (typeof value !== 'string')
          throw new CloudRepositoryError('VALIDATION_FAILED', '活动时间格式错误');
        data[to] = value;
      }
    }
    return mapEditableActivity(await this.call('activity-admin', data), true);
  }
  async listActivities() {
    return expectRecordArray(await this.call('activity-read', { action: 'list' })).map((item) =>
      mapActivity(item, true),
    );
  }
  async getActivity(id: string) {
    return mapActivity(
      await this.call('activity-read', { action: 'detail', activityId: requiredId(id, '活动 ID') }),
      true,
    );
  }
  async listRegistrations() {
    return expectRecordArray(await this.call('registration', { action: 'mine' })).map(
      mapRegistration,
    );
  }
  async getRegistration(id: string) {
    return mapRegistration(
      await this.call('registration', {
        action: 'detail',
        registrationId: requiredId(id, '报名 ID'),
      }),
    );
  }
  async saveRegistration(value: RegistrationSubmission) {
    return mapRegistration(
      await this.call('registration', {
        action: 'submit',
        activityId: requiredId(value.activityId, '活动 ID'),
        options: submissionOptions(value),
      }),
    );
  }
  async getReviewNotificationTemplateIds(): Promise<string[]> {
    const value = expectRecord(
      await this.call('notification-send', { action: 'subscription-config' }),
    );
    if (
      !Array.isArray(value.template_ids) ||
      !value.template_ids.every((item) => typeof item === 'string' && item.length > 0)
    )
      return invalidResponse();
    return value.template_ids;
  }
  async requestReviewNotificationSubscription(templateIds: string[]): Promise<void> {
    const tmplIds = templateIds
      .filter((item) => typeof item === 'string' && item.length > 0)
      .filter((item, index, values) => values.indexOf(item) === index);
    if (!tmplIds.length) return;
    const request = typeof wx !== 'undefined' ? wx.requestSubscribeMessage : undefined;
    if (typeof request !== 'function')
      throw new CloudRepositoryError('SUBSCRIPTION_UNAVAILABLE', '当前环境不支持订阅消息');
    await new Promise<void>((resolve, reject) => {
      request({
        tmplIds,
        success: () => resolve(),
        fail: () =>
          reject(new CloudRepositoryError('SUBSCRIPTION_REQUEST_FAILED', '订阅消息授权请求失败')),
      });
    });
  }
  async updateRegistration(id: string, status: RegistrationStatus, comment?: string) {
    if (status === 'cancelled') return this.cancelRegistration(id);
    if (status !== 'approved' && status !== 'rejected')
      throw new CloudRepositoryError('INVALID_TRANSITION', '不支持的状态迁移');
    return this.reviewRegistration(id, status, comment);
  }
  async cancelRegistration(id: string) {
    const registrationId = requiredId(id, '报名 ID');
    return mapRegistration(await this.call('registration', { action: 'cancel', registrationId }));
  }
  async reviewRegistration(id: string, decision: 'approved' | 'rejected', reason?: string) {
    const registrationId = requiredId(id, '报名 ID');
    return mapRegistration(
      await this.call('admin-review', {
        action: 'review',
        registrationId,
        decision: decision === 'approved' ? 'approve' : 'reject',
        reason: typeof reason === 'string' ? reason : undefined,
      }),
    );
  }
  async checkInRegistration(id: string) {
    const registrationId = requiredId(id, '报名 ID');
    return mapRegistration(
      await this.call('admin-review', {
        action: 'checkIn',
        registrationId,
      }),
    );
  }
  async listReviewRegistrations(activityId: string, status?: AdminRegistrationStatusFilter) {
    const data: Record<string, unknown> = {
      action: 'list',
      activityId: requiredId(activityId, '活动 ID'),
    };
    if (status !== undefined) {
      if (!['pending', 'approved', 'checked_in', 'rejected', 'cancelled'].includes(status))
        throw new CloudRepositoryError('VALIDATION_FAILED', '报名状态无效');
      data.filterStatus = status;
    }
    return expectRecordArray(await this.call('admin-review', data)).map(mapRegistration);
  }
  async getReviewRegistration(id: string) {
    return mapRegistration(
      await this.call('admin-review', {
        action: 'detail',
        registrationId: requiredId(id, '报名 ID'),
      }),
    );
  }
  async getProfile() {
    return mapProfile(await this.call('profile', { action: 'get' }));
  }
  async getProfileMediaUploadPath() {
    const value = expectRecord(await this.call('profile', { action: 'mediaUploadPath' }));
    if (
      typeof value.cloud_path !== 'string' ||
      !/^profiles\/[a-f0-9]{32}\/[a-f0-9-]{36}\.jpg$/i.test(value.cloud_path)
    )
      return invalidResponse();
    return value.cloud_path;
  }
  async getPersonalCapabilityCard() {
    return mapPersonalCapabilityCard(await this.call('profile', { action: 'capabilityCard' }));
  }
  async registerProfileMedia(
    fileId: string,
    category: 'ride' | 'bike' | 'other',
    origin: ClientAvatarSource = 'custom',
  ) {
    const value = expectRecord(
      await this.call('profile', {
        action: 'registerMedia',
        fileId: requiredId(fileId, '媒体文件 ID'),
        category,
        origin: clientAvatarSource(origin),
      }),
    );
    if (value.registered !== true) return invalidResponse();
  }
  async reportProfileMediaOrphan(
    fileId: string,
    category: 'ride' | 'bike' | 'other',
    origin: ClientAvatarSource = 'custom',
  ) {
    const value = expectRecord(
      await this.call('profile', {
        action: 'reportOrphan',
        fileId: requiredId(fileId, '媒体文件 ID'),
        category,
        origin: clientAvatarSource(origin),
      }),
    );
    if (value.reported !== true) return invalidResponse();
  }
  async setAvatar(source: ClientAvatarSource, fileId: string) {
    return mapProfile(
      await this.call('profile', {
        action: 'setAvatar',
        source: clientAvatarSource(source),
        fileId: requiredId(fileId, '头像文件 ID'),
      }),
    );
  }
  async importStravaAvatar() {
    return mapProfile(await this.call('profile', { action: 'importStravaAvatar' }));
  }
  async updateProfile(profile: ProfileUpdate) {
    const data: Record<string, unknown> = { action: 'update' };
    const simple: [keyof ProfileUpdate, string][] = [
      ['nickname', 'nickname'],
      ['gender', 'gender'],
      ['emergencyName', 'emergency_name'],
    ];
    for (const [from, to] of simple)
      if (typeof profile[from] === 'string') data[to] = profile[from];
    if (typeof profile.hasCompletedGuidance === 'boolean')
      data.has_completed_guidance = profile.hasCompletedGuidance;
    if (profile.avatarVisibility === 'public' || profile.avatarVisibility === 'private')
      data.avatar_visibility = profile.avatarVisibility;
    if (Array.isArray(profile.photos))
      data.photos = profile.photos.map((item) => ({ file_id: item.id, category: item.category }));
    if (typeof profile.realName === 'string' && profile.realName) data.real_name = profile.realName;
    if (typeof profile.phone === 'string' && profile.phone) data.phone = profile.phone;
    if (typeof profile.emergencyPhone === 'string' && profile.emergencyPhone)
      data.emergency_phone = profile.emergencyPhone;
    return mapProfile(await this.call('profile', data));
  }
  async getPhoneNumber(code: string) {
    return mapProfile(
      await this.call('profile', {
        action: 'getPhoneNumber',
        code: requiredId(code, '手机号动态 code'),
      }),
    );
  }
  async getStravaStatus() {
    return mapStrava(await this.call('strava-auth', { action: 'status' }));
  }
  async getStravaReadiness() {
    return mapStravaReadiness(await this.call('strava-auth', { action: 'status' }));
  }
  async ensureStravaReady() {
    return mapStravaReadiness(await this.call('strava-auth', { action: 'ensureReady' }));
  }
  async startStrava() {
    const value = expectRecord(await this.call('strava-auth', { action: 'start' }));
    if (
      typeof value.authorization_url !== 'string' ||
      !value.authorization_url.startsWith('https://') ||
      typeof value.expires_at !== 'string'
    )
      return invalidResponse();
    return { authorizationUrl: value.authorization_url, expiresAt: value.expires_at };
  }
  async cancelStravaAuthorization() {
    await this.call('strava-auth', { action: 'cancelAuthorization' });
  }
  async syncStrava() {
    return mapStrava(await this.call('strava-auth', { action: 'sync' }));
  }
  async previewStravaRoute(routeUrl: string) {
    if (
      typeof routeUrl !== 'string' ||
      routeUrl.length > 256 ||
      routeUrl !== routeUrl.trim() ||
      !/^https:\/\/www\.strava\.com\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?routes\/[1-9]\d{0,19}\/?$/i.test(
        routeUrl,
      )
    )
      throw new CloudRepositoryError('ROUTE_URL_INVALID', '请输入有效的 Strava 路线 URL');
    return mapStravaRoutePreview(
      await this.call('strava-auth', { action: 'routePreview', routeUrl }),
    );
  }
  async getStravaRouteGpx(activityId: string, routeId: string) {
    if (typeof routeId !== 'string' || !/^\d{1,20}$/.test(routeId))
      throw new CloudRepositoryError('ROUTE_ID_INVALID', '路线 ID 格式错误');
    return mapRouteGpx(
      await this.call('strava-auth', {
        action: 'routeGpx',
        activityId: boundedId(activityId, '活动 ID', 1, 128),
        routeId,
      }),
    );
  }
  async exportActivityGpx(activityId: string) {
    const id = requiredId(activityId, '活动 ID');
    const activity = await this.getActivity(id);
    const routeId = activity?.route.stravaRouteId;
    if (!routeId) throw new CloudRepositoryError('ROUTE_NOT_AVAILABLE', '活动暂无可导出的路线');
    const value = await this.getStravaRouteGpx(id, routeId);
    return { base64: value.base64, fileName: value.filename };
  }
  async disconnectStrava() {
    await this.call('strava-auth', { action: 'disconnect' });
  }
}
