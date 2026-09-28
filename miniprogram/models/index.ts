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
    years: number;
    rides90d: number;
    longestKm: number;
    elevationM: number;
    speedKmh: number;
  };
  reviewComment?: string;
  serialNo?: string;
  updatedAt: string;
}
