#!/usr/bin/env node
// 正式 Pages 视觉验收截图器（可复用）。
//
// 复用场景：每次改动 docs/ 原型（styles.css / templates.js / app.js 等）后，
// 需要对 17 条正式路由逐页截图核对影像志风格、窄屏溢出与控件可读性。
// 本脚本把“启本地服务 → 隐藏 showcase 外壳 → 逐路由等待渲染 → 截图”
// 这套重复操作固化下来，避免每次手敲 agent-browser 命令。
//
// 依赖：playwright-core（随 npx 缓存可用）或系统 Chrome；仅读 docs/，不改任何文件。
//
// 用法：
//   node scripts/pages-visual-acceptance/capture-routes.mjs \
//     --port 63742 --width 390 --out /tmp/cili-pages-shots [--route profile]
//
// 产出：<out>/<route>.png（隐藏 showcase 外壳后的纯手机屏长图）+ <out>/report.json

import { createServer } from 'node:http';
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROUTES = [
  'activities',
  'activity-detail',
  'route-analysis',
  'registration-form',
  'registrations',
  'credential',
  'profile',
  'settings',
  'profile-edit',
  'admin-activity-list',
  'admin-activity-edit',
  'admin-reviews',
  'admin-review-detail',
  'club/center',
  'admin-club-applications',
  'admin-club-application-detail',
];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

function parseArgs(argv) {
  const options = {
    port: 63742,
    width: 390,
    out: '/tmp/cili-pages-shots',
    route: '',
    docs: 'docs',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index].replace(/^--/, '');
    if (key in options) {
      options[key] = argv[index + 1];
      index += 1;
    }
  }
  options.port = Number(options.port);
  options.width = Number(options.width);
  return options;
}

function serveDocs(docsRoot, port) {
  const root = resolve(docsRoot);
  const server = createServer((request, response) => {
    const urlPath = decodeURIComponent(request.url.split('?')[0]);
    const filePath = join(root, urlPath === '/' ? 'index.html' : urlPath);
    if (!filePath.startsWith(root) || !existsSync(filePath)) {
      response.writeHead(404);
      response.end('not found');
      return;
    }
    response.writeHead(200, {
      'content-type': MIME[extname(filePath)] || 'application/octet-stream',
    });
    response.end(readFileSync(filePath));
  });
  return new Promise((resolvePromise) =>
    server.listen(port, '127.0.0.1', () => resolvePromise(server)),
  );
}

// 隐藏 showcase 外壳（站点头/导航/说明/页脚），让 #screen-container 全展开后截图。
const HIDE_CHROME = `(() => {
  for (const selector of ['.site-header', '.screen-nav-panel', '.screen-notes', '.site-footer']) {
    const element = document.querySelector(selector);
    if (element) element.style.display = 'none';
  }
  const container = document.querySelector('#screen-container');
  if (container) {
    container.style.maxHeight = 'none';
    container.style.height = 'auto';
  }
  return Boolean(container);
})()`;

async function loadChromium() {
  try {
    const mod = await import('playwright-core');
    return mod.chromium || mod.default?.chromium;
  } catch {
    const { globSync } = await import('node:fs');
    const matches =
      globSync?.(`${process.env.HOME}/.npm/_npx/*/node_modules/playwright-core/index.js`) || [];
    if (matches.length) {
      const mod = await import(matches[0]);
      return mod.chromium || mod.default?.chromium;
    }
    throw new Error('找不到 playwright-core，请先 npx playwright-core 或安装依赖');
  }
}

// 优先复用系统已安装的 Chrome，避免下载 playwright 自带浏览器。
const CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
];
function systemChrome() {
  return CHROME_CANDIDATES.find((candidate) => existsSync(candidate));
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
  const routes = options.route ? [options.route] : ROUTES;
  mkdirSync(options.out, { recursive: true });
  const server = await serveDocs(options.docs, options.port);
  const chromium = await loadChromium();
  const executablePath = systemChrome();
  const browser = await chromium.launch(
    executablePath ? { headless: true, executablePath } : { headless: true },
  );
  const page = await browser.newPage();
  await page.setViewportSize({ width: options.width, height: 844 });
  const results = [];
  for (const route of routes) {
    const safe = route.replace(/\//g, '-');
    const consoleErrors = [];
    page.on('pageerror', (error) => consoleErrors.push(error.message));
    await page.goto(`http://127.0.0.1:${options.port}/index.html?bust=${Date.now()}#${route}`, {
      waitUntil: 'networkidle',
    });
    await page.waitForSelector('#screen-container .pg', { timeout: 15000 }).catch(() => {});
    await page.evaluate(HIDE_CHROME);
    const overflow = await page.evaluate(
      'document.documentElement.scrollWidth > window.innerWidth + 1',
    );
    const target = join(options.out, `${safe}.png`);
    await page.screenshot({ path: target, fullPage: true });
    results.push({ route, screenshot: target, overflow, pageErrors: consoleErrors.slice() });
    page.removeAllListeners('pageerror');
    process.stdout.write(`${route} → ${target}${overflow ? ' [溢出!]' : ''}\n`);
  }
  await browser.close();
  server.close();
  const report = { capturedAt: new Date().toISOString(), width: options.width, results };
  writeFileSync(join(options.out, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  const problems = results.filter((item) => item.overflow || item.pageErrors.length);
  process.stdout.write(
    `\n完成 ${results.length} 路由；${problems.length ? `${problems.length} 项有溢出或脚本错误` : '无溢出、无脚本错误'}\n`,
  );
  process.exitCode = problems.length ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  run().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
