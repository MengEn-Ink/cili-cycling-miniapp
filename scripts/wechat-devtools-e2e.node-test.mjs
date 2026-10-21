import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

const source = readFileSync(new URL('./wechat-devtools-e2e.cjs', import.meta.url), 'utf8');
const require = createRequire(import.meta.url);
// 旧入口导入即启动 IDE，RED 阶段先拒绝导入，避免测试误操作真实开发者工具。
const driver = source.includes('if (require.main === module)')
  ? require('./wechat-devtools-e2e.cjs')
  : {};

test('开发者工具冷启动使用 automator 支持的 timeout 参数', () => {
  assert.match(
    source,
    /automator\.launch\(\{\s*cliPath,\s*projectPath,\s*timeout:\s*180000\s*\}\)/s,
  );
  assert.doesNotMatch(source, /launchTimeout/);
});

test('当前 app.json 的全部路由被基础流程与补充只读流程覆盖', () => {
  assert.equal(typeof driver.additionalReadOnlyRoutes, 'function');
  const { expandAppRoutes } = require('./app-routes.cjs');
  const app = JSON.parse(readFileSync(new URL('../miniprogram/app.json', import.meta.url)));
  const basic = new Set([
    'pages/activities/index',
    'pages/activity-detail/index',
    'pages/registration-form/index',
    'pages/registrations/index',
    'pages/credential/index',
    'pages/profile/index',
    'pages/profile-edit/index',
    'pages/capability-card/index',
    'pages/settings/index',
    'pages/admin/activity-list/index',
    'pages/admin/activity-edit/index',
    'pages/admin/reviews/index',
    'pages/admin/review-detail/index',
  ]);
  const extra = driver.additionalReadOnlyRoutes('activity with space');
  for (const route of extra) basic.add(route.url.split('?')[0].replace(/^\//, ''));
  assert.deepEqual([...basic].sort(), expandAppRoutes(app).sort());
  assert.equal(extra[0].url, '/pages/route-analysis/index?id=activity%20with%20space');
});

test('补充路由等待实际 loading 状态结束，空库仍可作为真实页面状态采集', () => {
  assert.equal(typeof driver.additionalReadOnlyRoutes, 'function');
  const [analysis, home, admin, editor] = driver.additionalReadOnlyRoutes('sample');
  assert.equal(analysis.isReady({ loading: true }), false);
  assert.equal(home.isReady({ mode: 'loading' }), false);
  assert.equal(home.isReady({ mode: 'home', activityMode: 'loading' }), false);
  assert.equal(home.isReady({ mode: 'empty', activityMode: 'empty' }), true);
  assert.equal(admin.isReady({ mode: 'loading' }), false);
  assert.equal(admin.isReady({ mode: 'bootstrap' }), true);
  assert.equal(editor.isReady({ pageState: 'loading' }), false);
  assert.equal(editor.isReady({ pageState: 'bootstrap' }), true);
});

test('计算后颜色支持当前主题但拒绝透明与非法颜色', () => {
  assert.equal(typeof driver.opaqueColorHex, 'function');
  assert.equal(driver.opaqueColorHex('rgb(33, 31, 28)'), '#211f1c');
  assert.equal(driver.opaqueColorHex('rgba(255, 255, 255, 1)'), '#ffffff');
  assert.equal(driver.opaqueColorHex('#211F1C'), '#211f1c');
  assert.equal(driver.opaqueColorHex('rgba(255, 255, 255, 0)'), null);
  assert.equal(driver.opaqueColorHex('rgb(256, 0, 0)'), null);
  assert.equal(driver.opaqueColorHex('transparent'), null);
});

test('公开媒体缺样本是阻塞，非 HTTPS 地址是失败，安全空态不会误报媒体就绪', () => {
  assert.equal(typeof driver.attendeeMediaSummary, 'function');
  assert.deepEqual(driver.attendeeMediaSummary([{ avatarUrl: '', backgroundUrl: '' }]), {
    safe: true,
    ready: false,
    count: 1,
    avatarHttps: 0,
    backgroundHttps: 0,
  });
  assert.equal(driver.attendeeMediaSummary([]).ready, false);
  assert.equal(
    driver.attendeeMediaSummary([{ avatarUrl: 'cloud://private', backgroundUrl: '' }]).safe,
    false,
  );
  assert.equal(
    driver.attendeeMediaSummary([
      { avatarUrl: '', backgroundUrl: '' },
      { avatarUrl: 'https://example.test/avatar', backgroundUrl: 'https://example.test/photo' },
    ]).ready,
    true,
  );
});

test('截图接口瞬时失败只重试一次，并核对仍是同一路由', async () => {
  assert.equal(typeof driver.captureRouteScreenshot, 'function');
  let attempts = 0;
  const report = { captureRetries: [] };
  await driver.captureRouteScreenshot({
    miniProgram: {
      currentPage: async () => ({ path: 'pages/activities/index' }),
      screenshot: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error('');
      },
    },
    path: '/tmp/example.png',
    report,
  });
  assert.equal(attempts, 2);
  assert.deepEqual(report.captureRetries, [{ route: 'pages/activities/index' }]);
});

test('持续截图失败或路由变化不能生成成功截图证据', async () => {
  assert.equal(typeof driver.captureRouteScreenshot, 'function');
  let attempts = 0;
  await assert.rejects(
    driver.captureRouteScreenshot({
      miniProgram: {
        currentPage: async () => ({ path: 'pages/activities/index' }),
        screenshot: async () => {
          attempts += 1;
          throw new Error('');
        },
      },
      path: '/tmp/example.png',
      report: { captureRetries: [] },
    }),
    /SCREENSHOT_FAILED:pages\/activities\/index/,
  );
  assert.equal(attempts, 2);

  let reads = 0;
  await assert.rejects(
    driver.captureRouteScreenshot({
      miniProgram: {
        currentPage: async () => ({
          path: ++reads === 1 ? 'pages/activities/index' : 'pages/profile/index',
        }),
        screenshot: async () => assert.fail('路由变化后不得截图'),
      },
      path: '/tmp/example.png',
      report: { captureRetries: [] },
    }),
    /SCREENSHOT_ROUTE_CHANGED/,
  );
});

test('截图等待过程中换页必须终止，首次成功与重试成功都不能接受旧路由证据', async () => {
  for (const initialFailure of [false, true]) {
    let route = 'pages/activities/index';
    let attempts = 0;
    const report = { captureRetries: [] };
    await assert.rejects(
      driver.captureRouteScreenshot({
        miniProgram: {
          currentPage: async () => ({ path: route }),
          screenshot: async () => {
            attempts += 1;
            if (initialFailure && attempts === 1) throw new Error('');
            route = 'pages/profile/index';
          },
        },
        path: '/tmp/example.png',
        report,
      }),
      /SCREENSHOT_ROUTE_CHANGED/,
    );
    assert.equal(attempts, initialFailure ? 2 : 1);
    assert.equal(report.captureRetries.length, initialFailure ? 1 : 0);
  }
});

test('初始媒体完整但弹层降为空态时保留就绪阻塞，不能跳过实样本验证', () => {
  assert.equal(typeof driver.recordAttendeeMediaReadiness, 'function');
  const report = { blockers: [] };
  driver.recordAttendeeMediaReadiness(report, [
    { avatarUrl: 'https://example.test/avatar', backgroundUrl: 'https://example.test/photo' },
  ]);
  assert.deepEqual(report.blockers, []);
  driver.recordAttendeeMediaReadiness(report, [{ avatarUrl: '', backgroundUrl: '' }]);
  driver.recordAttendeeMediaReadiness(report, []);
  assert.deepEqual(report.blockers, ['PUBLIC_ATTENDEE_MEDIA_SAMPLE_NOT_READY']);
});
