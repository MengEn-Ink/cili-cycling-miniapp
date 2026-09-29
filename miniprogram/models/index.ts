export type Role = 'member' | 'admin';
export type RegistrationStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export type StravaStatus = 'pending' | 'connected' | 'exempted';
export interface Activity {
  id: string;
  title: string;
  date: string;
  startAt: string;
  endAt: string;
  deadline: string;
  status: 'draft' | 'published' | 'finished';
  capacity: number;
  occupiedCount?: number;
  description: string;
  route: { start: string; end: string; distanceKm: number; elevationM: number; level: string };
  schedule: { time: string; title: string; location: string }[];
  notices: string[];
  equipment: string[];
  fee: string;
}
export interface Profile {
  nickname: string;
  title: string;
  realName: string;
  phone: string;
  idType: string;
  idNumber: string;
  gender: string;
  emergencyName: string;
  emergencyPhone: string;
  photos: { id: string; category: string }[];
  completeness?: number;
  sensitiveStatus?: {
    realName: boolean;
    idNumber: boolean;
    phone: boolean;
    phoneVerified?: boolean;
    phoneSource?: 'wechat' | 'manual' | 'legacy' | '';
    emergencyPhone: boolean;
  };
}
export interface ProfileUpdate {
  nickname?: string;
  idType?: string;
  gender?: string;
  emergencyName?: string;
  avatarFileId?: string;
  photos?: { id: string; category: string }[];
  realName?: string;
  idNumber?: string;
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
  bikeMode: string;
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
