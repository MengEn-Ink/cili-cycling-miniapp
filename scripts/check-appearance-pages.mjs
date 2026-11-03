/* global document, getComputedStyle, window */
// Browser checks are Pages-only: never create or sign DevTools evidence here.
import assert from 'node:assert/strict';
import { createReadStream } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { chromium } from 'playwright';

const root = resolve('docs');
const types = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = resolve(root, pathname === '/' ? 'index.html' : pathname.slice(1));
    if (!file.startsWith(`${root}${sep}`) || !(await stat(file)).isFile()) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' });
    createReadStream(file).pipe(response);
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const base = `http://127.0.0.1:${server.address().port}`;
  let checks = 0;
  for (const width of [340, 375, 414, 430]) {
    const page = await browser.newPage({
      viewport: { width, height: 900 },
      reducedMotion: 'reduce',
    });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${base}/?capture=viewport#settings`);
    await page.waitForSelector('.settings-appearance-card');
    const routes = await page.evaluate(() =>
      window.prototypeData.pages
        .filter((item) => item.path?.startsWith('pages/'))
        .map((item) => item.id),
    );
    assert.equal(routes.length, 17);
    for (const mode of ['light', 'dark']) {
      await page.evaluate(() => {
        window.location.hash = 'settings';
      });
      await page.locator(`[data-action="settings-appearance"][data-mode="${mode}"]`).click();
      assert.equal(await page.evaluate(() => localStorage.getItem('cili-appearance')), mode);
      await page.reload();
      await page.waitForSelector('.settings-appearance-card');
      assert.equal(
        await page.locator(`[data-mode="${mode}"][role="radio"]`).getAttribute('aria-checked'),
        'true',
      );
      for (const route of routes) {
        await page.evaluate((id) => {
          window.location.hash = id;
        }, route);
        await page.waitForFunction(
          (id) =>
            window.location.hash.slice(1).split('/')[0] === id.split('/')[0] &&
            document.querySelector('.pg'),
          route === 'capability-card' ? 'profile' : route,
        );
        await page.evaluate(
          () =>
            new Promise((done) =>
              window.requestAnimationFrame(() => window.requestAnimationFrame(done)),
            ),
        );
        const result = await page.evaluate(() => {
          const canvas = document.querySelector('.screen-container');
          const styles = getComputedStyle(document.querySelector('.pg'));
          const smallButtons = [...document.querySelectorAll('.pg button')]
            .filter((button) => {
              const rect = button.getBoundingClientRect();
              return rect.width > 0 && rect.height > 0 && (rect.width < 43.9 || rect.height < 43.9);
            })
            .map((button) => button.textContent.trim().slice(0, 20));
          const root = document.querySelector('.pg');
          const bounds = root.getBoundingClientRect();
          const heading = root.querySelector('.pageheading');
          const content = root.querySelector('.content');
          const caption = root.querySelector('.detail-hero-caption');
          const chapter = root.querySelector('.chapterhead');
          const switchButton = root.querySelector('.info-bar .btn-inverse.is-ghost');
          const probe = document.createElement('span');
          probe.style.color = 'var(--color-on-media)';
          root.append(probe);
          const mediaColor = getComputedStyle(probe).color;
          const captionColors = caption
            ? [...caption.querySelectorAll('h1, p, .eyebrow')].map(
                (node) => getComputedStyle(node).color,
              )
            : [];
          probe.remove();
          return {
            headingInset: heading ? heading.getBoundingClientRect().left - bounds.left : null,
            contentInset: content ? content.getBoundingClientRect().left - bounds.left : null,
            contentPadding: content ? parseFloat(getComputedStyle(content).paddingLeft) : null,
            captionColors,
            captionStack: caption ? getComputedStyle(caption).zIndex : null,
            chapterAlignment: chapter ? getComputedStyle(chapter).justifyContent : null,
            switchColor: switchButton ? getComputedStyle(switchButton).color : null,
            textColor: styles.color,
            mediaColor,
            settingsSections: root.matches('.settings-page')
              ? [...root.querySelectorAll('.chapterhead')].map((node) =>
                  node.textContent.trim().replace(/\s+/g, ' '),
                )
              : null,
            mode: document.documentElement.dataset.appearance,
            background: styles.getPropertyValue('--color-bg').trim(),
            foreground: styles.getPropertyValue('--color-text').trim(),
            overflow: canvas.scrollWidth > canvas.clientWidth + 1,
            smallButtons,
            metricStyles: [...root.querySelectorAll('.metrics, .storyfacts, .ra-map-stats')].map(
              (group) => ({
                frame: getComputedStyle(group).borderTopWidth,
                dividers: [...group.children].map((node) => getComputedStyle(node).borderLeftWidth),
              }),
            ),
          };
        });
        assert.equal(result.mode, mode);
        assert.equal(result.background, mode === 'light' ? '#f7f6f2' : '#0b0a0c');
        assert.equal(result.foreground, mode === 'light' ? '#1f2324' : '#f4f3f1');
        assert.equal(result.overflow, false, `${width}/${mode}/${route}: horizontal overflow`);
        assert.deepEqual(result.smallButtons, [], `${width}/${mode}/${route}: small touch targets`);
        const context = `${width}/${mode}/${route}`;
        for (const metric of result.metricStyles) {
          assert.equal(metric.frame, '0px', `${context}: no metric frame`);
          assert.ok(
            metric.dividers.every((value) => value === '0px'),
            `${context}: no metric separators`,
          );
        }
        if (result.headingInset !== null)
          assert.equal(result.headingInset, 20, `${context}: heading gutter`);
        if (result.contentInset !== null) {
          assert.equal(result.contentInset, 20, `${context}: content gutter`);
          assert.equal(result.contentPadding, 0, `${context}: no double gutter`);
        }
        for (const color of result.captionColors)
          assert.equal(color, result.mediaColor, `${context}: media caption`);
        if (result.captionStack)
          assert.equal(result.captionStack, '1', `${context}: caption above legacy scrim`);
        if (result.chapterAlignment)
          assert.equal(result.chapterAlignment, 'flex-start', `${context}: chapter alignment`);
        if (result.switchColor)
          assert.equal(result.switchColor, result.textColor, `${context}: paper button contrast`);
        if (result.settingsSections)
          assert.deepEqual(
            result.settingsSections,
            ['00显示主题', '01通知', '02隐私', '03应用'],
            `${context}: settings order`,
          );
        if (process.env.CILI_PAGES_REVIEW_DIR && [375, 414].includes(width)) {
          const directory = resolve(process.env.CILI_PAGES_REVIEW_DIR);
          await mkdir(directory, { recursive: true });
          await page.screenshot({
            animations: 'disabled',
            path: resolve(directory, `${route.replaceAll('/', '-')}-${mode}-${width}.png`),
          });
        }
        checks += 1;
      }
      await page.evaluate(() => {
        window.location.hash = 'settings/admin';
      });
      await page.waitForSelector('[data-admin-only]');
      assert.deepEqual(
        await page.locator('.settings-page .chapterhead').allTextContents(),
        ['00显示主题', '01通知', '02隐私', '03应用', '04Strava 线路同步'],
        `${width}/${mode}: admin settings order`,
      );
      assert.equal(await page.locator('[data-action="settings-strava-sync"]').count(), 1);
    }
    assert.deepEqual(errors, [], `${width}: runtime errors`);
    await page.close();
  }
  console.log(
    `Pages appearance PASS: ${checks} route/mode/width checks; persistence and radio feedback checked. Not WeChat/DevTools evidence.`,
  );
} finally {
  if (browser) await browser.close();
  await new Promise((done) => server.close(done));
}
