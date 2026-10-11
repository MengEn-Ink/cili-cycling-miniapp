// 2026-10-11 定时对齐交付：最新开发版 0.0.123.1（main f0cbcbc，含 #120 边距/对齐修复）视觉 E2E（只读）
const path = require('node:path');
const fs = require('node:fs');
const automator = require('miniprogram-automator');

const cliPath = '/Applications/wechatwebdevtools.app/Contents/MacOS/cli';
const projectPath = path.join(process.env.HOME, 'cili-deploy-workspace/cili-cycling-miniapp');
const out = '/private/tmp/aime-agent-shared-dir/69394ef5e88d/alignment-e2e-20261011';
fs.mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const result = {
  startedAt: new Date().toISOString(),
  git: 'f0cbcbc',
  version: '0.0.123.1',
  windowWidth: null,
  expectedGutterPx: null,
  gutterRpx: 32,
  probes: {},
  checks: [],
  exceptions: [],
};
const check = (name, ok, detail) => {
  result.checks.push({ name, ok: !!ok, detail: detail === undefined ? null : detail });
  console.log((ok ? 'PASS ' : 'FAIL ') + name + ' ' + JSON.stringify(detail ?? {}));
};
const px = (v) => {
  const m = /(-?[0-9]*\.?[0-9]+)px/.exec(String(v ?? ''));
  return m ? parseFloat(m[1]) : null;
};
const near = (a, b, tol) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= tol;
const shot = (mp, file) =>
  mp.screenshot({ path: path.join(out, file) }).then(
    () => console.log('SCREENSHOT ' + file),
    (e) => console.log('SCREENSHOT-SKIP ' + file + ' ' + e.message),
  );

async function readGeometry(mp, sels) {
  const KEY = '__cili_align_probe_' + Date.now() + '__';
  await mp.evaluate(
    (key, selectors) => {
      const pages = getCurrentPages();
      const page = pages[pages.length - 1];
      const FIELDS = {
        rect: true,
        size: true,
        computedStyle: ['padding-left', 'padding-right', 'text-align', 'width'],
      };
      const q = wx.createSelectorQuery().in(page);
      selectors.forEach((s) => {
        if (s.indexOf('all:') === 0) q.selectAll(s.slice(4)).fields(FIELDS, function () {});
        else q.select(s).fields(FIELDS, function () {});
      });
      q.exec(function (res) {
        globalThis[key] = res;
      });
    },
    KEY,
    sels,
  );
  await sleep(400);
  return mp.evaluate((key) => globalThis[key], KEY);
}

function gutterChecks(label, node) {
  const pl = px(node && node['padding-left']);
  const pr = px(node && node['padding-right']);
  result.probes[label] = { pl, pr, width: px(node && node.width), left: node && node.left, right: node && node.right };
  check(label + '-left-gutter-32rpx', near(pl, result.expectedGutterPx, 1), {
    paddingLeftPx: pl, expectPx: result.expectedGutterPx, raw: node && node['padding-left'],
  });
  check(label + '-right-gutter-32rpx', near(pr, result.expectedGutterPx, 1), {
    paddingRightPx: pr, expectPx: result.expectedGutterPx, raw: node && node['padding-right'],
  });
  check(label + '-gutters-symmetric', near(pl, pr, 0.75), { paddingLeftPx: pl, paddingRightPx: pr });
}

(async () => {
  const mp = await automator.launch({ cliPath, projectPath, launchTimeout: 180000 });
  mp.on('exception', (e) => {
    result.exceptions.push(e);
    console.log('RUNTIME-EXCEPTION ' + JSON.stringify(e));
  });
  try {
    await sleep(4000);

    const sys = await mp.evaluate(() => {
      const i = wx.getSystemInfoSync();
      return { windowWidth: i.windowWidth };
    });
    result.windowWidth = sys.windowWidth;
    result.expectedGutterPx = (sys.windowWidth * result.gutterRpx) / 750;
    console.log('windowWidth=' + sys.windowWidth + ' expectedGutterPx=' + result.expectedGutterPx.toFixed(2));

    let page = await mp.reLaunch('/pages/settings/index');
    await sleep(3000);
    let geo = await readGeometry(mp, ['.page']);
    check('settings-page-node-present', !!geo && !!geo[0], { count: geo ? geo.length : 0 });
    if (geo && geo[0]) gutterChecks('settings-page', geo[0]);
    await shot(mp, '01-settings-gutter.png');

    page = await mp.reLaunch('/pages/activities/index');
    await sleep(4500);
    geo = await readGeometry(mp, ['.page']);
    check('activities-page-node-present', !!geo && !!geo[0], { count: geo ? geo.length : 0 });
    if (geo && geo[0]) gutterChecks('activities-page', geo[0]);
    await shot(mp, '02-activities-gutter.png');

    page = await mp.reLaunch('/pages/capability-card/index');
    let card = null;
    for (let i = 0; i < 10; i += 1) {
      await sleep(1000);
      const d = await page.data();
      if (d && d.card) { card = d.card; break; }
      if (d && d.error) break;
    }
    const pageData = await page.data();
    const metaRows = {
      hasCard: !!card,
      coverageText: card && card.coverageText ? String(card.coverageText).slice(0, 40) : null,
      syncedAtText: card && card.syncedAtText ? String(card.syncedAtText).slice(0, 40) : null,
      error: pageData.error || null,
    };
    geo = await readGeometry(mp, ['.capability-page', 'all:.meta-value', 'all:.meta-label']);
    const capNode = geo && geo[0];
    const metaValues = (geo && geo[1]) || [];
    const metaLabels = (geo && geo[2]) || [];
    check('capability-page-node-present', !!capNode, { metaRows });
    if (capNode) gutterChecks('capability-page', capNode);

    if (metaValues.length > 0) {
      const allLeft = metaValues.every((n) => (n['text-align'] || '').toLowerCase() === 'left');
      check('capability-meta-value-text-align-left', allLeft, { aligns: metaValues.map((n) => n['text-align']) });
      const lefts = metaValues.map((n) => Math.round(n.left));
      check('capability-meta-value-same-left-column', new Set(lefts).size === 1, { lefts });
      if (metaLabels.length) {
        const labelRight = metaLabels[0].right;
        check('capability-meta-value-after-label-column', metaValues.every((n) => n.left >= labelRight - 1), {
          labelRight, valueLefts: lefts,
        });
      }
      result.probes['capability-meta'] = {
        aligns: metaValues.map((n) => n['text-align']),
        lefts,
        labels: metaLabels.map((n) => Math.round(n.left)),
      };
    } else {
      check('capability-meta-value-text-align-left', false, {
        reason: '当前账号未渲染 .meta-value（无 Strava 覆盖/同步文案），运行态对齐未覆盖，以单测契约为准',
        metaRows,
      });
    }
    await shot(mp, '03-capability-card-align.png');
  } finally {
    await mp.close();
  }
  result.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(result, null, 2));
  const fails = result.checks.filter((c) => !c.ok);
  console.log('SUMMARY total=' + result.checks.length + ' fail=' + fails.length + ' exceptions=' + result.exceptions.length);
  if (result.exceptions.length) process.exit(2);
  if (fails.length) process.exit(1);
})().catch((e) => {
  console.error('HARNESS-FAILED', e && e.stack ? e.stack : e);
  process.exit(3);
});
