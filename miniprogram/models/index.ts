export type Role = 'member' | 'admin';
export type RegistrationStatus =
  'waiting' | 'pending' | 'approved' | 'checked_in' | 'rejected' | 'cancelled';
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
export interface RouteCoordinate {
  latitude: number;
  longitude: number;
}
export interface PublicRoutePreview {
  previewId: string;
  externalProvider: 'strava';
  externalRouteId: string;
  externalRouteUrl: string;
  routeName: string;
  distanceKm: number;
  elevationM: number;
  elevationLossM: number;
  elevationMinM: number;
  elevationMaxM: number;
  estimatedMovingTimeSeconds: number;
  estimationSource: 'cili';
  elevationProfile: RouteElevationPoint[];
  routeOutline: RouteCoordinate[];
  routeBounds: RouteBounds;
  expiresAt: string;
}
export interface RouteGpxPreviewInput {
  gpxFileId: string;
  gpxSha256: string;
  fileName: string;
  requestId: string;
}
export interface RouteGpxPreview {
  previewId: string;
  gpxFileId: string;
  gpxSha256: string;
  generatedPreviewFileId?: string;
  routeName: string;
  distanceKm: number;
  elevationM: number;
  elevationLossM: number;
  elevationMinM: number;
  elevationMaxM: number;
  estimatedMovingTimeSeconds: number;
  estimationSource: 'cili';
  elevationProfile: RouteElevationPoint[];
  routeOutline: RouteCoordinate[];
  routeBounds: RouteBounds;
  expiresAt: string;
}
export interface RouteGpxDownload {
  base64: string;
  fileName: string;
}
export interface ActivityAttendee {
  id: string;
  displayName: string;
  gender: string;
  avatarUrl: string;
  status: 'approved' | 'checked_in';
}
export interface ActivityPublisher {
  nickname: string;
  avatarUrl: string;
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
  registrationUnlimited?: boolean;
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
  approvedRegistrationCount?: number;
  description: string;
  images?: string[];
  coverImage?: string;
  groupQrCode?: string;
  groupQrCodeUploadedAt?: string;
  route: {
    start: string;
    end: string;
    startLocation?: ActivityLocation;
    endLocation?: ActivityLocation;
    distanceKm: number;
    elevationM: number;
    estimatedMovingTimeSeconds?: number;
    level: string;
    gpxFileId?: string;
    gpxPreviewId?: string;
    gpxSha256?: string;
    generatedPreviewFileId?: string;
    generatedPreviewUrl?: string;
    elevationLossM?: number;
    elevationMinM?: number;
    elevationMaxM?: number;
    estimationSource?: 'cili';
    routeOutline?: RouteCoordinate[];
    externalProvider?: 'strava';
    publicRoutePreviewId?: string;
    externalRouteId?: string;
    externalRouteUrl?: string;
    stravaRouteId?: string;
    stravaRouteUrl?: string;
    routeName?: string;
    elevationProfile?: RouteElevationPoint[];
    routeBounds?: RouteBounds;
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
  waitlistOnly?: boolean;
  serverNow?: string;
  attendees?: ActivityAttendee[];
  publisher?: ActivityPublisher;
}
export type AvatarSource = 'wechat' | 'custom';
export type AvatarVisibility = 'public' | 'private';
export type ClientAvatarSource = AvatarSource;
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
export interface ProfilePhoto {
  id: string;
  category: string;
}
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
  photos: ProfilePhoto[];
  backgroundPhoto?: ProfilePhoto | null;
  avatarId?: string;
  avatarSource?: AvatarSource;
  hasCompletedGuidance?: boolean;
  completeness?: number;
  missing?: string[];
  missingKeys?: string[];
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
  photos?: ProfilePhoto[];
  backgroundPhoto?: ProfilePhoto | null;
  realName?: string;
  phone?: string;
  emergencyPhone?: string;
}
export interface PersonalCapabilityCardBackground {
  url: string;
  source: 'user_photo' | 'avatar';
  category: string;
}
export interface PersonalCapabilityCard {
  generatedAt: string;
  profile: { displayName: string; gender: string; avatarUrl?: string };
  backgrounds: PersonalCapabilityCardBackground[];
}
export interface Registration {
  id: string;
  activityId: string;
  activity?: Activity;
  status: RegistrationStatus;
  profile: Profile;
  gatheringMode: '自行前往' | '需要后援车' | '';
  experience: string;
  remark: string;
  reviewComment?: string;
  serialNo?: string;
  checkedInAt?: string;
  teamId?: string;
  teamName?: string;
  isTeamLeader?: boolean;
  updatedAt: string;
}
