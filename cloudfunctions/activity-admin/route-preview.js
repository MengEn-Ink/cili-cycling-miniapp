'use strict';

const crypto = require('node:crypto');
const { assertTrustedOpenid, fail, isEnabledAdmin } = require('./domain');
const { parseGpx } = require('./gpx');

const PREVIEW_TTL_MS = 2 * 60 * 60 * 1000;
const PREVIEW_REQUEST_FIELDS = new Set([
  'openid',
  'gpxFileId',
  'gpxSha256',
  'fileName',
  'requestId',
]);
const BIND_REQUEST_FIELDS = new Set(['openid', 'previewId', 'generatedPreviewFileId']);

function routePreviewId(openid, digest, requestId) {
  return crypto
    .createHash('sha256')
    .update(openid)
    .update('\0')
    .update(digest)
    .update('\0')
    .update(requestId)
    .digest('hex');
}

function assertExactFields(request, allowed) {
  if (!request || typeof request !== 'object' || Array.isArray(request))
    fail('VALIDATION_FAILED', '路线文件参数无效');
  const forbidden = Object.keys(request).find((key) => !allowed.has(key));
  if (forbidden) fail('FORBIDDEN_FIELD', '路线文件请求包含未允许字段', { field: forbidden });
}

async function assertAdmin(deps, openid) {
  assertTrustedOpenid(openid);
  const admin = await deps.getAdmin(openid);
  if (!isEnabledAdmin(admin, openid)) fail('ADMIN_REQUIRED', '仅活动管理员可以上传路线');
}

function assertDigest(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value))
    fail('VALIDATION_FAILED', '路线文件摘要无效');
  return value;
}

function assertRequestId(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(value))
    fail('VALIDATION_FAILED', '路线预览请求无效');
  return value;
}

function assertFileName(value) {
  if (
    typeof value !== 'string' ||
    value.length < 5 ||
    value.length > 120 ||
    !/^[^/\\\0]+\.gpx$/i.test(value)
  )
    fail('GPX_FILE_INVALID', '这个文件不是有效的 GPX，请重新选择');
  return value;
}

function routeFileMatch(fileId, extension) {
  if (typeof fileId !== 'string' || fileId.length > 512) return undefined;
  const escapedExtension = extension.replace('.', '\\.');
  return new RegExp(
    `^cloud://[^/]+/activity-routes/([^/]+)/([a-f0-9]{64})${escapedExtension}$`,
  ).exec(fileId);
}

function assertOwnedRouteFile(fileId, openid, digest, extension, code, message) {
  const match = routeFileMatch(fileId, extension);
  if (!match || match[1] !== openid || match[2] !== digest) fail(code, message);
  return fileId;
}

function assertCanonicalRoutePreview(fileId, openid) {
  const secret =
    typeof process.env.PROFILE_MEDIA_PATH_SECRET === 'string'
      ? process.env.PROFILE_MEDIA_PATH_SECRET.trim()
      : '';
  const alias =
    openid && secret.length >= 32
      ? crypto.createHmac('sha256', secret).update(openid).digest('hex').slice(0, 32)
      : '';
  if (
    typeof fileId !== 'string' ||
    !alias ||
    !new RegExp(
      `^cloud://[^/]+/profile-canonical/${alias}/activity-route-preview/[a-f0-9]{64}/[a-f0-9]{64}\\.png$`,
      'i',
    ).test(fileId)
  )
    fail('ROUTE_PREVIEW_IMAGE_INVALID', '路线图校验失败，请重新生成');
  return fileId;
}

function previewResponse(preview) {
  return {
    preview_id: preview._id,
    gpx_file_id: preview.source_file_id,
    gpx_sha256: preview.gpx_sha256,
    ...(preview.generated_file_id ? { generated_preview_file_id: preview.generated_file_id } : {}),
    ...preview.summary,
    expires_at: preview.expires_at,
  };
}

function validExpiry(value) {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function assertPreviewIdentity(preview, { openid, digest, sourceFileId }) {
  if (
    !preview ||
    preview.owner_openid !== openid ||
    preview.gpx_sha256 !== digest ||
    preview.source_file_id !== sourceFileId ||
    !preview.summary ||
    typeof preview.summary !== 'object' ||
    Array.isArray(preview.summary)
  )
    fail('ROUTE_PREVIEW_REQUIRED', '请重新上传 GPX 路线');
}

async function previewRouteGpx(deps, request, now = new Date()) {
  assertExactFields(request, PREVIEW_REQUEST_FIELDS);
  const { openid } = request;
  await assertAdmin(deps, openid);
  const digest = assertDigest(request.gpxSha256);
  const requestId = assertRequestId(request.requestId);
  const fileName = assertFileName(request.fileName);
  const sourceFileId = assertOwnedRouteFile(
    request.gpxFileId,
    openid,
    digest,
    '.gpx',
    'GPX_FILE_INVALID',
    '这个文件不是有效的 GPX，请重新选择',
  );
  const source = deps.getRouteSource ? await deps.getRouteSource(sourceFileId) : undefined;
  const id = routePreviewId(openid, digest, requestId);
  const existing = await deps.getPreview(id);
  if (existing) {
    assertPreviewIdentity(existing, { openid, digest, sourceFileId });
    if (existing.oauth_generation !== undefined) await deps.checkPreview(existing);
    if (existing.consumed_at) fail('ROUTE_PREVIEW_CONSUMED', '这份路线已用于其他活动，请重新选择');
    if (validExpiry(existing.expires_at) <= now.getTime())
      fail('ROUTE_PREVIEW_EXPIRED', '路线预览已过期，请重新上传 GPX');
    return previewResponse(existing);
  }

  const downloaded = await deps.downloadFile({ fileID: sourceFileId });
  const bytes = Buffer.from(downloaded?.fileContent || []);
  const actualDigest = crypto.createHash('sha256').update(bytes).digest('hex');
  if (actualDigest !== digest) fail('GPX_DIGEST_MISMATCH', '路线文件校验失败，请重新选择');
  const summary = parseGpx(bytes, { fileName });
  const preview = {
    _id: id,
    owner_openid: openid,
    ...(source
      ? { oauth_generation: source.oauth_generation, profile_generation: source.profile_generation }
      : {}),
    request_id: requestId,
    gpx_sha256: digest,
    source_file_id: sourceFileId,
    file_name: fileName,
    generated_file_id: '',
    summary,
    created_at: now,
    expires_at: new Date(now.getTime() + PREVIEW_TTL_MS),
    consumed_at: null,
    attached_activity_id: '',
  };
  await deps.putPreview(id, preview);
  return previewResponse(preview);
}

async function bindRoutePreviewImage(deps, request, now = new Date()) {
  assertExactFields(request, BIND_REQUEST_FIELDS);
  const { openid } = request;
  await assertAdmin(deps, openid);
  if (typeof request.previewId !== 'string' || !/^[a-f0-9]{64}$/.test(request.previewId))
    fail('VALIDATION_FAILED', '路线预览标识无效');
  const preview = await deps.getPreview(request.previewId);
  if (!preview || preview.owner_openid !== openid)
    fail('ROUTE_PREVIEW_REQUIRED', '请重新上传 GPX 路线');
  if (preview.oauth_generation !== undefined) await deps.checkPreview(preview);
  if (preview.consumed_at) fail('ROUTE_PREVIEW_CONSUMED', '这份路线已用于其他活动，请重新选择');
  if (validExpiry(preview.expires_at) <= now.getTime())
    fail('ROUTE_PREVIEW_EXPIRED', '路线预览已过期，请重新上传 GPX');
  const generatedFileId = assertCanonicalRoutePreview(request.generatedPreviewFileId, openid);
  const media = await deps.getProfileMediaByCanonical(
    generatedFileId,
    openid,
    'activity-route-preview',
  );
  if (
    !media ||
    media.canonical_file_id !== generatedFileId ||
    media.owner_openid !== openid ||
    media.category !== 'activity-route-preview' ||
    !['unreferenced', 'active'].includes(media.status)
  )
    fail('MEDIA_REGISTRATION_INVALID', '路线图登记不可用');
  await deps.updatePreview(preview._id, {
    generated_file_id: generatedFileId,
    updated_at: now,
  });
  return previewResponse({ ...preview, generated_file_id: generatedFileId, updated_at: now });
}

function assertUsableRoutePreview(
  preview,
  { openid, previewId, digest, sourceFileId, generatedFileId, activityId, now },
) {
  assertPreviewIdentity(preview, { openid, digest, sourceFileId });
  if (preview._id !== previewId) fail('ROUTE_PREVIEW_REQUIRED', '请重新上传 GPX 路线');
  if ((preview.generated_file_id || '') !== (generatedFileId || ''))
    fail('ROUTE_PREVIEW_REQUIRED', '请重新生成路线图');
  if (preview.consumed_at && preview.attached_activity_id === activityId) return preview;
  if (validExpiry(preview.expires_at) <= now.getTime())
    fail('ROUTE_PREVIEW_EXPIRED', '路线预览已过期，请重新上传 GPX');
  if (preview.consumed_at && preview.attached_activity_id !== activityId)
    fail('ROUTE_PREVIEW_CONSUMED', '这份路线已用于其他活动，请重新选择');
  return preview;
}

function mergeTrustedPreviewRoute(route, preview) {
  return {
    ...route,
    gpx_preview_id: preview._id,
    gpx_file_id: preview.source_file_id,
    gpx_sha256: preview.gpx_sha256,
    ...(preview.generated_file_id
      ? { generated_preview_file_id: preview.generated_file_id }
      : { generated_preview_file_id: '' }),
    ...preview.summary,
  };
}

module.exports = {
  PREVIEW_TTL_MS,
  routePreviewId,
  previewRouteGpx,
  bindRoutePreviewImage,
  assertUsableRoutePreview,
  mergeTrustedPreviewRoute,
};
