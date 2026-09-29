'use strict';

const cloud = require('wx-server-sdk');
const { authorizeCleanup, drainMediaCleanup, responseError } = require('./core');
const { createCleanupStore } = require('./store');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const store = createCleanupStore(cloud.database());

exports.main = async (event = {}) => {
  try {
    authorizeCleanup(event, cloud.getWXContext().OPENID);
    const data = await drainMediaCleanup({
      store,
      deleteFile: (input) => cloud.deleteFile(input),
    });
    return { ok: true, data };
  } catch (error) {
    console.error(
      'profile-media-cleanup failed',
      error && error.code ? error.code : 'INTERNAL_ERROR',
    );
    return responseError(error);
  }
};
