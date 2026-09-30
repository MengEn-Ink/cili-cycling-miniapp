export type Role = 'member' | 'admin';
export type RegistrationStatus = 'pending' | 'approved' | 'checked_in' | 'rejected' | 'cancelled';
export type StravaStatus = 'pending' | 'connected' | 'exempted' | 'syncing' | 'failed';
export type ActivityRegistrationState = 'open' | 'closed';
export type ActivityClosedReason = 'finished' | 'deadline' | 'full' | 'incomplete' | 'unavailable';
export interface ActivityLocation {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
}
export interface RouteElevationPoint {
  distanceKm: number;
  elevationM: number;
}
export interface RouteBounds {
  south: number;
  west: number;
  north: number;
  east: number;
}
export interface PopularClimb {
  id: string;
  name: string;
  distanceKm: number;
  elevationGainM: number;
  averageGrade: number;
  maxGrade: number;
  climbCategory: number;
  popularity: number;
  popularityLabel: string;
}
export interface StravaRoutePreview {
  stravaRouteId: string;
  stravaRouteUrl: string;
  distanceKm: number;
  elevationM: number;
  elevationProfile: RouteElevationPoint[];
  routeBounds: RouteBounds;
  popularClimbs: PopularClimb[];
}
export interface StravaRouteGpx {
  base64: string;
  filename: string;
  contentType: 'application/gpx+xml';
}
export interface ActivityAttendee {
  id: string;
  displayName: string;
  title: string;
  avatarUrl: string;
  status: 'approved' | 'checked_in';
  card: {
    rides90d: number | null;
    longestKm: number | null;
    elevationM: number | null;
    speedKmh: number | null;
  };
}
export interface Activity {
  id: string;
  version: number;
  title: string;
  date: string;
  startAt: string;
  endAt: string;
  deadline: string;
  status: 'draft' | 'published' | 'finished';
  capacity: number;
  supportVehicleCapacity?: number;
  selfDriveCapacity?: number;
  supportVehicleRemaining?: number;
  selfDriveRemaining?: number;
  supportVehicleDriver?: {
    nickname: string;
    licensePlate: string;
    contactPhone: string;
  };
  occupiedCount?: number;
  description: string;
  images?: string[];
  coverImage?: string;
  route: {
    start: string;
    end: string;
    startLocation?: ActivityLocation;
    endLocation?: ActivityLocation;
    distanceKm: number;
    elevationM: number;
    level: string;
    gpxFileId?: string;
    stravaRouteId?: string;
    stravaRouteUrl?: string;
    elevationProfile?: RouteElevationPoint[];
    routeBounds?: RouteBounds;
    popularClimbs?: PopularClimb[];
  };
  schedule: { time: string; title: string; location: string; remark?: string }[];
  notices: string[];
  equipment: string[];
  fee: string;
  feeIncluded?: string[];
  feeExcluded?: string[];
  registrationState?: ActivityRegistrationState;
  closedReason?: ActivityClosedReason | null;
  registrationSetupPending?: boolean;
  serverNow?: string;
  attendees?: ActivityAttendee[];
}
export type AvatarSource = 'wechat' | 'strava' | 'custom';
export type AvatarVisibility = 'public' | 'private';
export type ClientAvatarSource = Exclude<AvatarSource, 'strava'>;
export type EditableActivity = Omit<
  Activity,
  'date' | 'startAt' | 'endAt' | 'deadline' | 'capacity' | 'fee'
> & {
  date?: string;
  startAt?: string;
  endAt?: string;
  deadline?: string;
  capacity?: number;
  fee?: string;
};
export interface Profile {
  avatarRevision: number;
  avatarVisibility?: AvatarVisibility;
  avatarVisibilityRevision?: number | null;
  nickname: string;
  title: string;
  realName: string;
  phone: string;
  gender: string;
  emergencyName: string;
  emergencyPhone: string;
  photos: { id: string; category: string }[];
  avatarId?: string;
  avatarSource?: AvatarSource;
  hasCompletedGuidance?: boolean;
  completeness?: number;
  sensitiveStatus?: {
    realName: boolean;
    phone: boolean;
    phoneVerified?: boolean;
    phoneSource?: 'wechat' | 'manual' | 'legacy' | '';
    emergencyPhone: boolean;
  };
}
export interface ProfileUpdate {
  nickname?: string;
  gender?: string;
  emergencyName?: string;
  hasCompletedGuidance?: boolean;
  avatarVisibility?: AvatarVisibility;
  photos?: { id: string; category: string }[];
  realName?: string;
  phone?: string;
  emergencyPhone?: string;
}
export type StravaReadinessState = 'disconnected' | 'authorizing' | 'syncing' | 'ready' | 'failed';
export interface StravaCoverage {
  from: string;
  to: string;
  complete: boolean;
}
export interface StravaSnapshot {
  totalKm: number | null;
  rides90d: number | null;
  longestKm: number | null;
  elevationM: number | null;
  speedKmh: number | null;
  latestActivityAt: string | null;
  syncedAt: string;
  coverage: StravaCoverage | null;
}
export interface StravaReadiness {
  state: StravaReadinessState;
  canRegister: boolean;
  avatarAvailable: boolean;
  athleteName: string | null;
  snapshot: StravaSnapshot | null;
  error: null | { code: string; message: string; retryable: boolean };
}
export type PersonalCapabilityCardState =
  'ready' | 'partial' | 'syncing' | 'failed' | 'disconnected';
export interface PersonalCapabilityCardBackground {
  url: string;
  source: 'user_photo' | 'avatar';
  category: string;
}
export interface PersonalCapabilityCardSummary {
  totalKm90d: number | null;
  rides90d: number | null;
  longestKm: number | null;
  elevationM90d: number | null;
  weightedAvgSpeedKmh: number | null;
}
export interface PersonalCapabilityCard {
  state: PersonalCapabilityCardState;
  generatedAt: string;
  profile: { displayName: string; title: string; avatarUrl?: string };
  backgrounds: PersonalCapabilityCardBackground[];
  summary: PersonalCapabilityCardSummary;
  coverage: StravaCoverage | null;
  syncedAt: string | null;
  needsStravaReauth?: boolean;
}
export interface StravaConnection {
  connected: boolean;
  athleteName?: string;
  snapshot?: StravaSnapshot;
}
export interface Registration {
  id: string;
  activityId: string;
  status: RegistrationStatus;
  profile: Profile;
  gatheringMode: '自驾' | '需要后援车' | '';
  experience: string;
  remark: string;
  strava: {
    status: StravaStatus;
    reason?: string;
    years: number | null;
    totalKm?: number | null;
    rides90d: number | null;
    longestKm: number | null;
    elevationM: number | null;
    speedKmh: number | null;
    latestActivityAt?: string | null;
    syncedAt?: string;
    coverage?: StravaCoverage | null;
  };
  reviewComment?: string;
  serialNo?: string;
  checkedInAt?: string;
  updatedAt: string;
}
