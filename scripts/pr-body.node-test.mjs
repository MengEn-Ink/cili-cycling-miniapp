import assert from 'node:assert/strict';
import { readFileSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { assertFailed, createPrFixture } from './pr-test-fixture.mjs';

const args = ['--title', 'ci(pr): 前置最终提交校验'];

test('仅自动选本次 diff 的唯一报告，不按 checkout mtime 误选', (t) => {
  const fixture = createPrFixture(t);
  fixture.commit('docs/verification/current.md', '# Current report\n');
  utimesSync(join(fixture.cwd, 'docs/verification/old.md'), new Date(), new Date('2099-01-01'));
  const result = fixture.run('./pr-body.mjs', args);
  assert.equal(result.status, 0, result.stderr);
  assert.match(
    readFileSync(join(fixture.cwd, '.pr-body.md'), 'utf8'),
    /验收报告：docs\/verification\/current.md/,
  );
});

test('无本次报告或多个本次报告要求明确 --report', (t) => {
  const fixture = createPrFixture(t);
  fixture.commit();
  assertFailed(fixture.run('./pr-body.mjs', args), /--report/);
  fixture.commit('docs/verification/one.md', '# One\n');
  fixture.commit('docs/verification/two.md', '# Two\n');
  assertFailed(fixture.run('./pr-body.mjs', args), /--report/);
});

test('报告路径越界失败，不生成可提交草稿', (t) => {
  const fixture = createPrFixture(t);
  fixture.commit();
  assertFailed(fixture.run('./pr-body.mjs', [...args, '--report', 'README.md']), /验收报告路径/);
});

test('dirty 或无主线基准时停止，干净 diff 统计与 CI 一致', (t) => {
  const fixture = createPrFixture(t);
  fixture.commit();
  const explicitArgs = [...args, '--report', 'docs/verification/old.md'];
  fixture.write('README.md', 'dirty\n');
  assertFailed(fixture.run('./pr-body.mjs', explicitArgs), /未提交/);
  fixture.git('restore', 'README.md');
  const result = fixture.run('./pr-body.mjs', explicitArgs);
  assert.equal(result.status, 0, result.stderr);
  assert.match(readFileSync(join(fixture.cwd, '.pr-body.md'), 'utf8'), /1 files changed, \+1\/-1/);
  fixture.git('update-ref', '-d', 'refs/remotes/origin/main');
  assertFailed(fixture.run('./pr-body.mjs', explicitArgs), /origin\/main/);
});
