#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

const CLI_PACKAGE = '@cloudbase/cli@3.8.4';

function parseJson(value, label) {
  if (value && typeof value === 'object') return value;
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} 不是有效 JSON`);
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`${label} 不是有效 JSON`);
  }
}

function findValue(value, keys, seen = new Set()) {
  if (typeof value === 'string') {
    try {
      return findValue(JSON.parse(value), keys, seen);
    } catch {
      return undefined;
    }
  }
  if (!value || typeof value !== 'object' || seen.has(value)) return undefined;
  seen.add(value);
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(value, key)) return value[key];
  }
  for (const nested of Object.values(value)) {
    const found = findValue(nested, keys, seen);
    if (found !== undefined) return found;
  }
  return undefined;
}

function findRules(value, seen = new Set()) {
  if (typeof value === 'string') {
    try {
      return findRules(JSON.parse(value), seen);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== 'object' || seen.has(value)) return null;
  seen.add(value);
  if (
    Object.prototype.hasOwnProperty.call(value, 'read') &&
    Object.prototype.hasOwnProperty.call(value, 'write')
  ) {
    return { read: value.read, write: value.write };
  }
  for (const nested of Object.values(value)) {
    const found = findRules(nested, seen);
    if (found) return found;
  }
  return null;
}

export function parseStorageRulesGetOutput(output) {
  const payload = parseJson(output, 'storage rules get 响应');
  const acl = findValue(payload, ['AclTag', 'aclTag', 'ACL', 'acl']);
  const rules = findRules(payload);
  if (typeof acl !== 'string' || !acl.trim()) throw new Error('storage rules get 响应缺少 ACL tag');
  if (!rules) throw new Error('storage rules get 响应缺少 read/write 规则');
  return { acl: acl.trim().toUpperCase(), rules };
}

export function assertStorageRulesMatch(expected, actual) {
  for (const key of ['read', 'write']) {
    if (!Object.prototype.hasOwnProperty.call(expected, key))
      throw new Error(`本地存储规则缺少 ${key}`);
  }
  if (actual.acl !== 'CUSTOM') throw new Error('存储规则回读 ACL 不是 CUSTOM');
  const normalizedExpected = { read: expected.read, write: expected.write };
  const normalizedActual = { read: actual.rules.read, write: actual.rules.write };
  if (!isDeepStrictEqual(normalizedExpected, normalizedActual)) {
    throw new Error('存储规则回读漂移：云端 read/write 与 cloudstorage.rules.json 不完全一致');
  }
  return true;
}

export function cliArgs(envId, command, extra = []) {
  return [
    '--yes',
    '--package',
    CLI_PACKAGE,
    'tcb',
    '-e',
    envId,
    'storage',
    'rules',
    command,
    ...extra,
    '--json',
  ];
}

export function reconcileStorageRules({
  envId,
  rulesPath = 'cloudstorage.rules.json',
  cwd = process.cwd(),
  execute = execFileSync,
}) {
  if (typeof envId !== 'string' || !envId.trim()) throw new Error('缺少 CloudBase 环境 ID');
  const expected = parseJson(readFileSync(resolve(cwd, rulesPath), 'utf8'), rulesPath);
  assertStorageRulesMatch(expected, { acl: 'CUSTOM', rules: expected });
  execute(
    'npx',
    cliArgs(envId, 'update', ['--acl', 'CUSTOM', '--rule', JSON.stringify(expected)]),
    { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const output = execute('npx', cliArgs(envId, 'get'), {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const actual = parseStorageRulesGetOutput(output);
  assertStorageRulesMatch(expected, actual);
  return actual;
}

function parseArgs(argv) {
  const options = { envId: '', rulesPath: 'cloudstorage.rules.json' };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--env-id' || arg === '--rules') {
      const value = argv[index + 1];
      if (!value) throw new Error(`${arg} 缺少值`);
      if (arg === '--env-id') options.envId = value;
      else options.rulesPath = value;
      index += 1;
    } else throw new Error(`未知参数：${arg}`);
  }
  return options;
}

export function run(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  reconcileStorageRules(options);
  console.log('CloudBase 存储规则已应用并通过 CUSTOM ACL 与 read/write 完整回读校验');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    run();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
