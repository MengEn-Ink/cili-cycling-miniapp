'use strict';

const cloud = require('wx-server-sdk');
const { ok, toErrorResponse, assertTrustedOpenid, publicActivity, fail } = require('./domain');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

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

exports.main = async (event = {}) => {
  try {
    assertTrustedOpenid(cloud.getWXContext().OPENID);
    const now = new Date();
    if (event.action === 'list') {
      const limit = Number.isInteger(event.limit) ? Math.min(Math.max(event.limit, 1), 20) : 20;
      const result = await db
        .collection('activities')
        .where({ status: 'published' })
        .orderBy('event_start', 'asc')
        .limit(limit)
        .get();
      const activities = result.data
        .filter((item) => item.is_deleted !== true)
        .map((item) => publicActivity(item, now));
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
      return ok(resolvedActivity);
    }
    fail('UNKNOWN_ACTION', '未知操作');
  } catch (error) {
    console.error('activity-read failed', error && error.code ? error.code : 'INTERNAL_ERROR');
    return toErrorResponse(error);
  }
};
