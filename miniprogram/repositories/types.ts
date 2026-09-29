import type {
  Activity,
  PersonalCapabilityCard,
  Profile,
  ProfileUpdate,
  Registration,
  RegistrationStatus,
  StravaConnection,
  StravaReadiness,
} from '../models';

export type AdminRegistrationStatusFilter = RegistrationStatus;
export type ActivityInput = Omit<Activity, 'id' | 'date' | 'occupiedCount'>;
export interface ActivityAdminRepository {
  listAdminActivities(): Promise<Activity[]>;
  getAdminActivity(id: string): Promise<Activity | undefined>;
  saveActivity(value: ActivityInput, id?: string): Promise<Activity>;
}
export interface RegistrationSubmission {
  activityId: string;
  bikeMode: string;
  experience: string;
  rentalNeed?: string;
  remark?: string;
  [key: string]: unknown;
}
export interface AdminReviewRepository {
  listReviewRegistrations(
    activityId: string,
    status?: AdminRegistrationStatusFilter,
  ): Promise<Registration[]>;
  getReviewRegistration(id: string): Promise<Registration | undefined>;
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
  registerProfileMedia(fileId: string, category: 'ride' | 'bike' | 'other'): Promise<void>;
  updateProfile(profile: ProfileUpdate): Promise<Profile>;
  getPhoneNumber(code: string): Promise<Profile>;
  getStravaStatus(): Promise<StravaConnection>;
  getStravaReadiness(): Promise<StravaReadiness>;
  ensureStravaReady(): Promise<StravaReadiness>;
  startStrava(): Promise<{ authorizationUrl: string; expiresAt: string }>;
  cancelStravaAuthorization(): Promise<void>;
  syncStrava(): Promise<StravaConnection>;
  disconnectStrava(): Promise<void>;
}
