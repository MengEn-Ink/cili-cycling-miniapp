'use strict';

const { publicActivity } = require('./domain');

function projectTripActivity(registration, activity, now = new Date()) {
  const snapshot =
    registration &&
    registration.activity_snapshot &&
    typeof registration.activity_snapshot === 'object'
      ? registration.activity_snapshot
      : {};
  const availableActivity = activity && typeof activity === 'object' ? activity : undefined;
  const source = availableActivity || snapshot;
  const unavailable =
    !availableActivity ||
    availableActivity.status === 'draft' ||
    availableActivity.is_deleted === true;
  const createdAt = registration && registration.created_at;
  const eventStart = source.event_start || createdAt;
  return publicActivity(
    {
      ...(availableActivity || {}),
      _id: registration.activity_id,
      title: typeof source.title === 'string' && source.title ? source.title : '历史活动',
      event_start: eventStart,
      event_end: source.event_end || eventStart,
      status: unavailable
        ? 'finished'
        : ['published', 'finished'].includes(source.status)
          ? source.status
          : 'finished',
    },
    now,
  );
}

module.exports = { projectTripActivity };
