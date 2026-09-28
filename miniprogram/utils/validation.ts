import type { Profile } from '../models';
export function validateRegistration(v: {
  profile: Profile;
  bikeMode: string;
  experience: string;
  stravaStatus: string;
}) {
  const e: string[] = [];
  if (!v.profile.realName.trim()) e.push('请填写真实姓名');
  if (!/^1\d{10}$/.test(v.profile.phone)) e.push('手机号格式错误');
  if (v.profile.idNumber.length < 6) e.push('证件号码无效');
  if (!v.profile.emergencyName.trim()) e.push('请填写紧急联系人');
  if (!/^1\d{10}$/.test(v.profile.emergencyPhone)) e.push('紧急联系电话错误');
  if (!v.bikeMode) e.push('请选择用车方式');
  if (!v.experience) e.push('请选择骑行经验');
  if (!['connected', 'exempted'].includes(v.stravaStatus)) e.push('请绑定 Strava 或获得豁免');
  return e;
}
