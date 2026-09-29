'use strict';

const { MAX_ATTEMPTS, nextRetryAt } = require('./core');

function coded(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function missing(error) {
  return (
    error &&
    (Number(error.errCode) === -502001 || /not exist|not found/i.test(String(error.errMsg || '')))
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

function expired(value, now) {
  const timestamp = Date.parse(value);
  return !Number.isFinite(timestamp) || timestamp <= now.getTime();
}

function trustedDate(value) {
  if (value instanceof Date && Number.isFinite(value.getTime())) return new Date(value.getTime());
  if (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
  ) {
    const parsed = new Date(value);
    if (Number.isFinite(parsed.getTime())) return parsed;
  }
  coded('INVALID_RETRY_TIME', '通知重试时间无效');
}

function fairReadyIds(groups, limit) {
  const result = [];
  const seen = new Set();
  for (let index = 0; result.length < limit; index += 1) {
    let found = false;
    for (const group of groups) {
      const entry = group[index];
      if (!entry) continue;
      found = true;
      if (!seen.has(entry._id)) {
        seen.add(entry._id);
        result.push(entry._id);
        if (result.length === limit) break;
      }
    }
    if (!found) break;
  }
  return result;
}

function createNotificationStore(db) {
  const command = db.command;

  async function fencedTransition(id, fence, expectedStatus, data) {
    return db.runTransaction(async (tx) => {
      const collection = tx.collection('notification_outbox');
      const current = await get(collection, id);
      if (
        !current ||
        !(Array.isArray(expectedStatus)
          ? expectedStatus.includes(current.status)
          : current.status === expectedStatus) ||
        current.lease_id !== fence.leaseId ||
        Number(current.attempt_no) !== fence.attemptNo
      )
        return false;
      await collection.doc(id).update({ data });
      return true;
    });
  }

  return {
    requireAdmin: async (openid) => {
      const admin = await get(db.collection('admins'), openid);
      if (!admin || admin._id !== openid || admin.enabled === false)
        coded('ADMIN_REQUIRED', '需要管理员权限');
    },
    listReady: async (limit, now = new Date()) => {
      const collection = db.collection('notification_outbox');
      const [immediate, retryable, claimed] = await Promise.all([
        collection
          .where({ status: command.in(['pending', 'failed']), attempts: command.lt(MAX_ATTEMPTS) })
          .orderBy('lease_expires_at', 'asc')
          .limit(limit)
          .get(),
        collection
          .where({
            status: 'retryable',
            attempts: command.lt(MAX_ATTEMPTS),
            next_retry_at: command.lte(now),
          })
          .orderBy('next_retry_at', 'asc')
          .limit(limit)
          .get(),
        collection
          .where({
            status: 'claimed',
            attempts: command.lt(MAX_ATTEMPTS),
            lease_expires_at: command.lte(now),
          })
          .orderBy('lease_expires_at', 'asc')
          .limit(limit)
          .get(),
      ]);
      return fairReadyIds([immediate.data, retryable.data, claimed.data], limit);
    },
    claim: (id, { claimant, leaseId, now, maxAttempts, leaseMs }) =>
      db.runTransaction(async (tx) => {
        const collection = tx.collection('notification_outbox');
        const current = await get(collection, id);
        if (!current) coded('OUTBOX_NOT_FOUND', '通知任务不存在');
        if (['sent', 'delivery_unknown', 'failed_terminal'].includes(current.status))
          return { ...current, claimed: false };
        if (['dispatching', 'sending'].includes(current.status)) {
          if (expired(current.lease_expires_at, now)) {
            const next = {
              ...current,
              status: 'delivery_unknown',
              lease_expires_at: null,
              last_error: 'DELIVERY_LEASE_EXPIRED',
              updated_at: now,
            };
            await collection.doc(id).update({
              data: {
                status: next.status,
                lease_expires_at: null,
                last_error: next.last_error,
                updated_at: now,
              },
            });
            return { ...next, claimed: false };
          }
          return { ...current, claimed: false };
        }
        if (current.status === 'claimed' && !expired(current.lease_expires_at, now))
          return { ...current, claimed: false };
        if (current.status === 'retryable' && !expired(current.next_retry_at, now))
          return { ...current, claimed: false };
        if (!['pending', 'retryable', 'failed', 'claimed'].includes(current.status))
          coded('INVALID_OUTBOX_STATE', '通知状态不可消费');
        const attempts = Number(current.attempt_no ?? current.attempts ?? 0);
        if (attempts >= maxAttempts) coded('MAX_RETRIES_EXCEEDED', '通知任务已达到最大重试次数');
        const attemptNo = attempts + 1;
        const next = {
          ...current,
          status: 'claimed',
          attempts: attemptNo,
          attempt_no: attemptNo,
          claimed_by: claimant,
          lease_id: leaseId,
          lease_expires_at: new Date(now.getTime() + leaseMs),
          updated_at: now,
          last_error: '',
        };
        await collection.doc(id).update({
          data: {
            status: next.status,
            attempts: next.attempts,
            attempt_no: next.attempt_no,
            claimed_by: next.claimed_by,
            lease_id: next.lease_id,
            lease_expires_at: next.lease_expires_at,
            updated_at: now,
            last_error: '',
            next_retry_at: command.remove(),
            dispatch_outcome: command.remove(),
          },
        });
        return { ...next, claimed: true };
      }),
    beginDispatch: (id, fence) =>
      fencedTransition(id, fence, 'claimed', {
        status: 'dispatching',
        dispatch_started_at: fence.now,
        dispatch_outcome: command.remove(),
        updated_at: fence.now,
      }),
    recordDispatchOutcome: (id, fence) => {
      const retryAt =
        fence.disposition === 'retryable'
          ? nextRetryAt(fence.errorCode, fence.attemptNo, fence.now)
          : null;
      return fencedTransition(id, fence, 'dispatching', {
        dispatch_outcome: {
          disposition: fence.disposition,
          error_code: fence.errorCode,
          recorded_at: fence.now,
          ...(retryAt ? { retry_at: retryAt } : {}),
        },
        updated_at: fence.now,
      });
    },
    markSent: (id, fence) =>
      fencedTransition(id, fence, 'dispatching', {
        status: 'sent',
        sent_at: fence.now,
        updated_at: fence.now,
        lease_expires_at: null,
        last_error: '',
      }),
    markRetryable: async (id, fence) =>
      fencedTransition(id, fence, ['claimed', 'dispatching'], {
        status: 'retryable',
        updated_at: fence.now,
        lease_expires_at: null,
        next_retry_at: nextRetryAt(fence.errorCode, fence.attemptNo, fence.now),
        last_error: fence.errorCode,
      }),
    markTerminal: (id, fence) =>
      fencedTransition(id, fence, 'dispatching', {
        status: 'failed_terminal',
        updated_at: fence.now,
        lease_expires_at: null,
        last_error: fence.errorCode,
      }),
    markDeliveryUnknown: (id, fence) =>
      fencedTransition(id, fence, 'dispatching', {
        status: 'delivery_unknown',
        updated_at: fence.now,
        lease_expires_at: null,
        last_error: fence.errorCode,
      }),
    recoverExpiredDispatching: async (now, limit) => {
      const result = await db
        .collection('notification_outbox')
        .where({
          status: command.in(['dispatching', 'sending']),
          lease_expires_at: command.lte(now),
        })
        .orderBy('lease_expires_at', 'asc')
        .limit(limit)
        .get();
      let recovered = 0;
      for (const entry of result.data) {
        const changed = await db.runTransaction(async (tx) => {
          const collection = tx.collection('notification_outbox');
          const current = await get(collection, entry._id);
          if (
            !current ||
            !['dispatching', 'sending'].includes(current.status) ||
            !expired(current.lease_expires_at, now)
          )
            return false;
          const outcome = current.dispatch_outcome;
          const status =
            outcome && outcome.disposition === 'retryable'
              ? 'retryable'
              : outcome && outcome.disposition === 'terminal'
                ? 'failed_terminal'
                : 'delivery_unknown';
          const data = {
            status,
            lease_expires_at: null,
            last_error:
              outcome && typeof outcome.error_code === 'string'
                ? outcome.error_code
                : 'DELIVERY_LEASE_EXPIRED',
            updated_at: now,
          };
          if (status === 'retryable') {
            if (Object.prototype.hasOwnProperty.call(outcome, 'retry_at')) {
              data.next_retry_at = trustedDate(outcome.retry_at);
            } else {
              data.next_retry_at = nextRetryAt(
                outcome.error_code,
                Number(current.attempt_no),
                trustedDate(outcome.recorded_at),
              );
            }
          }
          await collection.doc(entry._id).update({
            data,
          });
          return true;
        });
        if (changed) recovered += 1;
      }
      return recovered;
    },
  };
}

module.exports = { coded, missing, get, trustedDate, fairReadyIds, createNotificationStore };
