#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function parseJson(text, source) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${source} 不是有效 JSON`);
  }
}

function embeddedJson(value) {
  if (typeof value !== 'string' || !/^\s*[[{]/u.test(value)) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function first(value, keys) {
  for (const key of keys) {
    if (Object.hasOwn(value, key)) return value[key];
  }
  return undefined;
}

function normalizedRoute(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const path = first(value, ['Path', 'path']);
  if (typeof path !== 'string' || !path.startsWith('/')) return null;
  const target = first(value, ['Target', 'target']);
  const upstreamType = first(value, ['UpstreamResourceType', 'upstreamResourceType']);
  const upstreamName = first(value, [
    'UpstreamResourceName',
    'upstreamResourceName',
    'FunctionName',
    'functionName',
  ]);
  const resolvedTarget =
    typeof target === 'string'
      ? target
      : upstreamType === 'SCF' && typeof upstreamName === 'string'
        ? `function:${upstreamName}`
        : '';
  if (!resolvedTarget) return null;
  return {
    path,
    target: resolvedTarget,
    domain: first(value, ['Domain', 'domain']),
    enable: first(value, ['Enable', 'enable']),
    enableAuth: first(value, ['EnableAuth', 'enableAuth']),
    enablePathTransmission: first(value, ['EnablePathTransmission', 'enablePathTransmission']),
  };
}

export function extractGatewayRoutes(document) {
  const routes = [];
  const seen = new Set();
  const visit = (value) => {
    const embedded = embeddedJson(value);
    if (embedded !== null) {
      visit(embedded);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    const route = normalizedRoute(value);
    if (route) routes.push(route);
    Object.values(value).forEach(visit);
  };
  visit(document);
  return routes;
}

export function verifyGatewayRoutes(config, document) {
  const actual = extractGatewayRoutes(document);
  const errors = [];
  for (const expected of config.gateway?.routes || []) {
    const matches = actual.filter(
      (route) => route.path === expected.path && route.target === expected.target,
    );
    if (matches.length !== 1) {
      errors.push(`${expected.path}: 路由缺失或不唯一`);
      continue;
    }
    const [route] = matches;
    for (const [field, expectedValue] of [
      ['domain', expected.domain ?? '*'],
      ['enable', expected.enable ?? true],
      ['enableAuth', expected.enableAuth ?? false],
      ['enablePathTransmission', expected.enablePathTransmission ?? false],
    ]) {
      if (route[field] !== expectedValue)
        errors.push(`${expected.path}: ${field} 应为 ${expectedValue}`);
    }
  }
  return errors;
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  if (command !== 'verify') throw new Error('命令必须是 verify');
  const options = {};
  for (let index = 0; index < rest.length; index += 2) {
    const flag = rest[index];
    const value = rest[index + 1];
    if (!flag?.startsWith('--') || value === undefined) throw new Error('参数格式无效');
    options[flag.slice(2)] = value;
  }
  if (!options.config || !options.routes) throw new Error('verify 缺少 config 或 routes');
  return options;
}

export function run(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const config = parseJson(readFileSync(resolve(options.config), 'utf8'), 'cloudbaserc.json');
  const routes = parseJson(readFileSync(resolve(options.routes), 'utf8'), '网关路由回读');
  const errors = verifyGatewayRoutes(config, routes);
  if (errors.length) throw new Error(`CloudBase 网关验证失败：${errors.join('；')}`);
  process.stdout.write(`CloudBase 网关验证通过：${config.gateway?.routes?.length || 0} 条路由\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    run();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
