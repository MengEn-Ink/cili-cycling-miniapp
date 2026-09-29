import type { Profile, StravaReadiness } from '../models';

function hasSensitiveField(
  profile: Profile,
  key: keyof NonNullable<Profile['sensitiveStatus']>,
  legacyCheck: () => boolean,
) {
  return profile.sensitiveStatus ? profile.sensitiveStatus[key] : legacyCheck();
}

export function validateRegistration(v: {
  profile: Profile;
  bikeMode: string;
  experience: string;
  readiness: Pick<StravaReadiness, 'state' | 'canRegister'>;
}) {
  const e: string[] = [];
  // 云端仅返回脱敏展示值，真实填写状态必须以服务端 sensitiveStatus 为准。
  if (!v.profile.nickname.trim()) e.push('请填写昵称');
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
  if (!v.bikeMode) e.push('请选择用车方式');
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
