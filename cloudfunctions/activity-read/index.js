'use strict';

const cloud = require('wx-server-sdk');
const { ok, toErrorResponse, assertTrustedOpenid, publicActivity, fail } = require('./domain');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event = {}) => {
  try {
    assertTrustedOpenid(cloud.getWXContext().OPENID);
    if (event.action === 'list') {
      const limit = Number.isInteger(event.limit) ? Math.min(Math.max(event.limit, 1), 20) : 20;
      const result = await db
        .collection('activities')
        .where({ status: 'published' })
        .orderBy('event_start', 'asc')
        .limit(limit)
        .get();
      return ok(result.data.filter((item) => item.is_deleted !== true).map(publicActivity));
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
      return ok(publicActivity(activity));
    }
    fail('UNKNOWN_ACTION', '未知操作');
  } catch (error) {
    console.error('activity-read failed', error && error.code ? error.code : 'INTERNAL_ERROR');
    return toErrorResponse(error);
  }
};
