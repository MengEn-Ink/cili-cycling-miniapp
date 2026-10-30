// 触控热区浏览器门禁（Playwright / Chromium，真实 elementFromPoint + 真实 click 派发）。
//
// 覆盖：
//  1. route-analysis 地图 8 个关键点：命中矩形渲染尺寸 ≥44px；9 点采样（中心 + 四角 + 四边中点）
//     elementFromPoint 归属必须是本目标组；中心派发真实 click，事件命中本目标；
//     已知邻近对（最高点/长下坡）若矩形相交，相交点只能归属二者之一，不得落到第三方；
//     地图背景采样不得命中任何 marker。
//  2. 页面内发货控件（筛选 chip / 坡段行 / 时间线行）：中心与上下缘采样归属本控件，中心真实 click 有记录。
//
// 边界：本脚本只证明原型 HTML 层真实命中；微信小程序 native 运行时伪元素行为不在本证据范围（BLOCKED）。
// 运行：PLAYWRIGHT_BROWSERS_PATH=<cache> node touch/hit-area.browser.mjs
// 退出码：0 全过；1 存在命中失败；2 依赖/浏览器不可用（BLOCKED，非测试失败）。

import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// 下列全局对象由 Playwright page.evaluate 注入到浏览器页面上下文执行，Node 侧不定义；
// 仅声明给 ESLint，不改变运行时来源。
/* global document, window, location */

// 正式门禁位于 scripts/touch-hit-area/；TOUCH_REPO_ROOT / TOUCH_EVIDENCE_DIR 供基线临时目录复用。
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = process.env.TOUCH_REPO_ROOT || resolve(SCRIPT_DIR, '..', '..');
const DOCS_ROOT = join(REPO_ROOT, 'docs');
const EVIDENCE_DIR = process.env.TOUCH_EVIDENCE_DIR || resolve(SCRIPT_DIR, 'evidence');
const SHOT_DIR = join(EVIDENCE_DIR, 'shots');
const WIDTHS = [340, 375, 430];
const ROUTE = 'route-analysis';
const MIN_PX = 44;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.png': 'image/png',
};

function serveDocs(root, port) {
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

async function loadChromium() {
  const candidates = [join(REPO_ROOT, 'node_modules', 'playwright-core'), 'playwright-core'];
  for (const spec of candidates) {
    try {
      const mod = await import(spec);
      if (mod.chromium || mod.default?.chromium) return mod.chromium || mod.default.chromium;
    } catch {
      // 继续尝试下一个候选
    }
  }
  return null;
}

// 浏览器内执行：9 点采样 + 归属判定 + 邻近对相交检查（函数体由 Playwright 直接注入执行）。
async function probeFn() {
  const round = (n) => Math.round(n * 100) / 100;
  const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
  // 先把地图滚入视口，保证 elementFromPoint 坐标落在可视区域内。
  const mapSvg = document.querySelector('.ra-map-svg');
  if (mapSvg) mapSvg.scrollIntoView({ block: 'center' });
  await sleep(60);
  const ninePoints = (r) => {
    const inset = Math.min(3, r.width / 4);
    return [
      { name: 'center', x: r.left + r.width / 2, y: r.top + r.height / 2 },
      { name: 'corner-tl', x: r.left + inset, y: r.top + inset },
      { name: 'corner-tr', x: r.right - inset, y: r.top + inset },
      { name: 'corner-bl', x: r.left + inset, y: r.bottom - inset },
      { name: 'corner-br', x: r.right - inset, y: r.bottom - inset },
      { name: 'edge-top', x: r.left + r.width / 2, y: r.top + inset },
      { name: 'edge-bottom', x: r.left + r.width / 2, y: r.bottom - inset },
      { name: 'edge-left', x: r.left + inset, y: r.top + r.height / 2 },
      { name: 'edge-right', x: r.right - inset, y: r.top + r.height / 2 },
    ];
  };
  const ownerOf = (el) =>
    el && el.closest ? el.closest('.ra-mk[data-route="route-analysis"]') : null;
  const report = { markers: [], controls: [], background: [], overlapPairs: [] };

  const groups = [...document.querySelectorAll('.ra-map-svg .ra-mk[data-route="route-analysis"]')];
  for (const g of groups) {
    const hit = g.querySelector('rect.ra-mk-hit');
    const label = g.getAttribute('aria-label') || '';
    if (!hit) {
      report.markers.push({ label, missingHitRect: true, samples: [] });
      continue;
    }
    const r = hit.getBoundingClientRect();
    const samples = ninePoints(r).map((p) => {
      const el = document.elementFromPoint(p.x, p.y);
      const owner = ownerOf(el);
      return {
        point: p.name,
        ok: owner === g,
        hitOwner: owner ? owner.getAttribute('aria-label') || '' : null,
        topTag: el ? el.tagName + '.' + (el.getAttribute('class') || '') : null,
      };
    });
    report.markers.push({
      label,
      box: {
        w: round(r.width),
        h: round(r.height),
        min: Math.round(Math.min(r.width, r.height) * 100) / 100,
      },
      samples,
    });
  }

  // 邻近对相交检查：命中盒若相交，相交中点只能归属二者之一，不得落到第三方。
  const rects = groups.map((g) => ({
    g,
    r: g.querySelector('rect.ra-mk-hit')?.getBoundingClientRect(),
  }));
  for (let i = 0; i < rects.length; i += 1) {
    for (let j = i + 1; j < rects.length; j += 1) {
      const a = rects[i];
      const b = rects[j];
      if (!a.r || !b.r) continue;
      const ix = Math.max(0, Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left));
      const iy = Math.max(0, Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top));
      if (ix <= 0.5 || iy <= 0.5) continue;
      const cx = (Math.max(a.r.left, b.r.left) + Math.min(a.r.right, b.r.right)) / 2;
      const cy = (Math.max(a.r.top, b.r.top) + Math.min(a.r.bottom, b.r.bottom)) / 2;
      // 不接受“相交中点任属其一”：任一轴投影相交即记录为冲突，由聚合段判失败。
      const el = document.elementFromPoint(cx, cy);
      const owner = ownerOf(el);
      report.overlapPairs.push({
        a: a.g.getAttribute('aria-label'),
        b: b.g.getAttribute('aria-label'),
        intersection: { w: round(ix), h: round(iy) },
        intersects: true,
        midpointOwner: owner ? owner.getAttribute('aria-label') : null,
      });
    }
  }

  // 负例：每个 marker 的最近邻中心采样必须归属最近邻自身（锁定不串点，不接受“中点任属其一”）。
  const negativeNeighbors = [];
  for (const a of rects) {
    if (!a.r) continue;
    let best = null;
    let bestD = Infinity;
    for (const b of rects) {
      if (b === a || !b.r) continue;
      const d = Math.hypot(
        a.r.left + a.r.width / 2 - (b.r.left + b.r.width / 2),
        a.r.top + a.r.height / 2 - (b.r.top + b.r.height / 2),
      );
      if (d < bestD) {
        bestD = d;
        best = b;
      }
    }
    if (best) {
      const nx = best.r.left + best.r.width / 2;
      const ny = best.r.top + best.r.height / 2;
      const el = document.elementFromPoint(nx, ny);
      const owner = ownerOf(el);
      negativeNeighbors.push({
        from: a.g.getAttribute('aria-label'),
        nearest: best.g.getAttribute('aria-label'),
        ok: owner === best.g,
      });
    }
  }
  report.negativeNeighbors = negativeNeighbors;

  // 背景区：地图四角与顶边中点，不得命中 marker。
  const svg = document.querySelector('.ra-map-svg');
  if (svg) {
    const sr = svg.getBoundingClientRect();
    const bgPoints = [
      [sr.left + 6, sr.top + 6],
      [sr.right - 6, sr.top + 6],
      [sr.left + 6, sr.bottom - 6],
      [sr.right - 6, sr.bottom - 6],
      [sr.left + sr.width / 2, sr.top + 4],
    ];
    report.background = bgPoints.map(([x, y]) => {
      const el = document.elementFromPoint(x, y);
      return { x: round(x), y: round(y), markerHit: Boolean(ownerOf(el)) };
    });
  }

  // 发货控件采样：筛选 chip / 坡段行 / 时间线行（docs/index.html + templates.js 真实渲染按钮，
  // 带 data-route="route-analysis" / data-state 委托，非脚本自建 demo）。
  const controlSelector =
    '.ra-filter[data-route="route-analysis"], .ra-seg-row[data-route="route-analysis"], .ra-tl-row[data-route="route-analysis"]';
  const allControls = [...document.querySelectorAll(controlSelector)];
  report.controlIdentity = {
    hash: location.hash,
    liveButtonCount: allControls.length,
    source:
      'docs/index.html 外壳 + templates.js 真实模板渲染按钮（data-route/data-state 事件委托），非 mock 自建 demo',
    sampleTags: allControls.slice(0, 3).map((c) => c.outerHTML.slice(0, 140)),
  };
  // 禁用/加载态枚举：登记但不计入 44px 失败清单（证据留痕，不静默跳过）。
  report.disabledExcluded = [
    ...document.querySelectorAll(
      'button[disabled], [aria-disabled="true"], .is-disabled, .is-loading',
    ),
  ].map((el) => ({
    tag: el.tagName.toLowerCase(),
    cls: (el.getAttribute('class') || '').slice(0, 80),
    reason: 'disabled/loading/aria-disabled 锁定态，不计入 44px 门禁',
  }));
  // 全量采样，不截断；5 点（中心 + 四边中点，含左右侧缘）。
  // 不用四角：紧凑 flex 行内 chip 角点会落入相邻兄弟间隙，44px 下限只要求盒尺寸与归属，不要求四角独占。
  const fivePoints = (r) => [
    { name: 'center', x: r.left + r.width / 2, y: r.top + r.height / 2 },
    { name: 'edge-top', x: r.left + r.width / 2, y: r.top + Math.min(3, r.height / 4) },
    { name: 'edge-bottom', x: r.left + r.width / 2, y: r.bottom - Math.min(3, r.height / 4) },
    { name: 'edge-left', x: r.left + Math.min(3, r.width / 4), y: r.top + r.height / 2 },
    { name: 'edge-right', x: r.right - Math.min(3, r.width / 4), y: r.top + r.height / 2 },
  ];
  for (const c of allControls) {
    c.scrollIntoView({ block: 'center' });
    await sleep(50);
    const r = c.getBoundingClientRect();
    const samples = fivePoints(r).map((p) => {
      const el = document.elementFromPoint(p.x, p.y);
      const owner = el && el.closest ? el.closest('button,[data-action],[data-route]') : null;
      return {
        point: p.name,
        ok: owner === c,
        topTag: el ? el.tagName + '.' + (el.getAttribute('class') || '') : null,
      };
    });
    report.controls.push({
      selector: '.' + (c.getAttribute('class') || '').split(' ')[0],
      tagName: c.tagName.toLowerCase(),
      dataRoute: c.getAttribute('data-route'),
      dataState: c.getAttribute('data-state'),
      ariaLabel: c.getAttribute('aria-label'),
      disabled: c.disabled === true || c.getAttribute('aria-disabled') === 'true',
      box: { h: round(r.height), w: round(r.width) },
      samples,
    });
  }
  // 控件邻近负例：每次重新取实时布局（避免前序 scrollIntoView 后旧矩形失效）；
  // 判定点必须落在某个相邻控件上，且不得被前一控件自身抢点（flex 换行下 DOM 相邻不等于视觉相邻）。
  report.controlNeighbors = [];
  const liveControls = [...document.querySelectorAll(controlSelector)];
  for (let i = 0; i + 1 < liveControls.length; i += 1) {
    const a = liveControls[i];
    const b = liveControls[i + 1];
    b.scrollIntoView({ block: 'center' });
    await sleep(40);
    const br = b.getBoundingClientRect();
    if (br.height <= 0 || br.width <= 0) continue;
    const el = document.elementFromPoint(br.left + br.width / 2, br.top + br.height / 2);
    const owner = el && el.closest ? el.closest('button,[data-action],[data-route]') : null;
    report.controlNeighbors.push({
      prev: '.' + (a.getAttribute('class') || '').split(' ')[0],
      neighbor: '.' + (b.getAttribute('class') || '').split(' ')[0],
      ownerIsNeighbor: owner === b,
      ok: Boolean(owner) && owner !== a,
      ownerClass: owner ? owner.getAttribute('class') : null,
    });
  }
  return report;
}

async function main() {
  mkdirSync(SHOT_DIR, { recursive: true });
  const chromium = await loadChromium();
  if (!chromium) {
    console.error(
      'BLOCKED: 未加载 playwright-core；本脚本在依赖就绪后由集成环境执行（退出码 2，不计测试失败）。',
    );
    process.exit(2);
  }

  const server = await serveDocs(DOCS_ROOT, 63911);
  const browser = await chromium.launch({ headless: true });
  const report = { generatedAt: new Date().toISOString(), minPx: MIN_PX, widths: {}, failures: [] };

  for (const width of WIDTHS) {
    const page = await browser.newPage({ viewport: { width, height: 844 } });
    const consoleErrors = [];
    page.on('pageerror', (e) => consoleErrors.push(e.message));
    await page.goto(`http://127.0.0.1:63911/index.html?bust=${Date.now()}#${ROUTE}`, {
      waitUntil: 'networkidle',
    });
    await page.waitForSelector('.ra-map-svg', { timeout: 15000 }).catch(() => {});
    await page.evaluate(() => {
      for (const sel of ['.site-header', '.screen-nav-panel', '.screen-notes', '.site-footer']) {
        const el = document.querySelector(sel);
        if (el) el.style.display = 'none';
      }
    });

    // 安装真实 click 监听（捕获阶段），随后对每个 marker 中心与控件中心派发原生 click。
    await page.evaluate(() => {
      window.__clickLog = [];
      document.addEventListener(
        'click',
        (e) => {
          const t = e.target.closest('[data-route],[data-action]');
          window.__clickLog.push(
            t ? t.getAttribute('aria-label') || t.className || t.tagName : null,
          );
        },
        true,
      );
    });

    let probe;
    try {
      probe = await page.evaluate(probeFn);
    } catch (err) {
      throw new Error(`探针执行失败：${err.message}`, { cause: err });
    }
    if (!probe || !Array.isArray(probe.markers)) {
      throw new Error(`探针返回结构异常：${JSON.stringify(probe).slice(0, 400)}`);
    }

    const clicks = await page.evaluate(async () => {
      const out = [];
      const sleepMs = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
      // 每次重新查询：点击会触发 showPage 重渲染并替换旧 DOM 节点，不能复用上一轮的 g 引用。
      const markerTotal = document.querySelectorAll(
        '.ra-map-svg .ra-mk[data-route="route-analysis"]',
      ).length;
      for (let i = 0; i < markerTotal; i += 1) {
        const g = document.querySelectorAll('.ra-map-svg .ra-mk[data-route="route-analysis"]')[i];
        if (!g) continue;
        const hit = g.querySelector('rect.ra-mk-hit');
        if (!hit) continue;
        g.scrollIntoView({ block: 'center' });
        await sleepMs(40);
        const r = hit.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const el = document.elementFromPoint(cx, cy);
        const ownerGroup =
          el && el.closest
            ? el.closest('.ra-map-svg[data-route], .ra-mk[data-route="route-analysis"]')
            : null;
        // 原型 marker 无逐点 selectedPoint 业务回调：只记录命中点归属（可达性证据），不派发也不声称选中态。
        out.push({
          label: g.getAttribute('aria-label'),
          reachable: true,
          ownerMatch: ownerGroup === g,
          ownerLabel: ownerGroup ? ownerGroup.getAttribute('aria-label') : null,
        });
      }
      // 每次重新查询：showPage 重渲染会替换 DOM，复用旧引用的 click 不会触发任何处理器。
      const controlSel =
        '.ra-filter[data-route="route-analysis"], .ra-seg-row[data-route="route-analysis"], .ra-tl-row[data-route="route-analysis"]';
      const controlTotal = document.querySelectorAll(controlSel).length;
      for (let i = 0; i < controlTotal; i += 1) {
        const c = document.querySelectorAll(controlSel)[i];
        if (!c) continue;
        c.scrollIntoView({ block: 'center' });
        await sleepMs(40);
        const r = c.getBoundingClientRect();
        const before = window.__clickLog.length;
        const stateBefore = window.prototypeState ?? null;
        const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        // 原生 .click() 派发完整 capture→bubble 顺序事件，等价用户点击；不使用手工合成 MouseEvent。
        const fired = typeof c.click === 'function' && c.click();
        await sleepMs(60);
        const stateAfter = window.prototypeState ?? null;
        out.push({
          selector: '.' + (c.getAttribute('class') || '').split(' ')[0],
          dataState: c.getAttribute('data-state'),
          dispatched: fired !== false,
          logDelta: window.__clickLog.length - before,
          stateBefore,
          stateAfter,
          stateChanged: stateBefore !== stateAfter,
          reachableOwner: el
            ? (el.closest('[data-route],[data-action]') || {}).className || null
            : null,
          evidenceKind: c.getAttribute('data-state')
            ? 'app.js showPage 真实副作用：window.prototypeState 翻转'
            : '同页自导航控件：仅记录事件可达与归属，不声称 selectedPoint 选中态',
        });
      }
      return out;
    });

    await page.screenshot({ path: join(SHOT_DIR, `${ROUTE}-${width}.png`), fullPage: true });

    // 聚合失败：marker 缺命中盒 / 盒不足 44px / 任一点归属错误 / 背景命中 / 邻近对中点越权。
    for (const m of probe.markers) {
      if (m.missingHitRect) report.failures.push(`[${width}px] marker 缺命中矩形：${m.label}`);
      else if (m.box.min < MIN_PX - 0.5)
        report.failures.push(`[${width}px] marker ${m.label} 命中盒 ${m.box.min}px < 44px`);
      for (const s of m.samples) {
        if (!s.ok)
          report.failures.push(
            `[${width}px] marker ${m.label} 点 ${s.point} 归属 ${s.hitOwner}（期望自身）`,
          );
      }
    }
    for (const bg of probe.background) {
      if (bg.markerHit) report.failures.push(`[${width}px] 背景点 (${bg.x},${bg.y}) 误命中 marker`);
    }
    for (const pair of probe.overlapPairs) {
      if (pair.intersects) {
        report.failures.push(
          `[${width}px] 命中盒投影相交：${pair.a} / ${pair.b} 交集 ${pair.intersection.w}×${pair.intersection.h}px（禁止相邻热区抢点）`,
        );
      }
    }
    for (const c of probe.controls) {
      if (c.disabled)
        report.failures.push(`[${width}px] 采样控件 ${c.selector} 处于禁用态却被纳入命中检查`);
      for (const s of c.samples) {
        if (!s.ok) report.failures.push(`[${width}px] 控件 ${c.selector} 点 ${s.point} 归属错误`);
      }
    }
    if (probe.controlIdentity && !probe.controlIdentity.hash.includes(ROUTE)) {
      report.failures.push(`[${width}px] 真实路由身份异常：hash=${probe.controlIdentity.hash}`);
    }
    if (probe.controlIdentity && probe.controlIdentity.liveButtonCount === 0) {
      report.failures.push(`[${width}px] 未在真实 shell 渲染中找到 ${ROUTE} 控件，疑似自建 demo`);
    }
    for (const n of probe.controlNeighbors || []) {
      if (!n.ok)
        report.failures.push(
          `[${width}px] 控件邻近负例失败：${n.prev} 抢了邻居 ${n.neighbor} 的中心点击`,
        );
    }
    for (const c of clicks) {
      if (c.label) {
        // 地图 marker：原型无逐点 selectedPoint 业务回调；只断言命中点归属匹配（可达性证据）。
        if (!c.ownerMatch) {
          report.failures.push(
            `[${width}px] marker 命中点归属错误：期望 ${c.label}，实际 ${c.ownerLabel}`,
          );
        }
      } else {
        // 发货控件：document 委托收到一次事件；带 data-state 者要求 showPage 状态副作用。
        if (!c.logDelta || c.logDelta < 1) {
          report.failures.push(`[${width}px] 控件 click 事件未到达委托目标：${c.selector}`);
        }
        if (c.dataState && !c.stateChanged && c.stateAfter !== c.dataState) {
          report.failures.push(
            `[${width}px] 控件 ${c.selector} data-state=${c.dataState} 未触发 showPage 状态副作用（before=${c.stateBefore} after=${c.stateAfter}）`,
          );
        }
      }
    }
    for (const n of probe.negativeNeighbors) {
      if (!n.ok)
        report.failures.push(
          `[${width}px] 邻近负例失败：${n.from} 的最近邻 ${n.nearest} 中心被他人抢点`,
        );
    }
    if (consoleErrors.length)
      report.failures.push(`[${width}px] 页面脚本错误：${consoleErrors.join('; ')}`);

    report.widths[width] = {
      markerCount: probe.markers.length,
      markerMinBox: Math.min(
        ...probe.markers.filter((m) => !m.missingHitRect).map((m) => m.box.min),
      ),
      controlCount: probe.controls.length,
      controlIdentity: probe.controlIdentity,
      disabledExcluded: probe.disabledExcluded,
      controlNeighbors: probe.controlNeighbors,
      overlapPairs: probe.overlapPairs,
      negativeNeighbors: probe.negativeNeighbors,
      clicks,
      probe,
    };
    await page.close();
  }

  await browser.close();
  server.close();

  writeFileSync(join(EVIDENCE_DIR, 'browser-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  if (report.failures.length) {
    console.error(`浏览器门禁失败 ${report.failures.length} 项：`);
    for (const f of report.failures.slice(0, 40)) console.error(' -', f);
    process.exit(1);
  }
  const summary = Object.fromEntries(
    Object.entries(report.widths).map(([w, v]) => [
      w,
      {
        markers: v.markerCount,
        markerMinBox: v.markerMinBox,
        controlsSampled: v.controlCount,
        controlLiveIdentities: v.controlIdentity?.liveButtonCount ?? null,
        controlsStatefulClicks: v.clicks.filter((c) => c.dataState).length,
        disabledExcluded: v.disabledExcluded.length,
        overlapPairs: v.overlapPairs.length,
        controlNeighbors: v.controlNeighbors.filter((n) => n.ok).length,
        controlNeighborsTotal: v.controlNeighbors.length,
      },
    ]),
  );
  console.log(
    '浏览器门禁通过（exit 0）：marker 9 点归属 + 发货控件全量 5 点采样 + 控件原生 click 与 showPage 状态副作用 + 背景/邻近负例；marker 仅可达性归属，不声称选中态。',
  );
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error('BLOCKED/ERROR:', error.message);
  process.exit(2);
});
