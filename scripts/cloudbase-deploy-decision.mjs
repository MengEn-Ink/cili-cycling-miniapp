#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SHARED_CONSUMERS = Object.freeze(['activity-read', 'registration', 'admin-review']);
const INFRASTRUCTURE_PATHS = new Set(['scripts/bootstrap-cloudbase.mjs']);

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

    if (file === 'cloudbaserc.json') {
      functions.forEach((name) => selected.add(name));
      continue;
    }

    if (
      file === 'scripts/prepare-cloudfunctions.mjs' ||
      file.startsWith('cloudfunctions/shared/')
    ) {
      SHARED_CONSUMERS.forEach((name) => {
        if (knownFunctions.has(name)) selected.add(name);
      });
      continue;
    }

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
    ['diff', '--name-only', '--diff-filter=ACMRD', base, head, '--'],
    { cwd, encoding: 'utf8' },
  );
  return output.split('\n').map(normalizePath).filter(Boolean);
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
