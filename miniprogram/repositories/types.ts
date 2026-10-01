import type {
  Activity,
  ClientAvatarSource,
  EditableActivity,
  PersonalCapabilityCard,
  Profile,
  ProfileUpdate,
  Registration,
  RegistrationStatus,
  StravaConnection,
  StravaReadiness,
  StravaRouteGpx,
  StravaRoutePreview,
} from '../models';

export type AdminRegistrationStatusFilter = RegistrationStatus;
export type ActivityInput = Omit<EditableActivity, 'id' | 'date' | 'occupiedCount' | 'version'>;
export interface CloneActivityInput {
  sourceActivityId: string;
  requestId: string;
  signupDeadline?: string;
  eventStart?: string;
  eventEnd?: string;
}
export interface ActivityAdminRepository {
  listAdminActivities(): Promise<EditableActivity[]>;
  getAdminActivity(id: string): Promise<EditableActivity | undefined>;
  saveActivity(
    value: ActivityInput,
    id?: string,
    expectedVersion?: number,
  ): Promise<EditableActivity>;
  cloneActivity(input: CloneActivityInput): Promise<EditableActivity>;
}
export type GatheringMode = 'self_drive' | 'support_vehicle';
export interface RegistrationSubmission {
  activityId: string;
  gatheringMode: GatheringMode;
  experience: string;
  remark?: string;
  teamId?: string;
  teamName?: string;
  [key: string]: unknown;
}
export interface AdminReviewRepository {
  listReviewRegistrations(
    activityId: string,
    status?: AdminRegistrationStatusFilter,
  ): Promise<Registration[]>;
  getReviewRegistration(id: string): Promise<Registration | undefined>;
  checkInRegistration(id: string): Promise<Registration>;
  enqueueActivityReminders(activityId: string): Promise<{
    queued: number;
    duplicates: number;
    total: number;
  }>;
}
export interface RideRepository extends AdminReviewRepository, ActivityAdminRepository {
  listActivities(): Promise<Activity[]>;
  getActivity(id: string): Promise<Activity | undefined>;
  listRegistrations(): Promise<Registration[]>;
  getRegistration(id: string): Promise<Registration | undefined>;
  saveRegistration(value: RegistrationSubmission): Promise<Registration>;
  getReviewNotificationTemplateIds(): Promise<string[]>;
  requestReviewNotificationSubscription(templateIds: string[]): Promise<void>;
  updateRegistration(
    id: string,
    status: RegistrationStatus,
    comment?: string,
  ): Promise<Registration>;
  cancelRegistration(id: string): Promise<Registration>;
  reviewRegistration(
    id: string,
    decision: 'approved' | 'rejected',
    reason?: string,
  ): Promise<Registration>;
  getProfile(): Promise<Profile>;
  getProfileMediaUploadPath(): Promise<string>;
  getPersonalCapabilityCard(): Promise<PersonalCapabilityCard>;
  registerProfileMedia(
    fileId: string,
    category: 'ride' | 'bike' | 'other',
    origin?: ClientAvatarSource,
  ): Promise<void>;
  reportProfileMediaOrphan(
    fileId: string,
    category: 'ride' | 'bike' | 'other',
    origin?: ClientAvatarSource,
  ): Promise<void>;
  setAvatar(source: ClientAvatarSource, fileId: string): Promise<Profile>;
  importStravaAvatar(): Promise<Profile>;
  updateProfile(profile: ProfileUpdate): Promise<Profile>;
  getPhoneNumber(code: string): Promise<Profile>;
  getStravaStatus(): Promise<StravaConnection>;
  getStravaReadiness(): Promise<StravaReadiness>;
  ensureStravaReady(): Promise<StravaReadiness>;
  startStrava(): Promise<{ authorizationUrl: string; expiresAt: string }>;
  cancelStravaAuthorization(): Promise<void>;
  syncStrava(): Promise<StravaConnection>;
  previewStravaRoute(routeUrl: string): Promise<StravaRoutePreview>;
  getStravaRouteGpx(activityId: string, routeId: string): Promise<StravaRouteGpx>;
  exportActivityGpx(activityId: string): Promise<{ base64: string; fileName: string }>;
  disconnectStrava(): Promise<void>;
}
