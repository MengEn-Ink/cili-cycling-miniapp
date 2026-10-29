#!/usr/bin/env node
// Three-width prototype walkthrough: iterates 16 pages × 3 widths,
// detects horizontal overflow, fixed-element occlusion, and sampled interactions.
// Produces a JSON report + per-page screenshots. Does NOT fake evidence —
// if the browser or server is unreachable, the script exits with an error.
/* global document, getComputedStyle, HTMLInputElement */

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PAGES = [
  'activities',
  'activity-detail',
  'route-analysis',
  'registration-form',
  'registrations',
  'credential',
  'profile',
  'profile-edit',
  'settings',
  'club-center',
  'admin-activity-list',
  'admin-activity-edit',
  'admin-reviews',
  'admin-review-detail',
  'admin-club-management',
  'admin-club-profile',
];

const WIDTHS = [340, 375, 430];
const HEIGHT = 780;
const BASE = process.env.PROTO_URL || 'http://localhost:63741';
const OUT_DIR = resolve(process.env.OUT_DIR || process.cwd(), 'docs/evidence/phase3-three-width');

mkdirSync(OUT_DIR, { recursive: true });

const report = {
  base: BASE,
  pages: PAGES.length,
  widths: WIDTHS,
  generatedAt: new Date().toISOString(),
  results: [],
};

const browser = await chromium.launch();
try {
  for (const slug of PAGES) {
    const perPage = { slug, widths: {} };
    for (const width of WIDTHS) {
      const ctx = await browser.newContext({
        viewport: { width, height: HEIGHT },
        deviceScaleFactor: 2,
      });
      const page = await ctx.newPage();
      const url = `${BASE}/pages/${slug}.html`;
      const consoleErrors = [];
      page.on('pageerror', (e) => consoleErrors.push(String(e)));
      page.on('console', (m) => {
        if (m.type() === 'error') consoleErrors.push(m.text());
      });
      try {
        await page.goto(url, { waitUntil: 'load', timeout: 15000 });
        await page.waitForTimeout(400);
      } catch (err) {
        perPage.widths[width] = { error: String(err) };
        await ctx.close();
        continue;
      }

      const metrics = await page.evaluate(() => {
        const docW = document.documentElement.scrollWidth;
        const viewW = document.documentElement.clientWidth;
        const docH = document.documentElement.scrollHeight;
        const horizontalOverflow = docW - viewW;
        const offenders = [];
        if (horizontalOverflow > 0) {
          const walker = document.querySelectorAll('*');
          for (const el of walker) {
            const r = el.getBoundingClientRect();
            if (r.right > viewW + 0.5 && r.width > 1 && r.width < viewW * 2) {
              offenders.push({
                tag: el.tagName.toLowerCase(),
                className: typeof el.className === 'string' ? el.className.slice(0, 80) : '',
                right: Math.round(r.right),
                width: Math.round(r.width),
              });
              if (offenders.length >= 5) break;
            }
          }
        }
        // Fixed / sticky bars that could occlude content.
        const fixedBars = [];
        const fixedBarElements = [];
        document.querySelectorAll('*').forEach((el) => {
          const cs = getComputedStyle(el);
          if (
            (cs.position === 'fixed' || cs.position === 'sticky') &&
            el.getBoundingClientRect().height > 24
          ) {
            const r = el.getBoundingClientRect();
            fixedBarElements.push(el);
            fixedBars.push({
              tag: el.tagName.toLowerCase(),
              className: typeof el.className === 'string' ? el.className.slice(0, 80) : '',
              top: Math.round(r.top),
              bottom: Math.round(r.bottom),
              height: Math.round(r.height),
              position: cs.position,
            });
          }
        });
        const fixedOcclusions = [];
        const contentElements = document.querySelectorAll(
          'main > *, .mini-page > *, .page > *, .content > *',
        );
        for (const bar of fixedBarElements) {
          const barRect = bar.getBoundingClientRect();
          for (const el of contentElements) {
            if (bar === el || bar.contains(el) || el.contains(bar)) continue;
            const cs = getComputedStyle(el);
            if (cs.position === 'fixed' || cs.position === 'sticky' || cs.visibility === 'hidden') {
              continue;
            }
            const rect = el.getBoundingClientRect();
            const overlapX =
              Math.min(barRect.right, rect.right) - Math.max(barRect.left, rect.left);
            const overlapY =
              Math.min(barRect.bottom, rect.bottom) - Math.max(barRect.top, rect.top);
            if (overlapX > 1 && overlapY > 1) {
              fixedOcclusions.push({
                bar: typeof bar.className === 'string' ? bar.className.slice(0, 80) : bar.tagName,
                content: typeof el.className === 'string' ? el.className.slice(0, 80) : el.tagName,
                overlapY: Math.round(overlapY),
              });
              if (fixedOcclusions.length >= 5) break;
            }
          }
          if (fixedOcclusions.length >= 5) break;
        }
        // Interactive controls · 44 CSS px 有效命中门禁（替代旧 32px 视觉矩形阈值）。
        // 有效尺寸 = 视觉盒 + 真实透明命中层（.hit-pad / .ra-mk-hit）包围盒；
        // 真实命中用 elementFromPoint 中心 + 四边中点采样校验归属，禁用/加载态单独登记不计失败。
        const MIN_HIT = 44;
        const candidateSelector = 'button, [role="button"], a[href], select, input, textarea';
        const allCandidates = Array.from(document.querySelectorAll(candidateSelector));
        const disabledExcluded = [];
        const invalidSmallTouchTargets = [];
        const hitOwnershipFailures = [];
        for (const el of allCandidates) {
          const target = el.closest('label') || el;
          const cs = getComputedStyle(el);
          const isDisabled =
            el.disabled === true ||
            cs.pointerEvents === 'none' ||
            el.getAttribute('aria-disabled') === 'true' ||
            el.classList.contains('is-disabled') ||
            el.classList.contains('is-loading');
          if (isDisabled) {
            disabledExcluded.push({
              tag: el.tagName.toLowerCase(),
              className: typeof el.className === 'string' ? el.className.slice(0, 80) : '',
              reason: 'disabled/loading/pointer-events:none 锁定态，不计入 44px 门禁',
            });
            continue;
          }
          const r = target.getBoundingClientRect();
          if (r.height <= 0 || r.width <= 0) continue;
          let effW = r.width;
          let effH = r.height;
          for (const overlay of target.querySelectorAll('.hit-pad, .ra-mk-hit')) {
            const o = overlay.getBoundingClientRect();
            effW = Math.max(effW, o.right - r.left, r.right - o.left);
            effH = Math.max(effH, o.bottom - r.top, r.bottom - o.top);
          }
          const samples = [
            ['center', r.left + r.width / 2, r.top + r.height / 2],
            ['edge-top', r.left + r.width / 2, r.top + 3],
            ['edge-bottom', r.left + r.width / 2, r.bottom - 3],
            ['edge-left', r.left + 3, r.top + r.height / 2],
            ['edge-right', r.right - 3, r.top + r.height / 2],
          ];
          // 归属判定：命中点落在目标自身、目标子树内的交互后代，或包裹目标的交互祖先，均属本目标；
          // 只有命中点落到与目标互不包含的独立兄弟控件上才算抢点。
          const belongsToTarget = (owner) =>
            owner === target ||
            owner === el ||
            (owner && target.contains(owner)) ||
            (owner && owner.contains(target));
          let ownershipOk = true;
          for (const [name, x, y] of samples) {
            const hit = document.elementFromPoint(x, y);
            const owner = hit && hit.closest ? hit.closest(candidateSelector) : null;
            // owner 为 null：命中点落在非交互后代（图标/文字 span 等），事件冒泡回本目标，不计抢点。
            if (owner && !belongsToTarget(owner)) {
              ownershipOk = false;
              hitOwnershipFailures.push({
                point: name,
                className: typeof el.className === 'string' ? el.className.slice(0, 80) : '',
                owner: owner
                  ? typeof owner.className === 'string'
                    ? owner.className.slice(0, 80)
                    : owner.tagName
                  : null,
              });
            }
          }
          const tooSmall = Math.min(effW, effH) < MIN_HIT - 0.5;
          if (tooSmall || !ownershipOk) {
            invalidSmallTouchTargets.push({
              tag: el.tagName.toLowerCase(),
              type: el instanceof HTMLInputElement ? el.type : '',
              className: typeof el.className === 'string' ? el.className.slice(0, 80) : '',
              effectiveTarget: target === el ? 'self' : 'label',
              effectiveW: Math.round(effW),
              effectiveH: Math.round(effH),
              ownershipOk,
              reason: tooSmall ? '有效命中盒 <44px' : '采样点归属到其他控件',
            });
          }
        }
        return {
          docW,
          viewW,
          docH,
          horizontalOverflow,
          offenders,
          fixedBars: fixedBars.slice(0, 10),
          fixedOcclusions,
          buttons: allCandidates.length,
          smallTouchTargets: invalidSmallTouchTargets,
          invalidSmallTouchTargets,
          disabledExcluded,
          hitOwnershipFailures,
        };
      });

      const shotFile = `${slug}-${width}.png`;
      await page.screenshot({ path: resolve(OUT_DIR, shotFile), fullPage: false });
      perPage.widths[width] = {
        ...metrics,
        screenshot: `docs/evidence/phase3-three-width/${shotFile}`,
        consoleErrors,
      };
      await ctx.close();
    }
    report.results.push(perPage);
    process.stdout.write(`✓ ${slug}\n`);
  }
} finally {
  await browser.close();
}

const reportPath = resolve(OUT_DIR, 'report.json');
writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(`\nReport: ${reportPath}`);

// Summarize to stdout
const problems = [];
for (const r of report.results) {
  for (const w of WIDTHS) {
    const m = r.widths[w];
    if (!m || m.error) {
      problems.push(`${r.slug}@${w}: ERROR ${m?.error || 'missing'}`);
      continue;
    }
    if (m.horizontalOverflow > 0) {
      problems.push(`${r.slug}@${w}: horizontalOverflow=${m.horizontalOverflow}px`);
    }
    if (m.consoleErrors && m.consoleErrors.length) {
      problems.push(`${r.slug}@${w}: ${m.consoleErrors.length} console errors`);
    }
    if (m.fixedOcclusions && m.fixedOcclusions.length) {
      problems.push(`${r.slug}@${w}: ${m.fixedOcclusions.length} fixed/sticky occlusions`);
    }
    if (m.invalidSmallTouchTargets && m.invalidSmallTouchTargets.length) {
      problems.push(
        `${r.slug}@${w}: ${m.invalidSmallTouchTargets.length} 个有效命中盒 <44px 或归属错误的触控目标`,
      );
    }
  }
}
const excludedTotal = report.results.reduce(
  (sum, r) =>
    sum + Object.values(r.widths).reduce((s, m) => s + (m.disabledExcluded?.length || 0), 0),
  0,
);
console.log(`登记禁用/加载态排除控件 ${excludedTotal} 个（不计入 44px 失败清单）`);
if (problems.length === 0) {
  console.log(
    '✅ 16 页 × 3 宽度 全部通过（无横向溢出、遮挡、<44px 有效命中目标、归属错误或 console 错误）',
  );
} else {
  console.error('❌ 发现以下问题：');
  for (const p of problems) console.error('  - ' + p);
  process.exitCode = 1;
}
