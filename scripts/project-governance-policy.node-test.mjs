import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  EXECUTABLE_PATH_ALLOWLIST,
  findTrackedModeViolations,
} from './project-governance-policy.mjs';

const EXPECTED_EXECUTABLES = [
  'scripts/bootstrap-cloudbase.mjs',
  'scripts/cloudbase-activity-flow-smoke.mjs',
  'scripts/cloudbase-club-application-smoke.mjs',
  'scripts/cloudbase-deploy-decision.mjs',
  'scripts/cloudbase-function-env.mjs',
  'scripts/cloudbase-historical-activity-purge.mjs',
  'scripts/cloudbase-prelaunch-media-purge.mjs',
  'scripts/cloudbase-storage-rules.mjs',
  'scripts/gen-tabbar-icons.mjs',
  'scripts/harness.mjs',
  'scripts/pages-visual-acceptance/capture-routes.mjs',
  'scripts/pages-visual-acceptance/sync-ui-digests.mjs',
  'scripts/phase3-three-width-walkthrough.mjs',
  'scripts/run-phase3-three-width.mjs',
  'scripts/wechat-devtools-e2e.cjs',
];
const packageScripts = JSON.parse(readFileSync('package.json', 'utf8')).scripts;

test('governance CLI rejects an executable bit outside the explicit allowlist', () => {
  const directory = mkdtempSync(join(tmpdir(), 'cili-governance-index-'));
  const index = join(directory, 'index');
  const env = { ...process.env, GIT_INDEX_FILE: index };

  try {
    execFileSync('git', ['read-tree', 'HEAD'], { env });
    execFileSync('git', ['update-index', '--chmod=+x', '--', 'README.md'], { env });
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const result = spawnSync(npm, ['run', 'check:governance'], {
      encoding: 'utf8',
      env,
    });
    const output = `${result.stdout}\n${result.stderr}`;

    assert.notEqual(result.status, 0);
    assert.match(output, /README\.md/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('executable allowlist is an exact path list', () => {
  assert.deepEqual(EXECUTABLE_PATH_ALLOWLIST, EXPECTED_EXECUTABLES);
});

test('allowlisted executable without the Node shebang is rejected', () => {
  const indexOutput = EXPECTED_EXECUTABLES.map(
    (path) => `100755 ${'a'.repeat(40)} 0\t${path}\0`,
  ).join('');
  const violations = findTrackedModeViolations(indexOutput, (path) =>
    path === 'scripts/harness.mjs' ? "import process from 'node:process';" : '#!/usr/bin/env node',
  );

  assert.deepEqual(violations, ['scripts/harness.mjs: 100755 入口缺少 #!/usr/bin/env node']);
});

test('current Git index contains only approved executable entries', () => {
  const indexOutput = execFileSync('git', ['ls-files', '--stage', '-z'], { encoding: 'utf8' });
  const violations = findTrackedModeViolations(
    indexOutput,
    (path) => readFileSync(path, 'utf8').split(/\r?\n/, 1)[0],
  );
  assert.deepEqual(violations, []);
});

test('check:governance composes the source-mode CLI', () => {
  assert.match(packageScripts['check:governance'], /check-source-modes\.mjs/);
});

test('CI contract runs the source-mode governance regression test', () => {
  assert.match(packageScripts['test:ci-contract'], /project-governance-policy\.node-test\.mjs/);
});
