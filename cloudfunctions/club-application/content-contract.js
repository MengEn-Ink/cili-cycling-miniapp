'use strict';

const crypto = require('node:crypto');
const MAX_FIELD_CHARACTERS = 2500;
const RETRYABLE_CODES = new Set([-1, 44991, 45009, 87020]);
const UNAVAILABLE_CODES = new Set([40001, 40003, 43104, 48001]);

class ContentCheckError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ContentCheckError';
    this.code = code;
  }
}
function fail(code, message) {
  throw new ContentCheckError(code, message);
}
function trustedOpenid(value) {
  if (typeof value !== 'string' || !value || value.length > 128)
    fail('CONTENT_CHECK_IDENTITY_INVALID', '无法确认内容提交身份');
  return value;
}
function normalizedFields(fields, whitelist) {
  if (
    !fields ||
    typeof fields !== 'object' ||
    Array.isArray(fields) ||
    !whitelist ||
    typeof whitelist !== 'object' ||
    Array.isArray(whitelist)
  )
    fail('CONTENT_CHECK_INPUT_INVALID', '待审核内容格式错误');
  const output = {};
  for (const [name, configuredLimit] of Object.entries(whitelist)) {
    if (!Object.prototype.hasOwnProperty.call(fields, name)) continue;
    if (typeof fields[name] !== 'string') fail('CONTENT_CHECK_INPUT_INVALID', '待审核内容格式错误');
    const value = fields[name].trim();
    const limit =
      Number.isInteger(configuredLimit) && configuredLimit >= 0
        ? configuredLimit
        : MAX_FIELD_CHARACTERS;
    if (value.length > limit) fail('CONTENT_FIELD_TOO_LONG', '内容长度超过审核限制');
    output[name] = value;
  }
  return output;
}
function contentChunks(fields) {
  const chunks = [];
  let pending = {};
  const flush = () => {
    if (!Object.keys(pending).length) return;
    chunks.push(JSON.stringify(pending));
    pending = {};
  };
  for (const [name, value] of Object.entries(fields)) {
    const combined = { ...pending, [name]: value };
    if (JSON.stringify(combined).length <= MAX_FIELD_CHARACTERS) {
      pending = combined;
      continue;
    }
    flush();
    if (JSON.stringify({ [name]: value }).length <= MAX_FIELD_CHARACTERS) {
      pending = { [name]: value };
      continue;
    }
    const characters = Array.from(value);
    for (let offset = 0; offset < characters.length;) {
      let low = offset + 1;
      let high = characters.length;
      let end = offset;
      while (low <= high) {
        const middle = Math.floor((low + high) / 2);
        const candidate = JSON.stringify({ [name]: characters.slice(offset, middle).join('') });
        if (candidate.length <= MAX_FIELD_CHARACTERS) {
          end = middle;
          low = middle + 1;
        } else {
          high = middle - 1;
        }
      }
      if (end === offset) fail('CONTENT_CHECK_INPUT_INVALID', '待审核内容格式错误');
      chunks.push(JSON.stringify({ [name]: characters.slice(offset, end).join('') }));
      offset = end;
    }
  }
  flush();
  return chunks.length ? chunks : ['{}'];
}
function stablePayload(fields, currentVersion) {
  return JSON.stringify({
    version: currentVersion,
    fields: Object.fromEntries(
      Object.entries(fields).sort(([left], [right]) => left.localeCompare(right)),
    ),
  });
}
function checkedDigest(fields, currentVersion) {
  return crypto.createHash('sha256').update(stablePayload(fields, currentVersion)).digest('hex');
}
function responseCode(response) {
  const values = [response?.errCode, response?.errcode].filter((value) => value !== undefined);
  if (
    values.length < 1 ||
    values.length > 2 ||
    values.some((value) => !Number.isInteger(value)) ||
    (values.length === 2 && values[0] !== values[1])
  )
    fail('CONTENT_CHECK_INVALID_RESPONSE', '内容审核服务响应异常');
  return values[0];
}
function traceId(response) {
  const value = response?.traceId ?? response?.trace_id;
  return typeof value === 'string' ? value.trim() : '';
}
function classifyServiceFailure(code, media = false) {
  const prefix = media ? 'MEDIA' : 'CONTENT';
  if (code === 61010 && media)
    fail('MEDIA_CHECK_USER_VISIT_REQUIRED', '请重新进入小程序后再次提交图片审核');
  if (RETRYABLE_CODES.has(code)) fail(`${prefix}_CHECK_RETRY`, '审核服务繁忙，请稍后重试');
  if (UNAVAILABLE_CODES.has(code))
    fail(`${prefix}_CHECK_UNAVAILABLE`, '审核服务暂不可用，请稍后重试');
  fail(`${prefix}_CHECK_RETRY`, '审核尚未完成，请稍后重试');
}
async function invokeCheck(operation, invalidCode, retryCode) {
  if (typeof operation !== 'function') fail(invalidCode, '审核服务未配置');
  try {
    return await operation();
  } catch (error) {
    if (error instanceof ContentCheckError) throw error;
    fail(retryCode, '审核服务繁忙，请稍后重试');
  }
}
async function checkTextContent({ openid, scene, fields, whitelist, currentVersion, msgSecCheck }) {
  const identity = trustedOpenid(openid);
  if (![1, 4].includes(scene)) fail('CONTENT_CHECK_INPUT_INVALID', '内容审核场景无效');
  if (!(
    (Number.isSafeInteger(currentVersion) && currentVersion >= 0) ||
    (typeof currentVersion === 'string' && currentVersion.length <= 128)
  ))
    fail('CONTENT_CHECK_INPUT_INVALID', '内容版本无效');
  const normalized = normalizedFields(fields, whitelist);
  const traceIds = [];
  for (const content of contentChunks(normalized)) {
    const response = await invokeCheck(
      () =>
        msgSecCheck({
          openid: identity,
          scene,
          version: 2,
          content,
        }),
      'CONTENT_CHECK_UNAVAILABLE',
      'CONTENT_CHECK_RETRY',
    );
    const code = responseCode(response);
    if (code !== 0) classifyServiceFailure(code);
    const suggest = response?.result?.suggest;
    if (suggest === 'review') fail('CONTENT_REVIEW_REQUIRED', '内容需要调整后重新提交');
    if (suggest === 'risky') fail('CONTENT_RISKY', '内容未通过安全审核');
    if (suggest !== 'pass') fail('CONTENT_CHECK_INVALID_RESPONSE', '内容审核服务响应异常');
    const trace = traceId(response);
    if (trace) traceIds.push(trace);
  }
  return {
    fields: normalized,
    currentVersion,
    digest: checkedDigest(normalized, currentVersion),
    traceId: traceIds[0] || '',
    traceIds,
  };
}
function assertCheckedContent(checked, fields, currentVersion) {
  if (
    !checked ||
    typeof checked !== 'object' ||
    checked.currentVersion !== currentVersion ||
    checked.digest !== checkedDigest(fields, currentVersion)
  )
    fail('CONTENT_CHECK_STALE', '内容已变化，请重新审核后保存');
  return checked.digest;
}
async function submitMediaCheck({
  mediaId,
  ownerOpenid,
  category,
  generation,
  canonicalFileId,
  sha256,
  scene,
  mediaUrl,
  mediaCheckAsync,
  now = new Date(),
}) {
  const identity = trustedOpenid(ownerOpenid);
  if (![1, 4].includes(scene) || !Number.isSafeInteger(generation) || generation < 1)
    fail('MEDIA_CHECK_INPUT_INVALID', '图片审核参数无效');
  if (
    typeof mediaId !== 'string' ||
    !mediaId ||
    typeof category !== 'string' ||
    !category ||
    typeof canonicalFileId !== 'string' ||
    !canonicalFileId.startsWith('cloud://') ||
    typeof sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(sha256) ||
    typeof mediaUrl !== 'string' ||
    !/^https:\/\//iu.test(mediaUrl)
  )
    fail('MEDIA_CHECK_INPUT_INVALID', '图片审核参数无效');
  const response = await invokeCheck(
    () =>
      mediaCheckAsync({
        openid: identity,
        scene,
        version: 2,
        mediaType: 2,
        mediaUrl,
      }),
    'MEDIA_CHECK_UNAVAILABLE',
    'MEDIA_CHECK_RETRY',
  );
  const code = responseCode(response);
  if (code !== 0) classifyServiceFailure(code, true);
  const trace = traceId(response);
  if (!trace || trace.length > 128) fail('MEDIA_CHECK_INVALID_RESPONSE', '图片审核服务响应异常');
  return {
    _id: trace,
    trace_id: trace,
    media_id: mediaId,
    owner_openid: identity,
    category,
    generation,
    canonical_file_id: canonicalFileId,
    sha256,
    status: 'pending',
    attempts: 1,
    submitted_at: now,
    updated_at: now,
  };
}

module.exports = {
  ContentCheckError,
  MAX_FIELD_CHARACTERS,
  assertCheckedContent,
  checkTextContent,
  checkedDigest,
  normalizedFields,
  submitMediaCheck,
};
