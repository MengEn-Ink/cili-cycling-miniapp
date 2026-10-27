'use strict';

function fail(code, message) {
  throw Object.assign(new Error(message), { code });
}

function profileGeneration(profile) {
  const value = profile?.generation;
  if (value === undefined) return 1;
  if (!Number.isSafeInteger(value) || value < 1) fail('PROFILE_GENERATION_INVALID', '资料版本无效');
  return value;
}

function isProfileDeleted(profile) {
  return Boolean(profile?.deletion_status && profile.deletion_status !== 'active');
}

function assertProfileWritable(profile, expectedGeneration) {
  if (isProfileDeleted(profile))
    fail('PROFILE_DELETION_LOCKED', '资料删除处理中或已删除，请先查看状态');
  const current = profileGeneration(profile);
  if ((current > 1 || expectedGeneration !== undefined) && expectedGeneration !== current)
    fail('PROFILE_GENERATION_MISMATCH', '资料版本已变化，请重新读取并明确操作');
  return current;
}

module.exports = { profileGeneration, isProfileDeleted, assertProfileWritable };
