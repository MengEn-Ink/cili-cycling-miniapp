'use strict';

const cloud = require('wx-server-sdk');
const {
  ok,
  toErrorResponse,
  assertTrustedOpenid,
  publicActivity,
  normalizeGender,
  fail,
} = require('./domain');
const { canonicalPublicAvatar, mediaDocumentId, publicAvatarSource } = require('./public-avatar');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const ATTENDEE_LIMIT = 24;
const ATTENDEE_PAGE_SIZE = 100;
const MAX_ACTIVITY_CAPACITY = 1000;

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
        [activity.cover_image, ...(Array.isArray(activity.images) ? activity.images : [])].filter(
          (value) => typeof value === 'string' && value.startsWith('cloud://'),
        ),
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
  }));
}

function timestamp(value) {
  const date = value instanceof Date ? value : new Date(value || 0);
  const time = date.getTime();
  return Number.isFinite(time) ? time : 0;
}

function publicMetric(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function publicAttendee(registration, profile, avatarUrl) {
  const snapshot = registration && registration.profile_snapshot;
  const strava = registration && registration.strava_snapshot;
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
    avatar_url: safeHttpsUrl(avatarUrl),
    status: registration.status,
    card: {
      rides90d: publicMetric(strava && strava.activities_90d),
      longestKm: publicMetric(strava && strava.longest_km),
      elevationM: publicMetric(strava && strava.total_elevation_m),
      speedKmh: publicMetric(strava && strava.weighted_avg_speed_kmh),
    },
  };
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

async function loadAttendees(activityId) {
  const registrations = (await loadAttendeeRegistrations(activityId))
    .sort(
      (left, right) =>
        timestamp(left.approved_at || left.checked_in_at || left.updated_at) -
          timestamp(right.approved_at || right.checked_in_at || right.updated_at) ||
        String(left._id).localeCompare(String(right._id)),
    )
    .slice(0, ATTENDEE_LIMIT);
  const openids = [
    ...new Set(
      registrations
        .map((item) => item.openid)
        .filter((value) => typeof value === 'string' && value),
    ),
  ];
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
      // 资料读取失败时使用报名快照，头像和称号保持为空。
    }
  }
  const avatarMediaIds = [
    ...new Set(
      registrations
        .map((item) => publicAvatarSource(profiles.get(item.openid)))
        .filter(Boolean)
        .map(mediaDocumentId),
    ),
  ];
  const mediaRecords = new Map();
  for (let offset = 0; offset < avatarMediaIds.length; offset += 20) {
    const batch = avatarMediaIds.slice(offset, offset + 20);
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
      // 媒体登记读取失败时 fail closed，仅隐藏受影响头像。
    }
  }
  const canonicalFileIds = [
    ...new Set(
      registrations
        .map((registration) => {
          const profile = profiles.get(registration.openid);
          const sourceFileId = publicAvatarSource(profile);
          const record = sourceFileId ? mediaRecords.get(mediaDocumentId(sourceFileId)) : undefined;
          return canonicalPublicAvatar(
            profile,
            record,
            registration.openid,
            process.env.PROFILE_MEDIA_PATH_SECRET,
          );
        })
        .filter(Boolean),
    ),
  ];
  const avatarUrls = new Map();
  if (canonicalFileIds.length) {
    try {
      const response = await cloud.getTempFileURL({ fileList: canonicalFileIds });
      for (const item of Array.isArray(response && response.fileList) ? response.fileList : []) {
        const url = item && Number(item.status) === 0 ? safeHttpsUrl(item.tempFileURL) : '';
        if (canonicalFileIds.includes(item && item.fileID) && url && !avatarUrls.has(item.fileID))
          avatarUrls.set(item.fileID, url);
      }
    } catch {
      // 头像解析失败不影响详情，客户端使用默认头像。
    }
  }
  return registrations.map((registration) => {
    const profile = profiles.get(registration.openid);
    const sourceFileId = publicAvatarSource(profile);
    const record = sourceFileId ? mediaRecords.get(mediaDocumentId(sourceFileId)) : undefined;
    const canonicalFileId = canonicalPublicAvatar(
      profile,
      record,
      registration.openid,
      process.env.PROFILE_MEDIA_PATH_SECRET,
    );
    const url = canonicalFileId ? avatarUrls.get(canonicalFileId) || '' : '';
    return publicAttendee(registration, profile, url);
  });
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
      const activities = rawActivities.map((item) => publicActivity(item, now));
      return ok(await resolveActivityMedia(activities));
    }
    if (event.action === 'detail') {
      if (typeof event.activityId !== 'string' || !event.activityId)
        fail('VALIDATION_FAILED', '缺少活动 ID');
      let activity;
      try {
        activity = (await db.collection('activities').doc(event.activityId).get()).data;
      } catch (_error) {
        activity = undefined;
      }
      if (
        !activity ||
        !['published', 'finished'].includes(activity.status) ||
        activity.is_deleted === true
      )
        fail('ACTIVITY_NOT_FOUND', '活动不存在');
      const [resolvedActivity] = await resolveActivityMedia([publicActivity(activity, now)]);
      return ok({ ...resolvedActivity, attendees: await loadAttendees(event.activityId) });
    }
    fail('UNKNOWN_ACTION', '未知操作');
  } catch (error) {
    console.error('activity-read failed', error && error.code ? error.code : 'INTERNAL_ERROR');
    return toErrorResponse(error);
  }
};
