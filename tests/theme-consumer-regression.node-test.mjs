/* global document, getComputedStyle */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from 'playwright';
import ts from 'typescript';

const RPX_PER_CSS_PIXEL = 2;
const read = (path) => readFileSync(path, 'utf8');
const readStyles = (path) =>
  read(path).replace(/@import\s+['"]([^'"]+)['"]\s*;/g, (_, relative) =>
    readStyles(resolve(dirname(path), relative)),
  );
const tokenModule = { exports: {} };
const compiled = ts.transpileModule(read('miniprogram/config/appearance.ts'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
});
new Function('exports', compiled.outputText)(tokenModule.exports);
const { APPEARANCE_TOKENS } = tokenModule.exports;

test('两主题阅读层级与必要控件边界', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 375, height: 900 } });
    for (const mode of ['light', 'dark']) {
      const tokens = Object.entries(APPEARANCE_TOKENS[mode])
        .map(([key, value]) => `${key}:${value}`)
        .join(';');
      await page.setContent(`<page style="${tokens}"><view class="aihero-page">
        <view class="section"><view class="metrics">
          <view><text class="em">88</text><text class="meta">距离</text></view>
          <view><text class="em">1200</text><text class="meta">爬升</text></view>
          <view><text class="em">4</text><text class="meta">预计用时</text></view>
        </view></view><input class="input"><text class="detailrow-desc">集合说明</text>
      </view></page>`);
      await page.addStyleTag({
        content:
          `${readStyles('miniprogram/app.wxss')}\n${readStyles('miniprogram/styles/aihero-layout.wxss')}`.replace(
            /([\d.]+)rpx/g,
            (_, value) => `${Number(value) / 2}px`,
          ),
      });
      const result = await page.evaluate(() => {
        const style = (selector) => getComputedStyle(document.querySelector(selector));
        const luminance = (channels) =>
          channels
            .map((channel) => {
              const v = channel / 255;
              return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
            })
            .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
        const input = style('.input');
        const bg = input.backgroundColor.match(/[\d.]+/g).map(Number);
        const border = input.borderTopColor.match(/[\d.]+/g).map(Number);
        const alpha = border[3] ?? 1;
        const blended = border.slice(0, 3).map((v, i) => v * alpha + bg[i] * (1 - alpha));
        const a = luminance(blended),
          b = luminance(bg.slice(0, 3));
        return {
          ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
          frame: style('.metrics').borderTopWidth,
          divider: style('.metrics > view:nth-child(2)').borderLeftWidth,
          section: style('.section').borderTopWidth,
          label: parseFloat(style('.meta').fontSize),
          prose: style('.detailrow-desc').fontFamily,
          body: (() => {
            const probe = document.createElement('span');
            probe.style.fontFamily = 'var(--font-family-body)';
            document.querySelector('.aihero-page').append(probe);
            return getComputedStyle(probe).fontFamily;
          })(),
        };
      });
      assert.ok(result.ratio >= 3, `${mode}: input border ${result.ratio.toFixed(2)}:1`);
      assert.equal(result.frame, '0px', mode);
      assert.equal(result.divider, '0px', mode);
      assert.equal(result.section, '0px', mode);
      assert.ok(result.label >= 14, `${mode}: metric label`);
      assert.equal(
        result.prose.replace(/["']/g, '').trim(),
        result.body.replace(/["']/g, '').trim(),
        mode,
      );
    }
  } finally {
    await browser.close();
  }
});

// Explicit browser regression: npx playwright install chromium, then node --test this file.
// Keep browser installation out of default Vitest/coverage and their clean-CI startup path.
// Real WXML classes + app/page WXSS cascade; NOT WeChatIDE or screenshot evidence.
for (const route of ['activity-detail', 'route-analysis', 'activities']) {
  test(`${route} 浅暗实际消费选择器`, { timeout: 30000 }, async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      for (const mode of ['light', 'dark']) {
        const tokens = Object.entries(APPEARANCE_TOKENS[mode])
          .map(([key, value]) => `${key}:${value}`)
          .join(';');
        const base = `miniprogram/pages/${route}/index`;
        await page.setContent(`<page style="${tokens}">${read(`${base}.wxml`)}</page>`);
        await page.addStyleTag({
          content: `${readStyles('miniprogram/app.wxss')}\n${readStyles(`${base}.wxss`)}`.replace(
            /([\d.]+)rpx/g,
            (_, value) => `${Number(value) / RPX_PER_CSS_PIXEL}px`,
          ),
        });
        // Probes resolve semantic variables independently of consumer rules.
        await page.evaluate(() => {
          const root = document.querySelector('page');
          for (const token of ['on-media', 'text', 'border-strong', 'surface']) {
            const probe = document.createElement('span');
            probe.id = `probe-${token}`;
            probe.style.color = `var(--color-${token})`;
            root.append(probe);
          }
        });
        const color = (selector, property = 'color') =>
          page
            .locator(selector)
            .first()
            .evaluate((node, key) => getComputedStyle(node).getPropertyValue(key), property);
        if (route === 'activity-detail') {
          for (const selector of [
            '.detail-page .caption .hero-title',
            '.detail-page .caption .hero-sub',
            '.detail-page .caption .eyebrow',
            '.detail-page .caption .eyebrow text',
          ]) {
            assert.equal(
              await color(selector),
              await color('#probe-on-media'),
              `${mode}/${selector}`,
            );
          }
        } else if (route === 'activities') {
          // WXML 通过 selected 表示当前活动时间视图，不使用演示页的 is-active。
          await page.evaluate(() => {
            document.querySelectorAll('.segment-item').forEach((node, index) => {
              node.classList.toggle('selected', index === 0);
            });
          });
          assert.equal(await color('.segment-item.selected'), await color('#probe-text'), mode);
          assert.notEqual(
            await color('.segment-item.selected', 'border-bottom-color'),
            'rgba(0, 0, 0, 0)',
            `${mode}: 选中视图具有下划线`,
          );
          assert.equal(
            await color('.caption .eyebrow'),
            await color('#probe-on-media'),
            `${mode}: 封面日期保持媒体白字`,
          );
        } else {
          const selector = '.route-analysis-page .strategy-tags text';
          assert.equal(await color(selector), await color('#probe-text'), mode);
          assert.equal(
            await color(selector, 'border-top-color'),
            await color('#probe-border-strong'),
            mode,
          );
          assert.equal(
            await color('.conclusion-panel', 'background-color'),
            await color('#probe-surface'),
            mode,
          );
        }
      }
    } finally {
      await browser.close();
    }
  });
}

// CSS-only layout probes use real WXML class hierarchies. Native conditionals,
// custom-component rendering and business events are NOT executed by Chromium.
test(
  '17 routes: imported AI Hero CSS wins in both themes and four widths',
  { timeout: 60000 },
  async () => {
    const config = JSON.parse(read('miniprogram/app.json'));
    const routes = [
      ...config.pages,
      ...config.subpackages.flatMap(({ root, pages }) => pages.map((route) => `${root}/${route}`)),
    ];
    assert.equal(routes.length, 17);
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({ reducedMotion: 'reduce' });
      for (const width of [340, 375, 414, 430]) {
        await page.setViewportSize({ width, height: 900 });
        for (const mode of ['light', 'dark']) {
          const tokens = Object.entries(APPEARANCE_TOKENS[mode])
            // 内联主题变量也含 rpx，必须与实际视口同比换算，避免掩盖页内边距越界。
            .map(
              ([key, value]) =>
                `${key}:${String(value).replace(/([0-9.]+)rpx/g, (_, number) => `${(Number(number) * width) / 750}px`)}`,
            )
            .join(';');
          for (const route of routes) {
            const base = `miniprogram/${route}`;
            await page.setContent(`<page style="${tokens}">${read(`${base}.wxml`)}</page>`);
            // Minimal native block sizing adapter, not a Mini Program emulator.
            await page.addStyleTag({
              content:
                'body{margin:0}page,view,state-view,block{display:block}page{width:100%}*{box-sizing:border-box}',
            });
            await page.addStyleTag({
              content:
                `${readStyles('miniprogram/app.wxss')}\n${readStyles(`${base}.wxss`)}`.replace(
                  /([\d.]+)rpx/g,
                  (_, value) => `${(Number(value) * width) / 750}px`,
                ),
            });
            const result = await page.evaluate(() => {
              const root = document.querySelector('.aihero-page');
              const probe = document.createElement('span');
              probe.style.color = 'var(--color-bg)';
              root.append(probe);
              const title = root.querySelector('.pageheading-title');
              probe.style.fontFamily = 'var(--font-family-body)';
              const bodyFont = getComputedStyle(probe).fontFamily;
              const computed = {
                background: getComputedStyle(root).backgroundColor,
                expected: getComputedStyle(probe).color,
                titleFont: title ? getComputedStyle(title).fontFamily : null,
                bodyFont,
                headingInset:
                  title && getComputedStyle(title).display !== 'none'
                    ? title.getBoundingClientRect().left - root.getBoundingClientRect().left
                    : null,
              };
              const ink = root.querySelector('.ink');
              if (ink) {
                const rootRect = root.getBoundingClientRect();
                const inkRect = ink.getBoundingClientRect();
                computed.inkWithinPage =
                  inkRect.left >= rootRect.left - 1 && inkRect.right <= rootRect.right + 1;
              }
              const hero = root.querySelector('.photo.hero.detail');
              if (hero) {
                const rect = hero.getBoundingClientRect();
                computed.heroRatio = rect.width / rect.height;
                computed.galleryPosition = getComputedStyle(
                  hero.querySelector('.hero-gallery'),
                ).position;
                computed.singlePosition = getComputedStyle(
                  hero.querySelector(':scope > .hero-media'),
                ).position;
              }
              const facts = root.querySelector('.storyfacts');
              if (facts) {
                computed.factsColumns =
                  getComputedStyle(facts).gridTemplateColumns.split(' ').length;
              }
              computed.metricStyles = [
                ...root.querySelectorAll('.metrics, .storyfacts, .trip-stats'),
              ].map((group) => ({
                frame: getComputedStyle(group).borderTopWidth,
                dividers: [...group.children].map((node) => getComputedStyle(node).borderLeftWidth),
              }));
              const preview = root.querySelector(
                '.upload-media-background > .background-image, .club-cover-preview > .upload-image',
              );
              if (preview) {
                computed.previewPosition = getComputedStyle(preview).position;
              }
              return computed;
            });
            const context = `${width}/${mode}/${route}`;
            for (const metric of result.metricStyles) {
              assert.equal(metric.frame, '0px', `${context}: no metric frame`);
              assert.ok(
                metric.dividers.every((value) => value === '0px'),
                `${context}: no metric separators`,
              );
            }
            assert.equal(result.background, result.expected, `${context}: root surface`);
            if (result.headingInset !== null) {
              assert.ok(
                result.headingInset >= (40 * width) / 750 - 1,
                `${context}: production heading not flush left`,
              );
            }
            if (result.titleFont) {
              assert.equal(
                result.titleFont.replace(/["']/g, ''),
                result.bodyFont.replace(/["']/g, ''),
                `${context}: title font`,
              );
            }
            if (result.inkWithinPage !== undefined) {
              assert.equal(result.inkWithinPage, true, `${context}: 指标和集合概要不可越过页边界`);
            }
            if (result.heroRatio) {
              assert.ok(
                Math.abs(result.heroRatio - 16 / 9) < 0.03,
                `${context}: detail hero ratio ${result.heroRatio}`,
              );
              assert.equal(result.galleryPosition, 'absolute', context);
              assert.equal(result.singlePosition, 'absolute', context);
            }
            if (result.factsColumns) {
              assert.equal(result.factsColumns, 3, context);
            }
            if (result.previewPosition) {
              assert.equal(result.previewPosition, 'absolute', context);
            }
          }
        }
      }
    } finally {
      await browser.close();
    }
  },
);

for (const route of ['registrations', 'credential']) {
  test(`${route} 无头像占位字浅暗真实消费对比`, async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      for (const mode of ['light', 'dark']) {
        const tokens = Object.entries(APPEARANCE_TOKENS[mode])
          .map(([key, value]) => `${key}:${value}`)
          .join(';');
        const base = `miniprogram/pages/${route}/index`;
        await page.setContent(`<page style="${tokens}">${read(`${base}.wxml`)}</page>`);
        await page.addStyleTag({
          content: `${readStyles('miniprogram/app.wxss')}\n${readStyles(`${base}.wxss`)}`.replace(
            /([\d.]+)rpx/g,
            (_, value) => `${Number(value) / RPX_PER_CSS_PIXEL}px`,
          ),
        });
        // Chromium 不执行 wx:if；显式保留无 avatarUrl 分支、填入真实占位字形。
        await page
          .locator('image.club-avatar')
          .evaluateAll((nodes) => nodes.forEach((node) => node.remove()));
        const placeholders = page.locator('.club-avatar--placeholder');
        assert.ok(await placeholders.count(), `${route}: WXML 必须有无头像兜底`);
        for (const node of await placeholders.all()) {
          const result = await node.evaluate((element) => {
            element.textContent = '此';
            const style = getComputedStyle(element);
            const probe = document.createElement('span');
            probe.style.color = 'var(--color-text)';
            element.append(probe);
            const expected = getComputedStyle(probe).color;
            probe.remove();
            const luminance = (color) => {
              const channels = color
                .match(/[\d.]+/g)
                .slice(0, 3)
                .map(Number)
                .map((channel) => {
                  const value = channel / 255;
                  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
                });
              return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
            };
            const foreground = luminance(style.color);
            const background = luminance(style.backgroundColor);
            return {
              color: style.color,
              expected,
              ratio:
                (Math.max(foreground, background) + 0.05) /
                (Math.min(foreground, background) + 0.05),
            };
          });
          assert.ok(
            result.ratio >= 4.5,
            `${route}/${mode}: 占位字对比 ${result.ratio.toFixed(2)}:1`,
          );
          assert.equal(
            result.color,
            result.expected,
            `${route}/${mode}: 占位字使用 text 而非 on-brand`,
          );
        }
      }
    } finally {
      await browser.close();
    }
  });
}
