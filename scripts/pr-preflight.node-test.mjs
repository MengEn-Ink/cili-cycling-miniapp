import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { assertFailed, createPrFixture, validPrBody } from './pr-test-fixture.mjs';

function setup(t) {
  const fixture = createPrFixture(t);
  const env = fixture.prepareCommands();
  fixture.commit();
  fixture.write('.pr-title.txt', 'ci(pr): 前置最终提交校验\n');
  fixture.write('.pr-body.md', validPrBody());
  return {
    ...fixture,
    run: () => fixture.run('./pr-preflight.mjs', [], env),
    commands: () => {
      const path = join(fixture.cwd, 'artifacts/commands.log');
      return existsSync(path) ? readFileSync(path, 'utf8').trim().split('\n') : [];
    },
  };
}

test('dirty 工作树在耗时检查前失败', (t) => {
  const fixture = setup(t);
  fixture.write('README.md', 'dirty\n');
  assertFailed(fixture.run(), /未提交/);
  assert.deepEqual(fixture.commands(), []);
});

test('缺少最终 PR body 在耗时检查前失败', (t) => {
  const fixture = setup(t);
  fixture.write('.pr-body.md', '');
  assertFailed(fixture.run(), /PR 描述/);
  assert.deepEqual(fixture.commands(), []);
});

test('占位描述与过期统计均立即失败', (t) => {
  const fixture = setup(t);
  fixture.write('.pr-body.md', validPrBody().replace('旧流程', '【请补充：背景】'));
  assertFailed(fixture.run(), /占位/);
  assert.deepEqual(fixture.commands(), []);
  fixture.write('.pr-body.md', validPrBody('2 files changed, +2/-1'));
  assertFailed(fixture.run(), /最终 diff/);
  assert.deepEqual(fixture.commands(), []);
});

test('无 origin/main 不回退 HEAD 假通过', (t) => {
  const fixture = setup(t);
  fixture.git('update-ref', '-d', 'refs/remotes/origin/main');
  assertFailed(fixture.run(), /origin\/main/);
  assert.deepEqual(fixture.commands(), []);
});

test('干净最终提交通过 Harness affected 共用 CI 影响面', (t) => {
  const fixture = setup(t);
  const result = fixture.run();
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.ok(fixture.commands().includes('run affected'));
  assert.ok(!fixture.commands().some((command) => command.includes('settings-page.test.ts')));
});

test('UI 影响追加严格同步和全量 validate，产品版本测试前置', (t) => {
  const fixture = setup(t);
  fixture.commit('miniprogram/pages/activities/index.wxml', '<view/>\n');
  fixture.write('.pr-body.md', validPrBody('2 files changed, +2/-1'));
  const result = fixture.run();
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.ok(fixture.commands().includes('run affected'));
  assert.ok(fixture.commands().includes('--strict'));
  assert.ok(fixture.commands().includes('run validate'));
  assert.ok(fixture.commands().some((command) => command.includes('settings-page.test.ts')));
});
