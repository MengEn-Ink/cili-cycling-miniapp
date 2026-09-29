'use strict';
const cloud = require('wx-server-sdk');
const {
  keyFrom,
  response,
  buildUpdate,
  phoneUpdate,
  writableDocument,
  toError,
} = require('./core');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const ok = (data) => ({ ok: true, data });
async function getDoc(openid) {
  try {
    return (await db.collection('profiles').doc(openid).get()).data || {};
  } catch (error) {
    if (
      String(error?.errCode || '').includes('NOT_FOUND') ||
      String(error?.message || '')
        .toLowerCase()
        .includes('not exist')
    )
      return {};
    throw error;
  }
}
async function merge(openid, data) {
  const now = db.serverDate();
  const current = await getDoc(openid);
  await db
    .collection('profiles')
    .doc(openid)
    .set({ data: writableDocument({ ...current, _id: openid, ...data, updated_at: now }) });
  return getDoc(openid);
}
exports.main = async (event = {}) => {
  try {
    keyFrom(process.env.PII_ENCRYPTION_KEY);
    const { OPENID } = cloud.getWXContext();
    if (!OPENID) throw Object.assign(new Error('无法取得微信身份'), { code: 'UNAUTHENTICATED' });
    if (event.action === 'get') return ok(response(await getDoc(OPENID)));
    if (event.action === 'update')
      return ok(response(await merge(OPENID, buildUpdate(event, process.env.PII_ENCRYPTION_KEY))));
    if (event.action === 'getPhoneNumber') {
      if (typeof event.code !== 'string' || !event.code)
        throw Object.assign(new Error('缺少微信手机号动态 code'), { code: 'PHONE_CODE_REQUIRED' });
      const result = await cloud.openapi.phonenumber.getPhoneNumber({ code: event.code });
      const phone =
        result?.phoneInfo?.phoneNumber ||
        result?.phone_info?.phoneNumber ||
        result?.phone_info?.phone_number;
      if (typeof phone !== 'string')
        throw Object.assign(new Error('微信手机号授权失败'), { code: 'PHONE_LOOKUP_FAILED' });
      return ok(
        response(await merge(OPENID, phoneUpdate(phone, process.env.PII_ENCRYPTION_KEY, 'wechat'))),
      );
    }
    throw Object.assign(new Error('未知操作'), { code: 'UNKNOWN_ACTION' });
  } catch (error) {
    if (error && error.code && !error.constructor?.name?.includes('Profile'))
      return { ok: false, error: { code: error.code, message: error.message } };
    return toError(error);
  }
};
