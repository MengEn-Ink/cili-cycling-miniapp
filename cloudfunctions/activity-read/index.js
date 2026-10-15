'use strict';

const crypto = require('node:crypto');
const cloud = require('wx-server-sdk');
const {
  ok,
  toErrorResponse,
  assertTrustedOpenid,
  publicActivity,
  normalizeGender,
  fail,
} = require('./domain');
const {
  canonicalPublicAvatar,
  canonicalPublicBackground,
  mediaDocumentId,
  publicAvatarSource,
  publicBackgroundSource,
} = require('./public-avatar');
const { parseListPageRequest, listActivityPage } = require('./list-page');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const ATTENDEE_LIMIT = 24;
const ATTENDEE_PAGE_SIZE = 100;
const MAX_ACTIVITY_CAPACITY = 1000;
const MAX_GPX_BYTES = 4 * 1024 * 1024;

async function collectVisibleActivities(query, limit) {
  const pageSize = Math.max(limit, 20);
  const visible = [];
  let offset = 0;
  while (visible.length < limit) {
    const result = await query.skip(offset).limit(pageSize).get();
    const page = Array.isArray(result.data) ? result.data : [];
    visible.push(...page.filter((item) => item.is_deleted !== true));
    if (page.length < pageSize) break;
    offset += page.length;
  }
  return visible.slice(0, limit);
}

function safeHttpsUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) return '';
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : '';
  } catch {
    return '';
  }
}

async function resolveActivityMedia(activities) {
  const fileIds = [
    ...new Set(
      activities.flatMap((activity) =>
        [
          activity.cover_image,
          activity.group_qr_code,
          activity.route && activity.route.generated_preview_file_id,
          ...(Array.isArray(activity.images) ? activity.images : []),
        ].filter((value) => typeof value === 'string' && value.startsWith('cloud://')),
      ),
    ),
  ];
  if (!fileIds.length) return activities;
  let response;
  try {
    response = await cloud.getTempFileURL({ fileList: fileIds });
  } catch {
    return activities;
  }
  const resolved = new Map();
  for (const item of Array.isArray(response && response.fileList) ? response.fileList : []) {
    const url = item && Number(item.status) === 0 ? safeHttpsUrl(item.tempFileURL) : '';
    if (fileIds.includes(item && item.fileID) && url && !resolved.has(item.fileID))
      resolved.set(item.fileID, url);
  }
  const resolve = (value) => resolved.get(value) || value;
  return activities.map((activity) => ({
    ...activity,
    cover_image: resolve(activity.cover_image),
    images: Array.isArray(activity.images) ? activity.images.map(resolve) : activity.images,
    group_qr_code: resolve(activity.group_qr_code),
    ...(activity.route && typeof activity.route === 'object'
      ? {
          route: {
            ...activity.route,
            ...(resolved.has(activity.route.generated_preview_file_id)
              ? {
                  generated_preview_url: resolved.get(activity.route.generated_preview_file_id),
                }
              : {}),
          },
        }
      : {}),
  }));
}

async function visibleActivity(activityId) {
  if (
    typeof activityId !== 'string' ||
    !activityId ||
    activityId.length > 128 ||
    !/^[A-Za-z0-9_-]+$/.test(activityId)
  )
    fail('VALIDATION_FAILED', '缺少活动 ID');
  let activity;
  try {
    activity = (await db.collection('activities').doc(activityId).get()).data;
  } catch (_error) {
    activity = undefined;
  }
  if (
    !activity ||
    !['published', 'finished'].includes(activity.status) ||
    activity.is_deleted === true
  )
    fail('ACTIVITY_NOT_FOUND', '活动不存在');
  return activity;
}

function attachedGpxFile(activity) {
  const route = activity && activity.route;
  const digest = route && route.gpx_sha256;
  const fileId = route && route.gpx_file_id;
  if (
    typeof digest !== 'string' ||
    !/^[a-f0-9]{64}$/.test(digest) ||
    typeof fileId !== 'string' ||
    fileId.length > 512 ||
    !new RegExp(`^cloud://[^/]+/activity-routes/[^/]+/${digest}\\.gpx$`).test(fileId)
  )
    fail('GPX_NOT_AVAILABLE', '这个活动暂未提供 GPX');
  return { digest, fileId };
}

function routeDownloadName(activity) {
  const routeName = typeof activity.route?.route_name === 'string' ? activity.route.route_name : '';
  const asciiName = routeName
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
  const activityId = String(activity._id || 'activity')
    .replace(/[^A-Za-z0-9_-]/g, '')
    .slice(0, 80);
  return `${asciiName || `activity-${activityId || 'route'}`}.gpx`;
}

function timestamp(value) {
  const date = value instanceof Date ? value : new Date(value || 0);
  const time = date.getTime();
  return Number.isFinite(time) ? time : 0;
}

function publicAttendee(registration, profile, media = {}) {
  const snapshot = registration && registration.profile_snapshot;
  return {
    id: typeof registration._id === 'string' ? registration._id : '',
    display_name:
      profile && typeof profile.nickname === 'string'
        ? profile.nickname
        : snapshot && typeof snapshot.nickname === 'string'
          ? snapshot.nickname
          : '',
    gender: normalizeGender(
      snapshot && typeof snapshot.gender === 'string'
        ? snapshot.gender
        : profile && typeof profile.gender === 'string'
          ? profile.gender
          : '',
    ),
    avatar_file_id: typeof media.avatarFileId === 'string' ? media.avatarFileId : '',
    avatar_url: safeHttpsUrl(media.avatarUrl),
    background_file_id: typeof media.backgroundFileId === 'string' ? media.backgroundFileId : '',
    background_url: safeHttpsUrl(media.backgroundUrl),
    status: registration.status,
  };
}

async function countApprovedRegistrations(activityId) {
  let total = 0;
  for (const status of ['approved', 'checked_in']) {
    const result = await db
      .collection('registrations')
      .where({ activity_id: activityId, status })
      .count();
    if (!result || !Number.isInteger(result.total) || result.total < 0)
      throw new Error('invalid registration count');
    total += result.total;
  }
  return total;
}

async function loadAttendeeRegistrations(activityId) {
  const registrations = [];
  // 复用现有 activity_id + status + created_at 索引，完整读取候选后再按审批时间统一稳定排序。
  for (const status of ['approved', 'checked_in']) {
    let offset = 0;
    while (registrations.length < MAX_ACTIVITY_CAPACITY) {
      const limit = Math.min(ATTENDEE_PAGE_SIZE, MAX_ACTIVITY_CAPACITY - registrations.length);
      const result = await db
        .collection('registrations')
        .where({ activity_id: activityId, status })
        .orderBy('created_at', 'desc')
        .skip(offset)
        .limit(limit)
        .get();
      if (!result || !Array.isArray(result.data)) throw new Error('invalid registration page');
      registrations.push(...result.data.filter((item) => item && item.status === status));
      if (result.data.length < limit) break;
      offset += result.data.length;
    }
  }
  return registrations;
}

// 批量按 openid 读取资料，供“活动参与人”和“发布人”信息解析复用。
async function loadProfiles(openids) {
  const profiles = new Map();
  for (let offset = 0; offset < openids.length; offset += 20) {
    const batch = openids.slice(offset, offset + 20);
    try {
      const response = await db
        .collection('profiles')
        .where({ _id: _.in(batch) })
        .limit(20)
        .get();
      for (const profile of Array.isArray(response.data) ? response.data : []) {
        if (profile && batch.includes(profile._id)) profiles.set(profile._id, profile);
      }
    } catch {
      // 资料读取失败时调用方使用空头像兜底，不阻断主流程。
    }
  }
  return profiles;
}

// 依据资料批量解析公开头像与骑行名片背景的 canonical fileId 和临时访问地址。
// entries: [{ openid, profile }]；返回 Map(openid -> canonical fileId 与临时访问地址)。
async function resolveProfileMediaTempUrls(entries, { includeBackground = false } = {}) {
  const sourceMediaIds = [
    ...new Set(
      entries.flatMap((entry) => {
        const avatar = publicAvatarSource(entry.profile);
        const background = includeBackground ? publicBackgroundSource(entry.profile) : undefined;
        return [avatar, background && background.fileId].filter(Boolean).map(mediaDocumentId);
      }),
    ),
  ];
  const mediaRecords = new Map();
  for (let offset = 0; offset < sourceMediaIds.length; offset += 20) {
    const batch = sourceMediaIds.slice(offset, offset + 20);
    try {
      const response = await db
        .collection('profile_media')
        .where({ _id: _.in(batch) })
        .limit(20)
        .get();
      for (const record of Array.isArray(response.data) ? response.data : []) {
        if (record && batch.includes(record._id)) mediaRecords.set(record._id, record);
      }
    } catch {
      // 媒体登记读取失败时 fail closed，仅隐藏受影响图片。
    }
  }
  const canonicalByOpenid = new Map();
  const canonicalFileIds = [];
  for (const { openid, profile } of entries) {
    const avatarSource = publicAvatarSource(profile);
    const backgroundSource = includeBackground ? publicBackgroundSource(profile) : undefined;
    const avatarFileId = canonicalPublicAvatar(
      profile,
      avatarSource ? mediaRecords.get(mediaDocumentId(avatarSource)) : undefined,
      openid,
      process.env.PROFILE_MEDIA_PATH_SECRET,
    );
    const backgroundFileId = backgroundSource
      ? canonicalPublicBackground(
          profile,
          mediaRecords.get(mediaDocumentId(backgroundSource.fileId)),
          openid,
          process.env.PROFILE_MEDIA_PATH_SECRET,
        )
      : '';
    canonicalByOpenid.set(openid, { avatarFileId, backgroundFileId });
    for (const fileId of [avatarFileId, backgroundFileId])
      if (fileId && !canonicalFileIds.includes(fileId)) canonicalFileIds.push(fileId);
  }
  const tempUrls = new Map();
  if (canonicalFileIds.length) {
    try {
      const response = await cloud.getTempFileURL({ fileList: canonicalFileIds });
      for (const item of Array.isArray(response && response.fileList) ? response.fileList : []) {
        const url = item && Number(item.status) === 0 ? safeHttpsUrl(item.tempFileURL) : '';
        if (canonicalFileIds.includes(item && item.fileID) && url && !tempUrls.has(item.fileID))
          tempUrls.set(item.fileID, url);
      }
    } catch {
      // 临时地址解析失败不影响主流程，客户端使用图片空态。
    }
  }
  const result = new Map();
  for (const { openid } of entries) {
    const canonical = canonicalByOpenid.get(openid) || {};
    result.set(openid, {
      avatarFileId: canonical.avatarFileId || '',
      avatarUrl: canonical.avatarFileId ? tempUrls.get(canonical.avatarFileId) || '' : '',
      backgroundFileId: canonical.backgroundFileId || '',
      backgroundUrl: canonical.backgroundFileId
        ? tempUrls.get(canonical.backgroundFileId) || ''
        : '',
    });
  }
  return result;
}

// 批量解析活动发布人的昵称与头像临时地址，供活动列表、分页与详情复用。
async function loadPublishers(rawActivities) {
  const openids = [
    ...new Set(
      rawActivities
        .map((activity) => activity && activity.created_by)
        .filter((value) => typeof value === 'string' && value),
    ),
  ];
  const profiles = await loadProfiles(openids);
  const profileMedia = await resolveProfileMediaTempUrls(
    openids.map((openid) => ({ openid, profile: profiles.get(openid) })),
  );
  const result = new Map();
  for (const openid of openids) {
    const profile = profiles.get(openid);
    result.set(openid, {
      nickname: profile && typeof profile.nickname === 'string' ? profile.nickname : '',
      avatar_url: profileMedia.get(openid)?.avatarUrl || '',
    });
  }
  return result;
}

// 把发布人信息挂到对外活动对象上；资料缺失时统一兜底为“骑友”，保证卡片字段始终可用。
function attachPublisher(activity, publisher) {
  activity.publisher = {
    nickname: publisher && publisher.nickname ? publisher.nickname : '骑友',
    avatar_url: publisher && publisher.avatar_url ? publisher.avatar_url : '',
  };
  return activity;
}

async function loadAttendance(activityId) {
  const [approvedRegistrationCount, registrations] = await Promise.all([
    countApprovedRegistrations(activityId),
    loadAttendeeRegistrations(activityId),
  ]);
  registrations.sort(
    (left, right) =>
      timestamp(left.approved_at || left.checked_in_at || left.updated_at) -
        timestamp(right.approved_at || right.checked_in_at || right.updated_at) ||
      String(left._id).localeCompare(String(right._id)),
  );
  const visibleRegistrations = registrations.slice(0, ATTENDEE_LIMIT);
  const openids = [
    ...new Set(
      visibleRegistrations
        .map((item) => item.openid)
        .filter((value) => typeof value === 'string' && value),
    ),
  ];
  const profiles = await loadProfiles(openids);
  const profileMedia = await resolveProfileMediaTempUrls(
    openids.map((openid) => ({ openid, profile: profiles.get(openid) })),
    { includeBackground: true },
  );
  return {
    approvedRegistrationCount,
    attendees: visibleRegistrations.map((registration) =>
      publicAttendee(
        registration,
        profiles.get(registration.openid),
        profileMedia.get(registration.openid) || {},
      ),
    ),
  };
}

exports.main = async (event = {}) => {
  try {
    assertTrustedOpenid(cloud.getWXContext().OPENID);
    const now = new Date();
    if (event.action === 'list') {
      const limit = Number.isInteger(event.limit) ? Math.min(Math.max(event.limit, 1), 20) : 20;
      const filter = event.filter === undefined ? 'upcoming' : event.filter;
      if (!['upcoming', 'history'].includes(filter)) fail('VALIDATION_FAILED', '活动筛选条件无效');
      let rawActivities;
      if (filter === 'history') {
        const [finished, ended] = await Promise.all([
          collectVisibleActivities(
            db
              .collection('activities')
              .where({ status: 'finished' })
              .orderBy('event_start', 'desc'),
            limit,
          ),
          collectVisibleActivities(
            db
              .collection('activities')
              .where({ status: 'published', event_end: _.lte(now) })
              .orderBy('event_start', 'desc'),
            limit,
          ),
        ]);
        rawActivities = [...finished, ...ended]
          .sort((left, right) => timestamp(right.event_start) - timestamp(left.event_start))
          .slice(0, limit);
      } else {
        rawActivities = await collectVisibleActivities(
          db
            .collection('activities')
            .where({ status: 'published', event_end: _.gt(now) })
            .orderBy('event_start', 'asc'),
          limit,
        );
      }
      const publisherByOpenid = await loadPublishers(rawActivities);
      const activities = rawActivities.map((item) =>
        attachPublisher(publicActivity(item, now), publisherByOpenid.get(item.created_by)),
      );
      return ok(await resolveActivityMedia(activities));
    }
    if (event.action === 'listPage') {
      const request = parseListPageRequest(event, now);
      const page = await listActivityPage({ db, command: _, request, now });
      const publisherByOpenid = await loadPublishers(page.items);
      const items = page.items.map((item) =>
        attachPublisher(publicActivity(item, request.asOf), publisherByOpenid.get(item.created_by)),
      );
      return ok({
        items: await resolveActivityMedia(items),
        next_cursor: page.nextCursor,
        as_of: request.asOf.toISOString(),
      });
    }
    if (event.action === 'detail') {
      const activity = await visibleActivity(event.activityId);
      const publisherByOpenid = await loadPublishers([activity]);
      const [resolvedActivity] = await resolveActivityMedia([
        attachPublisher(publicActivity(activity, now), publisherByOpenid.get(activity.created_by)),
      ]);
      const attendance = await loadAttendance(event.activityId);
      return ok({
        ...resolvedActivity,
        attendees: attendance.attendees,
        approved_registration_count: attendance.approvedRegistrationCount,
      });
    }
    if (event.action === 'downloadRouteGpx') {
      const activity = await visibleActivity(event.activityId);
      const source = attachedGpxFile(activity);
      const downloaded = await cloud.downloadFile({ fileID: source.fileId });
      const bytes = Buffer.from(downloaded?.fileContent || []);
      if (bytes.length === 0) fail('GPX_NOT_AVAILABLE', '这个活动暂未提供 GPX');
      if (bytes.length > MAX_GPX_BYTES) fail('GPX_TOO_LARGE', '路线文件超过 4 MB，暂时无法下载');
      const actualDigest = crypto.createHash('sha256').update(bytes).digest('hex');
      if (actualDigest !== source.digest)
        fail('GPX_DIGEST_MISMATCH', '路线文件校验失败，请稍后重试');
      return ok({
        base64: bytes.toString('base64'),
        filename: routeDownloadName(activity),
        content_type: 'application/gpx+xml',
      });
    }
    fail('UNKNOWN_ACTION', '未知操作');
  } catch (error) {
    console.error('activity-read failed', error && error.code ? error.code : 'INTERNAL_ERROR');
    return toErrorResponse(error);
  }
};
