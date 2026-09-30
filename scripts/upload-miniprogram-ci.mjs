import { chmod, readFile, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const uploadRequire = createRequire(
  new URL('../tools/miniprogram-ci/package.json', import.meta.url),
);
const DEFAULT_DESCRIPTION = 'GitHub Actions 自动上传';
const VERSION_PATTERN = /^[0-9A-Za-z][0-9A-Za-z._-]{0,63}$/;

function requiredText(value, name) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) throw new Error(`缺少环境变量 ${name}`);
  return text;
}

export function parseRobot(value) {
  const robot = value === undefined || value === '' ? 1 : Number(value);
  if (!Number.isInteger(robot) || robot < 1 || robot > 30)
    throw new Error('MINIPROGRAM_CI_ROBOT 必须是 1 到 30 的整数');
  return robot;
}

export function validateVersion(value) {
  const version = requiredText(value, 'MINIPROGRAM_VERSION');
  if (!VERSION_PATTERN.test(version))
    throw new Error('MINIPROGRAM_VERSION 只能包含字母、数字、点、下划线和连字符，且不超过 64 字符');
  return version;
}

export function validateDescription(value) {
  const description = (typeof value === 'string' ? value.trim() : '') || DEFAULT_DESCRIPTION;
  if ([...description].length > 128 || /[\r\n\0]/.test(description))
    throw new Error('MINIPROGRAM_DESCRIPTION 必须是单行文本，且不超过 128 个字符');
  return description;
}

export async function loadUploadConfig(env = process.env, cwd = process.cwd()) {
  const projectPath = resolve(cwd);
  const projectConfigPath = resolve(projectPath, 'project.config.json');
  const projectConfig = JSON.parse(await readFile(projectConfigPath, 'utf8'));
  const privateKeyPath = resolve(
    requiredText(env.MINIPROGRAM_CI_PRIVATE_KEY_PATH, 'MINIPROGRAM_CI_PRIVATE_KEY_PATH'),
  );
  const keyStat = await stat(privateKeyPath).catch(() => undefined);
  if (!keyStat?.isFile()) throw new Error('代码上传密钥文件不存在或不是普通文件');
  await chmod(privateKeyPath, 0o600);
  return {
    appid: requiredText(projectConfig.appid, 'project.config.json appid'),
    projectPath,
    privateKeyPath,
    version: validateVersion(env.MINIPROGRAM_VERSION),
    description: validateDescription(env.MINIPROGRAM_DESCRIPTION),
    robot: parseRobot(env.MINIPROGRAM_CI_ROBOT),
    setting: { ...(projectConfig.setting || {}), minify: true },
  };
}

export async function uploadMiniProgram({
  ci,
  env = process.env,
  cwd = process.cwd(),
  logger = console,
}) {
  const config = await loadUploadConfig(env, cwd);
  const project = new ci.Project({
    appid: config.appid,
    type: 'miniProgram',
    projectPath: config.projectPath,
    privateKeyPath: config.privateKeyPath,
    ignores: ['node_modules/**/*', 'coverage/**/*', 'dist/**/*'],
  });
  logger.log(`开始上传微信开发版 ${config.version}（robot ${config.robot}）`);
  const result = await ci.upload({
    project,
    version: config.version,
    desc: config.description,
    robot: config.robot,
    setting: config.setting,
    onProgressUpdate: (progress) => logger.log(progress),
  });
  logger.log(`微信开发版 ${config.version} 上传成功`);
  return result;
}

const isEntryPoint =
  process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isEntryPoint) {
  const ci = uploadRequire('miniprogram-ci');
  uploadMiniProgram({ ci }).catch((error) => {
    console.error(`微信开发版上传失败：${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}

export const scriptPath = fileURLToPath(import.meta.url);
