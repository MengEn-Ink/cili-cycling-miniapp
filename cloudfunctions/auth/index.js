'use strict';

const cloud = require('wx-server-sdk');
const { buildIdentity, isCollectionMissing } = require('./core');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

async function findAdmin(openid) {
  try {
    const result = await db.collection('admins').where({ _id: openid }).limit(1).get();
    return Array.isArray(result.data) ? result.data[0] : undefined;
  } catch (error) {
    if (isCollectionMissing(error)) return undefined;

    const lookupError = new Error('AUTH_ADMIN_LOOKUP_FAILED');
    lookupError.code = 'AUTH_ADMIN_LOOKUP_FAILED';
    throw lookupError;
  }
}

exports.main = async () => {
  const { OPENID } = cloud.getWXContext();
  if (typeof OPENID !== 'string' || OPENID.length === 0) {
    return {
      error: {
        code: 'AUTH_OPENID_MISSING',
        message: '无法取得微信身份，请从小程序内重试',
      },
    };
  }

  return buildIdentity(OPENID, await findAdmin(OPENID));
};
