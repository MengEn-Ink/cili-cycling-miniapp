'use strict';

const crypto = require('node:crypto');
const { get } = require('./store');
const { createStravaStore } = require('./strava-store');
const {
  privacyError,
  profileGeneration,
  scrubProfile,
  assertProfileWritable,
  publicConsentStatus,
  PUBLIC_POLICY_VERSION,
} = require('./privacy-contract');
const POLICY_VERSION = '2026-10-21';
const DELETION_SCOPE = 'self-profile-and-personal-media';
const requestDocumentId = (openid, requestId) =>
  `deletion-${crypto
    .createHash('sha256')
    .update(JSON.stringify([openid, requestId]))
    .digest('hex')}`;
function validateInput(openid, event, fields) {
  if (typeof openid !== 'string' || !openid) privacyError('UNAUTHENTICATED', '无法取得微信身份');
  for (const key of Object.keys(event))
    if (!['action', ...fields].includes(key)) privacyError('FORBIDDEN_FIELD', '包含禁止字段');
}
function validateConfirmation(event) {
  if (
    event.confirmed !== true ||
    event.policyVersion !== POLICY_VERSION ||
    event.scope !== DELETION_SCOPE
  )
    privacyError('DELETION_CONFIRMATION_REQUIRED', '请确认当前删除范围与政策版本');
}
function deletionDTO(request) {
  if (!request) return { requestId: null, status: 'none', complete: false };
  return {
    requestId: request._id,
    generation: request.generation,
    policyVersion: request.policy_version,
    scope: DELETION_SCOPE,
    status: request.status,
    phase: request.phase,
    complete: request.status === 'completed',
    retryAt: request.retry_at || null,
    errorCode: request.last_error_code || '',
    restriction: request.status === 'restricted' ? 'ACTIVE_REGISTRATION_CONTACT' : '',
    createdAt: request.created_at,
    updatedAt: request.updated_at,
    completedAt: request.completed_at || null,
    // Existing signed URLs may outlive projection invalidation; object cleanup is separate.
    signedUrlNotAfter: request.signed_url_not_after,
  };
}
function createPrivacyService(db) {
  return {
    publicConsentStatus: async (openid, event = {}) => {
      validateInput(openid, event, []);
      return publicConsentStatus(await get(db.collection('profiles'), openid));
    },
    setPublicConsent: async (openid, event, now = new Date()) => {
      validateInput(openid, event, ['generation', 'policyVersion', 'nickname', 'media']);
      if (event.policyVersion !== PUBLIC_POLICY_VERSION)
        privacyError('PUBLIC_CONSENT_POLICY_MISMATCH', '请读取当前公开政策版本');
      const fields = ['nickname', 'media'].filter((field) => event[field] !== undefined);
      if (!fields.length) privacyError('PUBLIC_CONSENT_INVALID', '请明确选择公开范围');
      for (const field of fields) {
        const choice = event[field];
        if (
          !choice ||
          typeof choice !== 'object' ||
          Array.isArray(choice) ||
          typeof choice.consented !== 'boolean' ||
          Object.keys(choice).some((key) => !['consented', 'version'].includes(key))
        )
          privacyError('PUBLIC_CONSENT_INVALID', '公开选择格式无效');
      }
      return db.runTransaction(async (tx) => {
        const profiles = tx.collection('profiles');
        const profile = await get(profiles, openid);
        if (!profile) privacyError('PROFILE_NOT_FOUND', '请先创建本人资料');
        const generation = assertProfileWritable(profile, event.generation);
        if (event.generation !== generation)
          privacyError('PROFILE_GENERATION_MISMATCH', '请读取当前资料版本并明确操作');
        const status = publicConsentStatus(profile);
        const saved = { ...profile.public_consent };
        for (const field of fields) {
          const choice = event[field];
          if (choice.consented && choice.version !== status[field].version)
            privacyError('PUBLIC_CONSENT_VERSION_MISMATCH', '资料已变化，请重新确认公开范围');
          saved[field] = {
            consented: choice.consented,
            version: status[field].version,
            generation,
            policy_version: PUBLIC_POLICY_VERSION,
            updated_at: now,
          };
        }
        await profiles.doc(openid).update({ data: { public_consent: saved, updated_at: now } });
        return publicConsentStatus({ ...profile, public_consent: saved });
      });
    },
    requestDeletion: async (openid, event, now = new Date()) => {
      validateInput(openid, event, [
        'requestId',
        'policyVersion',
        'scope',
        'confirmed',
        'generation',
      ]);
      validateConfirmation(event);
      if (typeof event.requestId !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(event.requestId))
        privacyError('DELETION_REQUEST_ID_INVALID', '删除请求标识无效');
      return db.runTransaction(async (tx) => {
        const requests = tx.collection('privacy_requests');
        const profiles = tx.collection('profiles');
        const id = requestDocumentId(openid, event.requestId);
        const prior = await get(requests, id);
        if (prior) return deletionDTO(prior);
        const profile = (await get(profiles, openid)) || {};
        if (profile.deletion_request_id && profile.deletion_status !== 'active') {
          const active = await get(requests, profile.deletion_request_id);
          if (!active) privacyError('DELETION_RECORD_MISSING', '删除状态需要人工核验');
          return deletionDTO(active);
        }
        const generation = profileGeneration(profile);
        if ((generation > 1 || event.generation !== undefined) && event.generation !== generation)
          privacyError('PROFILE_GENERATION_MISMATCH', '资料版本已变化，请重新确认');
        const strava = await createStravaStore(db).disconnectTx(tx, openid, now, generation);
        const request = {
          _id: id,
          owner_openid: openid,
          kind: 'profile_deletion',
          policy_version: POLICY_VERSION,
          generation,
          strava_generation: strava.generation,
          status: 'requested',
          phase: 'registrations',
          cursors: {},
          attempts: 0,
          retry_at: now,
          lease_id: '',
          lease_expires_at: null,
          last_error_code: '',
          media_targets: [
            ...new Set(
              [
                profile.avatar_file_id,
                profile.background_photo?.file_id,
                ...(Array.isArray(profile.photos)
                  ? profile.photos.map((photo) => photo?.file_id)
                  : []),
              ].filter((value) => typeof value === 'string' && value),
            ),
          ],
          created_at: now,
          updated_at: now,
          signed_url_not_after: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        };
        const { _id, ...data } = request;
        await requests.doc(id).set({ data });
        const { _id: ignored, ...next } = scrubProfile(profile, true);
        await profiles.doc(openid).set({
          data: {
            ...next,
            generation,
            deletion_status: 'requested',
            deletion_request_id: id,
            updated_at: now,
          },
        });
        return deletionDTO(request);
      });
    },
    deletionStatus: async (openid, event = {}) => {
      validateInput(openid, event, ['requestId']);
      const profile = await get(db.collection('profiles'), openid);
      const id = event.requestId || profile?.deletion_request_id;
      if (!id) return deletionDTO();
      const request = await get(db.collection('privacy_requests'), id);
      if (!request || request.owner_openid !== openid)
        privacyError('DELETION_NOT_FOUND', '删除请求不存在');
      return deletionDTO(request);
    },
    recreate: async (openid, event, now = new Date()) => {
      validateInput(openid, event, [
        'requestId',
        'generation',
        'policyVersion',
        'scope',
        'confirmed',
      ]);
      validateConfirmation(event);
      return db.runTransaction(async (tx) => {
        const profiles = tx.collection('profiles');
        const profile = await get(profiles, openid);
        const request = await get(tx.collection('privacy_requests'), event.requestId);
        if (!request || request.owner_openid !== openid)
          privacyError('DELETION_NOT_FOUND', '删除请求不存在');
        if (
          request.status !== 'completed' ||
          profile?.deletion_status !== 'completed' ||
          profile.deletion_request_id !== request._id
        )
          privacyError('DELETION_NOT_COMPLETED', '删除尚未完成，不能重建资料');
        if (
          event.generation !== profileGeneration(profile) ||
          request.generation !== event.generation
        )
          privacyError('PROFILE_GENERATION_MISMATCH', '资料版本已变化，请重新确认');
        if (event.generation >= Number.MAX_SAFE_INTEGER)
          privacyError('PROFILE_GENERATION_EXHAUSTED', '资料版本需要人工核验');
        const { _id, ...next } = scrubProfile(profile);
        await profiles.doc(openid).set({
          data: {
            ...next,
            generation: event.generation + 1,
            deletion_status: 'active',
            recreation_policy_version: POLICY_VERSION,
            recreated_at: now,
            updated_at: now,
          },
        });
        return { generation: event.generation + 1, status: 'active' };
      });
    },
  };
}
module.exports = {
  POLICY_VERSION,
  DELETION_SCOPE,
  requestDocumentId,
  deletionDTO,
  createPrivacyService,
};
