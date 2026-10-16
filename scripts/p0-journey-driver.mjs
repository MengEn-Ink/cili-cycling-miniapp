import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const ERROR_MESSAGES = Object.freeze({
  PREFLIGHT_SCHEMA_INVALID: '预检文件结构无效',
  PAGE_NOT_READY: '目标页面未就绪',
  WRITE_OUTCOME_UNKNOWN: '写操作结果无法确认',
  AUDIT_SCHEMA_INVALID: '审计记录结构无效',
  COMPENSATION_INCOMPLETE: '失败补偿未完成',
});

const LEGACY_ROOT_KEYS = new Set(['schemaVersion', 'environment', 'member', 'routeFixture']);
const CURRENT_ROOT_KEYS = new Set([
  'schemaVersion',
  'environment',
  'member',
  'routeFixture',
  'devices',
]);
const ENVIRONMENT_KEYS = new Set(['kind', 'deployed']);
const LEGACY_MEMBER_KEYS = new Set([
  'available',
  'role',
  'profileReady',
  'stravaConnected',
  'stravaReady',
  'oauthFresh',
]);
const CURRENT_MEMBER_KEYS = new Set(['available', 'role', 'profileReady']);
const LEGACY_ROUTE_FIXTURE_KEYS = new Set([
  'available',
  'ownedByMember',
  'previewReady',
  'gpxReady',
]);
const CURRENT_ROUTE_FIXTURE_KEYS = new Set([
  'publicRouteReady',
  'publicRoutePreviewReady',
  'gpxReady',
  'gpxPreviewReady',
  'gpxDownloadReady',
]);
const DEVICE_KEYS = new Set(['iosReady', 'androidReady']);
const AUDIT_KEYS = new Set(['action', 'target_id', 'created_at']);
const SUBJECT_ALIAS_PATTERN = /^user_test_(P0_\d{8}_[A-F0-9]{32})$/;
const REGISTRATION_ALIAS_PATTERN = /^reg_test_(P0_\d{8}_[A-F0-9]{32})$/;
const JOURNEY_AUDIT_TARGETS = new Map([
  ['strava.sync.succeeded', 'subject'],
  ['registration.submitted', 'registration'],
  ['registration.approved', 'registration'],
  ['registration.cancelled', 'registration'],
  ['registration.resubmitted', 'registration'],
]);
const COMPENSATION_STATE_KEYS = new Set(['activityStatus', 'registrations']);
const COMPENSATION_REGISTRATION_KEYS = new Set(['id', 'status']);
const ACTIVE_REGISTRATION_STATUSES = new Set(['waiting', 'pending', 'approved']);

export class JourneyDriverError extends Error {
  constructor(code) {
    super(ERROR_MESSAGES[code]);
    this.name = 'JourneyDriverError';
    this.code = code;
  }
}

function fail(code) {
  throw new JourneyDriverError(code);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(value, expectedKeys) {
  return (
    isRecord(value) &&
    Object.keys(value).length === expectedKeys.size &&
    Object.keys(value).every((key) => expectedKeys.has(key))
  );
}

function hasBooleanFields(value, keys) {
  return [...keys].every((key) => typeof value[key] === 'boolean');
}

function validatePreflightSchema(value) {
  if (!isRecord(value) || ![1, 2].includes(value.schemaVersion)) {
    fail('PREFLIGHT_SCHEMA_INVALID');
  }
  const current = value.schemaVersion === 2;
  if (!hasExactKeys(value, current ? CURRENT_ROOT_KEYS : LEGACY_ROOT_KEYS)) {
    fail('PREFLIGHT_SCHEMA_INVALID');
  }
  if (
    !hasExactKeys(value.environment, ENVIRONMENT_KEYS) ||
    typeof value.environment.kind !== 'string' ||
    typeof value.environment.deployed !== 'boolean'
  ) {
    fail('PREFLIGHT_SCHEMA_INVALID');
  }
  if (
    !hasExactKeys(value.member, current ? CURRENT_MEMBER_KEYS : LEGACY_MEMBER_KEYS) ||
    typeof value.member.role !== 'string' ||
    !hasBooleanFields(
      value.member,
      current
        ? new Set(['available', 'profileReady'])
        : new Set(['available', 'profileReady', 'stravaConnected', 'stravaReady', 'oauthFresh']),
    )
  ) {
    fail('PREFLIGHT_SCHEMA_INVALID');
  }
  if (
    !hasExactKeys(
      value.routeFixture,
      current ? CURRENT_ROUTE_FIXTURE_KEYS : LEGACY_ROUTE_FIXTURE_KEYS,
    ) ||
    !hasBooleanFields(
      value.routeFixture,
      current ? CURRENT_ROUTE_FIXTURE_KEYS : LEGACY_ROUTE_FIXTURE_KEYS,
    )
  ) {
    fail('PREFLIGHT_SCHEMA_INVALID');
  }
  if (
    current &&
    (!hasExactKeys(value.devices, DEVICE_KEYS) || !hasBooleanFields(value.devices, DEVICE_KEYS))
  ) {
    fail('PREFLIGHT_SCHEMA_INVALID');
  }
}

function defaultWait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export function evaluateJourneyPreflight(value) {
  validatePreflightSchema(value);

  const blockers = [];
  if (value.environment.kind !== 'test') blockers.push('ENVIRONMENT_NOT_TEST');
  if (!value.environment.deployed) blockers.push('DEPLOYMENT_NOT_READY');
  if (!value.member.available) blockers.push('MEMBER_UNAVAILABLE');
  if (value.member.role !== 'member') blockers.push('MEMBER_ROLE_INVALID');
  if (!value.member.profileReady) blockers.push('MEMBER_PROFILE_NOT_READY');
  if (value.schemaVersion === 1) {
    if (!value.member.stravaConnected) blockers.push('STRAVA_NOT_CONNECTED');
    if (!value.member.stravaReady) blockers.push('STRAVA_NOT_READY');
    if (!value.member.oauthFresh) blockers.push('OAUTH_NOT_FRESH');
    if (!value.routeFixture.available) blockers.push('ROUTE_FIXTURE_UNAVAILABLE');
    if (!value.routeFixture.ownedByMember) blockers.push('ROUTE_FIXTURE_OWNER_MISMATCH');
    if (!value.routeFixture.previewReady) blockers.push('ROUTE_PREVIEW_NOT_READY');
    if (!value.routeFixture.gpxReady) blockers.push('ROUTE_GPX_NOT_READY');
  } else {
    if (!value.routeFixture.publicRouteReady) blockers.push('PUBLIC_ROUTE_NOT_READY');
    if (!value.routeFixture.publicRoutePreviewReady)
      blockers.push('PUBLIC_ROUTE_PREVIEW_NOT_READY');
    if (!value.routeFixture.gpxReady) blockers.push('ROUTE_GPX_NOT_READY');
    if (!value.routeFixture.gpxPreviewReady) blockers.push('ROUTE_GPX_PREVIEW_NOT_READY');
    if (!value.routeFixture.gpxDownloadReady) blockers.push('ROUTE_GPX_DOWNLOAD_NOT_READY');
    if (!value.devices.iosReady) blockers.push('IOS_DEVICE_NOT_READY');
    if (!value.devices.androidReady) blockers.push('ANDROID_DEVICE_NOT_READY');
  }

  return {
    outcome: blockers.length === 0 ? 'ready' : 'not_executed',
    blockers,
  };
}

export async function waitForPageReady({
  readPage,
  expectedPath,
  isDataReady,
  timeoutMs = 10_000,
  intervalMs = 100,
  now = Date.now,
  wait = defaultWait,
}) {
  if (
    typeof readPage !== 'function' ||
    typeof expectedPath !== 'string' ||
    expectedPath.length === 0 ||
    typeof isDataReady !== 'function' ||
    !Number.isFinite(timeoutMs) ||
    timeoutMs < 0 ||
    !Number.isFinite(intervalMs) ||
    intervalMs < 0 ||
    typeof now !== 'function' ||
    typeof wait !== 'function'
  ) {
    fail('PAGE_NOT_READY');
  }

  const startedAt = now();
  let attempts = 0;
  for (;;) {
    attempts += 1;
    let ready;
    try {
      const page = await readPage();
      ready = page?.path === expectedPath && Boolean(isDataReady(page.data));
    } catch {
      ready = false;
    }

    const elapsedMs = Math.max(0, now() - startedAt);
    if (ready) return { attempts, elapsedMs };
    if (elapsedMs >= timeoutMs) fail('PAGE_NOT_READY');

    await wait(Math.min(intervalMs, timeoutMs - elapsedMs));
  }
}

export async function relaunchWhenReady({
  miniProgram,
  url,
  isDataReady,
  timeoutMs = 30_000,
  intervalMs = 250,
  maxAttempts = 2,
  navigationMethod = 'reLaunch',
  now = Date.now,
  wait = defaultWait,
}) {
  const expectedPath = typeof url === 'string' ? url.split(/[?#]/, 1)[0].replace(/^\/+/, '') : '';
  const navigate = miniProgram?.[navigationMethod];
  if (
    !miniProgram ||
    !['reLaunch', 'switchTab'].includes(navigationMethod) ||
    typeof navigate !== 'function' ||
    typeof miniProgram.currentPage !== 'function' ||
    !expectedPath ||
    typeof isDataReady !== 'function' ||
    !Number.isInteger(maxAttempts) ||
    maxAttempts < 1 ||
    maxAttempts > 3
  ) {
    fail('PAGE_NOT_READY');
  }

  const attemptTimeoutMs = timeoutMs / maxAttempts;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let readyPage;
    try {
      await navigate.call(miniProgram, url);
      await waitForPageReady({
        expectedPath,
        timeoutMs: attemptTimeoutMs,
        intervalMs,
        now,
        wait,
        readPage: async () => {
          const page = await miniProgram.currentPage();
          readyPage = page;
          return {
            path: page?.path,
            data: await page?.data(),
          };
        },
        isDataReady,
      });
      return readyPage;
    } catch {
      if (attempt === maxAttempts) fail('PAGE_NOT_READY');
    }
  }
  fail('PAGE_NOT_READY');
}

export async function runReconciledWrite({
  execute,
  reconcile,
  timeoutMs = 5_000,
  intervalMs = 100,
  now = Date.now,
  wait = defaultWait,
}) {
  if (
    typeof execute !== 'function' ||
    typeof reconcile !== 'function' ||
    !Number.isFinite(timeoutMs) ||
    timeoutMs < 0 ||
    !Number.isFinite(intervalMs) ||
    intervalMs < 0 ||
    typeof now !== 'function' ||
    typeof wait !== 'function'
  ) {
    fail('WRITE_OUTCOME_UNKNOWN');
  }

  let writeFailed = false;
  try {
    await execute();
  } catch {
    writeFailed = true;
  }

  const startedAt = now();
  let reconciliationAttempts = 0;
  for (;;) {
    reconciliationAttempts += 1;
    let outcome;
    try {
      outcome = await reconcile();
    } catch {
      fail('WRITE_OUTCOME_UNKNOWN');
    }

    if (outcome === 'committed') {
      return {
        outcome,
        source: writeFailed ? 'reconciled_after_error' : 'write_confirmed',
        reconciliationAttempts,
      };
    }
    if (outcome !== 'not_committed') fail('WRITE_OUTCOME_UNKNOWN');

    const elapsedMs = Math.max(0, now() - startedAt);
    if (elapsedMs >= timeoutMs) {
      return {
        outcome,
        source: writeFailed ? 'write_error_not_observed' : 'write_not_observed',
        reconciliationAttempts,
      };
    }
    await wait(Math.min(intervalMs, timeoutMs - elapsedMs));
  }
}

function isCanonicalTimestamp(value) {
  if (typeof value !== 'string') return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value;
}

export function sanitizeJourneyAudits({
  audits,
  subjectId,
  registrationId,
  subjectAlias,
  registrationAlias,
}) {
  const subjectMatch =
    typeof subjectAlias === 'string' ? subjectAlias.match(SUBJECT_ALIAS_PATTERN) : null;
  const registrationMatch =
    typeof registrationAlias === 'string'
      ? registrationAlias.match(REGISTRATION_ALIAS_PATTERN)
      : null;
  if (
    !Array.isArray(audits) ||
    typeof subjectId !== 'string' ||
    subjectId.length === 0 ||
    typeof registrationId !== 'string' ||
    registrationId.length === 0 ||
    !subjectMatch ||
    !registrationMatch ||
    subjectMatch[1] !== registrationMatch[1]
  ) {
    fail('AUDIT_SCHEMA_INVALID');
  }

  const records = new Set();
  for (const audit of audits) {
    const recordKey = `${audit?.action}\0${audit?.target_id}\0${audit?.created_at}`;
    if (
      !hasExactKeys(audit, AUDIT_KEYS) ||
      !JOURNEY_AUDIT_TARGETS.has(audit.action) ||
      records.has(recordKey) ||
      !isCanonicalTimestamp(audit.created_at)
    ) {
      fail('AUDIT_SCHEMA_INVALID');
    }
    const targetType = JOURNEY_AUDIT_TARGETS.get(audit.action);
    const expectedTarget = targetType === 'subject' ? subjectId : registrationId;
    if (audit.target_id !== expectedTarget) fail('AUDIT_SCHEMA_INVALID');
    records.add(recordKey);
  }

  return audits
    .map((audit) => ({
      action: audit.action,
      target_id:
        JOURNEY_AUDIT_TARGETS.get(audit.action) === 'subject' ? subjectAlias : registrationAlias,
      created_at: audit.created_at,
    }))
    .sort((left, right) => Date.parse(left.created_at) - Date.parse(right.created_at));
}

function validateCompensationState(value) {
  if (
    !hasExactKeys(value, COMPENSATION_STATE_KEYS) ||
    typeof value.activityStatus !== 'string' ||
    !Array.isArray(value.registrations)
  ) {
    fail('COMPENSATION_INCOMPLETE');
  }

  const ids = new Set();
  for (const registration of value.registrations) {
    if (
      !hasExactKeys(registration, COMPENSATION_REGISTRATION_KEYS) ||
      typeof registration.id !== 'string' ||
      registration.id.length === 0 ||
      typeof registration.status !== 'string' ||
      registration.status.length === 0 ||
      ids.has(registration.id)
    ) {
      fail('COMPENSATION_INCOMPLETE');
    }
    ids.add(registration.id);
  }
  return value;
}

async function readCompensationState(readState) {
  try {
    return validateCompensationState(await readState());
  } catch {
    fail('COMPENSATION_INCOMPLETE');
  }
}

export async function compensateJourney({ readState, cancelRegistration, finishActivity }) {
  if (
    typeof readState !== 'function' ||
    typeof cancelRegistration !== 'function' ||
    typeof finishActivity !== 'function'
  ) {
    fail('COMPENSATION_INCOMPLETE');
  }

  const initialState = await readCompensationState(readState);
  const registrationsToCancel = initialState.registrations.filter((registration) =>
    ACTIVE_REGISTRATION_STATUSES.has(registration.status),
  );

  for (const registration of registrationsToCancel) {
    try {
      await cancelRegistration(registration.id);
    } catch {
      // Final state reconciliation decides whether the compensation succeeded.
    }
  }

  if (initialState.activityStatus !== 'finished') {
    try {
      await finishActivity();
    } catch {
      // Final state reconciliation decides whether the compensation succeeded.
    }
  }

  const finalState = await readCompensationState(readState);
  const finalRegistrations = new Map(
    finalState.registrations.map((registration) => [registration.id, registration]),
  );
  const allInitialRecordsRemain = initialState.registrations.every((registration) =>
    finalRegistrations.has(registration.id),
  );
  const allCancelled = registrationsToCancel.every(
    (registration) => finalRegistrations.get(registration.id)?.status === 'cancelled',
  );
  const activeRegistrations = finalState.registrations.filter((registration) =>
    ACTIVE_REGISTRATION_STATUSES.has(registration.status),
  );
  if (
    finalState.activityStatus !== 'finished' ||
    !allInitialRecordsRemain ||
    !allCancelled ||
    activeRegistrations.length > 0
  ) {
    fail('COMPENSATION_INCOMPLETE');
  }

  return {
    outcome: 'completed',
    cancelledCount: registrationsToCancel.length,
    activityFinished: true,
  };
}

async function runCli(argv) {
  if (
    argv.length !== 3 ||
    argv[0] !== 'preflight' ||
    argv[1] !== '--input' ||
    argv[2].length === 0
  ) {
    process.stderr.write('P0 真实旅程预检失败: 预检命令参数无效\n');
    process.exitCode = 1;
    return;
  }

  let value;
  try {
    value = JSON.parse(await readFile(argv[2], 'utf8'));
  } catch {
    process.stderr.write('P0 真实旅程预检失败: 预检文件结构无效\n');
    process.exitCode = 1;
    return;
  }

  try {
    const result = evaluateJourneyPreflight(value);
    if (result.outcome === 'not_executed') {
      process.stderr.write(`P0 真实旅程预检未执行: ${result.blockers.join(',')}\n`);
      process.exitCode = 2;
      return;
    }
    process.stdout.write('P0 真实旅程预检通过\n');
  } catch (error) {
    const message =
      error instanceof JourneyDriverError ? error.message : ERROR_MESSAGES.PREFLIGHT_SCHEMA_INVALID;
    process.stderr.write(`P0 真实旅程预检失败: ${message}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  runCli(process.argv.slice(2));
}
