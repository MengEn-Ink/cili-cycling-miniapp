import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const MAIN_PACKAGE_BASELINE_BYTES = 541_235;
export const MINIMUM_REDUCTION_BYTES = 80 * 1024;

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
}

export function mainPackageFiles(root = process.cwd()) {
  const miniprogramRoot = path.join(root, 'miniprogram');
  const app = JSON.parse(readFileSync(path.join(miniprogramRoot, 'app.json'), 'utf8'));
  const subpackageRoots = (app.subpackages || app.subPackages || []).map(
    (subpackage) => path.join(miniprogramRoot, String(subpackage.root || '')) + path.sep,
  );
  // 微信会上传源码、图片、字体等普通文件；仅排除 app.json 明确声明的分包目录，
  // 避免新增静态资源或其他扩展名时门禁低估真实主包体积。
  return walk(miniprogramRoot)
    .filter((file) => !subpackageRoots.some((subpackageRoot) => file.startsWith(subpackageRoot)))
    .sort()
    .map((file) => path.relative(root, file).split(path.sep).join('/'));
}

export function mainPackageBytes(root = process.cwd()) {
  return mainPackageFiles(root).reduce(
    (total, file) => total + statSync(path.join(root, file)).size,
    0,
  );
}

export function assertMainPackageBudget(root = process.cwd()) {
  const bytes = mainPackageBytes(root);
  const reduction = MAIN_PACKAGE_BASELINE_BYTES - bytes;
  if (reduction < MINIMUM_REDUCTION_BYTES) {
    throw new Error(
      `主包文件仅减少 ${reduction} 字节，要求至少减少 ${MINIMUM_REDUCTION_BYTES} 字节`,
    );
  }
  return { baselineBytes: MAIN_PACKAGE_BASELINE_BYTES, bytes, reduction };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const result = assertMainPackageBudget();
  console.log(
    `主包文件字节门禁通过：${result.baselineBytes} -> ${result.bytes}，减少 ${result.reduction} 字节`,
  );
}
