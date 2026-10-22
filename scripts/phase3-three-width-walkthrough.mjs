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
        // Interactive controls.
        const buttons = document.querySelectorAll(
          'button, [role="button"], a, select, input, textarea',
        ).length;
        const smallTouchTargets = Array.from(
          document.querySelectorAll('button, [role="button"], a, select, input'),
        )
          .map((el) => ({ el, target: el.closest('label') || el }))
          .filter(({ target }) => {
            const r = target.getBoundingClientRect();
            return r.height > 0 && (r.height < 32 || r.width < 32);
          })
          .map(({ el, target }) => ({
            tag: el.tagName.toLowerCase(),
            type: el instanceof HTMLInputElement ? el.type : '',
            className: typeof el.className === 'string' ? el.className.slice(0, 80) : '',
            effectiveTarget: target === el ? 'self' : 'label',
          }));
        const invalidSmallTouchTargets = smallTouchTargets;
        return {
          docW,
          viewW,
          docH,
          horizontalOverflow,
          offenders,
          fixedBars: fixedBars.slice(0, 10),
          fixedOcclusions,
          buttons,
          smallTouchTargets,
          invalidSmallTouchTargets,
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
      problems.push(`${r.slug}@${w}: ${m.invalidSmallTouchTargets.length} small touch targets`);
    }
  }
}
if (problems.length === 0) {
  console.log('✅ 16 页 × 3 宽度 全部通过（无横向溢出、遮挡、无效小触控目标或 console 错误）');
} else {
  console.error('❌ 发现以下问题：');
  for (const p of problems) console.error('  - ' + p);
  process.exitCode = 1;
}
