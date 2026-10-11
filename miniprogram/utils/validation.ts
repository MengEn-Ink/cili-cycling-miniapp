import type { Profile, StravaReadiness } from '../models';
import { normalizeGender } from './gender';

function hasSensitiveField(
  profile: Profile,
  key: keyof NonNullable<Profile['sensitiveStatus']>,
  legacyCheck: () => boolean,
) {
  return profile.sensitiveStatus ? profile.sensitiveStatus[key] : legacyCheck();
}

export function validateRegistrationProfile(profile: Profile): string[] {
  const errors: string[] = [];
  // 云端仅返回脱敏展示值，真实填写状态必须以服务端 sensitiveStatus 为准。
  if (!profile.nickname.trim()) errors.push('请授权并填写微信昵称');
  if (!profile.avatarId?.trim()) errors.push('请设置非默认头像');
  if (!normalizeGender(profile.gender)) errors.push('请在个人资料中选择性别');
  if (!hasSensitiveField(profile, 'phone', () => /^1\d{10}$/.test(profile.phone)))
    errors.push('请填写有效联系电话');
  if (!profile.emergencyName.trim()) errors.push('请填写紧急联系人');
  if (!hasSensitiveField(profile, 'emergencyPhone', () => /^1\d{10}$/.test(profile.emergencyPhone)))
    errors.push('请填写有效紧急联系电话');
  return errors;
}

export function validateRegistration(v: {
  profile: Profile;
  gatheringMode: string;
  experience: string;
  readiness: Pick<StravaReadiness, 'state' | 'canRegister'>;
}) {
  const e = validateRegistrationProfile(v.profile);
  if (!['self_drive', 'support_vehicle'].includes(v.gatheringMode)) e.push('请选择集合方式');
  if (!v.experience) e.push('请选择骑行经验');
  if (!v.readiness.canRegister) {
    switch (v.readiness.state) {
      case 'authorizing':
        e.push('请先完成 Strava 授权');
        break;
      case 'syncing':
        e.push('Strava 数据正在准备');
        break;
      case 'failed':
        e.push('请重试 Strava 数据准备');
        break;
      case 'ready':
        e.push('Strava 数据尚未准备完成');
        break;
      case 'disconnected':
        e.push('请绑定 Strava');
        break;
    }
  }
  return e;
}
