import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import config, { LOCAL_OUTPUT_EXCLUDES } from '../vitest.config.mjs';

const REQUIRED_LOCAL_OUTPUT_EXCLUDES = [
  '.trae/**',
  '.superpowers/**',
  'artifacts/**',
  'coverage/**',
  'dist/**',
  'miniprogram_npm/**',
];
const packageScripts = JSON.parse(readFileSync('package.json', 'utf8')).scripts;

test('Vitest excludes generated and locally mounted worktree outputs', () => {
  assert.deepEqual(LOCAL_OUTPUT_EXCLUDES, REQUIRED_LOCAL_OUTPUT_EXCLUDES);
  for (const pattern of REQUIRED_LOCAL_OUTPUT_EXCLUDES) {
    assert(config.test.exclude.includes(pattern), `missing Vitest exclude: ${pattern}`);
  }
});

test('CI contract locks the Vitest discovery boundary', () => {
  assert.match(packageScripts['test:ci-contract'], /vitest-config\.node-test\.mjs/);
});
