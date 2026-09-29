'use strict';
const cloud = require('wx-server-sdk');
const {
  keyFrom,
  response,
  buildUpdate,
  phoneUpdate,
  issueMediaUploadPath,
  mediaDocumentId,
  mediaRegistration,
  clientAvatarSource,
  clientMediaOrigin,
  inspectMediaObject,
  verifyMediaObject,
  validateMediaUpdate,
  normalizeAvatarProfile,
  writableDocument,
  toError,
} = require('./core');
const { buildCapabilityCard } = require('./capability-card');
const { createProfileStore } = require('./store');
const { assertImportRequest, importStravaAvatar } = require('./avatar-import');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const profileStore = createProfileStore(db);
const ok = (data) => ({ ok: true, data });
function isNotFound(error) {
  const code = String(error?.errCode || error?.code || '');
  const message = String(error?.errMsg || error?.message || '');
  return (
    ['DATABASE_DOCUMENT_NOT_EXIST', 'DOCUMENT_NOT_FOUND'].includes(code) ||
    (Number(error?.errCode) === -502001 && /document.+(?:not exist|not found)/i.test(message))
  );
}
async function maybeGet(collection, id) {
  try {
    return (await collection.doc(id).get()).data;
  } catch (error) {
    if (isNotFound(error)) return undefined;
    throw error;
  }
}
async function getDoc(openid) {
  return (await maybeGet(db.collection('profiles'), openid)) || {};
}
async function getById(collection, id) {
  return maybeGet(db.collection(collection), id);
}
function profileMediaIds(...profiles) {
  const ids = [];
  for (const profile of profiles) {
    ids.push(profile && profile.avatar_file_id);
    for (const item of Array.isArray(profile && profile.photos) ? profile.photos : []) {
      ids.push(item && item.file_id);
    }
  }
  return [...new Set(ids.filter((id) => typeof id === 'string' && id))];
}
async function getMediaRecords(collection, ...profiles) {
  return (
    await Promise.all(
      profileMediaIds(...profiles).map((fileId) => maybeGet(collection, mediaDocumentId(fileId))),
    )
  ).filter(Boolean);
}
async function updateProfile(openid, event) {
  const result = await db.runTransaction(async (transaction) => {
    const profiles = transaction.collection('profiles');
    const media = transaction.collection('profile_media');
    const current = (await maybeGet(profiles, openid)) || {};
    const update = buildUpdate(event, process.env.PII_ENCRYPTION_KEY, current);
    const records = await getMediaRecords(media, current, update);
    const validated = validateMediaUpdate(
      current,
      update,
      openid,
      process.env.PROFILE_MEDIA_PATH_SECRET,
      records,
    );
    const updatedAt = db.serverDate();
    const cleanupAfter = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const next = writableDocument(
      normalizeAvatarProfile({
        ...current,
        _id: openid,
        ...validated.data,
        updated_at: updatedAt,
      }),
    );
    await profiles.doc(openid).set({ data: next });
    for (const id of validated.activate_ids) {
      await media.doc(id).update({
        data: { status: 'active', referenced_at: updatedAt, cleanup_after: null },
      });
    }
    for (const id of validated.demote_ids) {
      await media.doc(id).update({
        data: {
          status: 'unreferenced',
          referenced_at: null,
          cleanup_after: cleanupAfter,
          delete_lease_id: '',
          updated_at: updatedAt,
        },
      });
    }
    return next;
  });
  return response(result);
}
async function registerMedia(openid, event, verifyObject) {
  const origin = clientMediaOrigin(event.origin);
  const id = mediaDocumentId(event.fileId);
  if (verifyObject) {
    await verifyMediaObject(event.fileId, (input) => cloud.getTempFileURL(input));
  }
  return profileStore.registerMedia(id, (existing) =>
    mediaRegistration(
      event.fileId,
      event.category,
      origin,
      openid,
      process.env.PROFILE_MEDIA_PATH_SECRET,
      new Date(),
      existing,
    ),
  );
}
exports.main = async (event = {}) => {
  try {
    keyFrom(process.env.PII_ENCRYPTION_KEY);
    const { OPENID } = cloud.getWXContext();
    if (!OPENID) throw Object.assign(new Error('无法取得微信身份'), { code: 'UNAUTHENTICATED' });
    if (event.action === 'get') return ok(response(await getDoc(OPENID)));
    if (event.action === 'capabilityCard') {
      if (Object.prototype.hasOwnProperty.call(event, 'openid'))
        throw Object.assign(new Error('包含禁止字段'), { code: 'FORBIDDEN_FIELD' });
      const [profile, credential, snapshot] = await Promise.all([
        getDoc(OPENID),
        getById('strava_credentials', OPENID),
        getById('strava_snapshots', OPENID),
      ]);
      const mediaRecords = await getMediaRecords(db.collection('profile_media'), profile);
      return ok(
        await buildCapabilityCard(
          { profile, credential, snapshot, mediaRecords },
          {
            openid: OPENID,
            mediaSecret: process.env.PROFILE_MEDIA_PATH_SECRET,
            getTempFileURL: (input) => cloud.getTempFileURL(input),
          },
        ),
      );
    }
    if (event.action === 'mediaUploadPath') {
      if (Object.prototype.hasOwnProperty.call(event, 'openid'))
        throw Object.assign(new Error('包含禁止字段'), { code: 'FORBIDDEN_FIELD' });
      return ok(issueMediaUploadPath(OPENID, process.env.PROFILE_MEDIA_PATH_SECRET));
    }
    if (event.action === 'registerMedia') {
      if (Object.prototype.hasOwnProperty.call(event, 'openid'))
        throw Object.assign(new Error('包含禁止字段'), { code: 'FORBIDDEN_FIELD' });
      await registerMedia(OPENID, event, true);
      return ok({ registered: true });
    }
    if (event.action === 'setAvatar') {
      if (Object.prototype.hasOwnProperty.call(event, 'openid'))
        throw Object.assign(new Error('包含禁止字段'), { code: 'FORBIDDEN_FIELD' });
      const source = clientAvatarSource(event.source);
      return ok(
        response(
          await profileStore.setAvatar(
            OPENID,
            source,
            event.fileId,
            process.env.PROFILE_MEDIA_PATH_SECRET,
          ),
        ),
      );
    }
    if (event.action === 'importStravaAvatar') {
      if (Object.prototype.hasOwnProperty.call(event, 'openid'))
        throw Object.assign(new Error('包含禁止字段'), { code: 'FORBIDDEN_FIELD' });
      assertImportRequest(event);
      const credential = await getById('strava_credentials', OPENID);
      return ok(
        response(
          await importStravaAvatar({
            openid: OPENID,
            credential,
            mediaSecret: process.env.PROFILE_MEDIA_PATH_SECRET,
            uploadFile: (input) => cloud.uploadFile(input),
            deleteFile: (input) => cloud.deleteFile(input),
            store: profileStore,
          }),
        ),
      );
    }
    if (event.action === 'reportOrphan') {
      if (Object.prototype.hasOwnProperty.call(event, 'openid'))
        throw Object.assign(new Error('包含禁止字段'), { code: 'FORBIDDEN_FIELD' });
      const objectState = await inspectMediaObject(event.fileId, (input) =>
        cloud.getTempFileURL(input),
      );
      if (objectState === 'missing') return ok({ reported: true, cleaned: true });
      await registerMedia(OPENID, event, false);
      return ok({ reported: true, cleaned: false });
    }
    if (event.action === 'update') {
      return ok(await updateProfile(OPENID, event));
    }
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
      const fields = phoneUpdate(phone, process.env.PII_ENCRYPTION_KEY, 'wechat');
      return ok(response(await profileStore.mergePhone(OPENID, fields)));
    }
    throw Object.assign(new Error('未知操作'), { code: 'UNKNOWN_ACTION' });
  } catch (error) {
    if (error && error.code && !error.constructor?.name?.includes('Profile'))
      return { ok: false, error: { code: error.code, message: error.message } };
    return toError(error);
  }
};
