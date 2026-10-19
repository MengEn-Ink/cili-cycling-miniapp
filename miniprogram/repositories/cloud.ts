import type {
  Activity,
  AvatarSource,
  ClientAvatarSource,
  ClubApplication,
  ClubApplicationInput,
  ClubApplicationStatus,
  ClubDetail,
  ClubIdentity,
  JoinableClub,
  JoinedClubSummary,
  ManagedClubProfile,
  ManagedClubProfileInput,
  EditableActivity,
  PersonalCapabilityCard,
  PublicRoutePreview,
  Profile,
  ProfileUpdate,
  Registration,
  RegistrationStatus,
  RouteCoordinate,
  RouteGpxDownload,
  RouteGpxPreview,
  RouteGpxPreviewInput,
} from '../models';
import { normalizeGender } from '../utils/gender';
import { isSafeGpxFileName } from '../utils/gpx-file';
import type {
  ActivityListFilter,
  ActivityInput,
  ActivityAdminPageInput,
  AdminRegistrationStatusFilter,
  AdminReviewRepository,
  CloneActivityInput,
  PublicActivityPage,
  PublicActivityView,
  RegistrationSubmission,
  RideRepository,
  UnifiedMediaCategory,
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
function clubAvatarUrl(value: unknown): string {
  if (typeof value !== 'string') return '';
  return httpsUrl(value) || (/^cloud:\/\/[^\s]+$/i.test(value) ? value : '');
}
function requiredId(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value)
    throw new CloudRepositoryError('VALIDATION_FAILED', `缺少${label}`);
  return value;
}
function clientAvatarSource(value: unknown): ClientAvatarSource {
  if (value !== 'wechat') throw new CloudRepositoryError('VALIDATION_FAILED', '头像来源无效');
  return value;
}
function clientMediaOrigin(value: unknown): ClientAvatarSource {
  if (value !== 'wechat' && value !== 'custom')
    throw new CloudRepositoryError('VALIDATION_FAILED', '媒体来源无效');
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
function strictDateText(value: unknown): string {
  const text = dateText(value);
  if (!text || !Number.isFinite(new Date(text).getTime())) return invalidResponse();
  return text;
}
function hasExactKeys(value: Record<string, any>, keys: string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
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
    .map((attendee) => ({
      id: typeof attendee.id === 'string' ? attendee.id : '',
      displayName: typeof attendee.display_name === 'string' ? attendee.display_name : '',
      gender: normalizeGender(attendee.gender),
      avatarUrl: httpsUrl(attendee.avatar_url),
      backgroundUrl: httpsUrl(attendee.background_url),
      status: (attendee.status === 'checked_in' ? 'checked_in' : 'approved') as
        'approved' | 'checked_in',
    }));
}
function mapActivityRouteExtras(raw: unknown) {
  if (!isRecord(raw)) return {};
  const gpxPreviewId =
    typeof raw.gpx_preview_id === 'string' && /^[a-f0-9]{64}$/.test(raw.gpx_preview_id)
      ? raw.gpx_preview_id
      : '';
  const gpxSha256 =
    typeof raw.gpx_sha256 === 'string' && /^[a-f0-9]{64}$/.test(raw.gpx_sha256)
      ? raw.gpx_sha256
      : '';
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
  const outline = Array.isArray(raw.route_outline)
    ? raw.route_outline
        .filter(isRecord)
        .map((point) => ({ latitude: point.latitude, longitude: point.longitude }))
        .filter(
          (point): point is RouteCoordinate =>
            typeof point.latitude === 'number' &&
            Number.isFinite(point.latitude) &&
            point.latitude >= -90 &&
            point.latitude <= 90 &&
            typeof point.longitude === 'number' &&
            Number.isFinite(point.longitude) &&
            point.longitude >= -180 &&
            point.longitude <= 180,
        )
        .slice(0, 240)
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
  const externalRouteId =
    raw.external_provider === 'strava' &&
    typeof raw.external_route_id === 'string' &&
    /^[1-9]\d{0,19}$/.test(raw.external_route_id)
      ? raw.external_route_id
      : '';
  const externalRouteUrl =
    externalRouteId && raw.external_route_url === `https://www.strava.com/routes/${externalRouteId}`
      ? raw.external_route_url
      : '';
  const generatedPreviewFileId =
    gpxSha256 &&
    typeof raw.generated_preview_file_id === 'string' &&
    (/^cloud:\/\/[^/]+\/profile-canonical\/[a-f0-9]{32}\/activity-route-preview\/[a-f0-9]{64}\/[a-f0-9]{64}\.png$/i.test(
      raw.generated_preview_file_id,
    ) ||
      new RegExp(`^cloud://[^/]+/activity-routes/[^/]+/${gpxSha256}\\.png$`).test(
        raw.generated_preview_file_id,
      ))
      ? raw.generated_preview_file_id
      : '';
  const optionalMetric = (value: unknown, minimum: number, maximum: number) =>
    typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum
      ? value
      : undefined;
  return {
    ...(raw.public_route_preview_id && typeof raw.public_route_preview_id === 'string'
      ? { publicRoutePreviewId: raw.public_route_preview_id }
      : {}),
    ...(externalRouteId && externalRouteUrl
      ? {
          externalProvider: 'strava' as const,
          externalRouteId,
          externalRouteUrl,
        }
      : {}),
    ...(gpxPreviewId ? { gpxPreviewId } : {}),
    ...(gpxSha256 ? { gpxSha256 } : {}),
    ...(generatedPreviewFileId ? { generatedPreviewFileId } : {}),
    ...(httpsUrl(raw.generated_preview_url)
      ? { generatedPreviewUrl: httpsUrl(raw.generated_preview_url) }
      : {}),
    ...(optionalMetric(raw.elevation_loss_m, 0, 100000) === undefined
      ? {}
      : { elevationLossM: optionalMetric(raw.elevation_loss_m, 0, 100000) }),
    ...(optionalMetric(raw.elevation_min_m, -1000, 10000) === undefined
      ? {}
      : { elevationMinM: optionalMetric(raw.elevation_min_m, -1000, 10000) }),
    ...(optionalMetric(raw.elevation_max_m, -1000, 10000) === undefined
      ? {}
      : { elevationMaxM: optionalMetric(raw.elevation_max_m, -1000, 10000) }),
    ...(raw.estimation_source === 'cili' ? { estimationSource: 'cili' as const } : {}),
    ...(Array.isArray(raw.route_outline) ? { routeOutline: outline } : {}),
    ...(typeof raw.strava_route_id === 'string' ? { stravaRouteId: raw.strava_route_id } : {}),
    ...(httpsUrl(raw.strava_route_url) ? { stravaRouteUrl: httpsUrl(raw.strava_route_url) } : {}),
    ...(typeof raw.route_name === 'string' && raw.route_name.trim().length <= 120
      ? { routeName: raw.route_name.trim() }
      : {}),
    ...(typeof raw.estimated_moving_time_seconds === 'number'
      ? { estimatedMovingTimeSeconds: raw.estimated_moving_time_seconds }
      : {}),
    ...(Array.isArray(raw.elevation_profile)
      ? { elevationProfile: points.slice(0, gpxPreviewId ? 120 : 80) }
      : {}),
    ...(safeBounds ? { routeBounds: safeBounds } : {}),
  };
}
function mapPublicRoutePreview(raw: unknown): PublicRoutePreview {
  const value = expectRecord(raw);
  const id = typeof value.external_route_id === 'string' ? value.external_route_id : '';
  const url = `https://www.strava.com/routes/${id}`;
  if (
    typeof value.preview_id !== 'string' ||
    !/^[a-f0-9]{64}$/.test(value.preview_id) ||
    value.external_provider !== 'strava' ||
    !/^[1-9]\d{0,19}$/.test(id) ||
    value.external_route_url !== url ||
    value.strava_route_id !== id ||
    value.strava_route_url !== url ||
    typeof value.route_name !== 'string' ||
    !value.route_name.trim() ||
    value.route_name.length > 120 ||
    typeof value.distance_km !== 'number' ||
    !Number.isFinite(value.distance_km) ||
    value.distance_km <= 0 ||
    value.distance_km > 2000 ||
    typeof value.elevation_m !== 'number' ||
    !Number.isFinite(value.elevation_m) ||
    value.elevation_m < 0 ||
    value.elevation_m > 30000 ||
    typeof value.elevation_loss_m !== 'number' ||
    !Number.isFinite(value.elevation_loss_m) ||
    typeof value.elevation_min_m !== 'number' ||
    !Number.isFinite(value.elevation_min_m) ||
    typeof value.elevation_max_m !== 'number' ||
    !Number.isFinite(value.elevation_max_m) ||
    !Number.isSafeInteger(value.estimated_moving_time_seconds) ||
    value.estimated_moving_time_seconds < 60 ||
    value.estimation_source !== 'cili'
  )
    return invalidResponse();
  let previousDistance = -1;
  if (
    !Array.isArray(value.elevation_profile) ||
    value.elevation_profile.length < 2 ||
    value.elevation_profile.length > 80
  )
    return invalidResponse();
  const elevationProfile = value.elevation_profile.map((point: unknown) => {
    const item = expectRecord(point);
    if (
      !hasExactKeys(item, ['distance_km', 'elevation_m']) ||
      typeof item.distance_km !== 'number' ||
      !Number.isFinite(item.distance_km) ||
      item.distance_km < previousDistance ||
      typeof item.elevation_m !== 'number' ||
      !Number.isFinite(item.elevation_m)
    )
      return invalidResponse();
    previousDistance = item.distance_km;
    return { distanceKm: item.distance_km, elevationM: item.elevation_m };
  });
  if (
    !Array.isArray(value.route_outline) ||
    value.route_outline.length < 2 ||
    value.route_outline.length > 240
  )
    return invalidResponse();
  const routeOutline = value.route_outline.map((point: unknown) => {
    const item = expectRecord(point);
    if (
      !hasExactKeys(item, ['latitude', 'longitude']) ||
      typeof item.latitude !== 'number' ||
      !Number.isFinite(item.latitude) ||
      typeof item.longitude !== 'number' ||
      !Number.isFinite(item.longitude)
    )
      return invalidResponse();
    return { latitude: item.latitude, longitude: item.longitude };
  });
  const bounds = expectRecord(value.route_bounds);
  if (
    !hasExactKeys(bounds, ['south', 'west', 'north', 'east']) ||
    !Object.values(bounds).every((item) => typeof item === 'number' && Number.isFinite(item))
  )
    return invalidResponse();
  return {
    previewId: value.preview_id,
    externalProvider: 'strava',
    externalRouteId: id,
    externalRouteUrl: url,
    routeName: value.route_name.trim(),
    distanceKm: value.distance_km,
    elevationM: value.elevation_m,
    elevationLossM: value.elevation_loss_m,
    elevationMinM: value.elevation_min_m,
    elevationMaxM: value.elevation_max_m,
    estimatedMovingTimeSeconds: value.estimated_moving_time_seconds,
    estimationSource: 'cili',
    elevationProfile,
    routeOutline,
    routeBounds: { south: bounds.south, west: bounds.west, north: bounds.north, east: bounds.east },
    expiresAt: strictDateText(value.expires_at),
  };
}

function mapRouteGpxPreview(raw: unknown): RouteGpxPreview {
  const value = expectRecord(raw);
  if (
    typeof value.preview_id !== 'string' ||
    !/^[a-f0-9]{64}$/.test(value.preview_id) ||
    typeof value.gpx_sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(value.gpx_sha256) ||
    typeof value.gpx_file_id !== 'string' ||
    !new RegExp(`^cloud://[^/]+/activity-routes/[^/]+/${value.gpx_sha256}\\.gpx$`).test(
      value.gpx_file_id,
    ) ||
    typeof value.route_name !== 'string' ||
    !value.route_name.trim() ||
    value.route_name.length > 120 ||
    typeof value.distance_km !== 'number' ||
    !Number.isFinite(value.distance_km) ||
    value.distance_km < 0 ||
    value.distance_km > 20000 ||
    typeof value.elevation_m !== 'number' ||
    !Number.isFinite(value.elevation_m) ||
    value.elevation_m < 0 ||
    value.elevation_m > 100000 ||
    typeof value.elevation_loss_m !== 'number' ||
    !Number.isFinite(value.elevation_loss_m) ||
    value.elevation_loss_m < 0 ||
    value.elevation_loss_m > 100000 ||
    typeof value.elevation_min_m !== 'number' ||
    !Number.isFinite(value.elevation_min_m) ||
    value.elevation_min_m < -1000 ||
    value.elevation_min_m > 10000 ||
    typeof value.elevation_max_m !== 'number' ||
    !Number.isFinite(value.elevation_max_m) ||
    value.elevation_max_m < value.elevation_min_m ||
    value.elevation_max_m > 10000 ||
    !Number.isSafeInteger(value.estimated_moving_time_seconds) ||
    value.estimated_moving_time_seconds < 60 ||
    value.estimated_moving_time_seconds > 604800 ||
    value.estimation_source !== 'cili'
  )
    return invalidResponse();
  if (
    value.generated_preview_file_id !== undefined &&
    (typeof value.generated_preview_file_id !== 'string' ||
      (!/^cloud:\/\/[^/]+\/profile-canonical\/[a-f0-9]{32}\/activity-route-preview\/[a-f0-9]{64}\/[a-f0-9]{64}\.png$/i.test(
        value.generated_preview_file_id,
      ) &&
        !new RegExp(`^cloud://[^/]+/activity-routes/[^/]+/${value.gpx_sha256}\\.png$`).test(
          value.generated_preview_file_id,
        )))
  )
    return invalidResponse();
  let previousDistance = -1;
  if (
    !Array.isArray(value.elevation_profile) ||
    value.elevation_profile.length < 2 ||
    value.elevation_profile.length > 120
  )
    return invalidResponse();
  const elevationProfile = value.elevation_profile.map((point: unknown) => {
    const item = expectRecord(point);
    if (
      !hasExactKeys(item, ['distance_km', 'elevation_m']) ||
      typeof item.distance_km !== 'number' ||
      !Number.isFinite(item.distance_km) ||
      item.distance_km < previousDistance ||
      item.distance_km < 0 ||
      item.distance_km > 20000 ||
      typeof item.elevation_m !== 'number' ||
      !Number.isFinite(item.elevation_m) ||
      item.elevation_m < -1000 ||
      item.elevation_m > 10000
    )
      return invalidResponse();
    previousDistance = item.distance_km;
    return { distanceKm: item.distance_km, elevationM: item.elevation_m };
  });
  if (
    !Array.isArray(value.route_outline) ||
    value.route_outline.length < 2 ||
    value.route_outline.length > 240
  )
    return invalidResponse();
  const routeOutline = value.route_outline.map((point: unknown) => {
    const item = expectRecord(point);
    if (
      !hasExactKeys(item, ['latitude', 'longitude']) ||
      typeof item.latitude !== 'number' ||
      !Number.isFinite(item.latitude) ||
      item.latitude < -90 ||
      item.latitude > 90 ||
      typeof item.longitude !== 'number' ||
      !Number.isFinite(item.longitude) ||
      item.longitude < -180 ||
      item.longitude > 180
    )
      return invalidResponse();
    return { latitude: item.latitude, longitude: item.longitude };
  });
  const bounds = expectRecord(value.route_bounds);
  if (
    !hasExactKeys(bounds, ['south', 'west', 'north', 'east']) ||
    !Object.values(bounds).every((item) => typeof item === 'number' && Number.isFinite(item)) ||
    bounds.south < -90 ||
    bounds.north > 90 ||
    bounds.west < -180 ||
    bounds.east > 180 ||
    bounds.south > bounds.north ||
    bounds.west > bounds.east
  )
    return invalidResponse();
  return {
    previewId: value.preview_id,
    gpxFileId: value.gpx_file_id,
    gpxSha256: value.gpx_sha256,
    ...(value.generated_preview_file_id
      ? { generatedPreviewFileId: value.generated_preview_file_id }
      : {}),
    routeName: value.route_name.trim(),
    distanceKm: value.distance_km,
    elevationM: value.elevation_m,
    elevationLossM: value.elevation_loss_m,
    elevationMinM: value.elevation_min_m,
    elevationMaxM: value.elevation_max_m,
    estimatedMovingTimeSeconds: value.estimated_moving_time_seconds,
    estimationSource: 'cili',
    elevationProfile,
    routeOutline,
    routeBounds: {
      south: bounds.south,
      west: bounds.west,
      north: bounds.north,
      east: bounds.east,
    },
    expiresAt: strictDateText(value.expires_at),
  };
}
function mapRouteGpx(raw: unknown) {
  const value = expectRecord(raw);
  const tempFileURL = httpsUrl(value.temp_file_url);
  if (
    !tempFileURL ||
    typeof value.filename !== 'string' ||
    !isSafeGpxFileName(value.filename) ||
    value.content_type !== 'application/gpx+xml' ||
    typeof value.gpx_md5 !== 'string' ||
    !/^[a-f0-9]{32}$/.test(value.gpx_md5)
  )
    return invalidResponse();
  return {
    tempFileURL,
    fileName: value.filename,
    contentType: value.content_type as 'application/gpx+xml',
    gpxMd5: value.gpx_md5,
  };
}
function mapClubIdentity(raw: unknown): ClubIdentity {
  if (!isRecord(raw) || typeof raw.name !== 'string' || !raw.name.trim()) {
    return { name: '此里公开活动', avatarUrl: '' };
  }
  const clubId =
    typeof raw.club_id === 'string' && raw.club_id
      ? raw.club_id
      : typeof raw.id === 'string' && raw.id
        ? raw.id
        : typeof raw._id === 'string' && raw._id
          ? raw._id
          : undefined;
  return {
    ...(clubId ? { clubId } : {}),
    name: raw.name.trim(),
    avatarUrl: clubAvatarUrl(raw.avatar_url),
  };
}
function mapClubMemberships(raw: unknown) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(isRecord)
    .map((membership) => {
      const rawIdentity = isRecord(membership.club_identity)
        ? {
            ...membership.club_identity,
            ...(typeof membership.club_id === 'string' ? { club_id: membership.club_id } : {}),
          }
        : {
            club_id: membership.club_id,
            name: membership.club_name,
            avatar_url: membership.club_avatar_url,
          };
      const identity = mapClubIdentity(rawIdentity);
      if (!identity.clubId || identity.name === '此里公开活动') return null;
      const role = typeof membership.role === 'string' ? membership.role : 'member';
      return {
        clubId: identity.clubId,
        name: identity.name,
        avatarUrl: identity.avatarUrl,
        role,
        roleLabel:
          typeof membership.role_label === 'string' && membership.role_label.trim()
            ? membership.role_label.trim()
            : (
                {
                  OWNER: '负责人',
                  ADMIN: '管理员',
                  ORGANIZER: '组织者',
                  MEMBER: '成员',
                } as Record<string, string>
              )[role.toUpperCase()] || '成员',
      };
    })
    .filter((membership): membership is NonNullable<typeof membership> => membership !== null);
}
function mapActivity(raw: unknown, requireRegistrationDecision = false): Activity {
  const value = expectRecord(raw);
  if (
    typeof value._id !== 'string' ||
    typeof value.title !== 'string' ||
    !['draft', 'pending_review', 'rejected', 'published', 'finished'].includes(value.status)
  )
    return invalidResponse();
  const fee = value.fee;
  const images = Array.isArray(value.images)
    ? value.images.filter((item: unknown) => typeof item === 'string').slice(0, 9)
    : [];
  const mapped = {
    id: value._id,
    version: Number.isInteger(value.version) && value.version >= 1 ? value.version : 0,
    ...(typeof value.club_id === 'string' && value.club_id ? { clubId: value.club_id } : {}),
    clubIdentity: mapClubIdentity(value.club_identity),
    title: value.title,
    date: dateText(value.event_start),
    startAt: dateText(value.event_start),
    endAt: dateText(value.event_end),
    deadline: dateText(value.signup_deadline),
    status: value.status,
    ...(Number.isInteger(value.review_version) ? { reviewVersion: value.review_version } : {}),
    ...(['club_review', 'role_auto_publish'].includes(value.approval_mode)
      ? { approvalMode: value.approval_mode }
      : {}),
    ...(typeof value.approved_role === 'string' ? { approvedRole: value.approved_role } : {}),
    ...(typeof value.rejection_reason === 'string'
      ? { rejectionReason: value.rejection_reason }
      : {}),
    capacity: Number.isInteger(value.capacity) ? value.capacity : 0,
    ...(value.registration_unlimited === true ? { registrationUnlimited: true } : {}),
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
    ...(Number.isInteger(value.approved_registration_count)
      ? { approvedRegistrationCount: value.approved_registration_count }
      : {}),
    registrationState: ['open', 'closed'].includes(value.registration_state)
      ? value.registration_state
      : undefined,
    closedReason: ['finished', 'deadline', 'full', 'incomplete', 'unavailable'].includes(
      value.closed_reason,
    )
      ? value.closed_reason
      : undefined,
    ...(value.registration_setup_pending === true ? { registrationSetupPending: true } : {}),
    ...(value.waitlist_only === true ? { waitlistOnly: true } : {}),
    description: typeof value.description === 'string' ? value.description : '',
    ...(Array.isArray(value.images) ? { images } : {}),
    coverImage: images[0] || (typeof value.cover_image === 'string' ? value.cover_image : ''),
    ...(typeof value.group_qr_code === 'string' ? { groupQrCode: value.group_qr_code } : {}),
    ...(typeof value.group_qr_code_uploaded_at === 'string'
      ? { groupQrCodeUploadedAt: value.group_qr_code_uploaded_at }
      : {}),
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
    ...(isRecord(value.publisher) && typeof value.publisher.nickname === 'string'
      ? {
          publisher: {
            nickname: value.publisher.nickname,
            avatarUrl:
              typeof value.publisher.avatar_url === 'string' ? value.publisher.avatar_url : '',
          },
        }
      : {}),
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
function mapPublicActivityPage(raw: unknown): PublicActivityPage {
  const value = expectRecord(raw);
  if (!hasExactKeys(value, ['items', 'next_cursor', 'as_of'])) return invalidResponse();
  if (
    (value.next_cursor !== null &&
      (typeof value.next_cursor !== 'string' ||
        value.next_cursor.length < 1 ||
        value.next_cursor.length > 512)) ||
    typeof value.as_of !== 'string'
  )
    return invalidResponse();
  return {
    items: expectRecordArray(value.items).map((item) => mapActivity(item, true)),
    nextCursor: value.next_cursor,
    asOf: strictDateText(value.as_of),
  };
}
function mapRegistrationPage(raw: unknown) {
  const value = expectRecord(raw);
  if (!hasExactKeys(value, ['items', 'next_cursor'])) return invalidResponse();
  if (
    value.next_cursor !== null &&
    (typeof value.next_cursor !== 'string' ||
      value.next_cursor.length < 1 ||
      value.next_cursor.length > 512)
  )
    return invalidResponse();
  return {
    items: expectRecordArray(value.items).map(mapRegistration),
    nextCursor: value.next_cursor as string | null,
  };
}
function mapEditableActivity(raw: unknown, requireCloneDraft = false): EditableActivity {
  const value = expectRecord(raw);
  if (
    typeof value._id !== 'string' ||
    !value._id ||
    (value.version !== undefined && (!Number.isInteger(value.version) || value.version < 1)) ||
    typeof value.title !== 'string' ||
    !['draft', 'pending_review', 'rejected', 'published', 'finished'].includes(value.status) ||
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
  if (value.image_preview_urls !== undefined) {
    if (
      !Array.isArray(value.image_preview_urls) ||
      value.image_preview_urls.some(
        (url: unknown) => typeof url !== 'string' || (url !== '' && !httpsUrl(url)),
      )
    )
      return invalidResponse();
    mapped.imagePreviewUrls = value.image_preview_urls.map(httpsUrl);
  }
  if (value.cover_preview_url !== undefined) {
    if (
      typeof value.cover_preview_url !== 'string' ||
      (value.cover_preview_url !== '' && !httpsUrl(value.cover_preview_url))
    )
      return invalidResponse();
    mapped.coverPreviewUrl = httpsUrl(value.cover_preview_url);
  }
  if (value.group_qr_preview_url !== undefined) {
    if (
      typeof value.group_qr_preview_url !== 'string' ||
      (value.group_qr_preview_url !== '' && !httpsUrl(value.group_qr_preview_url))
    )
      return invalidResponse();
    mapped.groupQrPreviewUrl = httpsUrl(value.group_qr_preview_url);
  }
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
    (avatarId && !['wechat', 'custom'].includes(avatarSource)) ||
    (!avatarId && avatarSource !== undefined)
  )
    return invalidResponse();
  return {
    avatarRevision: Number.isInteger(value.avatar_revision) ? value.avatar_revision : 0,
    clubs: mapClubMemberships(value.club_memberships),
    avatarVisibility: value.avatar_visibility === 'public' ? 'public' : 'private',
    avatarVisibilityRevision: Number.isInteger(value.avatar_visibility_revision)
      ? Number(value.avatar_visibility_revision)
      : null,
    nickname: value.nickname,
    title: typeof value.title === 'string' ? value.title : '',
    avatarId,
    ...(avatarId ? { avatarSource: avatarSource as AvatarSource } : {}),
    hasCompletedGuidance: value.has_completed_guidance === true,
    // 本人资料完整回显；*_masked 仅作旧版云函数兼容，不再用于页面展示。
    realName: typeof value.real_name === 'string' ? value.real_name : '',
    phone: typeof value.phone === 'string' ? value.phone : '',
    gender: typeof value.gender === 'string' ? value.gender : '',
    emergencyName: typeof value.emergency_name === 'string' ? value.emergency_name : '',
    emergencyPhone: typeof value.emergency_phone === 'string' ? value.emergency_phone : '',
    photos: Array.isArray(value.photos)
      ? value.photos.filter(isRecord).map((photo) => ({
          id: String(photo.file_id || ''),
          category: String(photo.category || ''),
        }))
      : [],
    ...(Object.prototype.hasOwnProperty.call(value, 'background_photo')
      ? {
          backgroundPhoto:
            value.background_photo === null
              ? null
              : isRecord(value.background_photo) &&
                  typeof value.background_photo.file_id === 'string' &&
                  value.background_photo.file_id &&
                  ['ride', 'bike', 'other'].includes(String(value.background_photo.category))
                ? {
                    id: String(value.background_photo.file_id),
                    category: String(value.background_photo.category),
                  }
                : invalidResponse(),
        }
      : {}),
    completeness: value.completeness,
    missing: Array.isArray(value.missing)
      ? value.missing.filter((item): item is string => typeof item === 'string')
      : [],
    missingKeys: Array.isArray(value.missingKeys)
      ? value.missingKeys.filter((item): item is string => typeof item === 'string')
      : [],
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
  if (!hasExactKeys(value, ['generated_at', 'profile', 'backgrounds'])) return invalidResponse();
  const generatedAt = strictDateText(value.generated_at);
  const profile = expectRecord(value.profile);
  if (
    !hasExactKeys(profile, ['display_name', 'gender', 'avatar_url']) ||
    typeof profile.display_name !== 'string' ||
    typeof profile.gender !== 'string' ||
    (profile.avatar_url !== '' && !httpsUrl(profile.avatar_url))
  )
    return invalidResponse();

  if (!Array.isArray(value.backgrounds)) return invalidResponse();
  const backgrounds = value.backgrounds.map((item: unknown) => {
    const background = expectRecord(item);
    const url = httpsUrl(background.url);
    if (
      !hasExactKeys(background, ['file_id', 'url', 'source', 'category']) ||
      typeof background.file_id !== 'string' ||
      !background.file_id ||
      !url ||
      !['user_photo', 'avatar'].includes(background.source) ||
      typeof background.category !== 'string'
    )
      return invalidResponse();
    return {
      id: background.file_id,
      url,
      source: background.source as 'user_photo' | 'avatar',
      category: background.category,
    };
  });

  return {
    generatedAt,
    profile: {
      displayName: profile.display_name,
      gender: normalizeGender(profile.gender),
      avatarUrl: httpsUrl(profile.avatar_url),
    },
    backgrounds,
  };
}
function mapRegistration(raw: unknown): Registration {
  const value = expectRecord(raw);
  if (
    typeof value._id !== 'string' ||
    typeof value.activity_id !== 'string' ||
    !['waiting', 'pending', 'approved', 'checked_in', 'rejected', 'cancelled'].includes(
      value.status,
    )
  )
    return invalidResponse();
  const snapshot = isRecord(value.profile_snapshot) ? value.profile_snapshot : {};
  const options = isRecord(value.options) ? value.options : {};
  const capability = isRecord(value.capability_profile) ? value.capability_profile : {};
  const history = Array.isArray(value.review_history) ? value.review_history : [];
  const lastReview =
    history.length > 0 && isRecord(history[history.length - 1]) ? history[history.length - 1] : {};
  return {
    id: value._id,
    activityId: value.activity_id,
    ...(isRecord(value.activity) ? { activity: mapActivity(value.activity, true) } : {}),
    status: value.status,
    profile: {
      avatarRevision: 0,
      clubs: [],
      nickname:
        typeof capability.nickname === 'string'
          ? capability.nickname
          : typeof snapshot.nickname === 'string'
            ? snapshot.nickname
            : '',
      title: typeof capability.title === 'string' ? capability.title : '',
      // 本人报名凭证与审核后台展示完整实名与电话；*_masked 仅用于判断旧快照是否已填写。
      realName: typeof snapshot.real_name === 'string' ? snapshot.real_name : '',
      phone: typeof snapshot.phone === 'string' ? snapshot.phone : '',
      gender: normalizeGender(
        typeof capability.gender === 'string'
          ? capability.gender
          : typeof snapshot.gender === 'string'
            ? snapshot.gender
            : '',
      ),
      emergencyName: typeof snapshot.emergency_name === 'string' ? snapshot.emergency_name : '',
      emergencyPhone: typeof snapshot.emergency_phone === 'string' ? snapshot.emergency_phone : '',
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
        realName:
          (typeof snapshot.real_name === 'string' && !!snapshot.real_name) ||
          (typeof snapshot.real_name_masked === 'string' && !!snapshot.real_name_masked),
        phone:
          (typeof snapshot.phone === 'string' && !!snapshot.phone) ||
          (typeof snapshot.phone_masked === 'string' && !!snapshot.phone_masked),
        phoneVerified: capability.phone_verified === true,
        phoneSource: ['wechat', 'manual', 'legacy'].includes(String(capability.phone_source))
          ? (capability.phone_source as 'wechat' | 'manual' | 'legacy')
          : '',
        emergencyPhone:
          (typeof snapshot.emergency_phone === 'string' && !!snapshot.emergency_phone) ||
          (typeof snapshot.emergency_phone_masked === 'string' &&
            !!snapshot.emergency_phone_masked),
      },
    },
    gatheringMode:
      ({ self_drive: '自行前往', support_vehicle: '需要后援车' } as const)[
        options.gathering_mode as 'self_drive' | 'support_vehicle'
      ] || '',
    experience:
      ({ beginner: '新手', intermediate: '有一定经验', regular: '常骑' } as Record<string, string>)[
        options.experience
      ] || '',
    remark: typeof options.remark === 'string' ? options.remark : '',
    reviewComment: typeof lastReview.comment === 'string' ? lastReview.comment : undefined,
    serialNo: typeof value.serial_no === 'string' ? value.serial_no : undefined,
    checkedInAt: dateText(value.checked_in_at) || undefined,
    teamId: typeof value.team_id === 'string' ? value.team_id : undefined,
    teamName: typeof value.team_name === 'string' ? value.team_name : undefined,
    isTeamLeader: value.is_team_leader === true,
    updatedAt: dateText(value.updated_at),
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
  const activity = value;
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
    club_id: activity.clubId || null,
    title: typeof value.title === 'string' ? value.title : '',
    ...(Array.isArray(value.images) ? { images } : {}),
    cover_image: (typeof value.coverImage === 'string' ? value.coverImage : '') || images[0] || '',
    ...(typeof value.groupQrCode === 'string' ? { group_qr_code: value.groupQrCode } : {}),
    ...(typeof value.groupQrCodeUploadedAt === 'string'
      ? { group_qr_code_uploaded_at: value.groupQrCodeUploadedAt }
      : {}),
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
      ...(typeof value.route?.estimatedMovingTimeSeconds === 'number'
        ? { estimated_moving_time_seconds: value.route.estimatedMovingTimeSeconds }
        : {}),
      level: typeof value.route?.level === 'string' ? value.route.level : '',
      ...(typeof value.route?.gpxFileId === 'string' ? { gpx_file_id: value.route.gpxFileId } : {}),
      ...(typeof value.route?.gpxPreviewId === 'string'
        ? { gpx_preview_id: value.route.gpxPreviewId }
        : {}),
      ...(typeof value.route?.gpxSha256 === 'string' ? { gpx_sha256: value.route.gpxSha256 } : {}),
      ...(typeof value.route?.generatedPreviewFileId === 'string'
        ? { generated_preview_file_id: value.route.generatedPreviewFileId }
        : {}),
      ...(typeof value.route?.publicRoutePreviewId === 'string'
        ? { public_route_preview_id: value.route.publicRoutePreviewId }
        : {}),
      ...(value.route?.externalProvider === 'strava' ? { external_provider: 'strava' } : {}),
      ...(typeof value.route?.externalRouteId === 'string'
        ? { external_route_id: value.route.externalRouteId }
        : {}),
      ...(httpsUrl(value.route?.externalRouteUrl)
        ? { external_route_url: httpsUrl(value.route.externalRouteUrl) }
        : {}),
      ...(typeof value.route?.routeName === 'string' ? { route_name: value.route.routeName } : {}),
      ...(typeof value.route?.elevationLossM === 'number'
        ? { elevation_loss_m: value.route.elevationLossM }
        : {}),
      ...(typeof value.route?.elevationMinM === 'number'
        ? { elevation_min_m: value.route.elevationMinM }
        : {}),
      ...(typeof value.route?.elevationMaxM === 'number'
        ? { elevation_max_m: value.route.elevationMaxM }
        : {}),
      ...(value.route?.estimationSource === 'cili' ? { estimation_source: 'cili' } : {}),
      ...(Array.isArray(value.route?.routeOutline)
        ? {
            route_outline: value.route.routeOutline.map((point) => ({
              latitude: point.latitude,
              longitude: point.longitude,
            })),
          }
        : {}),
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
    ...(value.registrationUnlimited === true ? { registration_unlimited: true } : {}),
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
function mapJoinableClub(raw: unknown): JoinableClub {
  const value = expectRecord(raw);
  if (
    typeof value.id !== 'string' ||
    !/^club_[a-f0-9]{64}$/.test(value.id) ||
    typeof value.name !== 'string' ||
    !value.name.trim() ||
    typeof value.city !== 'string' ||
    typeof value.introduction !== 'string' ||
    typeof value.avatar_url !== 'string' ||
    typeof value.cover_url !== 'string' ||
    typeof value.capacity_initialized !== 'boolean' ||
    !Number.isInteger(value.member_count) ||
    value.member_count < 0 ||
    !Number.isInteger(value.max_members) ||
    value.max_members < Math.max(2, value.member_count) ||
    value.max_members > 10000 ||
    (value.avatar_url !== '' && !/^https:\/\//i.test(value.avatar_url)) ||
    (value.cover_url !== '' && !/^https:\/\//i.test(value.cover_url))
  )
    return invalidResponse();
  return {
    id: value.id,
    name: value.name,
    city: value.city,
    introduction: value.introduction,
    avatarUrl: value.avatar_url,
    coverUrl: value.cover_url,
    avatarInitial: Array.from(value.name.trim())[0] || '俱',
    capacityInitialized: value.capacity_initialized,
    memberCount: value.member_count,
    maxMembers: value.max_members,
  };
}

function mapClubDetail(raw: unknown): ClubDetail {
  const value = expectRecord(raw);
  const base = mapJoinableClub(value);
  if (
    !['public_apply', 'invite_code', 'admin_invite'].includes(value.join_mode) ||
    typeof value.role !== 'string' ||
    typeof value.role_label !== 'string' ||
    typeof value.can_manage !== 'boolean'
  )
    return invalidResponse();
  return {
    ...base,
    joinMode: value.join_mode,
    role: value.role,
    roleLabel: value.role_label,
    canManage: value.can_manage,
  };
}

function mapJoinedClubSummary(raw: unknown): JoinedClubSummary {
  const value = expectRecord(raw);
  if (typeof value.role !== 'string' || !value.role || value.status !== 'active')
    return invalidResponse();
  return { club: mapJoinableClub(value.club), role: value.role, status: 'active' };
}

function mapManagedClub(raw: unknown): ManagedClubProfile {
  const value = expectRecord(raw);
  if (
    typeof value.id !== 'string' ||
    !/^club_[a-f0-9]{64}$/.test(value.id) ||
    typeof value.name !== 'string' ||
    typeof value.city !== 'string' ||
    typeof value.introduction !== 'string' ||
    !['public_apply', 'invite_code', 'admin_invite'].includes(value.join_mode) ||
    typeof value.avatar_file_id !== 'string' ||
    typeof value.cover_file_id !== 'string' ||
    !Number.isInteger(value.member_count) ||
    value.member_count < 0 ||
    !Number.isInteger(value.max_members) ||
    value.max_members < Math.max(2, value.member_count) ||
    value.max_members > 10000 ||
    typeof value.avatar_url !== 'string' ||
    (value.avatar_url !== '' && !/^https:\/\//i.test(value.avatar_url)) ||
    typeof value.cover_url !== 'string' ||
    (value.cover_url !== '' && !/^https:\/\//i.test(value.cover_url))
  )
    return invalidResponse();
  return {
    id: value.id,
    name: value.name,
    city: value.city,
    introduction: value.introduction,
    joinMode: value.join_mode,
    avatarFileId: value.avatar_file_id,
    avatarUrl: value.avatar_url,
    coverFileId: value.cover_file_id,
    coverUrl: value.cover_url,
    memberCount: value.member_count,
    maxMembers: value.max_members,
    updatedAt: dateText(value.updated_at),
  };
}

function managedClubPayload(value: ManagedClubProfileInput) {
  return {
    name: value.name,
    city: value.city,
    introduction: value.introduction,
    join_mode: value.joinMode,
    avatar_file_id: value.avatarFileId,
    cover_file_id: value.coverFileId,
    max_members: value.maxMembers,
  };
}

function mapClubApplication(raw: unknown): ClubApplication {
  const value = expectRecord(raw);
  const status = value.status;
  const joinMode = value.join_mode;
  if (
    typeof value.id !== 'string' ||
    !['draft', 'pending_review', 'rejected', 'approved'].includes(status) ||
    !['public_apply', 'invite_code', 'admin_invite'].includes(joinMode) ||
    !Number.isInteger(value.review_version) ||
    !Number.isInteger(value.expected_size)
  )
    return invalidResponse();
  return {
    id: value.id,
    status,
    reviewVersion: value.review_version,
    clubName: typeof value.club_name === 'string' ? value.club_name : '',
    city: typeof value.city === 'string' ? value.city : '',
    introduction: typeof value.introduction === 'string' ? value.introduction : '',
    applicantContact: typeof value.applicant_contact === 'string' ? value.applicant_contact : '',
    joinMode,
    expectedSize: value.expected_size,
    activityTypes: typeof value.activity_types === 'string' ? value.activity_types : '',
    rulesSummary: typeof value.rules_summary === 'string' ? value.rules_summary : '',
    avatarFileId: typeof value.avatar_file_id === 'string' ? value.avatar_file_id : '',
    avatarUrl: typeof value.avatar_url === 'string' ? value.avatar_url : '',
    coverFileId: typeof value.cover_file_id === 'string' ? value.cover_file_id : '',
    coverUrl: typeof value.cover_url === 'string' ? value.cover_url : '',
    rejectionReason: typeof value.rejection_reason === 'string' ? value.rejection_reason : '',
    clubId: typeof value.club_id === 'string' ? value.club_id : '',
    ...(typeof value.applicant_openid === 'string'
      ? { applicantOpenid: value.applicant_openid }
      : {}),
    createdAt: dateText(value.created_at),
    updatedAt: dateText(value.updated_at),
    submittedAt: dateText(value.submitted_at),
    reviewedAt: dateText(value.reviewed_at),
  };
}
function clubApplicationPayload(value: ClubApplicationInput) {
  return {
    club_name: value.clubName,
    city: value.city,
    introduction: value.introduction,
    applicant_contact: value.applicantContact,
    join_mode: value.joinMode,
    expected_size: value.expectedSize,
    activity_types: value.activityTypes,
    rules_summary: value.rulesSummary,
    avatar_file_id: value.avatarFileId,
    cover_file_id: value.coverFileId,
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
  async listAdminActivitiesPage(input: ActivityAdminPageInput) {
    if (!Number.isInteger(input.pageSize) || input.pageSize < 1 || input.pageSize > 50)
      throw new CloudRepositoryError('VALIDATION_FAILED', '分页大小格式错误');
    if (
      input.cursor !== undefined &&
      (typeof input.cursor !== 'string' || !input.cursor || input.cursor.length > 512)
    )
      throw new CloudRepositoryError('VALIDATION_FAILED', '分页游标格式错误');
    const statusFilter = input.statusFilter || 'all';
    if (
      !['all', 'draft', 'pending_review', 'rejected', 'published', 'finished'].includes(
        statusFilter,
      )
    )
      throw new CloudRepositoryError('VALIDATION_FAILED', '活动状态筛选格式错误');
    const value = expectRecord(
      await this.call('activity-admin', {
        action: 'list',
        page_size: input.pageSize,
        ...(statusFilter === 'all' ? {} : { status_filter: statusFilter }),
        ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
      }),
    );
    if (
      !Object.prototype.hasOwnProperty.call(value, 'items') ||
      !Object.prototype.hasOwnProperty.call(value, 'next_cursor') ||
      (value.next_cursor !== null && (typeof value.next_cursor !== 'string' || !value.next_cursor))
    )
      return invalidResponse();
    return {
      items: expectRecordArray(value.items).map((item) => mapEditableActivity(item)),
      nextCursor: value.next_cursor as string | null,
    };
  }
  async getAdminActivity(id: string) {
    return mapEditableActivity(
      await this.call('activity-admin', {
        action: 'detail',
        activityId: requiredId(id, '活动 ID'),
      }),
    );
  }
  async saveActivity(
    value: ActivityInput,
    id?: string,
    expectedVersion?: number,
    createRequestId?: string,
    operationReason?: string,
  ) {
    const data: Record<string, unknown> = { action: 'save', activity: activityPayload(value) };
    if (id !== undefined) {
      if (createRequestId !== undefined)
        throw new CloudRepositoryError('VALIDATION_FAILED', '更新活动不能携带创建请求 ID');
      data.activityId = requiredId(id, '活动 ID');
      if (!Number.isInteger(expectedVersion) || Number(expectedVersion) < 0)
        throw new CloudRepositoryError('VALIDATION_FAILED', '活动版本格式错误');
      data.expectedVersion = expectedVersion;
    } else if (createRequestId !== undefined) {
      data.createRequestId = boundedId(createRequestId, '创建请求 ID', 8, 128);
    }
    if (operationReason !== undefined) data.operationReason = operationReason;
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
  async reviewActivity(
    id: string,
    decision: 'approve' | 'reject',
    expectedReviewVersion: number,
    requestId: string,
    reason?: string,
  ) {
    if (!['approve', 'reject'].includes(decision))
      throw new CloudRepositoryError('VALIDATION_FAILED', '审批决定无效');
    if (!Number.isInteger(expectedReviewVersion) || expectedReviewVersion < 1)
      throw new CloudRepositoryError('VALIDATION_FAILED', '审批版本格式错误');
    return mapEditableActivity(
      await this.call('activity-admin', {
        action: 'review',
        activityId: requiredId(id, '活动 ID'),
        decision,
        expectedReviewVersion,
        requestId: boundedId(requestId, '请求 ID', 8, 128),
        ...(reason === undefined ? {} : { reason }),
      }),
    );
  }
  async deleteActivity(id: string, reason: string) {
    // 服务端 delete 契约只信任调用者 OPENID 做权限校验，删除理由由页面显式采集。
    await this.call('activity-admin', {
      action: 'delete',
      id: requiredId(id, '活动 ID'),
      reason,
    });
  }
  async listActivities(filter?: ActivityListFilter) {
    const data: Record<string, unknown> = { action: 'list' };
    if (filter !== undefined) {
      if (!['upcoming', 'history'].includes(filter))
        throw new CloudRepositoryError('VALIDATION_FAILED', '活动筛选条件无效');
      data.filter = filter;
    }
    return expectRecordArray(await this.call('activity-read', data)).map((item) =>
      mapActivity(item, true),
    );
  }
  async listActivityPage(view: PublicActivityView, cursor?: string) {
    if (view !== 'future' && view !== 'history')
      throw new CloudRepositoryError('VALIDATION_FAILED', '活动视图无效');
    if (
      cursor !== undefined &&
      (typeof cursor !== 'string' || cursor.length < 1 || cursor.length > 512)
    )
      throw new CloudRepositoryError('VALIDATION_FAILED', '活动分页游标无效');
    const data: Record<string, unknown> = { action: 'listPage', view, page_size: 20 };
    if (cursor !== undefined) data.cursor = cursor;
    return mapPublicActivityPage(await this.call('activity-read', data));
  }
  async getActivity(id: string) {
    return mapActivity(
      await this.call('activity-read', { action: 'detail', activityId: requiredId(id, '活动 ID') }),
      true,
    );
  }
  async listRegistrations() {
    const items: Registration[] = [];
    const ids = new Set<string>();
    let cursor: string | undefined;
    for (let page = 0; page < 200; page += 1) {
      const value = mapRegistrationPage(
        await this.call('registration', {
          action: 'minePage',
          page_size: 50,
          ...(cursor ? { cursor } : {}),
        }),
      );
      for (const item of value.items) {
        if (ids.has(item.id)) return invalidResponse();
        ids.add(item.id);
        items.push(item);
      }
      if (value.nextCursor === null) return items;
      if (value.nextCursor === cursor) return invalidResponse();
      cursor = value.nextCursor;
    }
    return invalidResponse();
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
    const data: Record<string, unknown> = {
      action: 'submit',
      activityId: requiredId(value.activityId, '活动 ID'),
      options: submissionOptions(value),
    };
    const teamId = typeof value.teamId === 'string' ? value.teamId : '';
    const teamName = typeof value.teamName === 'string' ? value.teamName : '';
    if (teamId || teamName)
      data.team = {
        ...(teamId ? { team_id: teamId } : {}),
        ...(teamName ? { team_name: teamName } : {}),
      };
    return mapRegistration(await this.call('registration', data));
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
      .filter((item, index, values) => values.indexOf(item) === index)
      .slice(0, 3);
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
  async deleteRegistration(id: string): Promise<void> {
    const registrationId = requiredId(id, '报名 ID');
    await this.call('registration', { action: 'delete', registrationId });
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
  async enqueueActivityReminders(activityId: string) {
    const value = expectRecord(
      await this.call('admin-review', {
        action: 'enqueueReminders',
        activityId: requiredId(activityId, '活动 ID'),
      }),
    );
    for (const key of ['queued', 'duplicates', 'total'])
      if (!Number.isInteger(value[key]) || value[key] < 0) return invalidResponse();
    return { queued: value.queued, duplicates: value.duplicates, total: value.total };
  }
  async listReviewRegistrations(activityId: string, status?: AdminRegistrationStatusFilter) {
    const data: Record<string, unknown> = {
      action: 'list',
      activityId: requiredId(activityId, '活动 ID'),
    };
    if (status !== undefined) {
      if (
        !['waiting', 'pending', 'approved', 'checked_in', 'rejected', 'cancelled'].includes(status)
      )
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
  async getMyClubApplication() {
    const value = await this.call<unknown>('club-application', { action: 'mine' });
    return value === null ? null : mapClubApplication(value);
  }
  async listJoinableClubs() {
    return expectRecordArray(await this.call('club-application', { action: 'listJoinable' })).map(
      mapJoinableClub,
    );
  }
  async joinPublicClub(clubId: string, requestId: string) {
    return mapJoinedClubSummary(
      await this.call('club-application', {
        action: 'joinPublicClub',
        clubId: requiredId(clubId, '俱乐部 ID'),
        requestId: boundedId(requestId, '加入请求 ID', 8, 128),
      }),
    );
  }
  async getClubDetail(clubId: string) {
    return mapClubDetail(
      await this.call('club-application', {
        action: 'getClubDetail',
        clubId: requiredId(clubId, '俱乐部 ID'),
      }),
    );
  }
  async getManagedClub(clubId: string) {
    return mapManagedClub(
      await this.call('club-application', {
        action: 'getManagedClub',
        clubId: requiredId(clubId, '俱乐部 ID'),
      }),
    );
  }
  async updateManagedClub(
    clubId: string,
    value: ManagedClubProfileInput,
    requestId: string,
    expectedUpdatedAt: string,
  ) {
    return mapManagedClub(
      await this.call('club-application', {
        action: 'updateManagedClub',
        clubId: requiredId(clubId, '俱乐部 ID'),
        club: managedClubPayload(value),
        requestId: boundedId(requestId, '保存请求 ID', 8, 128),
        expectedUpdatedAt,
      }),
    );
  }
  async saveClubApplicationDraft(value: ClubApplicationInput) {
    return mapClubApplication(
      await this.call('club-application', {
        action: 'saveDraft',
        application: clubApplicationPayload(value),
      }),
    );
  }
  async submitClubApplication(value: ClubApplicationInput, requestId: string) {
    return mapClubApplication(
      await this.call('club-application', {
        action: 'submit',
        application: clubApplicationPayload(value),
        requestId: boundedId(requestId, '提交请求 ID', 8, 128),
      }),
    );
  }
  async withdrawClubApplication(requestId: string, expectedReviewVersion: number) {
    if (!Number.isInteger(expectedReviewVersion) || expectedReviewVersion < 1)
      throw new CloudRepositoryError('VERSION_CONFLICT', '申请版本已变化，请刷新后重试');
    return mapClubApplication(
      await this.call('club-application', {
        action: 'withdraw',
        requestId: boundedId(requestId, '撤回请求 ID', 8, 128),
        expectedReviewVersion,
      }),
    );
  }
  async listClubApplications(status: ClubApplicationStatus = 'pending_review') {
    if (!['pending_review', 'approved', 'rejected'].includes(status))
      throw new CloudRepositoryError('VALIDATION_FAILED', '申请状态筛选无效');
    return expectRecordArray(
      await this.call('club-application', { action: 'adminList', status }),
    ).map(mapClubApplication);
  }
  async getClubApplication(id: string) {
    return mapClubApplication(
      await this.call('club-application', {
        action: 'adminDetail',
        applicationId: requiredId(id, '申请 ID'),
      }),
    );
  }
  async reviewClubApplication(
    id: string,
    decision: 'approved' | 'rejected',
    reason: string,
    requestId: string,
  ) {
    if (decision !== 'approved' && decision !== 'rejected')
      throw new CloudRepositoryError('VALIDATION_FAILED', '审批操作无效');
    return mapClubApplication(
      await this.call('club-application', {
        action: 'review',
        applicationId: requiredId(id, '申请 ID'),
        decision,
        reason,
        requestId: boundedId(requestId, '审批请求 ID', 8, 128),
      }),
    );
  }
  async getProfile() {
    return mapProfile(await this.call('profile', { action: 'get' }));
  }
  async issueMediaUploadPath(
    category: UnifiedMediaCategory,
    requestId: string,
    extension: 'jpg' | 'png' | 'webp' = 'jpg',
  ) {
    const value = expectRecord(
      await this.call('profile', {
        action: 'mediaUploadPath',
        category,
        requestId: boundedId(requestId, '媒体请求 ID', 8, 128),
        extension,
      }),
    );
    if (
      typeof value.cloud_path !== 'string' ||
      !/^profiles\/[a-f0-9]{32}\/[a-z-]+\/[a-f0-9-]{36}\.(?:jpg|png|webp)$/i.test(
        value.cloud_path,
      ) ||
      value.category !== category
    )
      return invalidResponse();
    return value.cloud_path;
  }
  async finalizeMediaUpload(
    fileId: string,
    category: UnifiedMediaCategory,
    requestId: string,
    origin: ClientAvatarSource = 'custom',
  ) {
    const value = expectRecord(
      await this.call('profile', {
        action: 'registerMedia',
        fileId: requiredId(fileId, '媒体文件 ID'),
        category,
        requestId: boundedId(requestId, '媒体请求 ID', 8, 128),
        origin: clientMediaOrigin(origin),
      }),
    );
    if (
      value.registered !== true ||
      typeof value.canonicalFileId !== 'string' ||
      !value.canonicalFileId.startsWith('cloud://')
    )
      return invalidResponse();
    return { canonicalFileId: value.canonicalFileId };
  }
  async getPersonalCapabilityCard() {
    return mapPersonalCapabilityCard(await this.call('profile', { action: 'capabilityCard' }));
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
    if (Object.prototype.hasOwnProperty.call(profile, 'backgroundPhoto'))
      data.background_photo =
        profile.backgroundPhoto === null || profile.backgroundPhoto === undefined
          ? null
          : {
              file_id: profile.backgroundPhoto.id,
              category: profile.backgroundPhoto.category,
            };
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
  async previewPublicStravaRoute(routeUrl: string): Promise<PublicRoutePreview> {
    if (typeof routeUrl !== 'string' || routeUrl.length > 256)
      throw new CloudRepositoryError('VALIDATION_FAILED', '公开路线链接无效');
    return mapPublicRoutePreview(
      await this.call('activity-admin', { action: 'previewPublicRoute', routeUrl }),
    );
  }
  async previewRouteGpx(input: RouteGpxPreviewInput): Promise<RouteGpxPreview> {
    if (
      !input ||
      typeof input !== 'object' ||
      typeof input.gpxSha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(input.gpxSha256) ||
      typeof input.gpxFileId !== 'string' ||
      !new RegExp(`^cloud://[^/]+/activity-routes/[^/]+/${input.gpxSha256}\\.gpx$`).test(
        input.gpxFileId,
      ) ||
      typeof input.fileName !== 'string' ||
      input.fileName.length < 5 ||
      input.fileName.length > 120 ||
      !/^[^/\\\0]+\.gpx$/i.test(input.fileName) ||
      typeof input.requestId !== 'string' ||
      !/^[A-Za-z0-9_-]{8,128}$/.test(input.requestId)
    )
      throw new CloudRepositoryError('VALIDATION_FAILED', '路线文件参数无效');
    return mapRouteGpxPreview(
      await this.call('activity-admin', {
        action: 'previewRouteGpx',
        gpxFileId: input.gpxFileId,
        gpxSha256: input.gpxSha256,
        fileName: input.fileName,
        requestId: input.requestId,
      }),
    );
  }
  async bindRoutePreviewImage(
    previewId: string,
    generatedPreviewFileId: string,
  ): Promise<RouteGpxPreview> {
    if (
      typeof previewId !== 'string' ||
      !/^[a-f0-9]{64}$/.test(previewId) ||
      typeof generatedPreviewFileId !== 'string' ||
      !/^cloud:\/\/[^/]+\/profile-canonical\/[a-f0-9]{32}\/activity-route-preview\/[a-f0-9]{64}\/[a-f0-9]{64}\.png$/i.test(
        generatedPreviewFileId,
      )
    )
      throw new CloudRepositoryError('VALIDATION_FAILED', '路线图参数无效');
    return mapRouteGpxPreview(
      await this.call('activity-admin', {
        action: 'bindRoutePreviewImage',
        previewId,
        generatedPreviewFileId,
      }),
    );
  }
  async downloadRouteGpx(activityId: string): Promise<RouteGpxDownload> {
    return mapRouteGpx(
      await this.call('activity-read', {
        action: 'downloadRouteGpx',
        activityId: boundedId(activityId, '活动 ID', 1, 128),
      }),
    );
  }
}
