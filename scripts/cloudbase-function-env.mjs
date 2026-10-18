#!/usr/bin/env node

import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MEDIA_SECRET_NAME = 'PROFILE_MEDIA_PATH_SECRET';
export const MEDIA_SECRET_CONSUMERS = Object.freeze([
  'profile',
  'profile-media-cleanup',
  'admin-review',
  'activity-read',
  'activity-admin',
  'club-application',
]);

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 2) {
    const flag = rest[index];
    const value = rest[index + 1];
    if (!flag?.startsWith('--') || value === undefined) throw new Error('参数格式无效');
    options[flag.slice(2)] = value;
  }
  if (!['inventory', 'prepare', 'verify-one', 'verify'].includes(command)) {
    throw new Error('命令必须是 inventory、prepare、verify-one 或 verify');
  }
  return { command, options };
}

function parseJsonText(text, source) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${source} 不是有效 JSON`);
  }
}

function parseEmbeddedJson(value) {
  if (typeof value !== 'string' || !/^\s*[[{]/u.test(value)) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function configuredFunctionNames(config) {
  const names = (config.functions || []).map(({ name }) => name);
  if (names.some((name) => typeof name !== 'string' || !/^[a-z][a-z0-9-]*$/u.test(name))) {
    throw new Error('cloudbaserc.json 包含非法函数名');
  }
  return names;
}

export function extractExistingFunctionNames(document, configuredNames) {
  const configured = new Set(configuredNames);
  const found = new Set();
  let recognizedList = false;
  const seen = new Set();

  const collectEntry = (entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return;
    const explicitName = entry.FunctionName ?? entry.functionName;
    const genericName = entry.name;
    const hasFunctionShape = ['Status', 'status', 'Runtime', 'runtime', 'Handler', 'handler'].some(
      (key) => Object.hasOwn(entry, key),
    );
    const name =
      typeof explicitName === 'string' ? explicitName : hasFunctionShape ? genericName : '';
    if (typeof name === 'string' && configured.has(name)) found.add(name);
  };

  const visit = (value, key = '') => {
    const embedded = parseEmbeddedJson(value);
    if (embedded !== null) {
      visit(embedded, key);
      return;
    }
    if (Array.isArray(value)) {
      if (/^(?:functions?|functionlist|data)$/iu.test(key) || key === '') recognizedList = true;
      value.forEach((item) => {
        collectEntry(item);
        visit(item);
      });
      return;
    }
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    for (const [nestedKey, nested] of Object.entries(value)) visit(nested, nestedKey);
  };

  visit(document);
  if (!recognizedList) throw new Error('fn list JSON 缺少可识别的函数列表');
  return configuredNames.filter((name) => found.has(name));
}

function inventory(options) {
  for (const required of ['config', 'list', 'output']) {
    if (!options[required]) throw new Error(`inventory 缺少 --${required}`);
  }
  const config = parseJsonText(readFileSync(resolve(options.config), 'utf8'), 'cloudbaserc.json');
  const configured = configuredFunctionNames(config);
  const list = parseJsonText(readFileSync(resolve(options.list), 'utf8'), 'fn list 输出');
  const existing = extractExistingFunctionNames(list, configured);
  const existingSet = new Set(existing);
  writeFileSync(
    resolve(options.output),
    `${JSON.stringify({ existing, missing: configured.filter((name) => !existingSet.has(name)) }, null, 2)}\n`,
    { mode: 0o600 },
  );
  process.stdout.write(
    `部署前函数清单已确认：现有 ${existing.length} 个，待创建 ${configured.length - existing.length} 个\n`,
  );
}

function addEnvironmentValue(target, key, value) {
  if (typeof key !== 'string' || typeof value !== 'string') return;
  if (Object.hasOwn(target, key) && target[key] !== value) {
    throw new Error('函数详情包含不一致的同名环境变量，拒绝继续');
  }
  target[key] = value;
}

function readEnvironmentContainer(target, value) {
  if (Array.isArray(value)) {
    for (const item of value) {
      if (item && typeof item === 'object') addEnvironmentValue(target, item.Key, item.Value);
    }
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) addEnvironmentValue(target, key, item);
}

export function extractFunctionEnvironment(detail) {
  const environment = {};
  const seen = new Set();
  const visit = (value, inEnvironment = false) => {
    const embedded = parseEmbeddedJson(value);
    if (embedded !== null) {
      visit(embedded, inEnvironment);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, inEnvironment));
      return;
    }
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);

    if (value.Key === MEDIA_SECRET_NAME) addEnvironmentValue(environment, value.Key, value.Value);
    for (const [key, item] of Object.entries(value)) {
      const isEnvironment = /^(?:environment|environmentvariables|envvariables)$/i.test(key);
      const isVariables = key === 'Variables' && inEnvironment;
      if (isEnvironment || isVariables) readEnvironmentContainer(environment, item);
      visit(item, inEnvironment || isEnvironment);
    }
  };
  visit(detail);
  return environment;
}

function readDetails(detailsDirectory, functionNames, existingNames = functionNames) {
  const existing = new Set(existingNames);
  return new Map(
    functionNames.map((name) => {
      if (!existing.has(name)) return [name, {}];
      const path = resolve(detailsDirectory, `${name}.json`);
      const detail = parseJsonText(readFileSync(path, 'utf8'), `云函数 ${name} 详情`);
      return [name, extractFunctionEnvironment(detail)];
    }),
  );
}

function validateSecret(value, source) {
  if (value === undefined || value === '') return null;
  if (typeof value !== 'string' || value.length < 32 || /[\r\n\0]/u.test(value)) {
    throw new Error(`${source} 中的 ${MEDIA_SECRET_NAME} 无效，拒绝继续`);
  }
  return value;
}

export function resolveMediaSecret(environments, actionsSecret = '') {
  const candidates = [];
  const configured = validateSecret(actionsSecret, 'GitHub Actions secret');
  if (configured) candidates.push(configured);
  for (const name of MEDIA_SECRET_CONSUMERS) {
    const value = validateSecret(environments.get(name)?.[MEDIA_SECRET_NAME], `云函数 ${name}`);
    if (value) candidates.push(value);
  }
  const unique = [...new Set(candidates)];
  if (unique.length === 0) {
    throw new Error(
      `${MEDIA_SECRET_NAME} 缺失；请由环境管理员在 cloudbase-production 配置同名 GitHub Actions secret 后重试`,
    );
  }
  if (unique.length !== 1) throw new Error(`${MEDIA_SECRET_NAME} 在可信来源中不一致，拒绝部署`);
  return unique[0];
}

export function createRuntimeConfig(config, environments, selectedFunctions, secret) {
  const configuredNames = new Set(configuredFunctionNames(config));
  for (const name of selectedFunctions) {
    if (!configuredNames.has(name)) throw new Error(`部署范围包含未知函数：${name}`);
  }
  return {
    ...config,
    functions: (config.functions || []).map((fn) => {
      if (!selectedFunctions.includes(fn.name)) return fn;
      const envVariables = { ...(environments.get(fn.name) || {}), ...(fn.envVariables || {}) };
      if (MEDIA_SECRET_CONSUMERS.includes(fn.name)) envVariables[MEDIA_SECRET_NAME] = secret;
      return { ...fn, envVariables };
    }),
  };
}

function prepare(options, env = process.env) {
  for (const required of ['config', 'decision', 'inventory', 'details-dir', 'output']) {
    if (!options[required]) throw new Error(`缺少 --${required}`);
  }
  const config = parseJsonText(readFileSync(resolve(options.config), 'utf8'), 'cloudbaserc.json');
  const decision = parseJsonText(readFileSync(resolve(options.decision), 'utf8'), '部署决策');
  const inventoryResult = parseJsonText(
    readFileSync(resolve(options.inventory), 'utf8'),
    '函数清单',
  );
  if (!Array.isArray(inventoryResult.existing)) throw new Error('函数清单缺少 existing 数组');
  const functionNames = configuredFunctionNames(config);
  const environments = readDetails(options['details-dir'], functionNames, inventoryResult.existing);
  const secret = resolveMediaSecret(environments, env.PROFILE_MEDIA_PATH_SECRET_SOURCE || '');
  if (!env.GITHUB_ENV) throw new Error('缺少 GITHUB_ENV，无法安全传递已掩码密钥');
  process.stdout.write(`::${'add'}-mask::${secret}\n`);

  const runtimeConfig = createRuntimeConfig(config, environments, decision.functions || [], secret);
  writeFileSync(resolve(options.output), `${JSON.stringify(runtimeConfig, null, 2)}\n`, {
    mode: 0o600,
  });
  appendFileSync(env.GITHUB_ENV, `${MEDIA_SECRET_NAME}=${secret}\n`, { mode: 0o600 });
  process.stdout.write('已从可信来源解析并掩码媒体路径密钥，运行时配置已准备\n');
}

function collectFunctionDetails(value, results = [], seen = new Set()) {
  const embedded = parseEmbeddedJson(value);
  if (embedded !== null) return collectFunctionDetails(embedded, results, seen);
  if (Array.isArray(value)) {
    value.forEach((item) => collectFunctionDetails(item, results, seen));
    return results;
  }
  if (!value || typeof value !== 'object' || seen.has(value)) return results;
  seen.add(value);
  const name = value.FunctionName ?? value.functionName ?? value.name;
  const status = value.Status ?? value.status;
  if (typeof name === 'string' && typeof status === 'string') results.push({ name, status });
  Object.values(value).forEach((item) => collectFunctionDetails(item, results, seen));
  return results;
}

export function verifyFunctionDetail(detail, expectedName, expectedSecret) {
  const matches = collectFunctionDetails(detail).filter(({ name }) => name === expectedName);
  if (matches.length !== 1) throw new Error(`云函数 ${expectedName} 详情缺失或不唯一`);
  if (matches[0].status.toLowerCase() !== 'active') {
    throw new Error(`云函数 ${expectedName} 状态不是可服务终态 Active`);
  }
  if (MEDIA_SECRET_CONSUMERS.includes(expectedName)) {
    const actual = validateSecret(
      extractFunctionEnvironment(detail)[MEDIA_SECRET_NAME],
      `云函数 ${expectedName}`,
    );
    const expected = validateSecret(expectedSecret, '当前部署任务');
    if (!actual || !expected || actual !== expected) {
      throw new Error(`云函数 ${expectedName} 的 ${MEDIA_SECRET_NAME} 缺失或不一致`);
    }
  }
  return { name: expectedName, status: matches[0].status };
}

function verifyOne(options, env = process.env) {
  if (!options.detail || !options.name) throw new Error('verify-one 缺少 detail 或 name');
  const detail = parseJsonText(
    readFileSync(resolve(options.detail), 'utf8'),
    `云函数 ${options.name} 详情`,
  );
  verifyFunctionDetail(detail, options.name, env[MEDIA_SECRET_NAME]);
  process.stdout.write(`云函数 ${options.name} 已处于 Active 且环境配置校验通过\n`);
}

export function verifyMediaSecret(environments, expectedSecret) {
  const expected = validateSecret(expectedSecret, '当前部署任务');
  if (!expected) throw new Error(`当前部署任务缺少 ${MEDIA_SECRET_NAME}`);
  for (const name of MEDIA_SECRET_CONSUMERS) {
    const actual = validateSecret(environments.get(name)?.[MEDIA_SECRET_NAME], `云函数 ${name}`);
    if (!actual || actual !== expected) {
      throw new Error(`云函数 ${name} 的 ${MEDIA_SECRET_NAME} 缺失或不一致`);
    }
  }
}

function verify(options, env = process.env) {
  if (!options.config || !options['details-dir'])
    throw new Error('verify 缺少 config 或 details-dir');
  const config = parseJsonText(readFileSync(resolve(options.config), 'utf8'), 'cloudbaserc.json');
  const configured = new Set(configuredFunctionNames(config));
  for (const name of MEDIA_SECRET_CONSUMERS) {
    if (!configured.has(name)) throw new Error(`cloudbaserc.json 缺少媒体消费者：${name}`);
    const path = resolve(options['details-dir'], `${name}.json`);
    const detail = parseJsonText(readFileSync(path, 'utf8'), `云函数 ${name} 详情`);
    verifyFunctionDetail(detail, name, env[MEDIA_SECRET_NAME]);
  }
  const environments = readDetails(options['details-dir'], MEDIA_SECRET_CONSUMERS);
  verifyMediaSecret(environments, env[MEDIA_SECRET_NAME]);
  process.stdout.write('所有媒体密钥消费者均为 Active，且部署后配置存在并一致\n');
}

export function run(argv = process.argv.slice(2), env = process.env) {
  const { command, options } = parseArgs(argv);
  if (command === 'inventory') inventory(options);
  else if (command === 'prepare') prepare(options, env);
  else if (command === 'verify-one') verifyOne(options, env);
  else verify(options, env);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    run();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
