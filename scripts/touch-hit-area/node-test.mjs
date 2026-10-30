// 触控热区静态门禁（node:test，零 npm 依赖，可在依赖准备完成前直接运行）。
//
// 覆盖：
//  A. 发货控件有效命中盒（视觉盒 + 透明命中层）在 340/375/430 三宽度 ≥44 CSS px。
//  B. 命中层只允许几何扩张声明白名单，禁止绘制背景/边框/字号/字色等视觉属性。
//  C. 豁免条目证据可复核：纯展示徽章在 WXML 中无点击处理器；外壳/原生/禁用态有明确来源。
//  D. 原型壳 8 个路线关键点标记：hit circle 数量、最小点间距、选择与 aria 契约。
//  E. 视觉零漂移：主题令牌、关键数据数组字节级不变；改动只落在 touch-hit 标记块内。
//
// 运行：node --test touch/hit-area.static.node-test.mjs
// 注意：本文件是静态与源码契约证据；小程序真机触控仍由独立真机门禁验收，本测试不冒充 IDE/真机。

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  VIEWPORT_WIDTHS,
  HIT_MIN_PX,
  repoPath,
  readRepoText,
  existsRepo,
  resolveLengthToPx,
  resolvePageTokens,
  parseCssRules,
  extractHitLayerBlock,
  stripHitBlocks,
  HIT_LAYER_ALLOWED_PROPS,
  HOST_BEARING_ALLOWED_PROPS,
  VISUAL_SENSITIVE_PROPS,
  gitBaselineText,
  REPO_ROOT,
} from './lib/geometry.mjs';
import { REQUIRED_TARGETS, EXEMPTIONS, EXPECTED_ROUTE_MARKER_IDS } from './lib/registry.mjs';

function selectorTokens(selectorList) {
  return selectorList
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function rulesForFile(relativePath) {
  return parseCssRules(readRepoText(relativePath));
}

/** 在规则列表中查找选择器 token 命中的规则（精确类名匹配，避免子串误配）。 */
function findRuleContaining(rules, token) {
  return rules.filter((rule) =>
    selectorTokens(rule.selector).some((sel) => {
      const base = sel.replace(/::(before|after)/g, '').trim();
      return base === token || base.endsWith(` ${token}`) || base === token;
    }),
  );
}

function basePx(target, viewportWidth, tokens) {
  const base = target.base;
  if (base.kind === 'rpx')
    return {
      height: (base.value * viewportWidth) / 750,
      width: (base.value * viewportWidth) / 750,
    };
  if (base.kind === 'px') return { height: base.value, width: base.value };
  if (base.kind === 'token') {
    const height = resolveLengthToPx(tokens[base.token], viewportWidth, tokens);
    return { height, width: null };
  }
  if (base.kind === 'bearing') {
    // 真实宿主节点 min-height:44px 承载，不随 rpx 缩放；宽度仅 both 轴校验。
    return { height: base.min, width: base.min ?? null };
  }
  return { height: null, width: null };
}

function collectWxmlFiles(dirRelative, out = []) {
  const abs = repoPath(dirRelative);
  for (const entry of readdirSync(abs, { withFileTypes: true })) {
    const child = join(dirRelative, entry.name);
    if (entry.isDirectory()) collectWxmlFiles(child, out);
    else if (entry.name.endsWith('.wxml')) out.push(child);
  }
  return out;
}

describe('A. 发货控件有效命中盒 ≥44 CSS px（340/375/430）', () => {
  const appTokens = resolvePageTokens(readRepoText('miniprogram/app.wxss'));

  for (const target of REQUIRED_TARGETS) {
    if (
      target.scope === 'prototype' &&
      target.id !== 'prototype-icon-back-button' &&
      target.id !== 'prototype-filter-chip'
    ) {
      continue; // 原型 SVG 标记在 D 段单独验证
    }
    test(`${target.id}：${target.selector}`, () => {
      const mergedRules = target.files.flatMap((file) =>
        existsRepo(file) ? rulesForFile(file) : [],
      );
      const matched = target.files.flatMap((file) =>
        existsRepo(file)
          ? selectorTokens(target.selector).flatMap((tok) =>
              findRuleContaining(rulesForFile(file), tok),
            )
          : [],
      );
      assert.ok(
        matched.length > 0 || target.sanityOnly,
        `源码中找不到控件规则：${target.selector}`,
      );

      for (const width of VIEWPORT_WIDTHS) {
        const base = basePx(target, width, appTokens);
        let effH = base.height;
        let effW = base.width;

        if (target.base.kind === 'bearing') {
          // 宿主承载：标记块内必须存在对应真实宿主规则，且引用固定 44px 组件令牌
          // --touch-target-min；沸点契约锁定 var(--control-height) 的主按钮不在此集合。
          const block = extractHitLayerBlock(readRepoText(target.files[0]));
          assert.ok(block.present, `${target.id} 缺少 touch-hit 承载标记块`);
          const matchedRules = block.rules.filter((rule) =>
            selectorTokens(target.selector).some((want) =>
              selectorTokens(rule.selector).some((have) => have.includes(want.split(' ').pop())),
            ),
          );
          const hostRule = matchedRules.find((rule) => {
            const declared = rule.decls.get('min-height');
            return declared === 'var(--touch-target-min)' || declared === '44px';
          });
          assert.ok(
            hostRule,
            `${target.id} 缺少宿主承载规则（min-height: var(--touch-target-min)）：${target.selector}`,
          );
          const declared = hostRule.decls.get('min-height');
          if (declared === 'var(--touch-target-min)') {
            assert.equal(
              appTokens['--touch-target-min'],
              '44px',
              `${target.id} 承载令牌 --touch-target-min 必须固定为 44px，实际 ${appTokens['--touch-target-min']}`,
            );
          } else {
            assert.equal(
              declared,
              '44px',
              `${target.id} 宿主 min-height 必须为固定 44px，实际 ${declared}`,
            );
          }
          continue;
        }

        if (target.overlay.v > 0 || target.overlay.h > 0) {
          // 命中层证据：标记块内必须存在对应 ::before 规则，且 insets 与登记一致。
          let overlayRule = null;
          let blockPresent = false;
          for (const file of target.files) {
            if (!existsRepo(file)) continue;
            const block = extractHitLayerBlock(readRepoText(file));
            blockPresent = blockPresent || block.present;
            if (!block.present) continue;
            for (const rule of block.rules) {
              const isHitLayerRule =
                rule.selector.includes('::before') || rule.selector.includes('.hit-pad');
              if (!isHitLayerRule) continue;
              const tokens = selectorTokens(rule.selector);
              const hit = selectorTokens(target.selector).some((want) =>
                tokens.some((have) => have.includes(want.split(' ').pop())),
              );
              if (hit) {
                overlayRule = rule;
                break;
              }
            }
            if (overlayRule) break;
          }
          assert.ok(blockPresent, `${target.id} 缺少 touch-hit 命中层标记块`);
          assert.ok(overlayRule, `${target.id} 命中层缺少对应 ::before 规则（${target.selector}）`);
          if (target.overlay.v > 0) {
            assert.equal(
              overlayRule.decls.get('top'),
              `-${target.overlay.v}px`,
              `${target.id} top 命中扩张不符`,
            );
            assert.equal(
              overlayRule.decls.get('bottom'),
              `-${target.overlay.v}px`,
              `${target.id} bottom 命中扩张不符`,
            );
            effH += 2 * target.overlay.v;
          }
          if (target.overlay.h > 0) {
            assert.equal(
              overlayRule.decls.get('left'),
              `-${target.overlay.h}px`,
              `${target.id} left 命中扩张不符`,
            );
            assert.equal(
              overlayRule.decls.get('right'),
              `-${target.overlay.h}px`,
              `${target.id} right 命中扩张不符`,
            );
            effW = (effW ?? 0) + 2 * target.overlay.h;
          }
        }

        assert.ok(Number.isFinite(effH), `${target.id} @${width}px 无法解析有效高度`);
        assert.ok(
          effH >= HIT_MIN_PX - 1e-9,
          `${target.id} @${width}px 有效高度 ${effH.toFixed(2)}px < 44px`,
        );
        if (target.axis === 'both') {
          assert.ok(Number.isFinite(effW), `${target.id} @${width}px 无法解析有效宽度`);
          assert.ok(
            effW >= HIT_MIN_PX - 1e-9,
            `${target.id} @${width}px 有效宽度 ${effW.toFixed(2)}px < 44px`,
          );
        }
      }
      void mergedRules;
    });
  }
});

describe('B. 命中层声明白名单：不绘制视觉', () => {
  const cssFiles = [
    'miniprogram/app.wxss',
    'miniprogram/pages/credential/index.wxss',
    'miniprogram/pages/registrations/index.wxss',
    'miniprogram/pages/activity-detail/index.wxss',
    'miniprogram/pages/route-analysis/index.wxss',
    'miniprogram/pages/admin/activity-edit/index.wxss',
    'miniprogram/pages/admin/activity-list/index.wxss',
    'docs/styles.css',
    'docs/designs/2026-10-22-cycling-image-journal/shared.css',
  ].filter(existsRepo);

  for (const file of cssFiles) {
    test(`${file} 命中块声明只含几何扩张`, () => {
      const block = extractHitLayerBlock(readRepoText(file));
      if (!block.present) return; // 本文件不承载命中层
      for (const rule of block.rules) {
        // 透明命中层（.hit-pad / .ra-mk-hit / 伪元素）走严格不可见白名单；
        // 宿主真实节点承载规则只允许 min-height/min-width 等承载几何。
        const isPadLayer = /\.hit-pad|\.ra-mk-hit|::before|::after/.test(rule.selector);
        const allowedProps = isPadLayer ? HIT_LAYER_ALLOWED_PROPS : HOST_BEARING_ALLOWED_PROPS;
        for (const [prop, value] of rule.decls) {
          assert.ok(
            allowedProps.has(prop),
            `${file} ${rule.selector} 出现非白名单声明 ${prop}: ${value}`,
          );
          if (prop === 'fill' || prop === 'background' || prop === 'background-color') {
            assert.ok(
              value === 'transparent' || value === 'none' || prop === 'fill',
              `${file} ${rule.selector} 命中层必须透明，实际 ${prop}: ${value}`,
            );
          }
          if (prop === 'pointer-events') {
            const isHitRect = rule.selector.includes('.ra-mk-hit');
            const isPseudoHitLayer = rule.selector.includes('::before');
            const isRealHitPad = rule.selector.includes('.hit-pad');
            const hitLayer = isHitRect || isPseudoHitLayer || isRealHitPad;
            const isGlyphSuppression =
              !hitLayer && /\b(text|circle|path|line|ellipse)\b/.test(rule.selector);
            if (hitLayer) {
              assert.ok(
                ['auto', 'all'].includes(value),
                `${file} ${rule.selector} 命中层必须可命中（auto/all），实际 ${value}`,
              );
            } else if (isGlyphSuppression) {
              // 字形/文字等非命中元素必须关事件，避免压住邻近透明命中矩形抢点。
              assert.equal(
                value,
                'none',
                `${file} ${rule.selector} 非命中元素必须 pointer-events:none`,
              );
            } else {
              assert.ok(
                ['auto', 'all', 'none'].includes(value),
                `${file} ${rule.selector} pointer-events 取值非法：${value}`,
              );
            }
          }
        }
      }
    });
  }

  test('视觉敏感属性不得出现在命中层选择器规则中', () => {
    for (const file of cssFiles) {
      const block = extractHitLayerBlock(readRepoText(file));
      if (!block.present) continue;
      for (const rule of block.rules) {
        const isPadLayer = /\.hit-pad|\.ra-mk-hit|::before|::after/.test(rule.selector);
        const blocked = new Set(VISUAL_SENSITIVE_PROPS);
        if (!isPadLayer) {
          // 宿主承载规则允许 min-height/min-width 作为命中几何，其余视觉属性仍禁止。
          blocked.delete('min-height');
          blocked.delete('min-width');
        }
        for (const prop of rule.decls.keys()) {
          assert.ok(!blocked.has(prop), `${file} ${rule.selector} 命中层禁止视觉属性 ${prop}`);
        }
      }
    }
  });

  // 合并反例：选择器等价归并时不允许静默丢类；registry 登记的 bearing 类必须仍被触控块覆盖。
  test('合并选择器零丢失：app.wxss 登记 bearing 类在触控块规则中均可被命中', () => {
    const block = extractHitLayerBlock(readRepoText('miniprogram/app.wxss'));
    assert.ok(block.present, '触控块缺失');
    const selectors = block.rules.map((rule) => rule.selector);
    const missing = [];
    for (const target of REQUIRED_TARGETS) {
      if (target.base?.kind !== 'bearing' || target.files?.[0] !== 'miniprogram/app.wxss') continue;
      for (const token of selectorTokens(target.selector)) {
        const bare = token.replace(/^\./, '').split(/\./).pop();
        const covered = selectors.some((selector) =>
          selectorTokens(selector).some(
            (part) => part.replace(/^\./, '').split(/\./).pop() === bare,
          ),
        );
        if (!covered) missing.push(`${target.id}:${token}`);
      }
    }
    assert.deepEqual(missing, [], '以下登记类在选择器合并后丢失规则：');
  });

  test('合并选择器零丢失：登记 pad 宿主均有对应 .hit-pad 后代规则', () => {
    const block = extractHitLayerBlock(readRepoText('miniprogram/app.wxss'));
    assert.ok(block.present, '触控块缺失');
    const padRules = block.rules.filter((rule) => rule.selector.includes('.hit-pad'));
    const hosts = [
      'button',
      '.btn',
      '.secondary',
      '.button',
      '.map-button',
      '.photo-button',
      '.photo-action',
      '.route-action',
      '.profile-alert-action',
      '.meeting-location__action',
      '.text-button',
      '.image-action',
      '.row.rowlink.rowbutton',
      '.step',
      '.segment',
      '.timeline-tab',
      '.status-filter',
      '.filter-tab',
    ];
    const missing = [];
    for (const host of hosts) {
      const covered = padRules.some((rule) => rule.selector.includes(`${host} .hit-pad`));
      if (!covered) missing.push(host);
    }
    assert.deepEqual(missing, [], '以下宿主在合并后丢失 .hit-pad 后代规则：');
  });
});

describe('C. 豁免证据可复核（不放宽断言）', () => {
  const badgeExemption = EXEMPTIONS.find((item) => item.id === 'badge-tag-family');
  test('纯展示徽章在 WXML 同标签行无 bindtap/catchtap/role=button', () => {
    const badgeTokens = selectorTokens(badgeExemption.selector).map((sel) =>
      sel.replace(/^\./, ''),
    );
    const wxmlFiles = collectWxmlFiles('miniprogram/pages');
    const violations = [];
    for (const file of wxmlFiles) {
      const lines = readRepoText(file).split('\n');
      lines.forEach((line, index) => {
        const clsMatch = line.match(/class="([^"]+)"/);
        if (!clsMatch) return;
        const classes = clsMatch[1].split(/\s+/);
        if (!classes.some((c) => badgeTokens.includes(c))) return;
        if (/\b(bindtap|catchtap|bind:tap|catch:tap)\b/.test(line) || /role="button"/.test(line)) {
          violations.push(`${file}:${index + 1} ${line.trim()}`);
        }
      });
    }
    assert.deepEqual(violations, [], '以下徽章携带点击行为，必须移入 required 清单补齐热区：');
  });

  test('其余豁免条目均带非空证据说明', () => {
    for (const item of EXEMPTIONS) {
      assert.ok(item.evidence && item.evidence.kind, `${item.id} 缺少证据类型`);
      assert.ok(item.evidence.note || item.evidence.wxmlDirs, `${item.id} 缺少证据说明`);
    }
  });

  test('禁用态宿主类仍在 required 清单（不因禁用豁免几何）', () => {
    const requiredSelectors = REQUIRED_TARGETS.map((t) => t.selector).join(' ');
    for (const cls of ['.btn.tiny', '.btn', '.map-reset']) {
      assert.ok(requiredSelectors.includes(cls), `${cls} 不在 required 清单`);
    }
  });
});

/** 在纯 Node 中加载 schema.js + templates.js 并渲染 route-analysis 模板字符串。 */
function renderRouteAnalysisTemplate() {
  const runtime = {};
  new Function('window', readRepoText('docs/schema.js'))(runtime);
  new Function('window', readRepoText('docs/templates.js'))(runtime);
  const template = runtime.pageTemplates?.['route-analysis'];
  assert.ok(template, 'runtime 缺少 route-analysis 模板');
  return template();
}

describe('D. 原型壳路线分析 8 关键点契约', () => {
  test('templates.js keyPoints 恰好 8 个且 id 与登记表一致', () => {
    const source = readRepoText('docs/templates.js');
    const block = source.match(/const keyPoints = \[([\s\S]*?)\];/);
    assert.ok(block, '找不到 keyPoints 数组');
    const ids = [...block[1].matchAll(/\{\s*id:\s*'([^']+)'/g)].map((m) => m[1]);
    assert.deepEqual(ids, EXPECTED_ROUTE_MARKER_IDS);
  });

  test('渲染后 8 个关键点（排除 WC 等非交互辅助标记）各含透明 44×44 命中矩形', () => {
    const html = renderRouteAnalysisTemplate();
    // 只统计携带 data-route 的关键点组；卫生间 .ra-mk-wc 等无 data-route 的辅助标记不计入 8 点门禁。
    const allGroups = (html.match(/<g class="ra-mk[^"]*"/g) || []).length;
    const wcGroups = (html.match(/<g class="ra-mk ra-mk-wc"/g) || []).length;
    const markerGroups = (
      html.match(/<g class="ra-mk[^"]*"[^>]*data-route="route-analysis"/g) || []
    ).length;
    const hitRects = (html.match(/<rect class="ra-mk-hit"/g) || []).length;
    assert.equal(
      markerGroups,
      EXPECTED_ROUTE_MARKER_IDS.length,
      '携带 data-route 的关键点组数量不是 8',
    );
    assert.equal(
      hitRects,
      EXPECTED_ROUTE_MARKER_IDS.length,
      '透明命中矩形数量不是 8（RED：修复前为 0）',
    );
    assert.ok(allGroups > markerGroups, 'WC 辅助标记应存在但被排除在门禁计数外');
    assert.equal(
      allGroups,
      markerGroups + wcGroups,
      '存在未登记类别的地图标记组，需先归类再纳入口径',
    );
  });

  test('源码 HIT_SIDE 与登记表 svgHitSideUnits 单一口径一致', () => {
    const source = readRepoText('docs/templates.js');
    const m = source.match(/const HIT_SIDE\s*=\s*([\d.]+)/);
    assert.ok(m, '缺少 HIT_SIDE 常量');
    const overlay = REQUIRED_TARGETS.find((t) => t.id === 'prototype-ra-map-markers').overlay;
    assert.equal(Number(m[1]), overlay.svgHitSideUnits, '源码 HIT_SIDE 与登记表不一致');
    const offSource = source.match(/highest:\s*\{\s*dx:\s*(-?[\d.]+)[^}]*\}/);
    assert.ok(offSource);
    assert.equal(Number(offSource[1]), overlay.hitOffsets.highest.dx, 'highest 偏移与登记表不一致');
  });

  test('.ra-mk-hit 样式为透明且可命中（rect 元素）', () => {
    const css = readRepoText('docs/styles.css');
    const rules = parseCssRules(css);
    const hitRule = rules.find((r) => r.selector.includes('.ra-mk-hit'));
    assert.ok(hitRule, 'docs/styles.css 缺少 .ra-mk-hit 规则');
    assert.equal(hitRule.decls.get('fill'), 'transparent', '命中矩形必须 fill:transparent');
    assert.ok(
      ['auto', 'all'].includes(hitRule.decls.get('pointer-events')),
      `命中矩形必须可命中（pointer-events auto/all），实际 ${hitRule.decls.get('pointer-events')}`,
    );
  });

  test('8 个命中矩形轴投影互不重叠（禁止相邻目标抢点），且各自包住 glyph 中心', () => {
    const source = readRepoText('docs/templates.js');
    const coords = {};
    const coordLine = /^\s*'?([\w-]+)'?\s*:\s*\{\s*x:\s*([\d.]+),\s*y:\s*([\d.]+)\s*\}/;
    for (const line of source.split('\n')) {
      const m = line.match(coordLine);
      if (m && EXPECTED_ROUTE_MARKER_IDS.includes(m[1])) {
        coords[m[1]] = { x: Number(m[2]), y: Number(m[3]) };
      }
    }
    for (const id of EXPECTED_ROUTE_MARKER_IDS) {
      assert.ok(coords[id], `缺少 ${id} 地图坐标`);
    }
    const overlay = REQUIRED_TARGETS.find((t) => t.id === 'prototype-ra-map-markers').overlay;
    const side = overlay.svgHitSideUnits;
    const half = side / 2;
    const hitCenter = {};
    for (const id of EXPECTED_ROUTE_MARKER_IDS) {
      const off = overlay.hitOffsets[id] || { dx: 0, dy: 0 };
      hitCenter[id] = { x: coords[id].x + off.dx, y: coords[id].y + off.dy };
      // glyph 中心必须落在自己的命中盒内（视觉锚点不漂移）。
      assert.ok(
        Math.abs(hitCenter[id].x - coords[id].x) <= half + 1e-9 &&
          Math.abs(hitCenter[id].y - coords[id].y) <= half + 1e-9,
        `${id} 热区中心偏移超出自身半盒，glyph 将落不出命中盒`,
      );
    }
    const overlaps = [];
    for (let i = 0; i < EXPECTED_ROUTE_MARKER_IDS.length; i += 1) {
      for (let j = i + 1; j < EXPECTED_ROUTE_MARKER_IDS.length; j += 1) {
        const a = hitCenter[EXPECTED_ROUTE_MARKER_IDS[i]];
        const b = hitCenter[EXPECTED_ROUTE_MARKER_IDS[j]];
        const overlapX = Math.abs(a.x - b.x) < side - 1e-9;
        const overlapY = Math.abs(a.y - b.y) < side - 1e-9;
        if (overlapX && overlapY) {
          overlaps.push(`${EXPECTED_ROUTE_MARKER_IDS[i]}↔${EXPECTED_ROUTE_MARKER_IDS[j]}`);
        }
      }
    }
    assert.deepEqual(
      overlaps,
      [],
      '命中矩形在 x/y 轴投影同时相交，存在抢点区域，必须分区偏移而非豁免：',
    );
  });

  test('每个渲染关键点组携带 data-route 与 aria-label（真实 click 可委派到目标）', () => {
    const html = renderRouteAnalysisTemplate();
    const groups = [
      ...html.matchAll(/<g class="ra-mk[^"]*"[^>]*data-route="route-analysis"[^>]*>/g),
    ].map((m) => m[0]);
    assert.equal(groups.length, EXPECTED_ROUTE_MARKER_IDS.length);
    for (const group of groups) {
      assert.ok(group.includes('data-route="route-analysis"'), '标记组缺少 data-route');
      assert.ok(group.includes('aria-label='), '标记组缺少 aria-label');
    }
  });
});

describe('F. native 触点使用真实 wxml 透明子节点 .hit-pad 承载命中层（不用伪元素兜底）', () => {
  // 真实节点 = wxml 内可见 <view class="hit-pad">；伪元素无 DOM 节点、无 bindtap 归属，不计入已补齐。
  const REAL_PAD_TARGETS = [
    {
      selector: '.btn.tiny',
      files: [
        'miniprogram/pages/credential/index.wxml',
        'miniprogram/pages/registrations/index.wxml',
      ],
    },
    { selector: '.rider-authorize', files: ['miniprogram/pages/activity-detail/index.wxml'] },
    { selector: '.dialog-close', files: ['miniprogram/pages/activity-detail/index.wxml'] },
    { selector: '.map-reset', files: ['miniprogram/pages/route-analysis/index.wxml'] },
    { selector: '.image-action', files: ['miniprogram/pages/admin/activity-edit/index.wxml'] },
    { selector: '.text-button', files: ['miniprogram/pages/admin/activity-list/index.wxml'] },
    { selector: '.anchor-item', files: ['miniprogram/pages/route-analysis/index.wxml'] },
    { selector: '.segment-item', files: ['miniprogram/pages/route-analysis/index.wxml'] },
    { selector: '.point', files: ['miniprogram/pages/route-analysis/index.wxml'] },
  ];
  // 从行内全部 class 属性值集合取 token，避免 .point 误匹配 point-list/point-main 等容器类。
  const classTokens = (line) => {
    const tokens = [];
    for (const m of line.matchAll(/class="([^"]*)"/g))
      tokens.push(...m[1].split(/\s+/).filter(Boolean));
    return tokens;
  };
  test('每个 native 触点 wxml 块内存在真实 .hit-pad 子节点', () => {
    for (const target of REAL_PAD_TARGETS) {
      const wanted = target.selector.replace(/^\./, '').split('.');
      for (const file of target.files) {
        const lines = readRepoText(file).split('\n');
        const matchIdx = lines.findIndex((line) => {
          const toks = classTokens(line);
          return wanted.every((token) => toks.includes(token));
        });
        assert.ok(matchIdx >= 0, `${file} 缺少 ${target.selector} 宿主标签`);
        const blockEnd = lines.findIndex((l, i) => i > matchIdx && l.includes('</button>'));
        const block = lines
          .slice(matchIdx, blockEnd > matchIdx ? blockEnd + 1 : matchIdx + 1)
          .join('\n');
        assert.ok(
          block.includes('class="hit-pad"'),
          `${file} ${target.selector} 缺少真实 .hit-pad 子节点`,
        );
      }
    }
  });

  test('native 触控块不再保留 ::before/::after 伪元素兜底规则', () => {
    for (const file of [
      'miniprogram/app.wxss',
      'miniprogram/pages/credential/index.wxss',
      'miniprogram/pages/registrations/index.wxss',
      'miniprogram/pages/activity-detail/index.wxss',
      'miniprogram/pages/route-analysis/index.wxss',
      'miniprogram/pages/admin/activity-edit/index.wxss',
      'miniprogram/pages/admin/activity-list/index.wxss',
    ]) {
      const block = extractHitLayerBlock(readRepoText(file));
      for (const rule of block.rules) {
        assert.ok(
          !rule.selector.includes('::before') && !rule.selector.includes('::after'),
          `${file} 仍存在伪元素兜底规则 ${rule.selector}`,
        );
      }
    }
  });

  test('.hit-pad 规则只含几何/事件声明，无视觉属性', () => {
    for (const file of [
      'miniprogram/app.wxss',
      'miniprogram/pages/credential/index.wxss',
      'miniprogram/pages/registrations/index.wxss',
      'miniprogram/pages/activity-detail/index.wxss',
      'miniprogram/pages/route-analysis/index.wxss',
      'miniprogram/pages/admin/activity-edit/index.wxss',
      'miniprogram/pages/admin/activity-list/index.wxss',
    ]) {
      const block = extractHitLayerBlock(readRepoText(file));
      for (const rule of block.rules) {
        if (!rule.selector.includes('.hit-pad')) continue;
        for (const [prop] of rule.decls) {
          assert.ok(
            HIT_LAYER_ALLOWED_PROPS.has(prop),
            `${file} ${rule.selector} 命中层非白名单声明 ${prop}`,
          );
          assert.ok(
            !VISUAL_SENSITIVE_PROPS.has(prop),
            `${file} ${rule.selector} 命中层禁止视觉属性 ${prop}`,
          );
        }
      }
    }
  });
});

describe('E. 视觉零漂移：主题令牌与关键数据不变，改动仅限标记块', () => {
  test('app.wxss 颜色/字号/字体/圆角主题令牌与基线一致', () => {
    const current = resolvePageTokens(readRepoText('miniprogram/app.wxss'));
    const baselineText = gitBaselineText('miniprogram/app.wxss');
    assert.ok(baselineText, '无法读取 Git 基线 miniprogram/app.wxss');
    const baseline = resolvePageTokens(baselineText);
    for (const [key, value] of Object.entries(baseline)) {
      if (!key.startsWith('--color-') && !key.startsWith('--font-') && !key.startsWith('--radius-'))
        continue;
      assert.equal(current[key], value, `主题令牌 ${key} 被改动`);
    }
  });

  test('触控组件令牌固定 44px，且沸点视觉基线 --control-height 保持 96rpx 不变', () => {
    const current = resolvePageTokens(readRepoText('miniprogram/app.wxss'));
    assert.equal(
      current['--touch-target-min'],
      '44px',
      '--touch-target-min 必须为固定 44px 承载下限，不得放宽为 rpx 缩放值',
    );
    assert.equal(
      current['--control-height'],
      '96rpx',
      '沸点契约锁定的视觉基线 --control-height 不得被热区补丁改写',
    );
  });

  test('templates.js 的 keyPoints 数据与 mapCoords 坐标不被补丁改写', () => {
    const current = readRepoText('docs/templates.js');
    const baseline = gitBaselineText('docs/templates.js');
    assert.ok(baseline);
    const slice = (text) => {
      const kp = text.match(/const keyPoints = \[[\s\S]*?\];/)[0];
      const mc = text.match(/const mapCoords = \{[\s\S]*?\};/)[0];
      return `${kp}\n${mc}`;
    };
    assert.equal(slice(current), slice(baseline), 'keyPoints / mapCoords 不允许被热区补丁修改');
  });

  // E4：受保护声明等价映射。保护视觉（颜色/字号/字重/背景/边框/圆角）、承载几何
  // （min-height/min-width）、定位锚点（position/四向偏移）与 spacing（margin/gap）。
  // 允许把同选择器重复的同值 spacing 合并；禁止删除或改写任一受保护声明。跨文件 @import
  // 展开由集成侧 theme-contract-helpers resolver 覆盖，本 node 门禁只校验同文件声明映射。
  const E4_PROTECTED_PROPS = new Set([
    ...VISUAL_SENSITIVE_PROPS,
    'position',
    'margin',
    'margin-top',
    'margin-right',
    'margin-bottom',
    'margin-left',
    'gap',
    'row-gap',
    'column-gap',
    'letter-spacing',
    'top',
    'right',
    'bottom',
    'left',
    'transform',
  ]);
  function effectiveProtectedMap(text) {
    const map = new Map();
    for (const rule of parseCssRules(stripHitBlocks(text))) {
      // parseCssRules 已把 @media 前缀拼到 rule.selector 上（如 `@media (max-width:375px) button.btn`），
      // key 保留媒体上下文，不同视口宽度的规则不会被全局 last-wins 压成同一条。
      const keySelector = rule.selector.replace(/\s+/g, ' ').trim();
      for (const [prop, value] of rule.decls) {
        if (!E4_PROTECTED_PROPS.has(prop)) continue;
        // 同一（媒体上下文 + 选择器）后写胜出，对齐 CSS 级联。
        map.set(`${keySelector}::${prop}`, value);
      }
    }
    return map;
  }
  function assertEffectiveDeclarationsEqual(baselineText, currentText, label) {
    const before = effectiveProtectedMap(baselineText);
    const after = effectiveProtectedMap(currentText);
    const problems = [];
    for (const [key, value] of before) {
      if (!after.has(key)) problems.push(`缺失 ${key}`);
      else if (after.get(key) !== value)
        problems.push(`改写 ${key}: ${value} -> ${after.get(key)}`);
    }
    assert.ok(problems.length === 0, `${label} 受保护视觉/承载声明不等价：${problems.join('；')}`);
  }

  test('命中块外受保护视觉与承载声明与基线等价（允许纯布局等价合并）', () => {
    const cssPatchFiles = [
      'miniprogram/app.wxss',
      'miniprogram/pages/credential/index.wxss',
      'miniprogram/pages/registrations/index.wxss',
      'miniprogram/pages/activity-detail/index.wxss',
      'miniprogram/pages/route-analysis/index.wxss',
      'miniprogram/pages/admin/activity-edit/index.wxss',
      'miniprogram/pages/admin/activity-list/index.wxss',
      'docs/styles.css',
    ].filter(existsRepo);
    for (const file of cssPatchFiles) {
      const baseline = gitBaselineText(file);
      if (baseline == null) continue; // 新文件由集成另行审计
      assertEffectiveDeclarationsEqual(baseline, readRepoText(file), file);
    }
  });

  test('E4 负例：删除受保护颜色/内边距声明必须失败（先红后绿证据）', () => {
    const baseline = '.demo { color: var(--color-text); padding: 12rpx; margin: 8rpx; }';
    const mutated = '.demo { padding: 12rpx; margin: 8rpx; }';
    assert.throws(
      () => assertEffectiveDeclarationsEqual(baseline, mutated, 'E4 负例'),
      /受保护视觉\/承载声明不等价/,
      '删除 color 后等价守卫应当报错',
    );
  });

  test('E4 正例：重复声明合并不改变受保护映射（合法去冗通过）', () => {
    const baseline =
      '.demo { color: var(--color-text); padding: 12rpx; margin: 8rpx; }\n.demo { margin: 8rpx; }';
    const merged = '.demo { color: var(--color-text); padding: 12rpx; margin: 8rpx; }';
    assertEffectiveDeclarationsEqual(baseline, merged, 'E4 正例');
  });

  test('E4 负例：删除必要 spacing（margin-top / gap）必须失败', () => {
    const baseline = '.demo { display: flex; gap: 16rpx; margin-top: 8rpx; }';
    const mutated = '.demo { display: flex; gap: 16rpx; }';
    assert.throws(
      () => assertEffectiveDeclarationsEqual(baseline, mutated, 'E4 spacing 负例'),
      /受保护视觉\/承载声明不等价/,
      '删除 margin-top 后 spacing 守卫应当报错',
    );
  });

  test('E4 正例：重复 spacing 声明合并后声明映射完全等价（语义不丢）', () => {
    const baseline =
      '.demo { margin-top: 8rpx; padding: 12rpx; }\n.demo { margin-top: 8rpx; gap: 16rpx; }';
    const merged = '.demo { margin-top: 8rpx; padding: 12rpx; gap: 16rpx; }';
    assertEffectiveDeclarationsEqual(baseline, merged, 'E4 spacing 正例');
  });

  test('E4 负例：删除字距 letter-spacing 必须失败（排版视觉不得被去冗抹掉）', () => {
    const baseline = '.demo { color: var(--color-text); letter-spacing: 1rpx; }';
    const mutated = '.demo { color: var(--color-text); }';
    assert.throws(
      () => assertEffectiveDeclarationsEqual(baseline, mutated, 'E4 letter-spacing 负例'),
      /受保护视觉\/承载声明不等价/,
      '删除 letter-spacing 后等价守卫应当报错',
    );
  });
});

// 防止误把仓库根目录当工作目录：显式打印 REPO_ROOT 便于日志核对。
test('门禁作用于专用 worktree', () => {
  assert.ok(REPO_ROOT.includes('artifacts/touch-package-delivery/worktree'), REPO_ROOT);
});
