import type { Activity, Profile, Registration, RegistrationStatus, StravaStatus } from '../models';

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
export interface RideRepository {
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
  saveProfile(profile: Profile): Promise<Profile>;
  setStrava(status: StravaStatus): Promise<void>;
  saveActivity(activity: Activity): Promise<Activity>;
}
