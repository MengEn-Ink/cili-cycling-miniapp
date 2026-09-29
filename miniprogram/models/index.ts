export type Role = 'member' | 'admin';
export type RegistrationStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export type StravaStatus = 'pending' | 'connected' | 'exempted' | 'syncing' | 'failed';
export type ActivityRegistrationState = 'open' | 'closed';
export type ActivityClosedReason = 'finished' | 'deadline' | 'full' | 'unavailable';
export type AvatarSource = 'wechat' | 'strava';
export interface Activity {
  id: string;
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
  coverImage?: string;
  route: {
    start: string;
    end: string;
    distanceKm: number;
    elevationM: number;
    level: string;
    gpxFileId?: string;
  };
  schedule: { time: string; title: string; location: string; remark?: string }[];
  notices: string[];
  equipment: string[];
  fee: string;
  feeIncluded?: string[];
  feeExcluded?: string[];
  registrationState?: ActivityRegistrationState;
  closedReason?: ActivityClosedReason | null;
  serverNow?: string;
}
export interface Profile {
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
  avatarFileId?: string;
  avatarSource?: AvatarSource;
  hasCompletedGuidance?: boolean;
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
  updatedAt: string;
}
