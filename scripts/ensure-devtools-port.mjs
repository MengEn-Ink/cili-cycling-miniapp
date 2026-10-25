#!/usr/bin/env node
// 微信开发者工具 CLI 服务端口一键修复脚本。
//
// 问题：Windows 上 DevTools 设置了 enableServicePort=true，但 CLI 报
// "IDE service port disabled"，因为 .ide 文件未被写入。
//
// 解决：读取 ls_*.json 中 DevTools 自动分配的 port，确认监听后写入 .ide/.cli。
//
// 用法：node scripts/ensure-devtools-port.mjs
//   会自动定位运行时 profile、检测端口、写入 .ide/.cli，然后输出 CLI 状态。

import { existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';

const DEVTOOLS_BASE = process.env.WECHAT_DEVTOOLS_PATH || 'D:\\app\\微信web开发者工具';
const APP_ASAR = join(DEVTOOLS_BASE, 'resources', 'app.asar');
const USER_DATA_ROOT = join(
  process.env.LOCALAPPDATA || process.env.USERPROFILE + '\\AppData\\Local',
  '微信开发者工具',
  'User Data',
);

function md5(str) {
  return createHash('md5').update(str, 'utf8').digest('hex');
}

function findRuntimeProfile() {
  const productHash = md5(APP_ASAR);
  const profileDir = join(USER_DATA_ROOT, productHash);
  if (!existsSync(profileDir)) {
    throw new Error(
      `未找到运行时 profile：${profileDir}\n请确认 DevTools 安装路径：${DEVTOOLS_BASE}`,
    );
  }
  return profileDir;
}

function readJsonSafe(filePath) {
  let content = readFileSync(filePath, 'utf8');
  // 去除 UTF-8 BOM
  if (content.charCodeAt(0) === 0xfeff) content = content.slice(1);
  return JSON.parse(content);
}

function findLsJson(profileDir) {
  const weappLocalDir = join(profileDir, 'WeappLocalData');
  if (!existsSync(weappLocalDir)) return null;
  const files = readdirSync(weappLocalDir).filter(
    (f) => f.startsWith('ls_') && f.endsWith('.json'),
  );
  // 遍历所有 ls_*.json，找到包含 security.port 的那个（其他可能是加密或空文件）
  for (const file of files) {
    try {
      const data = readJsonSafe(join(weappLocalDir, file));
      if (data.security?.port) return join(weappLocalDir, file);
    } catch {
      // 加密文件无法解析，跳过
    }
  }
  return null;
}

function readPortFromLsJson(lsJsonPath) {
  try {
    const data = readJsonSafe(lsJsonPath);
    return {
      enableServicePort: data.security?.enableServicePort,
      port: data.security?.port,
      trustWhenAuto: data.security?.trustWhenAuto,
    };
  } catch {
    return null;
  }
}

function isPortListening(port) {
  try {
    const out = execSync(`netstat -ano | findstr ":${port}" | findstr LISTENING`, {
      encoding: 'utf8',
    });
    return out.trim().length > 0;
  } catch {
    return false;
  }
}

function run() {
  const profileDir = findRuntimeProfile();
  const defaultDir = join(profileDir, 'Default');
  const lsJsonPath = findLsJson(profileDir);

  console.log(`运行时 profile: ${profileDir.split('\\').pop()}`);

  if (!lsJsonPath) {
    console.error('未找到 ls_*.json，请先启动一次 DevTools。');
    process.exit(1);
  }

  const info = readPortFromLsJson(lsJsonPath);
  if (!info) {
    console.error('无法解析 ls_*.json 中的 security 配置。');
    process.exit(1);
  }

  console.log(`enableServicePort: ${info.enableServicePort}`);
  console.log(`trustWhenAuto:     ${info.trustWhenAuto}`);
  console.log(`分配端口:          ${info.port}`);

  if (!info.enableServicePort) {
    console.error('enableServicePort 为 false，请在 DevTools 设置中开启「服务端口」。');
    process.exit(1);
  }

  if (!info.port) {
    console.error('未分配端口，请重启 DevTools。');
    process.exit(1);
  }

  if (!isPortListening(info.port)) {
    console.error(`端口 ${info.port} 未监听，请重启 DevTools 后重试。`);
    process.exit(1);
  }

  console.log(`端口 ${info.port} 监听正常 ✓`);

  // 写入 .ide 和 .cli
  const ideFile = join(defaultDir, '.ide');
  const cliFile = join(defaultDir, '.cli');
  writeFileSync(ideFile, String(info.port), 'utf8');
  writeFileSync(cliFile, String(info.port), 'utf8');
  console.log(`已写入 .ide / .cli → ${info.port}`);

  // 验证 CLI 连接
  try {
    const cli = join(DEVTOOLS_BASE, 'cli.bat');
    const result = execSync(`"${cli}" islogin`, { encoding: 'utf8', timeout: 15000 });
    const match = result.match(/\{.*login.*\}/);
    console.log(`CLI 连接: ${match ? match[0] : 'OK'}`);
  } catch {
    console.log(`CLI 验证跳过（可手动运行 cli.bat islogin）`);
  }

  console.log('\n完成。现在可以使用 wechatide / cli.bat 命令。');
}

run();
