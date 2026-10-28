import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const STATUSES = new Set(['doing', 'done', 'fail', 'warn', 'info']);
const ERROR_SUMMARIES = Object.freeze({
  'access-token-missing': 'access token missing',
  'invalid-ip': 'request IP rejected',
  'compile-error': 'miniprogram compilation failed',
  unknown: 'unclassified SDK error',
});
const ERROR_TEXT_LIMIT = 4096;
const WECHAT_ERRCODE_MIN = -2147483648;
const WECHAT_ERRCODE_MAX = 2147483647;

function readErrorText(error) {
  const values = [];
  const append = (value) => {
    if (typeof value === 'string' && values.join('\n').length < ERROR_TEXT_LIMIT) {
      values.push(value.slice(0, ERROR_TEXT_LIMIT));
    }
  };
  const read = (object, key) => {
    try {
      append(object?.[key]);
    } catch {}
  };
  for (const key of ['message', 'errMsg', 'errmsg', 'errorMessage']) read(error, key);
  for (const nestedKey of ['cause', 'response', 'data']) {
    let nested;
    try {
      nested = error?.[nestedKey];
    } catch {
      continue;
    }
    if (!nested || typeof nested !== 'object') continue;
    for (const key of ['message', 'errMsg', 'errmsg', 'errorMessage']) read(nested, key);
    if (nestedKey === 'response') {
      let data;
      try {
        data = nested.data;
      } catch {
        continue;
      }
      if (data && typeof data === 'object') {
        for (const key of ['message', 'errMsg', 'errmsg', 'errorMessage']) read(data, key);
      }
    }
  }
  return values.join('\n').slice(0, ERROR_TEXT_LIMIT);
}

function safeWechatErrCode(value) {
  return Number.isSafeInteger(value) && value >= WECHAT_ERRCODE_MIN && value <= WECHAT_ERRCODE_MAX
    ? value
    : null;
}

function readErrorInteger(error, keys) {
  for (const key of keys) {
    try {
      const value = safeWechatErrCode(error?.[key]);
      if (value !== null) return value;
    } catch {}
  }
  return null;
}

function readWechatErrCode(error) {
  const candidates = [error];
  for (const key of ['cause', 'response', 'data']) {
    try {
      candidates.push(error?.[key]);
    } catch {}
  }
  try {
    candidates.push(error?.response?.data);
  } catch {}
  for (const candidate of candidates) {
    const value = readErrorInteger(candidate, ['errCode', 'errcode']);
    if (value !== null) return value;
  }
  return null;
}

export function safeUploadErrorCode(error) {
  return readErrorInteger(error, ['code']);
}

export function classifyUploadError(error) {
  const text = readErrorText(error);
  let category = 'unknown';
  if (
    /access[_\s-]?token[^\r\n]{0,48}(?:missing|empty|required|not\s+(?:found|exist))/i.test(text) ||
    /(?:missing|empty|required)[^\r\n]{0,32}access[_\s-]?token/i.test(text)
  ) {
    category = 'access-token-missing';
  } else if (
    /\binvalid\s+ip\b/i.test(text) ||
    /\bip\b[^\r\n]{0,48}(?:not\s+in\s+(?:white|allow)list|forbidden|unauthori[sz]ed)/i.test(text)
  ) {
    category = 'invalid-ip';
  } else if (
    /\bcompil(?:e|er|ation)[^\r\n]{0,32}(?:error|fail(?:ed|ure)?)/i.test(text) ||
    /编译[^\r\n]{0,16}(?:错误|失败)/.test(text)
  ) {
    category = 'compile-error';
  }
  const matchedErrCode = text.match(/\b(?:errcode|err_code|error\s+code)\s*[:=]\s*(-?\d{1,10})\b/i);
  const textErrCode = matchedErrCode ? safeWechatErrCode(Number(matchedErrCode[1])) : null;
  const objectErrCode = readWechatErrCode(error);
  const outerCode = safeUploadErrorCode(error);
  return {
    category,
    summary: ERROR_SUMMARIES[category],
    wechatErrCode: textErrCode ?? objectErrCode ?? outerCode,
  };
}

export function sanitizeErrorDetail(detail) {
  if (!detail || typeof detail !== 'object' || Array.isArray(detail)) return undefined;
  const summary = ERROR_SUMMARIES[detail.category];
  if (!summary || detail.summary !== summary) return undefined;
  return {
    category: detail.category,
    summary,
    wechatErrCode: safeWechatErrCode(detail.wechatErrCode),
  };
}

export function safeUploadProgress(progress) {
  const message = String(progress?.message || '')
    .trim()
    .toLowerCase();
  return {
    phase: ['upload', '上传'].includes(message) ? 'upload' : 'prepare',
    status: STATUSES.has(progress?.status) ? progress.status : 'info',
  };
}

export function runUploadProcess({
  workerPath = fileURLToPath(new URL('./upload-miniprogram-ci.mjs', import.meta.url)),
  env = process.env,
  cwd = process.cwd(),
  uploadTimeoutMs = 300000,
  heartbeatMs = 60000,
  killGraceMs = 1000,
  logger = console,
} = {}) {
  for (const [name, value] of Object.entries({ uploadTimeoutMs, heartbeatMs, killGraceMs })) {
    if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${name} 必须是正整数`);
  }
  if (uploadTimeoutMs > 300000) throw new Error('上传阶段超时不得超过 300000ms');
  return new Promise((resolveResult) => {
    const startedAt = new Date().toISOString();
    let uploadStartedAt = null;
    let uploadStartedTick = null;
    let lastProgressAt = null;
    let lastProgressTick = null;
    let terminal = null;
    let deadline;
    let escalation;
    let finished = false;
    const child = fork(workerPath, ['--worker'], {
      cwd,
      env,
      execArgv: [],
      detached: process.platform !== 'win32',
      // SDK 会打印原始请求 URL/错误；父进程只接收有界 IPC 进度。
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    });
    const snapshot = () => ({
      schemaVersion: 1,
      startedAt,
      uploadStartedAt,
      lastProgressAt,
      phase: uploadStartedAt ? 'upload' : 'prepare',
      uploadElapsedMs:
        uploadStartedTick === null ? 0 : Math.round(performance.now() - uploadStartedTick),
      noProgressMs:
        lastProgressTick === null ? 0 : Math.round(performance.now() - lastProgressTick),
      workerStarts: 1,
    });
    const signalWorker = (signal) => {
      if (!child.pid) return;
      try {
        if (process.platform === 'win32') child.kill(signal);
        else process.kill(-child.pid, signal);
      } catch {}
    };
    const terminate = (result) => {
      if (terminal) return;
      terminal = result;
      clearTimeout(deadline);
      signalWorker('SIGTERM');
      escalation = setTimeout(() => signalWorker('SIGKILL'), killGraceMs);
    };
    const heartbeat = setInterval(
      () =>
        logger.log(
          JSON.stringify({
            ...snapshot(),
            outcome: terminal?.outcome || 'RUNNING',
          }),
        ),
      heartbeatMs,
    );
    const onCancel = () =>
      terminate({
        outcome: uploadStartedAt ? 'UNKNOWN' : 'FAILED',
        reason: 'cancelled',
      });
    process.once('SIGINT', onCancel);
    process.once('SIGTERM', onCancel);
    const finish = (exitCode, exitSignal) => {
      if (finished) return;
      finished = true;
      clearTimeout(deadline);
      clearTimeout(escalation);
      clearInterval(heartbeat);
      process.removeListener('SIGINT', onCancel);
      process.removeListener('SIGTERM', onCancel);
      // 进程退出时同时清理 SDK 可能遗留的编译子进程。
      signalWorker('SIGKILL');
      resolveResult({
        ...snapshot(),
        ...(terminal || {
          outcome: uploadStartedAt ? 'UNKNOWN' : 'FAILED',
          reason: 'worker-exit',
        }),
        finishedAt: new Date().toISOString(),
        exitCode,
        exitSignal,
      });
    };
    child.on('message', (message) => {
      if (terminal || !message || typeof message !== 'object') return;
      if (message.type === 'progress') {
        if (!['prepare', 'upload'].includes(message.phase) || !STATUSES.has(message.status)) {
          terminate({
            outcome: uploadStartedAt ? 'UNKNOWN' : 'FAILED',
            reason: 'invalid-progress',
          });
          return;
        }
        lastProgressAt = new Date().toISOString();
        lastProgressTick = performance.now();
        if (message.phase === 'upload' && uploadStartedAt === null) {
          uploadStartedAt = lastProgressAt;
          uploadStartedTick = lastProgressTick;
          deadline = setTimeout(
            () => terminate({ outcome: 'UNKNOWN', reason: 'upload-timeout' }),
            uploadTimeoutMs,
          );
        }
        logger.log(JSON.stringify({ ...snapshot(), status: message.status, outcome: 'RUNNING' }));
      } else if (message.type === 'completed' && message.outcome === 'UPLOADED') {
        terminate({ outcome: 'UPLOADED', reason: 'sdk-confirmed' });
      } else if (message.type === 'failed') {
        const errorCode = Number.isSafeInteger(message.errorCode) ? message.errorCode : null;
        const errorDetail = sanitizeErrorDetail(message.errorDetail);
        terminate({
          outcome: uploadStartedAt ? 'UNKNOWN' : 'FAILED',
          reason: 'sdk-error',
          errorCode,
          ...(errorDetail ? { errorDetail } : {}),
        });
      } else {
        terminate({
          outcome: uploadStartedAt ? 'UNKNOWN' : 'FAILED',
          reason: 'invalid-worker-message',
        });
      }
    });
    child.once('error', () => {
      terminal = { outcome: 'FAILED', reason: 'worker-start-error' };
      finish(null, null);
    });
    child.once('exit', finish);
  });
}
