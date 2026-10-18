import type {
  Activity,
  ClientAvatarSource,
  ClubApplication,
  ClubApplicationInput,
  ClubApplicationStatus,
  ClubDetail,
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
  RouteGpxDownload,
  RouteGpxPreview,
  RouteGpxPreviewInput,
} from '../models';

export type AdminRegistrationStatusFilter = RegistrationStatus;
export type ActivityListFilter = 'upcoming' | 'history';
export type PublicActivityView = 'future' | 'history';
export type UnifiedMediaCategory =
  | 'profile-avatar'
  | 'profile-background'
  | 'activity-image'
  | 'activity-group-qr'
  | 'activity-route-preview'
  | 'club-avatar'
  | 'club-cover';
export interface PublicActivityPage {
  items: Activity[];
  nextCursor: string | null;
  asOf: string;
}
export type ActivityInput = Omit<EditableActivity, 'id' | 'date' | 'occupiedCount' | 'version'>;
export type ActivityAdminStatusFilter =
  'all' | 'draft' | 'pending_review' | 'rejected' | 'published' | 'finished';
export interface ActivityAdminPageInput {
  pageSize: number;
  cursor?: string;
  statusFilter?: ActivityAdminStatusFilter;
}
export interface ActivityAdminPage {
  items: EditableActivity[];
  nextCursor: string | null;
}
export interface CloneActivityInput {
  sourceActivityId: string;
  requestId: string;
  signupDeadline?: string;
  eventStart?: string;
  eventEnd?: string;
}
export interface ActivityAdminRepository {
  listAdminActivities(): Promise<EditableActivity[]>;
  listAdminActivitiesPage(input: ActivityAdminPageInput): Promise<ActivityAdminPage>;
  getAdminActivity(id: string): Promise<EditableActivity | undefined>;
  saveActivity(
    value: ActivityInput,
    id?: string,
    expectedVersion?: number,
    createRequestId?: string,
    operationReason?: string,
  ): Promise<EditableActivity>;
  cloneActivity(input: CloneActivityInput): Promise<EditableActivity>;
  reviewActivity(
    id: string,
    decision: 'approve' | 'reject',
    expectedReviewVersion: number,
    requestId: string,
    reason?: string,
  ): Promise<EditableActivity>;
  deleteActivity(id: string, reason: string): Promise<void>;
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
export interface ClubApplicationRepository {
  getMyClubApplication(): Promise<ClubApplication | null>;
  listJoinableClubs(): Promise<JoinableClub[]>;
  joinPublicClub(clubId: string, requestId: string): Promise<JoinedClubSummary>;
  getClubDetail(clubId: string): Promise<ClubDetail>;
  getManagedClub(clubId: string): Promise<ManagedClubProfile>;
  updateManagedClub(
    clubId: string,
    value: ManagedClubProfileInput,
    requestId: string,
    expectedUpdatedAt: string,
  ): Promise<ManagedClubProfile>;
  saveClubApplicationDraft(value: ClubApplicationInput): Promise<ClubApplication>;
  submitClubApplication(value: ClubApplicationInput, requestId: string): Promise<ClubApplication>;
  listClubApplications(status?: ClubApplicationStatus): Promise<ClubApplication[]>;
  getClubApplication(id: string): Promise<ClubApplication>;
  reviewClubApplication(
    id: string,
    decision: 'approved' | 'rejected',
    reason: string,
    requestId: string,
  ): Promise<ClubApplication>;
}
export interface RideRepository
  extends AdminReviewRepository, ActivityAdminRepository, ClubApplicationRepository {
  listActivities(filter?: ActivityListFilter): Promise<Activity[]>;
  listActivityPage(view: PublicActivityView, cursor?: string): Promise<PublicActivityPage>;
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
  deleteRegistration(id: string): Promise<void>;
  reviewRegistration(
    id: string,
    decision: 'approved' | 'rejected',
    reason?: string,
  ): Promise<Registration>;
  getProfile(): Promise<Profile>;
  issueMediaUploadPath(
    category: UnifiedMediaCategory,
    requestId: string,
    extension?: 'jpg' | 'png' | 'webp',
  ): Promise<string>;
  finalizeMediaUpload(
    fileId: string,
    category: UnifiedMediaCategory,
    requestId: string,
    origin?: ClientAvatarSource,
  ): Promise<{ canonicalFileId: string }>;
  getPersonalCapabilityCard(): Promise<PersonalCapabilityCard>;
  setAvatar(source: ClientAvatarSource, fileId: string): Promise<Profile>;
  updateProfile(profile: ProfileUpdate): Promise<Profile>;
  getPhoneNumber(code: string): Promise<Profile>;
  previewPublicStravaRoute(routeUrl: string): Promise<PublicRoutePreview>;
  previewRouteGpx(input: RouteGpxPreviewInput): Promise<RouteGpxPreview>;
  bindRoutePreviewImage(
    previewId: string,
    generatedPreviewFileId: string,
  ): Promise<RouteGpxPreview>;
  downloadRouteGpx(activityId: string): Promise<RouteGpxDownload>;
}
