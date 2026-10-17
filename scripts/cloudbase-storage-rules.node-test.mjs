import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  assertStorageRulesMatch,
  parseStorageRulesGetOutput,
  reconcileStorageRules,
} from './cloudbase-storage-rules.mjs';

const rules = {
  read: false,
  write: 'auth != null && resource.openid == auth.openid',
};
const actual = (overrides = {}) => ({ acl: 'CUSTOM', rules, ...overrides });

test('解析 storage rules get 的 ACL 与嵌套字符串规则', () => {
  assert.deepEqual(
    parseStorageRulesGetOutput(
      JSON.stringify({ Response: { AclTag: 'CUSTOM', Rule: JSON.stringify(rules) } }),
    ),
    actual(),
  );
  assert.deepEqual(
    parseStorageRulesGetOutput(JSON.stringify({ data: { acl: 'custom', rule: rules } })),
    actual(),
  );
});

test('get 响应缺 ACL、缺规则或不是 JSON 时拒绝静默成功', () => {
  assert.throws(() => parseStorageRulesGetOutput(JSON.stringify({ rule: rules })), /缺少 ACL tag/);
  assert.throws(
    () => parseStorageRulesGetOutput(JSON.stringify({ AclTag: 'CUSTOM' })),
    /缺少 read\/write/,
  );
  assert.throws(() => parseStorageRulesGetOutput('success'), /不是有效 JSON/);
});

test('ACL 非 CUSTOM 以及 read/write 漂移均阻断', () => {
  assert.throws(() => assertStorageRulesMatch(rules, actual({ acl: 'PRIVATE' })), /不是 CUSTOM/);
  assert.throws(
    () => assertStorageRulesMatch(rules, actual({ rules: { ...rules, read: true } })),
    /回读漂移/,
  );
  assert.throws(
    () => assertStorageRulesMatch(rules, actual({ rules: { ...rules, write: `${rules.write} ` } })),
    /回读漂移/,
  );
});

test('应用使用锁定 CLI 命令并在 update 后强制 get 回读 ACL 与规则', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'storage-rules-'));
  writeFileSync(join(cwd, 'cloudstorage.rules.json'), `${JSON.stringify(rules)}\n`);
  const calls = [];
  const execute = (file, args) => {
    calls.push([file, args]);
    return calls.length === 1
      ? JSON.stringify({ success: true })
      : JSON.stringify({ Response: { AclTag: 'CUSTOM', Rule: JSON.stringify(rules) } });
  };
  reconcileStorageRules({ envId: 'env-test', cwd, execute });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0][1].slice(-6), [
    'update',
    '--acl',
    'CUSTOM',
    '--rule',
    JSON.stringify(rules),
    '--json',
  ]);
  assert.deepEqual(calls[1][1].slice(-2), ['get', '--json']);
  assert.ok(calls.every(([, args]) => args.includes('@cloudbase/cli@3.8.4')));
});

test('update 返回成功但 get ACL 或规则漂移时仍失败', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'storage-rules-drift-'));
  writeFileSync(join(cwd, 'cloudstorage.rules.json'), JSON.stringify(rules));
  for (const response of [
    { AclTag: 'PRIVATE', Rule: JSON.stringify(rules) },
    { AclTag: 'CUSTOM', Rule: JSON.stringify({ ...rules, read: true }) },
  ]) {
    let calls = 0;
    assert.throws(() =>
      reconcileStorageRules({
        envId: 'env-test',
        cwd,
        execute: () => {
          calls += 1;
          return calls === 1 ? '{}' : JSON.stringify({ Response: response });
        },
      }),
    );
  }
});
