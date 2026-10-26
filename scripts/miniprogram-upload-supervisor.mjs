import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const STATUSES = new Set(['doing', 'done', 'fail', 'warn', 'info']);

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
        terminate({
          outcome: uploadStartedAt ? 'UNKNOWN' : 'FAILED',
          reason: 'sdk-error',
          errorCode,
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
