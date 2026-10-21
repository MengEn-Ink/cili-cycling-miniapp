import { spawn } from 'node:child_process';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

export const CLOUD_PACKAGES = [
  'shared',
  'auth',
  'activity-read',
  'activity-admin',
  'strava-bridge',
  'strava-callback',
  'registration',
  'admin-review',
  'club-application',
  'notification-send',
  'profile',
  'profile-media-cleanup',
  'route-maintenance',
];

export function concurrencyLimit(value = process.env.CLOUD_CONCURRENCY) {
  if (value === undefined || value === '') return 3;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 8) {
    throw new Error(`CLOUD_CONCURRENCY 必须是 1 到 8 的整数，收到：${value}`);
  }
  return parsed;
}

export function packageCommand(mode, name) {
  const prefix = `cloudfunctions/${name}`;
  if (mode === 'install') return ['npm', ['ci', '--prefix', prefix]];
  if (mode === 'test') return ['npm', ['--prefix', prefix, 'test']];
  throw new Error(`未知云函数任务：${mode}`);
}

function runOne(mode, name, spawnCommand = spawn) {
  const [command, args] = packageCommand(mode, name);
  console.log(`[cloud:${mode}:${name}] 开始`);
  return new Promise((resolve, reject) => {
    const child = spawnCommand(command, args, { stdio: 'inherit', env: process.env });
    child.once('error', (error) =>
      reject(new Error(`cloud:${mode}:${name} 无法启动：${error.message}`)),
    );
    child.once('close', (code, signal) => {
      if (code === 0) {
        console.log(`[cloud:${mode}:${name}] 完成`);
        resolve();
      } else {
        reject(
          new Error(
            `cloud:${mode}:${name} 失败（exit=${code ?? 'null'}, signal=${signal ?? 'none'}）`,
          ),
        );
      }
    });
  });
}

export async function runBounded(items, limit, worker) {
  const pending = [...items];
  const failures = [];
  let stopped = false;
  async function consume() {
    while (!stopped && pending.length > 0) {
      const item = pending.shift();
      try {
        await worker(item);
      } catch (error) {
        failures.push(error instanceof Error ? error : new Error(String(error)));
        stopped = true;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, consume));
  if (failures.length > 0) throw failures[0];
}

export async function runCloudPackages(mode, options = {}) {
  const packages = options.packages || CLOUD_PACKAGES;
  const worker = options.worker || ((name) => runOne(mode, name));
  const limit = options.limit ?? concurrencyLimit();
  const [shared, ...dependents] = packages;
  if (shared !== 'shared') throw new Error('云函数任务必须先处理 shared');

  // prepare-cloudfunctions 已由 cloud:install 在本脚本前同步执行；shared 完成后才能并发其余函数。
  await worker(shared);
  await runBounded(dependents, limit, worker);
  console.log(`cloud:${mode} 完成：${packages.length} 个包，并发上限 ${limit}`);
}

async function main() {
  const mode = process.argv[2];
  const packagesArgument = process.argv.find((argument) => argument.startsWith('--packages='));
  const requested = packagesArgument
    ? packagesArgument.slice('--packages='.length).split(',').filter(Boolean)
    : CLOUD_PACKAGES;
  const unknown = requested.filter((name) => !CLOUD_PACKAGES.includes(name));
  if (unknown.length > 0) throw new Error(`未知云函数包：${unknown.join(', ')}`);
  const packages = ['shared', ...requested.filter((name) => name !== 'shared')];
  await runCloudPackages(mode, { packages: [...new Set(packages)] });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
