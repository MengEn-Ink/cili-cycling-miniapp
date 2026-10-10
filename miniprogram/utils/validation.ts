import type { Profile, StravaReadiness } from '../models';
import { normalizeGender } from './gender';

function hasSensitiveField(
  profile: Profile,
  key: keyof NonNullable<Profile['sensitiveStatus']>,
  legacyCheck: () => boolean,
) {
  return profile.sensitiveStatus ? profile.sensitiveStatus[key] : legacyCheck();
}

function hasPersonalPhoto(profile: Profile): boolean {
  const background = profile.backgroundPhoto;
  if (background !== undefined) return Boolean(background && background.id.trim());
  return profile.photos.some((photo) => Boolean(photo.id.trim()));
}

export function validateRegistration(v: {
  profile: Profile;
  gatheringMode: string;
  experience: string;
  readiness: Pick<StravaReadiness, 'state' | 'canRegister'>;
}) {
  const e: string[] = [];
  // 云端仅返回脱敏展示值，真实填写状态必须以服务端 sensitiveStatus 为准。
  if (!v.profile.nickname.trim()) e.push('请填写昵称');
  if (!v.profile.avatarId?.trim()) e.push('请先设置头像');
  if (!normalizeGender(v.profile.gender)) e.push('请先在个人资料中选择性别');
  if (!hasPersonalPhoto(v.profile)) e.push('请先上传个人照片');
  if (!hasSensitiveField(v.profile, 'realName', () => !!v.profile.realName.trim()))
    e.push('请填写真实姓名');
  if (!hasSensitiveField(v.profile, 'phone', () => /^1\d{10}$/.test(v.profile.phone)))
    e.push('手机号格式错误');
  if (!v.profile.emergencyName.trim()) e.push('请填写紧急联系人');
  if (
    !hasSensitiveField(v.profile, 'emergencyPhone', () =>
      /^1\d{10}$/.test(v.profile.emergencyPhone),
    )
  )
    e.push('紧急联系电话错误');
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
