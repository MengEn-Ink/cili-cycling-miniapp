import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const MAIN_PACKAGE_BASELINE_BYTES = 541_235;
export const MINIMUM_REDUCTION_BYTES = 80 * 1024;
export const MAIN_PACKAGE_HARD_LIMIT_BYTES = MAIN_PACKAGE_BASELINE_BYTES - MINIMUM_REDUCTION_BYTES;
export const MAIN_PACKAGE_WARNING_BYTES = 440 * 1024;

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
}

/**
 * The upload budget must describe what WeChat actually packs. `project.config.json`
 * packOptions.ignore excludes checker-only artifacts (theme-contract.json has no
 * runtime import); unsupported rule types fail closed instead of being skipped.
 */
export function packedExclusions(root = process.cwd()) {
  const configPath = path.join(root, 'project.config.json');
  if (!existsSync(configPath)) return { files: new Set(), folders: [] };
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  const rules = config.packOptions?.ignore ?? [];
  const files = new Set();
  const folders = [];
  for (const rule of rules) {
    const value = typeof rule?.value === 'string' ? rule.value.replace(/^\/+/, '') : '';
    if (!value) throw new Error(`packOptions.ignore: invalid rule ${JSON.stringify(rule)}`);
    const relative = `miniprogram/${value}`;
    if (rule.type === 'file') files.add(relative);
    else if (rule.type === 'folder') folders.push(`${relative}/`);
    else throw new Error(`packOptions.ignore: unsupported type ${rule?.type}`);
  }
  return { files, folders };
}

export function mainPackageFiles(root = process.cwd()) {
  const miniprogramRoot = path.join(root, 'miniprogram');
  const app = JSON.parse(readFileSync(path.join(miniprogramRoot, 'app.json'), 'utf8'));
  const subpackageRoots = (app.subpackages || app.subPackages || []).map(
    (subpackage) => path.join(miniprogramRoot, String(subpackage.root || '')) + path.sep,
  );
  const exclusions = packedExclusions(root);
  // 微信会上传源码、图片、字体等普通文件；仅排除 app.json 的分包目录与
  // packOptions.ignore 显式排除的 checker-only 文件，避免门禁低估真实主包体积。
  return walk(miniprogramRoot)
    .filter((file) => !subpackageRoots.some((subpackageRoot) => file.startsWith(subpackageRoot)))
    .filter((file) => path.basename(file) !== '.DS_Store')
    .map((file) => path.relative(root, file).split(path.sep).join('/'))
    .filter(
      (file) =>
        !exclusions.files.has(file) &&
        !exclusions.folders.some((folder) => file.startsWith(folder)),
    )
    .sort();
}

export function mainPackageBytes(root = process.cwd()) {
  return mainPackageFiles(root).reduce(
    (total, file) => total + statSync(path.join(root, file)).size,
    0,
  );
}

export function assessMainPackageBytes(bytes) {
  const reduction = MAIN_PACKAGE_BASELINE_BYTES - bytes;
  const remainingBytes = MAIN_PACKAGE_HARD_LIMIT_BYTES - bytes;
  if (bytes > MAIN_PACKAGE_HARD_LIMIT_BYTES) {
    throw new Error(
      `主包 ${bytes} 字节超过硬限额 ${MAIN_PACKAGE_HARD_LIMIT_BYTES} 字节；仅减少 ${reduction} 字节，要求至少减少 ${MINIMUM_REDUCTION_BYTES} 字节`,
    );
  }
  return {
    baselineBytes: MAIN_PACKAGE_BASELINE_BYTES,
    bytes,
    reduction,
    warning: bytes >= MAIN_PACKAGE_WARNING_BYTES,
    warningBytes: MAIN_PACKAGE_WARNING_BYTES,
    hardLimitBytes: MAIN_PACKAGE_HARD_LIMIT_BYTES,
    remainingBytes,
  };
}

export function assertMainPackageBudget(root = process.cwd()) {
  return assessMainPackageBytes(mainPackageBytes(root));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const result = assertMainPackageBudget();
  if (result.warning) {
    console.warn(
      `::warning::主包 ${result.bytes} 字节已达到 ${result.warningBytes} 字节预警线，距硬限额剩余 ${result.remainingBytes} 字节`,
    );
  }
  console.log(
    `主包文件字节门禁通过：${result.baselineBytes} -> ${result.bytes}，减少 ${result.reduction} 字节；硬限额 ${result.hardLimitBytes}，余量 ${result.remainingBytes} 字节`,
  );
}
