'use strict';

const crypto = require('node:crypto');
const { StravaError, decrypt, revokeToken } = require('./core');
const MINT_LEASE_MS = 2 * 60 * 1000;
const REVOKE_LEASE_MS = 30 * 1000;
const MAX_ATTEMPTS = 8;
const REVOKE_BATCH = 2;
const REVOKE_SCAN_LIMIT = 20;
const REVOCATION_MANUAL_REASONS = Object.freeze({
  INVALID_MATERIAL: 'STRAVA_REVOCATION_MATERIAL_INVALID',
  AUTHORIZATION_MISSING: 'STRAVA_REVOCATION_AUTHORIZATION_MISSING',
  OWNER_MISMATCH: 'STRAVA_REVOCATION_OWNER_MISMATCH',
  GENERATION_MISMATCH: 'STRAVA_REVOCATION_GENERATION_MISMATCH',
  AUTHORIZATION_INVALID: 'STRAVA_REVOCATION_AUTHORIZATION_INVALID',
  LEDGER_INVALID: 'STRAVA_REVOCATION_LEDGER_INVALID',
  ATTEMPTS_EXHAUSTED: 'STRAVA_REVOCATION_ATTEMPTS_EXHAUSTED',
});
const withoutId = ({ _id, ...data }) => data;
const validDate = (value) => value instanceof Date && Number.isFinite(value.getTime());
const missingValue = (value) => value === null || value === undefined;
function validMaterialSchedule(row) {
  if (row.status === 'manual')
    return missingValue(row.retry_at) && row.lease_id === '' && missingValue(row.lease_expires_at);
  if (row.status !== 'pending' || !validDate(row.retry_at)) return false;
  if (row.lease_id === '') return missingValue(row.lease_expires_at);
  return (
    typeof row.lease_id === 'string' && Boolean(row.lease_id) && validDate(row.lease_expires_at)
  );
}
function missing(error) {
  const code = String(error?.errCode || error?.code || '');
  const message = String(error?.errMsg || error?.message || '');
  const explicitDocumentMissing =
    /\bdocument(?:\s+with\s+_id\s+\S+)?\s+(?:(?:does\s+)?not\s+exist|not\s+found)\b/i.test(message);
  return (
    ['DATABASE_DOCUMENT_NOT_EXIST', 'DOCUMENT_NOT_FOUND'].includes(code) ||
    ([-502001, -1].includes(Number(error?.errCode)) && explicitDocumentMissing)
  );
}
async function get(collection, id) {
  try {
    return (await collection.doc(id).get()).data;
  } catch (error) {
    if (missing(error)) return undefined;
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
const sourceId = (cloudPath) => crypto.createHash('sha256').update(cloudPath).digest('hex');
const filePath = (fileId) =>
  typeof fileId === 'string' && fileId.startsWith('cloud://')
    ? fileId.slice(fileId.indexOf('/', 8) + 1)
    : '';

function createStravaStore(db, { env = process.env, cloud, privacy } = {}) {
  if (
    !privacy ||
    ['profileGeneration', 'isProfileDeleted', 'assertProfileWritable'].some(
      (key) => typeof privacy[key] !== 'function',
    )
  )
    throw new StravaError('STRAVA_PRIVACY_CONTRACT_REQUIRED', 'Explicit privacy contract required');
  const generationOf = (profile) => privacy.profileGeneration(profile);
  const writable = (profile) => !privacy.isProfileDeleted(profile);
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
      authorization_state_hash: '',
      authorization_expires_at: null,
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
  async function ledger(tx, auth) {
    const materials = (
      await tx
        .collection('strava_revocations')
        .where({
          owner_openid: auth._id,
          status: db.command.neq('completed'),
        })
        .limit(100)
        .get()
    ).data;
    const operations = (
      await tx
        .collection('strava_operations')
        .where({
          owner_openid: auth._id,
          status: db.command.neq('resolved'),
        })
        .limit(100)
        .get()
    ).data;
    const pointer = auth.operation_id
      ? await get(tx.collection('strava_operations'), auth.operation_id)
      : undefined;
    // A saturated scan is not evidence of an empty or complete ledger.
    const invalid =
      materials.length >= 100 ||
      operations.length >= 100 ||
      !Number.isSafeInteger(auth.generation) ||
      auth.generation < 1 ||
      !['connected', 'disconnected', 'authorizing', 'revoking'].includes(auth.mode) ||
      auth.owner_openid !== auth._id ||
      auth.pending_count !== materials.length ||
      auth.manual_count !== materials.filter((row) => row.status === 'manual').length ||
      materials.some(
        (row) =>
          !['pending', 'manual'].includes(row.status) ||
          row.generation !== auth.generation ||
          !Number.isSafeInteger(row.attempts) ||
          row.attempts < 0 ||
          row.attempts > MAX_ATTEMPTS ||
          !validMaterialSchedule(row) ||
          !row.token_cipher,
      ) ||
      operations.some(
        (row) =>
          !['in_flight', 'uncertain'].includes(row.status) ||
          !['callback', 'refresh'].includes(row.kind) ||
          !Number.isSafeInteger(row.oauth_generation) ||
          row.oauth_generation < 1 ||
          row.oauth_generation > auth.generation ||
          !Number.isSafeInteger(row.profile_generation) ||
          row.profile_generation < 1 ||
          row.profile_generation > auth.profile_generation ||
          !validDate(row.expires_at),
      ) ||
      operations.length > 1 ||
      (auth.operation_id
        ? !pointer ||
          pointer.owner_openid !== auth._id ||
          !['in_flight', 'uncertain'].includes(pointer.status) ||
          !['callback', 'refresh'].includes(pointer.kind) ||
          operations[0]?._id !== auth.operation_id
        : operations.length !== 0);
    return {
      materials,
      operations,
      invalid,
      manual:
        materials.some((row) => row.status === 'manual') ||
        operations.some((row) => row.status === 'uncertain'),
      pending: materials.length > 0 || operations.length > 0,
    };
  }
  async function endAuthorization(tx, auth, now) {
    auth.mode = 'disconnected';
    auth.authorization_state_hash = '';
    auth.authorization_expires_at = null;
    auth.updated_at = now;
    await put(tx, 'strava_authorizations', auth._id, auth);
  }
  const expired = (value, now) =>
    !Number.isFinite(new Date(value).getTime()) || new Date(value) <= now;
  async function reconcileAuthorizationTx(tx, auth, now) {
    if (auth.mode !== 'authorizing' || auth.operation_id || !auth.authorization_state_hash) return;
    const state = await get(tx.collection('oauth_states'), auth.authorization_state_hash);
    const profile = await get(tx.collection('profiles'), auth._id);
    if (
      !state ||
      state.consumed_at ||
      state.owner_openid !== auth._id ||
      state.oauth_generation !== auth.generation ||
      state.profile_generation !== auth.profile_generation ||
      generationOf(profile) !== auth.profile_generation ||
      !writable(profile)
    )
      return;
    if (expired(auth.authorization_expires_at, now) || expired(state.expires_at, now)) {
      await tx
        .collection('oauth_states')
        .doc(state._id)
        .update({ data: { consumed_at: now } });
      await endAuthorization(tx, auth, now);
    }
  }
  async function dto(tx, auth, now = new Date()) {
    await reconcileAuthorizationTx(tx, auth, now);
    const evidence = await ledger(tx, auth);
    const state =
      evidence.invalid || evidence.manual
        ? 'manual_review'
        : auth.mode === 'revoking'
          ? evidence.pending
            ? 'revocation_pending'
            : 'disconnected'
          : evidence.materials.length
            ? 'revocation_pending'
            : auth.mode === 'disconnected' && evidence.pending
              ? 'revocation_pending'
              : auth.mode === 'authorizing' && !auth.operation_id && !auth.authorization_state_hash
                ? 'manual_review'
                : auth.mode;
    const credential =
      state === 'connected' ? await get(tx.collection('strava_credentials'), auth._id) : undefined;
    const profile = await get(tx.collection('profiles'), auth._id);
    return {
      state,
      generation: auth.generation,
      import_ready:
        state === 'connected' &&
        Boolean(credential) &&
        writable(profile) &&
        generationOf(profile) === auth.profile_generation &&
        credential.oauth_generation === auth.generation &&
        credential.profile_generation === auth.profile_generation &&
        !evidence.pending,
      revocation_complete: state === 'disconnected' && !evidence.pending,
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
    const evidence = await ledger(tx, auth);
    if (evidence.invalid || evidence.manual || evidence.materials.length) revoked();
    privacy.assertProfileWritable(profile, fence.profile_generation);
    return auth;
  }
  async function queueMaterial(tx, auth, id, cipher, now) {
    if (!cipher || (await get(tx.collection('strava_revocations'), id))) return;
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
      return dto(tx, auth, now);
    if (auth.mode === 'revoking') return dto(tx, auth, now);
    if (auth.generation >= Number.MAX_SAFE_INTEGER)
      throw new StravaError('STRAVA_GENERATION_EXHAUSTED', '授权版本需人工核验');
    const credential = await get(tx.collection('strava_credentials'), owner);
    auth.generation += 1;
    auth.mode = 'revoking';
    auth.updated_at = now;
    auth.authorization_state_hash = '';
    auth.authorization_expires_at = null;
    if (credential) {
      await queueMaterial(
        tx,
        auth,
        `credential-${crypto.randomUUID()}`,
        credential.access_token_cipher,
        now,
      );
      await tx.collection('strava_credentials').doc(owner).remove();
    }
    await put(tx, 'strava_authorizations', owner, auth);
    return dto(tx, auth, now);
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
    auth.authorization_state_hash = '';
    auth.authorization_expires_at = null;
    await put(tx, 'strava_authorizations', auth._id, auth);
    return {
      operation_id: id,
      oauth_generation: auth.generation,
      profile_generation: auth.profile_generation,
      kind,
    };
  }
  async function operationTx(tx, owner, fence) {
    const operation = fence?.operation_id
      ? await get(tx.collection('strava_operations'), fence.operation_id)
      : undefined;
    const auth = await get(tx.collection('strava_authorizations'), owner);
    if (
      !operation ||
      !auth ||
      auth.owner_openid !== owner ||
      operation.owner_openid !== owner ||
      !['callback', 'refresh'].includes(operation.kind) ||
      operation.kind !== fence.kind ||
      operation.oauth_generation !== fence.oauth_generation ||
      operation.profile_generation !== fence.profile_generation ||
      !Number.isSafeInteger(operation.oauth_generation) ||
      !Number.isSafeInteger(operation.profile_generation) ||
      !['in_flight', 'uncertain', 'resolved'].includes(operation.status) ||
      (operation.status !== 'resolved' && auth.operation_id !== operation._id)
    )
      throw new StravaError('STRAVA_OPERATION_INVALID', 'Strava 凭证操作需人工核验');
    return { operation, auth };
  }
  async function matchingOperation(tx, auth, operation) {
    const profile = await get(tx.collection('profiles'), auth._id);
    return (
      auth.generation === operation.oauth_generation &&
      auth.profile_generation === operation.profile_generation &&
      generationOf(profile) === operation.profile_generation &&
      writable(profile) &&
      ['connected', 'authorizing'].includes(auth.mode)
    );
  }
  const store = {
    disconnectTx,
    deletionStatusTx: async (tx, owner, oauthGeneration, expectedProfileGeneration) => {
      const auth = await get(tx.collection('strava_authorizations'), owner);
      if (!auth || auth.generation < oauthGeneration)
        return { state: 'manual_review', revocation_complete: false };
      const evidence = await ledger(tx, auth);
      if (
        evidence.invalid ||
        evidence.materials.some((row) => row.generation <= oauthGeneration) ||
        evidence.operations.some((row) => row.oauth_generation < oauthGeneration)
      )
        return {
          state: evidence.manual || evidence.invalid ? 'manual_review' : 'revocation_pending',
          revocation_complete: false,
        };
      if (
        expectedProfileGeneration !== undefined &&
        auth.profile_generation > expectedProfileGeneration
      )
        return { state: 'disconnected', revocation_complete: true };
      if (auth.generation > oauthGeneration)
        return { state: 'disconnected', revocation_complete: true };
      return dto(tx, auth);
    },
    status: (owner, now = new Date()) =>
      db.runTransaction(async (tx) => dto(tx, await authorization(tx, owner, now), now)),
    disconnect: (owner, now = new Date()) =>
      db.runTransaction((tx) => disconnectTx(tx, owner, now)),
    start: (owner, state, now, expectedProfileGeneration) =>
      db.runTransaction(async (tx) => {
        const auth = await authorization(tx, owner, now);
        const profile = await get(tx.collection('profiles'), owner);
        const status = await dto(tx, auth, now);
        if (['manual_review', 'revocation_pending'].includes(status.state))
          throw new StravaError('STRAVA_REVOCATION_PENDING', '旧授权撤销尚未完成，请稍后重试');
        privacy.assertProfileWritable(profile, expectedProfileGeneration);
        if (auth.operation_id)
          throw new StravaError('STRAVA_OPERATION_PENDING', 'Strava 凭证操作尚未完成');
        if (auth.mode === 'authorizing')
          throw new StravaError('STRAVA_AUTHORIZATION_PENDING', 'Strava 授权尚未完成');
        if (auth.mode === 'connected')
          throw new StravaError('STRAVA_ALREADY_CONNECTED', '请先撤回当前 Strava 授权');
        if (auth.generation >= Number.MAX_SAFE_INTEGER)
          throw new StravaError('STRAVA_GENERATION_EXHAUSTED', '授权版本需人工核验');
        auth.generation += 1;
        auth.mode = 'authorizing';
        auth.profile_generation = generationOf(profile);
        auth.authorization_state_hash = state.hash;
        auth.authorization_expires_at = state.expiresAt;
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
          auth.authorization_state_hash !== hash ||
          auth.operation_id ||
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
        if (
          !mint ||
          expired(state.expires_at, now) ||
          expired(auth.authorization_expires_at, now)
        ) {
          await endAuthorization(tx, auth, now);
          return state;
        }
        return { ...state, ...(await reserve(tx, auth, 'callback', now)) };
      }),
    getCredential: (owner) =>
      db.runTransaction(async (tx) => {
        const auth = await authorization(tx, owner, new Date());
        const status = await dto(tx, auth);
        if (['revocation_pending', 'manual_review'].includes(status.state)) revoked();
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
        const { operation, auth } = await operationTx(tx, owner, fence);
        if (operation.status === 'resolved') return operation.saved === true;
        if (!material) {
          await disconnectTx(tx, owner, now);
          await put(tx, 'strava_operations', operation._id, { ...operation, status: 'uncertain' });
          return false;
        }
        const current = await matchingOperation(tx, auth, operation);
        if (current && value) {
          const old = await get(tx.collection('strava_credentials'), owner);
          await put(tx, 'strava_credentials', owner, {
            ...value,
            oauth_generation: operation.oauth_generation,
            profile_generation: operation.profile_generation,
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
          saved: current && Boolean(value),
        });
        await put(tx, 'strava_authorizations', owner, auth);
        return current && Boolean(value);
      }),
    failMint: (owner, fence, uncertain, now) =>
      db.runTransaction(async (tx) => {
        const { auth, operation } = await operationTx(tx, owner, fence);
        if (operation.status === 'resolved') return;
        if (uncertain) {
          await disconnectTx(tx, owner, now);
          await tx
            .collection('strava_operations')
            .doc(operation._id)
            .update({ data: { status: 'uncertain' } });
        } else {
          auth.operation_id = '';
          if (await matchingOperation(tx, auth, operation)) {
            auth.mode = auth.pending_count || auth.manual_count ? 'revoking' : 'disconnected';
            await tx.collection('strava_credentials').doc(owner).remove();
          }
          await put(tx, 'strava_authorizations', owner, auth);
          await tx
            .collection('strava_operations')
            .doc(operation._id)
            .update({ data: { status: 'resolved', resolved_at: now, saved: false } });
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
      const batchLimit = Math.max(1, Math.min(REVOKE_BATCH, limit));
      const condition = {
        status: 'pending',
        retry_at: db.command.lte(now),
        ...(owner ? { owner_openid: owner } : {}),
      };
      const dueRows = (
        await db
          .collection('strava_revocations')
          .where(condition)
          .orderBy('retry_at', 'asc')
          .orderBy('_id', 'asc')
          .limit(REVOKE_SCAN_LIMIT)
          .get()
      ).data;
      const auditRows = (
        await db
          .collection('strava_revocations')
          .where({ status: 'pending', ...(owner ? { owner_openid: owner } : {}) })
          .limit(REVOKE_SCAN_LIMIT)
          .get()
      ).data;
      const rows = [...dueRows, ...auditRows].filter(
        (row, index, all) => all.findIndex((candidate) => candidate._id === row._id) === index,
      );
      let attempted = 0;
      let completed = 0;
      let isolated = 0;
      for (const row of rows) {
        if (attempted >= batchLimit) break;
        const leaseId = crypto.randomUUID();
        const claim = await db.runTransaction(async (tx) => {
          const current = await get(tx.collection('strava_revocations'), row._id);
          if (
            !current ||
            current.status !== 'pending' ||
            new Date(current.retry_at) > now ||
            (current.lease_id && new Date(current.lease_expires_at) > now)
          )
            return { state: 'skipped' };
          const auth =
            typeof current.owner_openid === 'string' && current.owner_openid
              ? await get(tx.collection('strava_authorizations'), current.owner_openid)
              : undefined;
          let reason = '';
          if (
            typeof current.owner_openid !== 'string' ||
            !current.owner_openid ||
            !Number.isSafeInteger(current.generation) ||
            current.generation < 1 ||
            !Number.isSafeInteger(current.attempts) ||
            current.attempts < 0 ||
            current.attempts > MAX_ATTEMPTS ||
            !validMaterialSchedule(current) ||
            !current.token_cipher
          )
            reason = REVOCATION_MANUAL_REASONS.INVALID_MATERIAL;
          else if (!auth) reason = REVOCATION_MANUAL_REASONS.AUTHORIZATION_MISSING;
          else if (auth.owner_openid !== current.owner_openid)
            reason = REVOCATION_MANUAL_REASONS.OWNER_MISMATCH;
          else if (auth.generation !== current.generation)
            reason = REVOCATION_MANUAL_REASONS.GENERATION_MISMATCH;
          else if (auth.mode !== 'revoking')
            reason = REVOCATION_MANUAL_REASONS.AUTHORIZATION_INVALID;
          else if ((await ledger(tx, auth)).invalid)
            reason = REVOCATION_MANUAL_REASONS.LEDGER_INVALID;
          else if (current.attempts >= MAX_ATTEMPTS)
            reason = current.last_error_code || REVOCATION_MANUAL_REASONS.ATTEMPTS_EXHAUSTED;
          if (reason) {
            await put(tx, 'strava_revocations', current._id, {
              ...current,
              status: 'manual',
              lease_id: '',
              lease_expires_at: null,
              retry_at: null,
              last_error_code: reason,
              updated_at: now,
            });
            if (
              auth?.owner_openid === current.owner_openid &&
              auth.generation === current.generation &&
              auth.mode === 'revoking' &&
              Number.isSafeInteger(auth.manual_count)
            ) {
              auth.manual_count += 1;
              await put(tx, 'strava_authorizations', auth._id, auth);
            }
            return { state: 'isolated' };
          }
          await tx
            .collection('strava_revocations')
            .doc(row._id)
            .update({
              data: {
                attempts: current.attempts + 1,
                lease_id: leaseId,
                lease_expires_at: new Date(now.getTime() + REVOKE_LEASE_MS),
              },
            });
          return { state: 'claimed', tokenCipher: current.token_cipher };
        });
        if (claim.state === 'isolated') {
          isolated += 1;
          continue;
        }
        if (claim.state !== 'claimed') continue;
        attempted += 1;
        let result;
        try {
          result = await revokeToken(
            decrypt(claim.tokenCipher, env.STRAVA_TOKEN_ENCRYPTION_KEY),
            env,
            fetchImpl,
          );
        } catch {
          result = { state: 'manual', code: 'STRAVA_REVOCATION_CONFIG' };
        }
        const settled = await db.runTransaction(async (tx) => {
          const current = await get(tx.collection('strava_revocations'), row._id);
          if (current?.lease_id !== leaseId || current.status !== 'pending') return;
          const auth = await get(tx.collection('strava_authorizations'), current.owner_openid);
          if (
            !auth ||
            auth.owner_openid !== current.owner_openid ||
            auth.mode !== 'revoking' ||
            auth.generation !== current.generation ||
            (await ledger(tx, auth)).invalid
          )
            return;
          const attempts = current.attempts;
          const success = result.state === 'completed';
          const manual = result.state === 'manual' || attempts >= MAX_ATTEMPTS;
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
          if (success) auth.pending_count -= 1;
          else if (manual) auth.manual_count += 1;
          await put(tx, 'strava_authorizations', auth._id, auth);
          await dto(tx, auth, now);
          return success;
        });
        if (settled) completed += 1;
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
      let uncertain = 0;
      for (const operation of operations) {
        if (!validDate(operation.expires_at)) continue;
        await store.failMint(
          operation.owner_openid,
          { ...operation, operation_id: operation._id },
          true,
          now,
        );
        uncertain += 1;
      }
      const [pendingVisible, manualVisible] = await Promise.all([
        db.collection('strava_revocations').where({ status: 'pending' }).limit(101).get(),
        db.collection('strava_revocations').where({ status: 'manual' }).limit(101).get(),
      ]);
      const pendingRows = Array.isArray(pendingVisible?.data) ? pendingVisible.data : [];
      const manualRows = Array.isArray(manualVisible?.data) ? manualVisible.data : [];
      return {
        attempted,
        completed,
        isolated,
        uncertain,
        backlog_pending_visible: Math.min(100, pendingRows.length),
        backlog_pending_truncated: pendingRows.length > 100,
        manual_review_visible: Math.min(100, manualRows.length),
        manual_review_truncated: manualRows.length > 100,
      };
    },
  };
  return store;
}
module.exports = { createStravaStore, MINT_LEASE_MS, REVOKE_LEASE_MS, MAX_ATTEMPTS, REVOKE_BATCH };
