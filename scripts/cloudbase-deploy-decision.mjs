#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SHARED_CONSUMERS = Object.freeze(['activity-read', 'registration', 'admin-review']);
const MEDIA_SECRET_CONSUMERS = Object.freeze([
  'profile',
  'profile-media-cleanup',
  'admin-review',
  'activity-read',
  'activity-admin',
  'club-application',
]);
const STRAVA_CONFIG_CONSUMERS = Object.freeze(['strava-bridge', 'strava-callback']);
const CONFIG_CONSUMERS = Object.freeze([
  ...new Set([...MEDIA_SECRET_CONSUMERS, ...STRAVA_CONFIG_CONSUMERS]),
]);
const MEDIA_SECRET_DEPLOYMENT_PATHS = new Set([
  '.github/workflows/deploy-cloudbase.yml',
  'scripts/cloudbase-function-env.mjs',
  'scripts/cloudbase-function-env.node-test.mjs',
]);
const INFRASTRUCTURE_PATHS = new Set([
  'cloudstorage.rules.json',
  '.github/workflows/deploy-cloudbase.yml',
  'scripts/bootstrap-cloudbase.mjs',
  'scripts/cloudbase-deploy-decision.mjs',
  'scripts/release-baseline.mjs',
  'scripts/release-baseline-github.mjs',
  'scripts/release-baseline-cli.mjs',
  'scripts/cloudbase-storage-rules.mjs',
  'scripts/cloudbase-storage-rules.node-test.mjs',
  'scripts/cloudbase-club-application-smoke.mjs',
  'scripts/cloudbase-club-application-smoke.node-test.mjs',
]);

function normalizePath(value) {
  return String(value || '')
    .trim()
    .replaceAll('\\', '/');
}

export function configuredFunctions(config) {
  return (config.functions || []).map(({ name }) => name).filter(Boolean);
}

export function createCloudBaseDeployDecision(changedPaths, config) {
  const functions = configuredFunctions(config);
  const knownFunctions = new Set(functions);
  const selected = new Set();
  let applyInfrastructure = false;

  for (const input of changedPaths) {
    const file = normalizePath(input);
    if (!file) continue;

    if (INFRASTRUCTURE_PATHS.has(file)) applyInfrastructure = true;

    if (MEDIA_SECRET_DEPLOYMENT_PATHS.has(file)) {
      CONFIG_CONSUMERS.forEach((name) => {
        if (knownFunctions.has(name)) selected.add(name);
      });
    }

    if (file === 'cloudbaserc.json') {
      functions.forEach((name) => selected.add(name));
      continue;
    }

    if (file === 'scripts/prepare-cloudfunctions.mjs') {
      [...SHARED_CONSUMERS, ...STRAVA_CONFIG_CONSUMERS].forEach((name) => {
        if (knownFunctions.has(name)) selected.add(name);
      });
      continue;
    }

    if (file.startsWith('cloudfunctions/shared/')) {
      SHARED_CONSUMERS.forEach((name) => {
        if (knownFunctions.has(name)) selected.add(name);
      });
      continue;
    }

    if (file === 'cloudfunctions/activity-admin/gpx.js' && knownFunctions.has('strava-bridge'))
      selected.add('strava-bridge');
    if (file === 'cloudfunctions/strava-bridge/core.js' && knownFunctions.has('strava-callback'))
      selected.add('strava-callback');
    const match = /^cloudfunctions\/([^/]+)\//.exec(file);
    if (match && knownFunctions.has(match[1])) selected.add(match[1]);
  }

  const selectedFunctions = functions.filter((name) => selected.has(name));
  return {
    shouldDeploy: applyInfrastructure || selectedFunctions.length > 0,
    applyInfrastructure,
    functions: selectedFunctions,
  };
}

function parseArgs(argv) {
  const options = { base: '', head: 'HEAD', output: '' };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--base' || arg === '--head' || arg === '--output') {
      const value = argv[index + 1];
      if (!value) throw new Error(`${arg} 缺少值`);
      options[arg.slice(2)] = value;
      index += 1;
    } else {
      throw new Error(`未知参数：${arg}`);
    }
  }
  if (!options.base) options.base = `${options.head}^`;
  return options;
}

export function changedPathsBetween(base, head, cwd = process.cwd()) {
  const output = execFileSync(
    'git',
    ['diff', '--no-renames', '--name-only', '--diff-filter=ACMRD', '-z', base, head, '--'],
    { cwd, encoding: 'utf8' },
  );
  return output.split('\0').map(normalizePath).filter(Boolean);
}

export function run(argv = process.argv.slice(2), cwd = process.cwd()) {
  const options = parseArgs(argv);
  const config = JSON.parse(readFileSync(resolve(cwd, 'cloudbaserc.json'), 'utf8'));
  const changedPaths = changedPathsBetween(options.base, options.head, cwd);
  const decision = {
    ...createCloudBaseDeployDecision(changedPaths, config),
    base: options.base,
    head: options.head,
    changedPaths,
  };
  const json = `${JSON.stringify(decision, null, 2)}\n`;
  if (options.output) writeFileSync(resolve(cwd, options.output), json, 'utf8');
  else process.stdout.write(json);
  return decision;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    run();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
