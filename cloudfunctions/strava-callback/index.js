'use strict';
const crypto = require('node:crypto');
const cloud = require('wx-server-sdk');
const { callbackFlow, writableDocument, toError } = require('./oauth/core');
const { stravaApi } = require('./oauth/api');
const { redirect303, resultLocation, renderResultPage } = require('./http');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
function isNotFound(error) {
  const code = String(error?.errCode || error?.code || '');
  const message = String(error?.errMsg || error?.message || '');
  return (
    ['DATABASE_DOCUMENT_NOT_EXIST', 'DOCUMENT_NOT_FOUND'].includes(code) ||
    (Number(error?.errCode) === -502001 && /document.+(?:not exist|not found)/i.test(message))
  );
}
async function maybeGet(database, collection, id) {
  try {
    return (await database.collection(collection).doc(id).get()).data;
  } catch (error) {
    if (isNotFound(error)) return undefined;
    throw error;
  }
}
function nextAvatarRevision(profile) {
  const current =
    Number.isSafeInteger(profile?.avatar_revision) && profile.avatar_revision >= 0
      ? profile.avatar_revision
      : 0;
  if (current >= Number.MAX_SAFE_INTEGER)
    throw Object.assign(new Error('头像版本无法继续递增'), {
      code: 'AVATAR_REVISION_EXHAUSTED',
    });
  return current + 1;
}
function mediaDocumentId(fileId) {
  return crypto.createHash('sha256').update(fileId).digest('hex');
}
function createCredentialStore(database) {
  return {
    consumeState: (hash) =>
      database.runTransaction(async (tx) => {
        const doc = await maybeGet(tx, 'oauth_states', hash);
        if (!doc || doc.consumed_at) return undefined;
        await tx
          .collection('oauth_states')
          .doc(hash)
          .update({ data: { consumed_at: database.serverDate() } });
        return doc;
      }),
    saveCredential: async (data, now = new Date()) => {
      await database.runTransaction(async (tx) => {
        const [profile, previousCredential] = await Promise.all([
          maybeGet(tx, 'profiles', data.openid).then((value) => value || { _id: data.openid }),
          maybeGet(tx, 'strava_credentials', data.openid),
        ]);
        let nextProfile = profile;
        const rebinding = previousCredential?.athlete_id !== data.athlete_id;
        const credentialGeneration = Number.isSafeInteger(previousCredential?.credential_generation)
          ? previousCredential.credential_generation + 1
          : 1;
        if (
          rebinding &&
          profile.avatar_source === 'strava' &&
          typeof profile.avatar_file_id === 'string'
        ) {
          const avatarFileId = profile.avatar_file_id;
          const mediaId = mediaDocumentId(avatarFileId);
          const retainedByPhotos = (Array.isArray(profile.photos) ? profile.photos : []).some(
            (item) => item && item.file_id === avatarFileId,
          );
          if (!retainedByPhotos) {
            const media = await maybeGet(tx, 'profile_media', mediaId);
            if (
              media &&
              media._id === mediaId &&
              media.file_id === avatarFileId &&
              media.owner_openid === data.openid &&
              media.origin === 'strava' &&
              media.status === 'active'
            ) {
              await tx
                .collection('profile_media')
                .doc(mediaId)
                .update({
                  data: {
                    status: 'unreferenced',
                    referenced_at: null,
                    cleanup_after: new Date(new Date(now).getTime() + 24 * 60 * 60 * 1000),
                    delete_lease_id: '',
                    updated_at: database.serverDate(),
                  },
                });
            }
          }
          const { avatar_source, avatar_file_id, ...withoutAvatar } = profile;
          void avatar_source;
          void avatar_file_id;
          nextProfile = {
            ...withoutAvatar,
            avatar_revision: nextAvatarRevision(profile),
          };
        }
        await tx
          .collection('strava_credentials')
          .doc(data._id)
          .set({
            data: writableDocument({
              ...data,
              credential_generation: credentialGeneration,
            }),
          });
        await tx.collection('strava_snapshots').doc(data._id).remove();
        await tx
          .collection('profiles')
          .doc(data.openid)
          .set({
            data: writableDocument({
              ...nextProfile,
              _id: data.openid,
              strava: { status: 'connected' },
              updated_at: database.serverDate(),
            }),
          });
      });
    },
  };
}
const store = createCredentialStore(db);
function eventPath(event) {
  return event.path || event.rawPath || (event.requestContext && event.requestContext.path) || '';
}

function createHandler({ callbackUrl, handleCallback, randomNonce, logger }) {
  const nonce = randomNonce || (() => crypto.randomBytes(18).toString('base64url'));
  const output = logger || console;
  const configuredUrl = () => (typeof callbackUrl === 'function' ? callbackUrl() : callbackUrl);

  return async (event = {}) => {
    const path = eventPath(event);
    if (path === '/strava/success') {
      return renderResultPage({ success: true, nonce: nonce() });
    }
    if (path === '/strava/failure') {
      return renderResultPage({ success: false, nonce: nonce() });
    }

    const query = event.queryStringParameters || event.query || event;
    try {
      await handleCallback(query);
      return redirect303(resultLocation(configuredUrl(), true));
    } catch (error) {
      const safe = toError(error);
      output.error('strava_callback_failed', { code: safe.error.code });
      return redirect303(resultLocation(configuredUrl(), false));
    }
  };
}

const main = createHandler({
  callbackUrl: () => process.env.STRAVA_CALLBACK_URL,
  handleCallback: (query) =>
    callbackFlow({
      code: query.code,
      state: query.state,
      env: process.env,
      store,
      api: stravaApi,
    }),
});

exports.main = main;
exports.createHandler = createHandler;
exports.createCredentialStore = createCredentialStore;
