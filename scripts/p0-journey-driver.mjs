import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const ERROR_MESSAGES = Object.freeze({
  PREFLIGHT_SCHEMA_INVALID: '预检文件结构无效',
  PAGE_NOT_READY: '目标页面未就绪',
  WRITE_OUTCOME_UNKNOWN: '写操作结果无法确认',
  AUDIT_SCHEMA_INVALID: '审计记录结构无效',
  COMPENSATION_INCOMPLETE: '失败补偿未完成',
});

const ROOT_KEYS = new Set(['schemaVersion', 'environment', 'member', 'routeFixture']);
const ENVIRONMENT_KEYS = new Set(['kind', 'deployed']);
const MEMBER_KEYS = new Set([
  'available',
  'role',
  'profileReady',
  'stravaConnected',
  'stravaReady',
  'oauthFresh',
]);
const ROUTE_FIXTURE_KEYS = new Set(['available', 'ownedByMember', 'previewReady', 'gpxReady']);

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
  if (!hasExactKeys(value, ROOT_KEYS) || value.schemaVersion !== 1) {
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
    !hasExactKeys(value.member, MEMBER_KEYS) ||
    typeof value.member.role !== 'string' ||
    !hasBooleanFields(
      value.member,
      new Set(['available', 'profileReady', 'stravaConnected', 'stravaReady', 'oauthFresh']),
    )
  ) {
    fail('PREFLIGHT_SCHEMA_INVALID');
  }
  if (
    !hasExactKeys(value.routeFixture, ROUTE_FIXTURE_KEYS) ||
    !hasBooleanFields(value.routeFixture, ROUTE_FIXTURE_KEYS)
  ) {
    fail('PREFLIGHT_SCHEMA_INVALID');
  }
}

export function evaluateJourneyPreflight(value) {
  validatePreflightSchema(value);

  const blockers = [];
  if (value.environment.kind !== 'test') blockers.push('ENVIRONMENT_NOT_TEST');
  if (!value.environment.deployed) blockers.push('DEPLOYMENT_NOT_READY');
  if (!value.member.available) blockers.push('MEMBER_UNAVAILABLE');
  if (value.member.role !== 'member') blockers.push('MEMBER_ROLE_INVALID');
  if (!value.member.profileReady) blockers.push('MEMBER_PROFILE_NOT_READY');
  if (!value.member.stravaConnected) blockers.push('STRAVA_NOT_CONNECTED');
  if (!value.member.stravaReady) blockers.push('STRAVA_NOT_READY');
  if (!value.member.oauthFresh) blockers.push('OAUTH_NOT_FRESH');
  if (!value.routeFixture.available) blockers.push('ROUTE_FIXTURE_UNAVAILABLE');
  if (!value.routeFixture.ownedByMember) blockers.push('ROUTE_FIXTURE_OWNER_MISMATCH');
  if (!value.routeFixture.previewReady) blockers.push('ROUTE_PREVIEW_NOT_READY');
  if (!value.routeFixture.gpxReady) blockers.push('ROUTE_GPX_NOT_READY');

  return {
    outcome: blockers.length === 0 ? 'ready' : 'not_executed',
    blockers,
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
