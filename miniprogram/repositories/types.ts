import type {
  Activity,
  Profile,
  ProfileUpdate,
  Registration,
  RegistrationStatus,
  StravaConnection,
} from '../models';

export type AdminRegistrationStatusFilter = RegistrationStatus;
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
export interface RideRepository extends AdminReviewRepository {
  listActivities(): Promise<Activity[]>;
  getActivity(id: string): Promise<Activity | undefined>;
  listRegistrations(): Promise<Registration[]>;
  getRegistration(id: string): Promise<Registration | undefined>;
  saveRegistration(value: RegistrationSubmission): Promise<Registration>;
  updateRegistration(
    id: string,
    status: RegistrationStatus,
    comment?: string,
  ): Promise<Registration>;
  getProfile(): Promise<Profile>;
  updateProfile(profile: ProfileUpdate): Promise<Profile>;
  getPhoneNumber(code: string): Promise<Profile>;
  getStravaStatus(): Promise<StravaConnection>;
  startStrava(): Promise<{ authorizationUrl: string; expiresAt: string }>;
  syncStrava(): Promise<StravaConnection>;
  disconnectStrava(): Promise<void>;
}
