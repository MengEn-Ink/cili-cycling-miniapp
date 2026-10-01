'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  MAX_ATTEMPTS,
  LEASE_MS,
  buildReadyCondition,
  consumeNotification,
  drainNotifications,
  subscriptionTemplateIds,
  messageData,
} = require('./core');
const env = {
  REVIEW_APPROVED_TEMPLATE_ID: 'approved-template',
  REVIEW_REJECTED_TEMPLATE_ID: 'rejected-template',
};
function fixture(overrides = {}) {
  const item = {
    _id: 'o1',
    target_openid: 'member-openid',
    template_key: 'review_approved',
    status: 'pending',
    attempts: 0,
    payload: { registration_id: 'r1', decision: 'approved' },
    ...overrides,
  };
  const calls = [];
  const fenced = (lease) => item.lease_id === lease.leaseId && item.attempt_no === lease.attemptNo;
  const store = {
    listReady: async () => [item._id],
    recoverExpiredDispatching: async (now) => {
      if (
        ['dispatching', 'sending'].includes(item.status) &&
        Date.parse(item.lease_expires_at) <= now.getTime()
      ) {
        item.status =
          item.dispatch_outcome?.disposition === 'retryable'
            ? 'retryable'
            : item.dispatch_outcome?.disposition === 'terminal'
              ? 'failed_terminal'
              : 'delivery_unknown';
        item.lease_expires_at = null;
        return 1;
      }
      return 0;
    },
    claim: async (_id, { claimant, leaseId, now, maxAttempts, leaseMs }) => {
      if (['sent', 'delivery_unknown', 'failed_terminal'].includes(item.status))
        return { ...item, claimed: false };
      if (item.status === 'dispatching') {
        if (Date.parse(item.lease_expires_at) <= now.getTime()) {
          item.status = 'delivery_unknown';
          item.lease_expires_at = null;
        }
        return { ...item, claimed: false };
      }
      if (item.status === 'claimed' && Date.parse(item.lease_expires_at) > now.getTime())
        return { ...item, claimed: false };
      if (item.attempts >= maxAttempts) {
        const error = new Error('通知任务已达到最大重试次数');
        error.code = 'MAX_RETRIES_EXCEEDED';
        throw error;
      }
      item.status = 'claimed';
      item.attempts += 1;
      item.attempt_no = item.attempts;
      item.claimed_by = claimant;
      item.lease_id = leaseId;
      item.lease_expires_at = new Date(now.getTime() + leaseMs);
      return { ...item, claimed: true };
    },
    beginDispatch: async (_id, lease) => {
      if (item.status !== 'claimed' || !fenced(lease)) return false;
      item.status = 'dispatching';
      return true;
    },
    recordDispatchOutcome: async (_id, lease) => {
      if (item.status !== 'dispatching' || !fenced(lease)) return false;
      item.dispatch_outcome = {
        disposition: lease.disposition,
        error_code: lease.errorCode,
        recorded_at: lease.now,
      };
      return true;
    },
    markSent: async (_id, lease) => {
      if (item.status !== 'dispatching' || !fenced(lease)) return false;
      item.status = 'sent';
      item.lease_expires_at = null;
      return true;
    },
    markRetryable: async (_id, lease) => {
      if (!['claimed', 'dispatching'].includes(item.status) || !fenced(lease)) return false;
      item.status = 'retryable';
      item.last_error = lease.errorCode;
      item.lease_expires_at = null;
      return true;
    },
    markTerminal: async (_id, lease) => {
      if (item.status !== 'dispatching' || !fenced(lease)) return false;
      item.status = 'failed_terminal';
      item.last_error = lease.errorCode;
      item.lease_expires_at = null;
      return true;
    },
    markDeliveryUnknown: async (_id, lease) => {
      if (item.status !== 'dispatching' || !fenced(lease)) return false;
      item.status = 'delivery_unknown';
      item.last_error = lease.errorCode;
      item.lease_expires_at = null;
      return true;
    },
  };
  const sender = {
    send: async (message) => {
      calls.push(message);
      return { errCode: 0 };
    },
  };
  return { calls, item, store, sender };
}
const consume = (f, extra = {}) =>
  consumeNotification({
    ...f,
    claimant: 'worker',
    outboxId: 'o1',
    env,
    now: new Date('2026-09-29T00:00:00Z'),
    randomUUID: () => 'lease-current',
    ...extra,
  });
test('订阅配置按报名关键路径去重且最多返回三个模板', () => {
  assert.deepEqual(
    subscriptionTemplateIds({
      REVIEW_APPROVED_TEMPLATE_ID: ' approved-template ',
      REVIEW_REJECTED_TEMPLATE_ID: 'rejected-template',
      WAITLIST_ENTERED_TEMPLATE_ID: 'entered-template',
      WAITLIST_PROMOTED_TEMPLATE_ID: 'promoted-template',
      ACTIVITY_REMINDER_TEMPLATE_ID: 'reminder-template',
      STRAVA_CLIENT_SECRET: 'must-not-leak',
    }),
    ['approved-template', 'rejected-template', 'reminder-template'],
  );
  assert.deepEqual(
    subscriptionTemplateIds({
      REVIEW_APPROVED_TEMPLATE_ID: 'same-template',
      REVIEW_REJECTED_TEMPLATE_ID: 'same-template',
      ACTIVITY_REMINDER_TEMPLATE_ID: 'reminder-template',
    }),
    ['same-template', 'reminder-template'],
  );
});
test('订阅配置未配置模板时返回空列表', () => {
  assert.deepEqual(subscriptionTemplateIds({}), []);
});
test('活动提醒时间按中国标准时间转换为微信 time 格式', () => {
  assert.equal(
    messageData({
      template_key: 'activity_reminder',
      payload: { event_start: '2026-10-11T00:00:00.000Z' },
    }).time2.value,
    '2026年10月11日 08:00',
  );
});
test('活动提醒时间为空或非法时明确失败', () => {
  for (const event_start of ['', 'not-a-date']) {
    assert.throws(
      () => messageData({ template_key: 'activity_reminder', payload: { event_start } }),
      { code: 'PAYLOAD_INVALID' },
    );
  }
});
test('活动提醒非法时间在发送前失败并回到可重试状态', async () => {
  const f = fixture({
    template_key: 'activity_reminder',
    payload: { event_start: 'not-a-date' },
  });
  await assert.rejects(
    consume(f, { env: { ACTIVITY_REMINDER_TEMPLATE_ID: 'reminder-template' } }),
    { code: 'PAYLOAD_INVALID' },
  );
  assert.equal(f.item.status, 'retryable');
  assert.equal(f.calls.length, 0);
});
test('模板缺失明确落 retryable 且释放租约', async () => {
  const f = fixture();
  await assert.rejects(consume(f, { env: {} }), { code: 'TEMPLATE_MISSING' });
  assert.equal(f.item.status, 'retryable');
  assert.equal(f.item.lease_expires_at, null);
  assert.match(f.item.last_error, /TEMPLATE_MISSING/);
});
test('发送成功落 sent', async () => {
  const f = fixture();
  const result = await consume(f);
  assert.equal(result.status, 'sent');
  assert.equal(f.item.status, 'sent');
  assert.equal(f.calls[0].touser, 'member-openid');
});
test('网络发送结果不明落 delivery_unknown/last_error', async () => {
  const f = fixture();
  f.sender.send = async () => {
    throw new Error('network down');
  };
  await assert.rejects(consume(f), { code: 'DELIVERY_STATE_UNCERTAIN' });
  assert.equal(f.item.status, 'delivery_unknown');
  assert.equal(f.item.last_error, 'SEND_RESULT_UNKNOWN');
});
test('未过期 claimed 不重复发送', async () => {
  const f = fixture({ status: 'claimed', attempts: 1, lease_expires_at: '2026-09-29T00:01:00Z' });
  const result = await consume(f);
  assert.equal(result.duplicate, true);
  assert.equal(f.calls.length, 0);
});
test('过期 claimed 可重领并增加 attempts', async () => {
  const f = fixture({ status: 'claimed', attempts: 1, lease_expires_at: '2026-09-28T23:59:00Z' });
  await consume(f);
  assert.equal(f.item.status, 'sent');
  assert.equal(f.item.attempts, 2);
});
test('最大重试次数阻止继续发送', async () => {
  const f = fixture({ status: 'failed', attempts: MAX_ATTEMPTS });
  await assert.rejects(consume(f), { code: 'MAX_RETRIES_EXCEEDED' });
  assert.equal(f.calls.length, 0);
});
test('租约时长使用核心常量', async () => {
  const f = fixture();
  await consume(f);
  assert.equal(LEASE_MS, 120000);
});
test('worker 批量消费审批生成的 pending 任务', async () => {
  const f = fixture();
  const result = await drainNotifications({ ...f, env, now: new Date('2026-09-29T00:00:00Z') });
  assert.equal(result.scanned, 1);
  assert.equal(result.sent, 1);
  assert.equal(f.item.status, 'sent');
});
test('worker 批量返回模板错误且任务为 retryable', async () => {
  const f = fixture();
  const result = await drainNotifications({ ...f, env: {}, now: new Date('2026-09-29T00:00:00Z') });
  assert.equal(result.failed, 1);
  assert.equal(result.results[0].error.code, 'TEMPLATE_MISSING');
  assert.equal(f.item.status, 'retryable');
});

test('大量耗尽任务在数据库 limit 前被过滤，不阻塞后续 pending', () => {
  const command = {
    in: (values) => ({ matches: (value) => values.includes(value) }),
    lt: (limit) => ({ matches: (value) => value < limit }),
  };
  const condition = buildReadyCondition(command);
  const exhausted = Array.from({ length: 100 }, (_, index) => ({
    _id: `exhausted-${index}`,
    status: 'failed',
    attempts: MAX_ATTEMPTS,
  }));
  const pending = { _id: 'fresh-pending', status: 'pending', attempts: 0 };
  const batch = [...exhausted, pending]
    .filter(
      (item) => condition.status.matches(item.status) && condition.attempts.matches(item.attempts),
    )
    .slice(0, 20);
  assert.deepEqual(
    batch.map((item) => item._id),
    ['fresh-pending'],
  );
});

test('微信发送成功但 ACK 写失败后不得再次调用 sender', async () => {
  const f = fixture();
  let markSentCalls = 0;
  f.store.markSent = async () => {
    markSentCalls += 1;
    throw new Error('ACK_WRITE_FAILED');
  };

  await assert.rejects(consume(f), { code: 'DELIVERY_STATE_UNCERTAIN' });
  await consume(f).catch(() => undefined);

  assert.equal(f.calls.length, 1);
  assert.equal(markSentCalls, 3);
  assert.equal(f.item.status, 'delivery_unknown');
});

test('网络结果不明进入 delivery_unknown 且不可自动重发', async () => {
  const f = fixture();
  f.sender.send = async (message) => {
    f.calls.push(message);
    throw new Error('socket timeout');
  };

  await assert.rejects(consume(f), { code: 'DELIVERY_STATE_UNCERTAIN' });
  await consume(f).catch(() => undefined);

  assert.equal(f.calls.length, 1);
  assert.equal(f.item.status, 'delivery_unknown');
});

test('provider 明确拒绝按错误码分为 retryable 与 terminal', async () => {
  const retryable = fixture();
  retryable.sender.send = async () => ({ errCode: 45009, errMsg: 'rate limited' });
  await assert.rejects(consume(retryable), { code: 'WECHAT_SEND_FAILED' });
  assert.equal(retryable.item.status, 'retryable');

  const terminal = fixture();
  terminal.sender.send = async () => ({ errCode: 43101, errMsg: 'user refuse' });
  await assert.rejects(consume(terminal), { code: 'WECHAT_SEND_REJECTED' });
  assert.equal(terminal.item.status, 'failed_terminal');
});

test('wx-server-sdk 的 -1 包装错误无论 resolve 或 reject 都视为结果未知', async () => {
  for (const sender of [
    async () => ({ errCode: -1, errMsg: 'system busy' }),
    async () => {
      throw Object.assign(new Error('system busy'), { errCode: -1 });
    },
  ]) {
    const ambiguous = fixture();
    ambiguous.sender.send = sender;
    await assert.rejects(consume(ambiguous), { code: 'DELIVERY_STATE_UNCERTAIN' });
    assert.equal(ambiguous.item.status, 'delivery_unknown');
    assert.equal(ambiguous.item.last_error, 'SEND_RESULT_UNKNOWN');
  }
});

test('未列入业务码白名单的正数错误无论 resolve 或 reject 都隔离', async () => {
  for (const sender of [
    async () => ({ errCode: 99999, errMsg: 'unknown provider error' }),
    async () => {
      throw Object.assign(new Error('unknown provider error'), { errCode: 99999 });
    },
  ]) {
    const ambiguous = fixture();
    ambiguous.sender.send = sender;
    await assert.rejects(consume(ambiguous), { code: 'DELIVERY_STATE_UNCERTAIN' });
    assert.equal(ambiguous.item.status, 'delivery_unknown');
    assert.equal(ambiguous.item.last_error, 'SEND_RESULT_UNKNOWN');
  }
});

test('provider 明确未投递但状态 ACK 失败时只重试 fenced 写且由 outcome 恢复', async () => {
  for (const [errCode, disposition, finalStatus, method] of [
    [45009, 'retryable', 'retryable', 'markRetryable'],
    [43101, 'terminal', 'failed_terminal', 'markTerminal'],
  ]) {
    const f = fixture();
    let ackCalls = 0;
    f.sender.send = async (message) => {
      f.calls.push(message);
      return { errCode };
    };
    f.store[method] = async () => {
      ackCalls += 1;
      throw new Error('ACK_WRITE_FAILED');
    };

    await assert.rejects(consume(f), { code: 'DELIVERY_STATE_PERSIST_FAILED' });
    assert.equal(f.calls.length, 1);
    assert.equal(ackCalls, 3);
    assert.equal(f.item.status, 'dispatching');
    assert.deepEqual(f.item.dispatch_outcome, {
      disposition,
      error_code: `WECHAT_${errCode}`,
      recorded_at: new Date('2026-09-29T00:00:00Z'),
    });

    f.item.lease_expires_at = '2026-09-28T23:59:00Z';
    await f.store.recoverExpiredDispatching(new Date('2026-09-29T00:00:00Z'));
    assert.equal(f.item.status, finalStatus);
    assert.equal(f.calls.length, 1);
  }
});

test('wx-server-sdk reject 的可靠 provider 业务码仍按 retryable/terminal 分类', async () => {
  const retryable = fixture();
  retryable.sender.send = async () => {
    throw Object.assign(new Error('rate limited'), { errCode: 45009 });
  };
  await assert.rejects(consume(retryable), { code: 'WECHAT_SEND_FAILED' });
  assert.equal(retryable.item.status, 'retryable');
  assert.equal(retryable.item.last_error, 'WECHAT_45009');

  const terminal = fixture();
  terminal.sender.send = async () => {
    throw { errcode: 43101, errmsg: 'user refuse' };
  };
  await assert.rejects(consume(terminal), { code: 'WECHAT_SEND_REJECTED' });
  assert.equal(terminal.item.status, 'failed_terminal');
  assert.equal(terminal.item.last_error, 'WECHAT_43101');
});

test('过期 dispatching 只隔离为 delivery_unknown，不调用 sender', async () => {
  const f = fixture({
    status: 'dispatching',
    attempts: 1,
    attempt_no: 1,
    lease_id: 'lease-old',
    lease_expires_at: '2026-09-28T23:59:00Z',
  });

  await consume(f).catch(() => undefined);

  assert.equal(f.calls.length, 0);
  assert.equal(f.item.status, 'delivery_unknown');
});
