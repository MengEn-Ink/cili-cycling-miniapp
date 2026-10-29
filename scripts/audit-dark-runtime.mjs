#!/usr/bin/env node
/* global document, getComputedStyle, innerHeight, innerWidth, location, requestAnimationFrame, window */

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { chromium } from 'playwright';

const HOST = '127.0.0.1';
const DOCS_DIR = resolve('docs');
const WIDTHS = [340, 375, 430];
const HEIGHT = 780;
const ROUNDS = Number(process.env.DARK_AUDIT_ROUNDS || 3);
const EXTERNAL_BASE = process.env.DARK_AUDIT_URL || '';
const contentTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp'],
  ['.svg', 'image/svg+xml'],
]);

function createDocsServer() {
  return createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url || '/', 'http://localhost').pathname);
      const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
      const filePath = resolve(DOCS_DIR, relativePath);
      if (filePath !== DOCS_DIR && !filePath.startsWith(`${DOCS_DIR}${sep}`)) {
        response.writeHead(403).end('Forbidden');
        return;
      }
      const fileStat = await stat(filePath);
      if (!fileStat.isFile()) throw new Error('Not a file');
      response.writeHead(200, {
        'Cache-Control': 'no-store',
        'Content-Type': contentTypes.get(extname(filePath)) || 'application/octet-stream',
      });
      createReadStream(filePath).pipe(response);
    } catch {
      response.writeHead(404).end('Not Found');
    }
  });
}

async function listen(server) {
  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, HOST, resolveListen);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('无法获取暗场审核服务端口');
  return `http://${HOST}:${address.port}`;
}

function closeServer(server) {
  return new Promise((resolveClose, reject) => {
    server.close((error) => (error ? reject(error) : resolveClose()));
  });
}

async function inspectCanvas(page) {
  return page.evaluate(() => {
    const parseColor = (color) => {
      const match = color.match(
        /rgba?\((\d+(?:\.\d+)?)[,\s]+(\d+(?:\.\d+)?)[,\s]+(\d+(?:\.\d+)?)(?:\s*[,/]\s*(\d*(?:\.\d+)?))?\)/,
      );
      if (!match) return null;
      return {
        r: Number(match[1]),
        g: Number(match[2]),
        b: Number(match[3]),
        a: match[4] === undefined || match[4] === '' ? 1 : Number(match[4]),
      };
    };
    const describe = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const style = getComputedStyle(element);
      return {
        selector,
        background: style.backgroundColor,
        colorScheme: style.colorScheme,
      };
    };
    const viewportArea = Math.max(1, innerWidth * innerHeight);
    const largeLightSurfaces = [];
    for (const element of document.querySelectorAll('body *')) {
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0 || rect.bottom <= 0 || rect.top >= innerHeight)
        continue;
      const style = getComputedStyle(element);
      if (
        style.visibility === 'hidden' ||
        style.display === 'none' ||
        Number(style.opacity) < 0.05
      ) {
        continue;
      }
      const color = parseColor(style.backgroundColor);
      if (!color || color.a < 0.9) continue;
      const visibleWidth = Math.min(innerWidth, rect.right) - Math.max(0, rect.left);
      const visibleHeight = Math.min(innerHeight, rect.bottom) - Math.max(0, rect.top);
      const visibleArea = Math.max(0, visibleWidth) * Math.max(0, visibleHeight);
      const luminance = (color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722) / 255;
      if (visibleArea / viewportArea >= 0.08 && luminance >= 0.9) {
        largeLightSurfaces.push({
          tag: element.tagName.toLowerCase(),
          className: typeof element.className === 'string' ? element.className.slice(0, 100) : '',
          background: style.backgroundColor,
          viewportRatio: Number((visibleArea / viewportArea).toFixed(3)),
        });
        if (largeLightSurfaces.length >= 8) break;
      }
    }
    return {
      canvases: ['html', 'body', '.phone-inner', '.screen-container', '.cinema-flow-page']
        .map(describe)
        .filter(Boolean),
      horizontalOverflow:
        document.documentElement.scrollWidth - document.documentElement.clientWidth,
      largeLightSurfaces,
      textLength: (document.querySelector('.screen-container')?.textContent || '').trim().length,
      title: document.title,
      themeColor: document.querySelector('meta[name="theme-color"]')?.getAttribute('content') || '',
      colorSchemeMeta:
        document.querySelector('meta[name="color-scheme"]')?.getAttribute('content') || '',
    };
  });
}

function isOpaqueDark(color) {
  const match = color.match(
    /rgba?\((\d+(?:\.\d+)?)[,\s]+(\d+(?:\.\d+)?)[,\s]+(\d+(?:\.\d+)?)(?:\s*[,/]\s*(\d*(?:\.\d+)?))?\)/,
  );
  if (!match) return false;
  const channels = [Number(match[1]), Number(match[2]), Number(match[3])];
  const alpha = match[4] === undefined || match[4] === '' ? 1 : Number(match[4]);
  return alpha >= 0.99 && channels.every((channel) => channel <= 48);
}

function collectProblems(
  snapshot,
  label,
  { requireContent = true, checkLayout = true, checkComponents = true } = {},
) {
  const problems = [];
  for (const selector of ['html', 'body']) {
    const canvas = snapshot.canvases.find((item) => item.selector === selector);
    if (!canvas || !isOpaqueDark(canvas.background)) {
      problems.push(
        `${label}: ${selector} 未提供不透明暗色画布（${canvas?.background || 'missing'}）`,
      );
    }
  }
  if (checkComponents) {
    for (const canvas of snapshot.canvases.filter((item) =>
      ['.phone-inner', '.screen-container', '.cinema-flow-page'].includes(item.selector),
    )) {
      if (!isOpaqueDark(canvas.background)) {
        problems.push(`${label}: ${canvas.selector} 暗场失效（${canvas.background}）`);
      }
    }
  }
  if (checkLayout && snapshot.horizontalOverflow > 1) {
    problems.push(`${label}: 横向溢出 ${snapshot.horizontalOverflow}px`);
  }
  if (snapshot.largeLightSurfaces.length) {
    problems.push(
      `${label}: 出现大面积浅色实体 ${JSON.stringify(snapshot.largeLightSurfaces.slice(0, 3))}`,
    );
  }
  if (requireContent && snapshot.textLength < 4) {
    problems.push(`${label}: 页面内容未稳定渲染（textLength=${snapshot.textLength}）`);
  }
  return problems;
}

async function auditCriticalStartup(browser, base) {
  const problems = [];
  const context = await browser.newContext({ viewport: { width: 375, height: HEIGHT } });
  const page = await context.newPage();
  await page.route('**/styles.css*', async (route) => {
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 1500));
    await route.continue();
  });
  await page.goto(`${base}/?dark-audit=critical#activities`, { waitUntil: 'commit' });
  await page.waitForTimeout(80);
  const startup = await inspectCanvas(page);
  problems.push(
    ...collectProblems(startup, 'CSS 延迟 80ms 启动画布', {
      requireContent: false,
      checkLayout: false,
      checkComponents: false,
    }),
  );
  if (startup.themeColor !== '#0b0a0c') {
    problems.push(`启动主题色未对齐 #0b0a0c（${startup.themeColor || 'missing'}）`);
  }
  if (startup.colorSchemeMeta !== 'dark') {
    problems.push(`缺少 color-scheme=dark 启动声明（${startup.colorSchemeMeta || 'missing'}）`);
  }
  await page.waitForLoadState('load', { timeout: 10000 });
  await page.waitForTimeout(120);
  problems.push(...collectProblems(await inspectCanvas(page), 'CSS 延迟恢复后'));
  await context.close();
  return problems;
}

async function auditImageFailure(browser, base) {
  const problems = [];
  const context = await browser.newContext({ viewport: { width: 375, height: HEIGHT } });
  const page = await context.newPage();
  await page.route(/\.(?:png|jpe?g|webp|gif)(?:\?.*)?$/i, (route) => route.abort('failed'));
  await page.goto(`${base}/?dark-audit=images#activities`, {
    waitUntil: 'load',
    timeout: 15000,
  });
  await page.waitForTimeout(250);
  problems.push(...collectProblems(await inspectCanvas(page), '图片全部失败'));
  await context.close();
  return problems;
}

async function auditScriptDelay(browser, base) {
  const problems = [];
  const context = await browser.newContext({ viewport: { width: 375, height: HEIGHT } });
  const page = await context.newPage();
  await page.route('**/app.js*', async (route) => {
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 1500));
    await route.continue();
  });
  await page.goto(`${base}/?dark-audit=script#activities`, { waitUntil: 'commit' });
  await page.waitForTimeout(120);
  problems.push(
    ...collectProblems(await inspectCanvas(page), '主脚本延迟 120ms', {
      requireContent: false,
      checkLayout: false,
      checkComponents: false,
    }),
  );
  await page.waitForLoadState('load', { timeout: 10000 });
  await page.waitForTimeout(120);
  problems.push(...collectProblems(await inspectCanvas(page), '主脚本延迟恢复后'));
  await context.close();
  return problems;
}

async function auditRoutes(browser, base, metrics) {
  const problems = [];
  for (const width of WIDTHS) {
    const context = await browser.newContext({ viewport: { width, height: HEIGHT } });
    const page = await context.newPage();
    const runtimeErrors = [];
    page.on('pageerror', (error) => runtimeErrors.push(String(error)));
    page.on('console', (message) => {
      if (message.type() === 'error') runtimeErrors.push(message.text());
    });
    await page.goto(`${base}/?dark-audit=routes#activities`, {
      waitUntil: 'load',
      timeout: 15000,
    });
    await page.waitForTimeout(180);
    const routeStates = await page.evaluate(() => {
      const pages = window.prototypeData?.pages || [];
      const results = [];
      for (const item of pages) {
        results.push(item.id);
        const states = Array.isArray(item.states) ? item.states.map(([id]) => id) : [];
        for (const state of states.filter((id) =>
          /loading|error|empty|waiting|preparing/.test(id),
        )) {
          results.push(`${item.id}/${state}`);
        }
      }
      return [...new Set(results)];
    });
    for (let round = 1; round <= ROUNDS; round += 1) {
      for (const routeState of routeStates) {
        const transitionMs = await page.evaluate(
          (hash) =>
            new Promise((resolveTransition) => {
              const startedAt = performance.now();
              location.hash = hash;
              requestAnimationFrame(() =>
                requestAnimationFrame(() => resolveTransition(performance.now() - startedAt)),
              );
            }),
          routeState,
        );
        metrics.maxTransitionMs = Math.max(metrics.maxTransitionMs, transitionMs);
        metrics.checkedTransitions += 1;
        if (transitionMs > 250) {
          problems.push(
            `${routeState}@${width} 第 ${round} 轮: 双帧切页耗时 ${transitionMs.toFixed(1)}ms`,
          );
        }
        await page.waitForTimeout(70);
        problems.push(
          ...collectProblems(await inspectCanvas(page), `${routeState}@${width} 第 ${round} 轮`),
        );
      }
    }
    if (runtimeErrors.length) {
      problems.push(
        `宽度 ${width}: ${runtimeErrors.length} 个运行时错误：${runtimeErrors.slice(0, 3).join(' | ')}`,
      );
    }
    await context.close();
  }
  return problems;
}

const server = EXTERNAL_BASE ? null : createDocsServer();
const base = EXTERNAL_BASE || (await listen(server));
const browser = await chromium.launch();
const problems = [];
const metrics = { checkedTransitions: 0, maxTransitionMs: 0 };
try {
  problems.push(...(await auditCriticalStartup(browser, base)));
  problems.push(...(await auditScriptDelay(browser, base)));
  problems.push(...(await auditImageFailure(browser, base)));
  problems.push(...(await auditRoutes(browser, base, metrics)));
} finally {
  await browser.close();
  if (server) await closeServer(server);
}

if (problems.length) {
  console.error(`❌ 暗场运行时审核失败（${problems.length} 项）`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exitCode = 1;
} else {
  console.log(
    `✅ 暗场运行时审核通过：CSS/主脚本延迟、图片全失败、${WIDTHS.length} 个宽度 × ${ROUNDS} 轮全路由/加载/错误状态均无白底、横向溢出或运行时错误；${metrics.checkedTransitions} 次切页最大双帧耗时 ${metrics.maxTransitionMs.toFixed(1)}ms`,
  );
}
