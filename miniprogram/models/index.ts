export type Role = 'member' | 'admin';
export type RegistrationStatus =
  'waiting' | 'pending' | 'approved' | 'checked_in' | 'rejected' | 'cancelled';
export type ActivityRegistrationState = 'open' | 'closed';
export type ActivityClosedReason = 'finished' | 'deadline' | 'full' | 'incomplete' | 'unavailable';
export interface ClubIdentity {
  clubId?: string;
  name: string;
  avatarUrl: string;
}
export interface ClubMembershipSummary {
  clubId: string;
  name: string;
  avatarUrl: string;
  role: string;
  roleLabel: string;
}
export interface JoinableClub {
  id: string;
  name: string;
  city: string;
  introduction: string;
  avatarUrl: string;
  coverUrl: string;
  avatarInitial: string;
  capacityInitialized: boolean;
  memberCount: number;
  maxMembers: number;
}
export interface ClubDetail extends JoinableClub {
  joinMode: ClubJoinMode;
  role: string;
  roleLabel: string;
  canManage: boolean;
}
export interface JoinedClubSummary {
  club: JoinableClub;
  role: string;
  status: 'active';
}
export interface ManagedClubProfile {
  id: string;
  name: string;
  city: string;
  introduction: string;
  joinMode: ClubJoinMode;
  avatarFileId: string;
  avatarUrl: string;
  coverFileId: string;
  coverUrl: string;
  memberCount: number;
  maxMembers: number;
  updatedAt: string;
}
export interface ManagedClubProfileInput {
  name: string;
  city: string;
  introduction: string;
  joinMode: ClubJoinMode;
  avatarFileId: string;
  coverFileId: string;
  maxMembers: number;
}
// 单俱乐部裁决：全平台至多一个俱乐部，仅平台管理员空库 bootstrap 或编辑资料。
export interface SoleClubProfile {
  id: string;
  name: string;
  city: string;
  introduction: string;
  avatarFileId: string;
  avatarUrl: string;
  coverFileId: string;
  coverUrl: string;
  updatedAt: string;
}
export interface SoleClubProfileInput {
  name: string;
  city: string;
  introduction: string;
  avatarFileId: string;
  coverFileId: string;
}
export type SoleClubSnapshot = { exists: false } | { exists: true; club: SoleClubProfile };
// 用户端唯一俱乐部主页仅包含公开资料和当前访问者身份。
export interface SoleClubHome {
  id: string;
  name: string;
  city: string;
  introduction: string;
  avatarUrl: string;
  coverUrl: string;
  role: string;
  roleLabel: string;
  canManage: boolean;
}
export type SoleClubHomeSnapshot = { exists: false } | { exists: true; club: SoleClubHome };
export type ClubApplicationStatus = 'draft' | 'pending_review' | 'rejected' | 'approved';
export type ClubJoinMode = 'public_apply' | 'invite_code' | 'admin_invite';
export interface ClubApplicationInput {
  clubName: string;
  city: string;
  introduction: string;
  applicantContact: string;
  joinMode: ClubJoinMode;
  expectedSize: number;
  activityTypes: string;
  rulesSummary: string;
  avatarFileId: string;
  coverFileId: string;
}
export interface ClubApplication extends ClubApplicationInput {
  id: string;
  avatarUrl: string;
  coverUrl: string;
  status: ClubApplicationStatus;
  reviewVersion: number;
  rejectionReason: string;
  clubId: string;
  applicantOpenid?: string;
  createdAt: string;
  updatedAt: string;
  submittedAt: string;
  reviewedAt: string;
}
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
  tempFileURL: string;
  fileName: string;
  contentType: 'application/gpx+xml';
  gpxMd5: string;
}
export interface ActivityAttendee {
  id: string;
  displayName: string;
  gender: string;
  avatarUrl: string;
  backgroundUrl: string;
  isSelf?: boolean;
  status: 'approved' | 'checked_in';
}
export interface ActivityPublisher {
  nickname: string;
  avatarUrl: string;
}
export type ActivityStatus = 'draft' | 'pending_review' | 'rejected' | 'published' | 'finished';
export interface Activity {
  id: string;
  version: number;
  clubId?: string;
  clubIdentity?: ClubIdentity;
  title: string;
  date: string;
  startAt: string;
  endAt: string;
  deadline: string;
  status: ActivityStatus;
  reviewVersion?: number;
  approvalMode?: 'club_review' | 'role_auto_publish';
  approvedRole?: string;
  rejectionReason?: string;
  capacity: number;
  registrationMode?: 'open' | 'approval';
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
  // 服务端按上传时间戳判断群二维码是否可能过期；缺字段/旧数据时为 false，客户端不自行推断。
  groupQrMayBeExpired?: boolean;
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
  imagePreviewUrls?: string[];
  coverPreviewUrl?: string;
  groupQrPreviewUrl?: string;
};
export interface ProfilePhoto {
  id: string;
  category: string;
}
export interface Profile {
  generation?: number;
  avatarRevision: number;
  clubs: ClubMembershipSummary[];
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
  generation?: number;
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
export type MediaSecurityStatus = 'missing' | 'pending' | 'retryable' | 'pass' | 'review' | 'risky';
export interface MediaCheckStatus {
  mediaId: string;
  fileId: string;
  canonicalFileId: string;
  category: string;
  generation: number;
  securityStatus: MediaSecurityStatus;
  traceId: string;
  retryable: boolean;
  activated: boolean;
  attempts?: number;
  errorCode?: string;
}
export interface PersonalCapabilityCardBackground {
  id?: string;
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
