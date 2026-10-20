import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CLOUD_PACKAGES,
  concurrencyLimit,
  packageCommand,
  runBounded,
  runCloudPackages,
} from './run-cloud-packages.mjs';

test('并发上限使用安全默认值并拒绝无界配置', () => {
  assert.equal(concurrencyLimit(undefined), 3);
  assert.equal(concurrencyLimit('8'), 8);
  for (const value of ['0', '9', '1.5', 'many']) {
    assert.throws(() => concurrencyLimit(value), /1 到 8/);
  }
});

test('npm 命令始终绑定到具体云函数目录', () => {
  assert.deepEqual(packageCommand('install', 'profile'), [
    'npm',
    ['ci', '--prefix', 'cloudfunctions/profile'],
  ]);
  assert.deepEqual(packageCommand('test', 'profile'), [
    'npm',
    ['--prefix', 'cloudfunctions/profile', 'test'],
  ]);
});

test('有上限并发不会超过 limit，且失败后不再领取新任务', async () => {
  let active = 0;
  let peak = 0;
  const started = [];
  await assert.rejects(
    runBounded(['bad', 'slow', 'never'], 2, async (name) => {
      started.push(name);
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, name === 'bad' ? 1 : 5));
      active -= 1;
      if (name === 'bad') throw new Error('bad failed');
    }),
    /bad failed/,
  );
  assert.ok(peak <= 2);
  assert.ok(!started.includes('never'));
});

test('shared 必须完成后才启动其余包', async () => {
  const events = [];
  let sharedComplete = false;
  await runCloudPackages('test', {
    packages: ['shared', 'auth', 'profile'],
    limit: 2,
    worker: async (name) => {
      events.push(`start:${name}`);
      if (name !== 'shared') assert.equal(sharedComplete, true);
      await new Promise((resolve) => setTimeout(resolve, 1));
      if (name === 'shared') sharedComplete = true;
      events.push(`end:${name}`);
    },
  });
  assert.deepEqual(events.slice(0, 2), ['start:shared', 'end:shared']);
  assert.equal(CLOUD_PACKAGES[0], 'shared');
});
