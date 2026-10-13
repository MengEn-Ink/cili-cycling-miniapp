import type { Profile } from '../models';
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
  // 报名门槛口径与服务端 profileReadiness 的 7 项一致：昵称/真实姓名/手机号/紧急联系人姓名/紧急联系人电话/性别/头像。
  // 背景图（个人照片）仅用于公开展示，不计入报名门槛，避免与完整度/展示就绪互相误导。
  if (!profile.nickname.trim()) errors.push('请授权并填写微信昵称');
  if (!hasSensitiveField(profile, 'realName', () => !!profile.realName.trim()))
    errors.push('请填写真实姓名');
  if (!hasSensitiveField(profile, 'phone', () => /^1\d{10}$/.test(profile.phone)))
    errors.push('请填写有效联系电话');
  if (!profile.emergencyName.trim()) errors.push('请填写紧急联系人');
  if (!hasSensitiveField(profile, 'emergencyPhone', () => /^1\d{10}$/.test(profile.emergencyPhone)))
    errors.push('请填写有效紧急联系电话');
  if (!normalizeGender(profile.gender)) errors.push('请在个人资料中选择性别');
  if (!profile.avatarId?.trim()) errors.push('请设置非默认头像');
  return errors;
}

export function validateRegistration(v: {
  profile: Profile;
  gatheringMode: string;
  experience: string;
  readiness?: unknown;
}) {
  const e = validateRegistrationProfile(v.profile);
  if (!['self_drive', 'support_vehicle'].includes(v.gatheringMode)) e.push('请选择集合方式');
  if (!v.experience) e.push('请选择骑行经验');
  return e;
}
