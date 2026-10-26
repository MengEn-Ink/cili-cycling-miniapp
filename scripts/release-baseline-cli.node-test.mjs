import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { run } from './release-baseline-cli.mjs';
import { decodeArchive } from './release-baseline-github.mjs';

function fixture(t) {
  const cwd = mkdtempSync(join(tmpdir(), 'cili-release-finalize-'));
  t.after(() => rmSync(cwd, { force: true, recursive: true }));
  const sha = 'a'.repeat(40);
  writeFileSync(join(cwd, 'project.config.json'), '{"appid":"fixture-app"}');
  writeFileSync(join(cwd, 'cloudbaserc.json'), '{"envId":"fixture-env"}');
  const env = {
    RUNNER_TEMP: cwd,
    TOOLING_SHA: sha,
    GITHUB_REPOSITORY: 'example/cili',
    GITHUB_RUN_ID: '20',
    GITHUB_RUN_ATTEMPT: '1',
    MINIPROGRAM_VERSION: '1.0.1',
    RELEASE_SUCCESS: 'true',
  };
  const scope = {
    targetSha: sha,
    toolingSha: sha,
    ciRunId: '10',
    ciRunAttempt: '2',
    sourceTree: 'b'.repeat(40),
    infrastructureDigest: `sha256:${'c'.repeat(64)}`,
    functions: [],
    applyInfrastructure: false,
  };
  writeFileSync(join(cwd, 'miniprogram-release-scope.json'), JSON.stringify(scope));
  return { cwd, env, sha, scope, output: join(cwd, 'release-outcome.json') };
}

test('安全 skip 单独记录，成功副作用与清理后才生成 receipt', (t) => {
  const { cwd, env, sha, output } = fixture(t);
  assert.equal(run(['finalize', 'miniprogram', sha, output], env, cwd).outcome, 'SKIPPED');
  assert.equal(existsSync(join(cwd, 'release-receipt.json')), false);
  writeFileSync(join(cwd, 'miniprogram-release-started'), '');
  assert.equal(
    run(['finalize', 'miniprogram', sha, output], { ...env, RELEASE_SUCCESS: 'false' }, cwd)
      .outcome,
    'UNKNOWN',
  );
  assert.equal(existsSync(join(cwd, 'release-receipt.json')), false);
  assert.equal(run(['finalize', 'miniprogram', sha, output], env, cwd).outcome, 'SUCCEEDED');
  const receipt = JSON.parse(readFileSync(join(cwd, 'release-receipt.json'), 'utf8'));
  assert.equal(receipt.targetSha, sha);
  assert.equal(receipt.checks.cleanup, true);
});

test('scope 实际目标不能与 finalize 参数不同', (t) => {
  const { cwd, env, sha, scope, output } = fixture(t);
  writeFileSync(join(cwd, 'miniprogram-release-started'), '');
  writeFileSync(
    join(cwd, 'miniprogram-release-scope.json'),
    JSON.stringify({ ...scope, targetSha: 'd'.repeat(40) }),
  );
  assert.throws(() => run(['finalize', 'miniprogram', sha, output], env, cwd), /scope|目标/);
});

test('真实 zip 读取单个 JSON，拒绝附带文件', (t) => {
  const { cwd } = fixture(t);
  writeFileSync(join(cwd, 'release-receipt.json'), '{"ok":true}');
  execFileSync('zip', ['-q', 'evidence.zip', 'release-receipt.json'], { cwd });
  assert.deepEqual(decodeArchive(readFileSync(join(cwd, 'evidence.zip')), 'release-receipt.json'), {
    ok: true,
  });
  writeFileSync(join(cwd, 'extra.json'), '{}');
  execFileSync('zip', ['-q', 'evidence.zip', 'extra.json'], { cwd });
  assert.throws(
    () => decodeArchive(readFileSync(join(cwd, 'evidence.zip')), 'release-receipt.json'),
    /archive/,
  );
});
