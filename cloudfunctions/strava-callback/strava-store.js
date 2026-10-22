'use strict';

const crypto = require('node:crypto');
const { StravaError, decrypt, revokeToken } = require('./core');
const MINT_LEASE_MS = 2 * 60 * 1000;
const REVOKE_LEASE_MS = 30 * 1000;
const MAX_ATTEMPTS = 8;
const REVOKE_BATCH = 2;
const withoutId = ({ _id, ...data }) => data;
async function get(collection, id) {
  try {
    return (await collection.doc(id).get()).data;
  } catch (error) {
    if (Number(error?.errCode) === -502001 || /not exist|not found/i.test(error?.errMsg || ''))
      return undefined;
    throw error;
  }
}
const put = (tx, name, id, row) =>
  tx
    .collection(name)
    .doc(id)
    .set({ data: withoutId(row) });
const revoked = () => {
  throw new StravaError('AUTHORIZATION_REVOKED', 'Strava 授权已撤回，请重新明确连接');
};
const generationOf = (profile) => profile?.generation || 1;
const writable = (profile) => !profile?.deletion_status || profile.deletion_status === 'active';
const sourceId = (cloudPath) => crypto.createHash('sha256').update(cloudPath).digest('hex');
const filePath = (fileId) =>
  typeof fileId === 'string' && fileId.startsWith('cloud://')
    ? fileId.slice(fileId.indexOf('/', 8) + 1)
    : '';

function createStravaStore(db, { env = process.env, cloud } = {}) {
  async function authorization(tx, owner, now) {
    let auth = await get(tx.collection('strava_authorizations'), owner);
    if (auth) return auth;
    const credential = await get(tx.collection('strava_credentials'), owner);
    const profile = await get(tx.collection('profiles'), owner);
    auth = {
      _id: owner,
      owner_openid: owner,
      generation: 1,
      profile_generation: generationOf(profile),
      mode: credential ? 'connected' : 'disconnected',
      pending_count: 0,
      manual_count: 0,
      operation_id: '',
      updated_at: now,
    };
    // Adopt pre-migration credentials once, never after an owner sentinel exists.
    if (credential)
      await put(tx, 'strava_credentials', owner, {
        ...credential,
        oauth_generation: 1,
        profile_generation: auth.profile_generation,
        revision: credential.revision || 1,
      });
    await put(tx, 'strava_authorizations', owner, auth);
    return auth;
  }
  async function dto(tx, auth) {
    const operation = auth.operation_id
      ? await get(tx.collection('strava_operations'), auth.operation_id)
      : undefined;
    const state =
      auth.mode === 'revoking'
        ? auth.manual_count || operation?.status === 'uncertain'
          ? 'manual_review'
          : auth.pending_count || auth.operation_id
            ? 'revocation_pending'
            : 'disconnected'
        : auth.mode;
    const credential =
      state === 'connected' ? await get(tx.collection('strava_credentials'), auth._id) : undefined;
    const profile = await get(tx.collection('profiles'), auth._id);
    return {
      state,
      generation: auth.generation,
      import_ready:
        state === 'connected' &&
        writable(profile) &&
        generationOf(profile) === auth.profile_generation &&
        !auth.operation_id,
      revocation_complete: state === 'disconnected',
      athlete_name: credential?.athlete_name || '',
    };
  }
  async function assertFence(tx, owner, fence) {
    const auth = await get(tx.collection('strava_authorizations'), owner);
    const profile = await get(tx.collection('profiles'), owner);
    if (
      !auth ||
      !fence ||
      auth.owner_openid !== owner ||
      auth.mode !== 'connected' ||
      auth.generation !== fence.oauth_generation ||
      auth.profile_generation !== fence.profile_generation ||
      generationOf(profile) !== fence.profile_generation ||
      !writable(profile)
    )
      revoked();
    return auth;
  }
  async function queueMaterial(tx, auth, id, cipher, now) {
    if (!cipher) return;
    if (await get(tx.collection('strava_revocations'), id)) return;
    await put(tx, 'strava_revocations', id, {
      _id: id,
      owner_openid: auth._id,
      generation: auth.generation,
      token_cipher: cipher,
      status: 'pending',
      attempts: 0,
      retry_at: now,
      lease_id: '',
      lease_expires_at: null,
      last_error_code: '',
      created_at: now,
    });
    auth.pending_count += 1;
  }
  async function disconnectTx(tx, owner, now, expectedProfileGeneration) {
    const auth = await authorization(tx, owner, now);
    if (
      expectedProfileGeneration !== undefined &&
      auth.profile_generation > expectedProfileGeneration
    )
      return dto(tx, auth);
    if (auth.mode === 'revoking') return dto(tx, auth);
    if (auth.generation >= Number.MAX_SAFE_INTEGER)
      throw new StravaError('STRAVA_GENERATION_EXHAUSTED', '授权版本需人工核验');
    const credential = await get(tx.collection('strava_credentials'), owner);
    auth.generation += 1;
    auth.mode = 'revoking';
    auth.updated_at = now;
    if (credential) {
      await queueMaterial(
        tx,
        auth,
        `credential-${crypto.randomUUID()}`,
        credential.refresh_token_cipher || credential.access_token_cipher,
        now,
      );
      await tx.collection('strava_credentials').doc(owner).remove();
    }
    await put(tx, 'strava_authorizations', owner, auth);
    return dto(tx, auth);
  }
  async function reserve(tx, auth, kind, now) {
    if (auth.operation_id)
      throw new StravaError('STRAVA_OPERATION_PENDING', 'Strava 凭证操作尚未完成，请稍后重试');
    const id = crypto.randomUUID();
    await put(tx, 'strava_operations', id, {
      _id: id,
      owner_openid: auth._id,
      oauth_generation: auth.generation,
      profile_generation: auth.profile_generation,
      kind,
      status: 'in_flight',
      expires_at: new Date(now.getTime() + MINT_LEASE_MS),
      created_at: now,
    });
    auth.operation_id = id;
    await put(tx, 'strava_authorizations', auth._id, auth);
    return {
      operation_id: id,
      oauth_generation: auth.generation,
      profile_generation: auth.profile_generation,
    };
  }
  const store = {
    disconnectTx,
    deletionStatusTx: async (tx, owner, oauthGeneration, expectedProfileGeneration) => {
      const auth = await get(tx.collection('strava_authorizations'), owner);
      if (!auth || auth.generation < oauthGeneration)
        return { state: 'manual_review', revocation_complete: false };
      if (
        expectedProfileGeneration !== undefined &&
        auth.profile_generation > expectedProfileGeneration
      )
        return { state: 'disconnected', revocation_complete: true };
      // A newer explicit authorization is possible only after the prior barrier completed.
      if (auth.generation > oauthGeneration)
        return { state: 'disconnected', revocation_complete: true };
      return dto(tx, auth);
    },
    status: (owner, now = new Date()) =>
      db.runTransaction(async (tx) => dto(tx, await authorization(tx, owner, now))),
    disconnect: (owner, now = new Date()) =>
      db.runTransaction((tx) => disconnectTx(tx, owner, now)),
    start: (owner, state, now) =>
      db.runTransaction(async (tx) => {
        const auth = await authorization(tx, owner, now);
        const profile = await get(tx.collection('profiles'), owner);
        const status = await dto(tx, auth);
        if (auth.mode === 'revoking' && !status.revocation_complete)
          throw new StravaError('STRAVA_REVOCATION_PENDING', '旧授权撤销尚未完成，请稍后重试');
        if (!writable(profile))
          throw new StravaError('PROFILE_DELETION_IN_PROGRESS', '资料删除期间不能连接 Strava');
        if (auth.operation_id)
          throw new StravaError('STRAVA_OPERATION_PENDING', 'Strava 凭证操作尚未完成');
        if (auth.mode === 'connected')
          throw new StravaError('STRAVA_ALREADY_CONNECTED', '请先撤回当前 Strava 授权');
        if (auth.generation >= Number.MAX_SAFE_INTEGER)
          throw new StravaError('STRAVA_GENERATION_EXHAUSTED', '授权版本需人工核验');
        auth.generation += 1;
        auth.mode = 'authorizing';
        auth.profile_generation = generationOf(profile);
        await put(tx, 'strava_authorizations', owner, auth);
        await put(tx, 'oauth_states', state.hash, {
          _id: state.hash,
          state_hash: state.hash,
          owner_openid: owner,
          oauth_generation: auth.generation,
          profile_generation: auth.profile_generation,
          created_at: now,
          expires_at: state.expiresAt,
          consumed_at: null,
        });
      }),
    consumeState: (hash, now, mint = true) =>
      db.runTransaction(async (tx) => {
        const state = await get(tx.collection('oauth_states'), hash);
        if (!state || state.consumed_at) return undefined;
        const auth = await get(tx.collection('strava_authorizations'), state.owner_openid);
        const profile = await get(tx.collection('profiles'), state.owner_openid);
        if (
          !auth ||
          auth.mode !== 'authorizing' ||
          auth.generation !== state.oauth_generation ||
          auth.profile_generation !== state.profile_generation ||
          generationOf(profile) !== state.profile_generation ||
          !writable(profile)
        )
          revoked();
        await tx
          .collection('oauth_states')
          .doc(hash)
          .update({ data: { consumed_at: now } });
        if (!mint || new Date(state.expires_at) <= now) return state;
        return { ...state, ...(await reserve(tx, auth, 'callback', now)) };
      }),
    getCredential: (owner) =>
      db.runTransaction(async (tx) => {
        const auth = await authorization(tx, owner, new Date());
        if (auth.mode === 'revoking') revoked();
        const credential = await get(tx.collection('strava_credentials'), owner);
        if (credential) await assertFence(tx, owner, credential);
        return credential;
      }),
    checkFence: (owner, fence) => db.runTransaction((tx) => assertFence(tx, owner, fence)),
    checkPreviewTx: async (tx, preview) => {
      if (preview?.oauth_generation !== undefined)
        await assertFence(tx, preview.owner_openid, preview);
    },
    reserveRouteSource: (owner, cloudPath, fence, now) =>
      db.runTransaction(async (tx) => {
        await assertFence(tx, owner, fence);
        await put(tx, 'strava_route_sources', sourceId(cloudPath), {
          _id: sourceId(cloudPath),
          owner_openid: owner,
          cloud_path: cloudPath,
          oauth_generation: fence.oauth_generation,
          profile_generation: fence.profile_generation,
          created_at: now,
        });
      }),
    getRouteSource: (fileId) =>
      db.runTransaction(async (tx) => {
        const source = await get(tx.collection('strava_route_sources'), sourceId(filePath(fileId)));
        if (source) await assertFence(tx, source.owner_openid, source);
        return source;
      }),
    beginRefresh: (credential, now) =>
      db.runTransaction(async (tx) => {
        const auth = await assertFence(tx, credential.owner_openid, credential);
        const current = await get(tx.collection('strava_credentials'), credential.owner_openid);
        if (!current || current.revision !== credential.revision)
          throw new StravaError('STRAVA_CREDENTIAL_CHANGED', 'Strava 凭证已变化，请重试');
        return reserve(tx, auth, 'refresh', now);
      }),
    finishMint: (owner, fence, value, material, now) =>
      db.runTransaction(async (tx) => {
        const operation = await get(tx.collection('strava_operations'), fence.operation_id);
        const auth = await get(tx.collection('strava_authorizations'), owner);
        if (
          !operation ||
          operation.owner_openid !== owner ||
          auth?.operation_id !== fence.operation_id ||
          !['in_flight', 'uncertain'].includes(operation.status)
        )
          throw new StravaError('STRAVA_OPERATION_INVALID', 'Strava 凭证操作需人工核验');
        const profile = await get(tx.collection('profiles'), owner);
        const current =
          auth.generation === fence.oauth_generation &&
          auth.profile_generation === fence.profile_generation &&
          generationOf(profile) === fence.profile_generation &&
          writable(profile) &&
          ['connected', 'authorizing'].includes(auth.mode);
        if (current && value) {
          const old = await get(tx.collection('strava_credentials'), owner);
          await put(tx, 'strava_credentials', owner, {
            ...value,
            oauth_generation: fence.oauth_generation,
            profile_generation: fence.profile_generation,
            revision: (old?.revision || 0) + 1,
          });
          auth.mode = 'connected';
        } else {
          if (auth.mode !== 'revoking') {
            await disconnectTx(tx, owner, now);
            Object.assign(auth, await get(tx.collection('strava_authorizations'), owner));
          }
          await queueMaterial(tx, auth, `mint-${fence.operation_id}`, material, now);
        }
        auth.operation_id = '';
        await put(tx, 'strava_operations', operation._id, {
          ...operation,
          status: 'resolved',
          resolved_at: now,
        });
        await put(tx, 'strava_authorizations', owner, auth);
        return current && Boolean(value);
      }),
    failMint: (owner, fence, uncertain, now) =>
      db.runTransaction(async (tx) => {
        const auth = await get(tx.collection('strava_authorizations'), owner);
        const operation = await get(tx.collection('strava_operations'), fence.operation_id);
        if (!operation || auth?.operation_id !== operation._id) return;
        if (uncertain) {
          await disconnectTx(tx, owner, now);
          await tx
            .collection('strava_operations')
            .doc(operation._id)
            .update({
              data: { status: 'uncertain' },
            });
        } else {
          auth.operation_id = '';
          auth.mode = 'disconnected';
          auth.pending_count = 0;
          auth.last_error_code = '';
          await tx.collection('strava_credentials').doc(owner).remove();
          await put(tx, 'strava_authorizations', owner, auth);
          await tx
            .collection('strava_operations')
            .doc(operation._id)
            .update({
              data: { status: 'resolved', resolved_at: now },
            });
        }
      }),
    getPreview: (id) => get(db.collection('route_previews'), id),
    putPreview: (id, value) =>
      db.runTransaction(async (tx) => {
        await store.checkPreviewTx(tx, value);
        const source = value.source_file_id
          ? await get(
              tx.collection('strava_route_sources'),
              sourceId(filePath(value.source_file_id)),
            )
          : undefined;
        if (source) {
          if (source.owner_openid !== value.owner_openid) revoked();
          await assertFence(tx, source.owner_openid, source);
          value = {
            ...value,
            oauth_generation: source.oauth_generation,
            profile_generation: source.profile_generation,
          };
        }
        await store.checkPreviewTx(tx, value);
        const prior = await get(tx.collection('route_previews'), id);
        if (prior) {
          await store.checkPreviewTx(tx, prior);
          return prior;
        }
        await put(tx, 'route_previews', id, value);
        return value;
      }),
    updatePreview: (id, data) =>
      db.runTransaction(async (tx) => {
        const preview = await get(tx.collection('route_previews'), id);
        if (!preview) throw new StravaError('ROUTE_PREVIEW_NOT_FOUND', '路线预览不存在');
        await store.checkPreviewTx(tx, preview);
        await tx.collection('route_previews').doc(id).update({ data });
      }),
    uploadFile: (input) => cloud.uploadFile(input),
    drainRevocations: async ({
      now = new Date(),
      limit = REVOKE_BATCH,
      owner,
      fetchImpl = fetch,
    } = {}) => {
      const condition = {
        status: 'pending',
        retry_at: db.command.lte(now),
        ...(owner ? { owner_openid: owner } : {}),
      };
      const rows = (
        await db
          .collection('strava_revocations')
          .where(condition)
          .orderBy('retry_at', 'asc')
          .orderBy('_id', 'asc')
          .limit(Math.max(1, Math.min(REVOKE_BATCH, limit)))
          .get()
      ).data;
      let completed = 0;
      for (const row of rows) {
        const leaseId = crypto.randomUUID();
        const claimed = await db.runTransaction(async (tx) => {
          const current = await get(tx.collection('strava_revocations'), row._id);
          if (
            !current ||
            current.status !== 'pending' ||
            new Date(current.retry_at) > now ||
            (current.lease_id && new Date(current.lease_expires_at) > now)
          )
            return false;
          await tx
            .collection('strava_revocations')
            .doc(row._id)
            .update({
              data: {
                lease_id: leaseId,
                lease_expires_at: new Date(now.getTime() + REVOKE_LEASE_MS),
              },
            });
          return true;
        });
        if (!claimed) continue;
        let result;
        try {
          result = await revokeToken(
            decrypt(row.token_cipher, env.STRAVA_TOKEN_ENCRYPTION_KEY),
            env,
            fetchImpl,
          );
        } catch {
          result = { state: 'manual', code: 'STRAVA_REVOCATION_CONFIG' };
        }
        await db.runTransaction(async (tx) => {
          const current = await get(tx.collection('strava_revocations'), row._id);
          if (current?.lease_id !== leaseId || current.status !== 'pending') return;
          const attempts = current.attempts + 1;
          const success = result.state === 'completed';
          const manual = result.state === 'manual' || attempts >= MAX_ATTEMPTS;
          const auth = await get(tx.collection('strava_authorizations'), row.owner_openid);
          await put(tx, 'strava_revocations', row._id, {
            ...current,
            attempts,
            status: success ? 'completed' : manual ? 'manual' : 'pending',
            token_cipher: success ? null : current.token_cipher,
            lease_id: '',
            lease_expires_at: null,
            retry_at:
              success || manual
                ? null
                : new Date(now.getTime() + Math.min(3600000, 60000 * 2 ** (attempts - 1))),
            last_error_code: success ? '' : result.code,
            updated_at: now,
          });
          if (auth?.generation === row.generation && auth.mode === 'revoking') {
            if (success) auth.pending_count -= 1;
            else if (manual) auth.manual_count += 1;
            await put(tx, 'strava_authorizations', auth._id, auth);
          }
          if (success) completed += 1;
        });
      }
      const operations = (
        await db
          .collection('strava_operations')
          .where({
            status: 'in_flight',
            expires_at: db.command.lte(now),
            ...(owner ? { owner_openid: owner } : {}),
          })
          .orderBy('expires_at', 'asc')
          .orderBy('_id', 'asc')
          .limit(10)
          .get()
      ).data;
      for (const operation of operations)
        await store.failMint(operation.owner_openid, { operation_id: operation._id }, true, now);
      return { attempted: rows.length, completed, uncertain: operations.length };
    },
  };
  return store;
}
module.exports = {
  createStravaStore,
  MINT_LEASE_MS,
  REVOKE_LEASE_MS,
  MAX_ATTEMPTS,
  REVOKE_BATCH,
};
