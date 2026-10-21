'use strict';
const cloud = require('wx-server-sdk');
const {
  keyFrom,
  response,
  buildUpdate,
  phoneUpdate,
  issueMediaUploadPath,
  clientUploadIntent,
  mediaDocumentId,
  clientAvatarSource,
  clientMediaOrigin,
  verifyMediaObject,
  validateMediaUpdate,
  normalizeAvatarProfile,
  writableDocument,
  toError,
} = require('./core');
const { buildCapabilityCard } = require('./capability-card');
const { createProfileStore, missing: isNotFound } = require('./store');
const { canonicalizeClientMedia } = require('./media-upload');
const { createPrivacyService } = require('./privacy');
const { assertProfileWritable, visibleProfile } = require('./privacy-contract');
const { loadClubMembershipSummaries, resolveClubMembershipAvatars } = require('./club-memberships');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const profileStore = createProfileStore(db);
const privacyService = createPrivacyService(db);
const ok = (data) => ({ ok: true, data });
async function maybeGet(collection, id) {
  try {
    return (await collection.doc(id).get()).data;
  } catch (error) {
    if (isNotFound(error)) return undefined;
    throw error;
  }
}
async function getDoc(openid) {
  return visibleProfile((await maybeGet(db.collection('profiles'), openid)) || {});
}
function profileMediaIds(...profiles) {
  const ids = [];
  for (const profile of profiles) {
    ids.push(profile && profile.avatar_file_id);
    ids.push(profile && profile.background_photo && profile.background_photo.file_id);
    for (const item of Array.isArray(profile && profile.photos) ? profile.photos : []) {
      ids.push(item && item.file_id);
    }
  }
  return [...new Set(ids.filter((id) => typeof id === 'string' && id))];
}
async function getMediaRecords(collection, ...profiles) {
  const records = await Promise.all(
    profileMediaIds(...profiles).map(async (fileId) => {
      const direct = await maybeGet(collection, mediaDocumentId(fileId));
      if (direct) return direct;
      const result = await collection.where({ canonical_file_id: fileId }).limit(2).get();
      return Array.isArray(result?.data) && result.data.length === 1 ? result.data[0] : undefined;
    }),
  );
  return [...new Map(records.filter(Boolean).map((record) => [record._id, record])).values()];
}
async function updateProfile(openid, event) {
  const result = await db.runTransaction(async (transaction) => {
    const profiles = transaction.collection('profiles');
    const media = transaction.collection('profile_media');
    const current = (await maybeGet(profiles, openid)) || {};
    assertProfileWritable(current, event.generation);
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
  return response(result, process.env.PII_ENCRYPTION_KEY);
}
function mediaProtocol(event) {
  if (
    !Object.prototype.hasOwnProperty.call(event, 'category') ||
    !Object.prototype.hasOwnProperty.call(event, 'requestId')
  )
    throw Object.assign(new Error('媒体用途与请求标识为必填项'), {
      code: 'MEDIA_PROTOCOL_INCOMPLETE',
    });
  if (typeof event.requestId !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(event.requestId))
    throw Object.assign(new Error('媒体请求标识无效'), { code: 'MEDIA_REQUEST_ID_INVALID' });
  return { category: event.category };
}
async function registerMedia(openid, event) {
  const protocol = mediaProtocol(event);
  const origin = clientMediaOrigin(event.origin);
  return canonicalizeClientMedia({
    openid,
    fileId: event.fileId,
    category: protocol.category,
    origin,
    requestId: event.requestId,
    generation: event.generation,
    mediaSecret: process.env.PROFILE_MEDIA_PATH_SECRET,
    getTempFileURL: (input) => cloud.getTempFileURL(input),
    uploadFile: (input) => cloud.uploadFile(input),
    store: profileStore,
  });
}
exports.main = async (event = {}) => {
  try {
    keyFrom(process.env.PII_ENCRYPTION_KEY);
    const { OPENID } = cloud.getWXContext();
    if (!OPENID) throw Object.assign(new Error('无法取得微信身份'), { code: 'UNAUTHENTICATED' });
    if (event.action === 'requestDeletion')
      return ok(await privacyService.requestDeletion(OPENID, event));
    if (event.action === 'deletionStatus')
      return ok(await privacyService.deletionStatus(OPENID, event));
    if (event.action === 'recreate') return ok(await privacyService.recreate(OPENID, event));
    if (event.action === 'publicConsentStatus')
      return ok(await privacyService.publicConsentStatus(OPENID, event));
    if (event.action === 'setPublicConsent')
      return ok(await privacyService.setPublicConsent(OPENID, event));
    if (event.action === 'get') {
      const [profile, clubMemberships] = await Promise.all([
        getDoc(OPENID),
        loadClubMembershipSummaries(db, OPENID),
      ]);
      return ok({
        ...response(profile, process.env.PII_ENCRYPTION_KEY),
        club_memberships: await resolveClubMembershipAvatars(clubMemberships, (input) =>
          cloud.getTempFileURL(input),
        ),
      });
    }
    if (event.action === 'capabilityCard') {
      if (Object.prototype.hasOwnProperty.call(event, 'openid'))
        throw Object.assign(new Error('包含禁止字段'), { code: 'FORBIDDEN_FIELD' });
      const profile = await getDoc(OPENID);
      const mediaRecords = await getMediaRecords(db.collection('profile_media'), profile);
      return ok(
        await buildCapabilityCard(
          { profile, mediaRecords },
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
      const protocol = mediaProtocol(event);
      const category = protocol.category;
      const extension = event.extension || 'jpg';
      const issued = issueMediaUploadPath(
        OPENID,
        process.env.PROFILE_MEDIA_PATH_SECRET,
        undefined,
        extension,
        category,
      );
      const intent = clientUploadIntent(
        OPENID,
        issued.cloud_path,
        process.env.PROFILE_MEDIA_PATH_SECRET,
        new Date(),
        { category, request_id: event.requestId },
      );
      const bound = await profileStore.prepareClientUpload(
        OPENID,
        intent,
        process.env.PROFILE_MEDIA_PATH_SECRET,
        event.generation,
      );
      return ok({ ...issued, generation: bound.generation });
    }
    if (event.action === 'registerMedia') {
      if (Object.prototype.hasOwnProperty.call(event, 'openid'))
        throw Object.assign(new Error('包含禁止字段'), { code: 'FORBIDDEN_FIELD' });
      const registered = await registerMedia(OPENID, event);
      return ok({
        registered: true,
        canonicalFileId: registered.canonical_file_id || registered.file_id,
      });
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
            new Date(),
            event.generation,
          ),
          process.env.PII_ENCRYPTION_KEY,
        ),
      );
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
      return ok(
        response(
          await profileStore.mergePhone(OPENID, fields, event.generation),
          process.env.PII_ENCRYPTION_KEY,
        ),
      );
    }
    throw Object.assign(new Error('未知操作'), { code: 'UNKNOWN_ACTION' });
  } catch (error) {
    if (error && error.code && !error.constructor?.name?.includes('Profile'))
      return { ok: false, error: { code: error.code, message: error.message } };
    return toError(error);
  }
};
