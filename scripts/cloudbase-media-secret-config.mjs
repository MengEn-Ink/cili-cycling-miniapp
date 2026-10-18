import { chmodSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const MEDIA_SECRET_FUNCTIONS = Object.freeze([
  'profile',
  'profile-media-cleanup',
  'admin-review',
  'activity-read',
  'activity-admin',
  'club-application',
]);

function normalizedSecret(secret) {
  return typeof secret === 'string' ? secret.trim() : '';
}

export function createMediaSecretDeploymentConfig(config, secret) {
  const normalized = normalizedSecret(secret);
  if (normalized.length < 32)
    throw new Error('cloudbase-production 缺少有效的 PROFILE_MEDIA_PATH_SECRET');
  const required = new Set(MEDIA_SECRET_FUNCTIONS);
  const functions = Array.isArray(config?.functions) ? config.functions : [];
  const configured = new Set(functions.map((item) => item?.name).filter(Boolean));
  const missing = MEDIA_SECRET_FUNCTIONS.filter((name) => !configured.has(name));
  if (missing.length > 0) throw new Error(`cloudbaserc.json 缺少媒体函数：${missing.join(', ')}`);
  return {
    ...config,
    functions: functions.map((item) =>
      required.has(item.name)
        ? {
            ...item,
            envVariables: {
              ...(item.envVariables || {}),
              PROFILE_MEDIA_PATH_SECRET: normalized,
            },
          }
        : item,
    ),
  };
}

export function functionDetailHasMediaSecret(detail, secret) {
  const normalized = normalizedSecret(secret);
  if (normalized.length < 32) return false;
  const visit = (value) => {
    if (!value || typeof value !== 'object') return false;
    if (
      (value.Key === 'PROFILE_MEDIA_PATH_SECRET' && value.Value === normalized) ||
      value.PROFILE_MEDIA_PATH_SECRET === normalized
    )
      return true;
    return Object.values(value).some(visit);
  };
  return visit(detail);
}

function valueAfter(argv, flag) {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : '';
}

export function run(argv = process.argv.slice(2), env = process.env) {
  const [command] = argv;
  if (command === 'prepare') {
    const source = valueAfter(argv, '--source');
    const target = valueAfter(argv, '--target');
    if (!source || !target) throw new Error('prepare 必须提供 --source 与 --target');
    const config = JSON.parse(readFileSync(source, 'utf8'));
    const deploymentConfig = createMediaSecretDeploymentConfig(
      config,
      env.PROFILE_MEDIA_PATH_SECRET,
    );
    writeFileSync(target, `${JSON.stringify(deploymentConfig, null, 2)}\n`, { mode: 0o600 });
    chmodSync(target, 0o600);
    return;
  }
  if (command === 'verify') {
    const functionName = valueAfter(argv, '--function');
    if (!functionName) throw new Error('verify 必须提供 --function');
    const detail = JSON.parse(readFileSync(0, 'utf8'));
    if (!functionDetailHasMediaSecret(detail, env.PROFILE_MEDIA_PATH_SECRET))
      throw new Error(`部署后函数缺少统一媒体密钥：${functionName}`);
    return;
  }
  throw new Error('用法：prepare --source <path> --target <path> | verify --function <name>');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    run();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
