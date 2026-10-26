import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

const source = readFileSync(new URL('./wechat-devtools-e2e.cjs', import.meta.url), 'utf8');
const pagesCaptureSource = readFileSync(
  new URL('./pages-visual-acceptance/capture-routes.mjs', import.meta.url),
  'utf8',
);
const require = createRequire(import.meta.url);
// 旧入口导入即启动 IDE，RED 阶段先拒绝导入，避免测试误操作真实开发者工具。
const driver = source.includes('if (require.main === module)')
  ? require('./wechat-devtools-e2e.cjs')
  : {};

test('开发者工具冷启动使用 automator 支持的剩余预算 timeout 参数', () => {
  assert.match(
    source,
    /automator\.launch\(\{\s*cliPath,\s*projectPath,\s*timeout:\s*remainingBeforeLaunch,?\s*\}\)/s,
  );
  assert.doesNotMatch(source, /timeout:\s*180000/);
  assert.doesNotMatch(source, /launchTimeout/);
});

test('标准 harness 接入 schema v4 与受限启动恢复', () => {
  assert.match(source, /schemaVersion:\s*4/);
  assert.match(source, /\blocalGitSha(?:\s*:|\s*,)/);
  assert.match(source, /startupOutcome:\s*null/);
  assert.match(source, /productVerdict:\s*'NOT_EXECUTED'/);
  assert.match(source, /recoveredStartupFailure:\s*false/);
  assert.match(source, /startup:\s*\{[\s\S]*?attempts:\s*\[\]/);
  assert.match(source, /console:\s*\[\]/);
  assert.match(source, /consoleDropped:\s*0/);
  assert.match(source, /exceptionsDropped:\s*0/);
  assert.match(source, /await launchWithStartupRecovery\(\{/);
  assert.equal((source.match(/onReadError:\s*recordRouteReadError/g) || []).length, 2);
  assert.match(source, /serializeError:\s*\(phase, error\)/);
  assert.match(source, /'passed_with_startup_recovery'/);
  assert.doesNotMatch(
    source,
    /miniProgram\s*=\s*await automator\.launch\(\{\s*cliPath,\s*projectPath,\s*timeout:\s*180000\s*\}\)/s,
  );
});

test('首个业务路由先记录 relaunch，业务谓词满足后才记录 data_ready', async () => {
  const report = {
    startedAt: new Date(1_000).toISOString(),
    activeStartupAttempt: 1,
    startup: { attempts: [{ attempt: 1, events: [], errors: [] }] },
  };
  const page = { path: 'pages/activities/index' };
  let predicateSatisfied = false;

  const actual = await driver.relaunchWithPhaseEvents({
    report,
    miniProgram: {},
    url: '/pages/activities/index',
    isDataReady: (data) => {
      predicateSatisfied = data.ready;
      return predicateSatisfied;
    },
    relaunchWhenReady: async ({ isDataReady }) => {
      assert.deepEqual(
        report.startup.attempts[0].events.map((event) => event.type),
        ['relaunch'],
      );
      assert.equal(isDataReady({ ready: true }), true);
      assert.equal(
        report.startup.attempts[0].events.some((event) => event.type === 'data_ready'),
        false,
      );
      return page;
    },
    now: () => 2_000,
  });

  assert.equal(actual, page);
  assert.equal(predicateSatisfied, true);
  assert.deepEqual(
    report.startup.attempts[0].events.map((event) => event.type),
    ['relaunch', 'data_ready'],
  );
});

test('启动恢复共享 90 秒预算且只创建两个 session', async () => {
  let clock = 1_000;
  const launchTimeouts = [];
  const sessions = [
    { close: async () => {}, on: () => {} },
    { close: async () => {}, on: () => {} },
  ];
  let frameworkCalls = 0;
  const report = {
    console: [],
    consoleDropped: 0,
    exceptions: [],
    exceptionsDropped: 0,
    blockers: [],
    recoveredStartupFailure: false,
    startup: { attempts: [] },
  };
  const result = await driver.launchWithStartupRecovery({
    automator: {
      launch: async ({ timeout }) => {
        launchTimeouts.push(timeout);
        clock += 5_000;
        return sessions.shift();
      },
    },
    cliPath: '/cli',
    projectPath: '/project',
    report,
    now: () => clock,
    waitForFrameworkReady: async ({ timeoutMs, deadlineMs, onReadError }) => {
      frameworkCalls += 1;
      assert.equal(timeoutMs, 30_000);
      assert.equal(deadlineMs, 91_000);
      if (frameworkCalls === 1) {
        clock += 30_000;
        onReadError({
          error: new Error('timeout waiting for automator response'),
          elapsedMs: 30_000,
        });
        throw Object.assign(new Error('页面框架未就绪'), {
          code: 'PAGE_FRAMEWORK_NOT_READY',
        });
      }
      clock += 1_000;
      return {
        page: { path: 'pages/activities/index' },
        data: { loading: true },
      };
    },
    classifyReadError: (error, context) =>
      !context.frameworkEverReady &&
      context.attempt === 1 &&
      error.message.includes('timeout waiting for automator response')
        ? 'STARTUP_AUTOMATOR_TIMEOUT'
        : null,
    redactDiagnostic: (value) => String(value?.message || value),
  });
  assert.ok(result.miniProgram);
  assert.deepEqual(launchTimeouts, [90_000, 55_000]);
  assert.equal(frameworkCalls, 2);
  assert.equal(report.startupOutcome, 'PASS_WITH_STARTUP_RECOVERY');
  assert.equal(report.recoveredStartupFailure, true);
  assert.equal(report.startup.attempts.length, 2);
});

test('运行时 console 和 exception 各保留 200 条并截断脱敏文本', async () => {
  const handlers = {};
  const report = {
    console: [],
    consoleDropped: 0,
    exceptions: [],
    exceptionsDropped: 0,
    blockers: [],
    startup: { attempts: [] },
  };
  await driver.launchWithStartupRecovery({
    automator: {
      launch: async () => ({
        close: async () => {},
        on: (event, handler) => {
          handlers[event] = handler;
        },
      }),
    },
    cliPath: '/cli',
    projectPath: '/project',
    report,
    now: () => 1_000,
    waitForFrameworkReady: async () => {
      for (let index = 0; index < 201; index += 1) {
        handlers.console(`console-${index}`);
        handlers.exception(`exception-${index}`);
      }
      return { page: { path: 'pages/activities/index' }, data: {} };
    },
    classifyReadError: () => null,
    redactDiagnostic: (value) => `${value}:${'x'.repeat(4_096)}`,
  });
  assert.equal(report.console.length, 200);
  assert.equal(report.consoleDropped, 1);
  assert.equal(report.exceptions.length, 200);
  assert.equal(report.exceptionsDropped, 1);
  assert.equal(
    report.console.every((entry) => entry.message.length <= 2_048),
    true,
  );
  assert.equal(
    report.exceptions.every((entry) => entry.message.length <= 2_048),
    true,
  );
});

test('未知框架错误不恢复并标记 runner blocked', async () => {
  let launches = 0;
  const report = {
    console: [],
    exceptions: [],
    blockers: [],
    startup: { attempts: [] },
  };
  const result = await driver.launchWithStartupRecovery({
    automator: {
      launch: async () => {
        launches += 1;
        return { close: async () => {}, on: () => {} };
      },
    },
    cliPath: '/cli',
    projectPath: '/project',
    report,
    now: () => 1_000,
    waitForFrameworkReady: async ({ onReadError }) => {
      onReadError({ error: new Error('unknown framework error'), elapsedMs: 1 });
      throw Object.assign(new Error('页面框架未就绪'), { code: 'PAGE_FRAMEWORK_NOT_READY' });
    },
    classifyReadError: () => null,
    redactDiagnostic: (value) => String(value?.message || value),
  });
  assert.equal(result.miniProgram, null);
  assert.equal(launches, 1);
  assert.equal(report.startupOutcome, 'BLOCKED');
  assert.equal(report.productVerdict, 'NOT_EXECUTED');
});

test('第二次启动仍失败后停止且不创建第三个 session', async () => {
  let launches = 0;
  const report = {
    console: [],
    exceptions: [],
    blockers: [],
    startup: { attempts: [] },
  };
  const result = await driver.launchWithStartupRecovery({
    automator: {
      launch: async () => {
        launches += 1;
        return { close: async () => {}, on: () => {} };
      },
    },
    cliPath: '/cli',
    projectPath: '/project',
    report,
    now: () => 1_000,
    waitForFrameworkReady: async ({ onReadError }) => {
      onReadError({
        error: new Error('timeout waiting for automator response'),
        elapsedMs: 1,
      });
      throw Object.assign(new Error('页面框架未就绪'), { code: 'PAGE_FRAMEWORK_NOT_READY' });
    },
    classifyReadError: (error, { attempt }) =>
      attempt === 1 && error.message.includes('timeout') ? 'STARTUP_AUTOMATOR_TIMEOUT' : null,
    redactDiagnostic: (value) => String(value?.message || value),
  });
  assert.equal(result.miniProgram, null);
  assert.equal(launches, 2);
  assert.equal(report.startup.attempts.length, 2);
  assert.equal(report.startupOutcome, 'BLOCKED');
});

test('首次 session 关闭失败时阻断且不发起恢复 session', async () => {
  let launches = 0;
  const report = {
    console: [],
    exceptions: [],
    blockers: [],
    startup: { attempts: [] },
  };
  const result = await driver.launchWithStartupRecovery({
    automator: {
      launch: async () => {
        launches += 1;
        return {
          close: async () => {
            throw new Error('close failed');
          },
          on: () => {},
        };
      },
    },
    cliPath: '/cli',
    projectPath: '/project',
    report,
    now: () => 1_000,
    waitForFrameworkReady: async ({ onReadError }) => {
      onReadError({
        error: new Error('timeout waiting for automator response'),
        elapsedMs: 1,
      });
      throw Object.assign(new Error('页面框架未就绪'), { code: 'PAGE_FRAMEWORK_NOT_READY' });
    },
    classifyReadError: () => 'STARTUP_AUTOMATOR_TIMEOUT',
    redactDiagnostic: (value) => String(value?.message || value),
  });
  assert.equal(result.miniProgram, null);
  assert.equal(launches, 1);
  assert.equal(report.startupOutcome, 'BLOCKED');
  assert.equal(report.startup.attempts[0].errors.at(-1).kind, 'STARTUP_SESSION_CLOSE_ERROR');
});

test('绝对预算耗尽后不创建恢复 session', async () => {
  let clock = 1_000;
  let launches = 0;
  const report = {
    console: [],
    exceptions: [],
    blockers: [],
    startup: { attempts: [] },
  };
  const result = await driver.launchWithStartupRecovery({
    automator: {
      launch: async () => {
        launches += 1;
        return { close: async () => {}, on: () => {} };
      },
    },
    cliPath: '/cli',
    projectPath: '/project',
    report,
    now: () => clock,
    waitForFrameworkReady: async ({ onReadError }) => {
      clock = 91_000;
      onReadError({
        error: new Error('timeout waiting for automator response'),
        elapsedMs: 90_000,
      });
      throw Object.assign(new Error('页面框架未就绪'), { code: 'PAGE_FRAMEWORK_NOT_READY' });
    },
    classifyReadError: () => 'STARTUP_AUTOMATOR_TIMEOUT',
    redactDiagnostic: (value) => String(value?.message || value),
  });
  assert.equal(result.miniProgram, null);
  assert.equal(launches, 1);
  assert.equal(report.startupOutcome, 'BLOCKED');
});

test('审核详情宽度探针跟随当前标题元信息结构且元素缺失时不会中断后续路由', () => {
  assert.match(source, /page\.\$\('\.pageheading-meta'\)/);
  assert.match(source, /page\.\$\('\.pageheading-meta \.tag'\)/);
  assert.match(source, /if \(meta && id && tag\)/);
  assert.doesNotMatch(source, /page\.\$\('\.info-head'\)/);
  assert.doesNotMatch(source, /page\.\$\('\.info-tag'\)/);
});

test('Pages 截图器覆盖兼容名片入口在内的全部 17 条路由', () => {
  const match = pagesCaptureSource.match(/const ROUTES = \[([\s\S]*?)\];/);
  assert.ok(match);
  const routes = [...match[1].matchAll(/'([^']+)'/g)].map((item) => item[1]);
  assert.equal(routes.length, 17);
  assert.ok(routes.includes('capability-card'));
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

test('历史名片入口等待我的页真实转跳，不调用独立名片服务', async () => {
  assert.equal(typeof driver.openLegacyProfile, 'function');
  const navigations = [];
  const profilePage = { path: 'pages/profile/index' };
  const actual = await driver.openLegacyProfile({
    miniProgram: { reLaunch: async (url) => navigations.push(url) },
    waitForReady: async (route) => {
      assert.equal(route, 'pages/profile/index');
      return profilePage;
    },
  });
  assert.deepEqual(navigations, ['/pages/capability-card/index']);
  assert.equal(actual, profilePage);
});

test('历史名片入口未转跳时拒绝作为已覆盖路由', async () => {
  assert.equal(typeof driver.openLegacyProfile, 'function');
  await assert.rejects(
    driver.openLegacyProfile({
      miniProgram: { reLaunch: async () => {} },
      waitForReady: async () => ({ path: 'pages/capability-card/index' }),
    }),
    /LEGACY_PROFILE_REDIRECT_FAILED/,
  );
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

test('半透明图片操作背景按最亮白底合成后再测文字对比度', () => {
  assert.equal(typeof driver.translucentColorOnWhiteHex, 'function');
  assert.equal(driver.translucentColorOnWhiteHex('rgba(12, 10, 7, 0.82)'), '#383634');
  assert.equal(driver.translucentColorOnWhiteHex('rgba(165, 42, 28, 0.92)'), '#ac3b2e');
  assert.equal(driver.translucentColorOnWhiteHex('rgb(33, 31, 28)'), '#211f1c');
  assert.equal(driver.translucentColorOnWhiteHex('rgba(255, 255, 255, 0)'), null);
});

test('空白活动发布探针使用当前发布按钮 data-status 接线', () => {
  assert.match(source, /page\.\$\('\[data-status="published"\]'\)/);
  assert.doesNotMatch(source, /page\.\$\('\.button--primary'\)/);
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

test('骑友名片点击使用当前 rider 结构并验证两种图片实际解码', () => {
  assert.match(source, /page\.\$\$\('\.riderlist \.rider'\)/);
  assert.doesNotMatch(source, /\.attendee-mini-card/);
  assert.match(source, /名片头像可下载并解码/);
  assert.match(source, /名片背景可下载并解码/);
  assert.match(source, /navigationTimings/);
});

test('详情性能探针分别记录首屏内容与完整刷新，保留真实等待状态', async () => {
  assert.equal(typeof driver.measureDetailNavigation, 'function');
  let clock = 100;
  const page = {
    path: 'pages/activity-detail/index',
    data: async () => ({ item: {}, loading: false, refreshing: true }),
  };
  let waits = 0;
  const measured = await driver.measureDetailNavigation({
    miniProgram: {
      callWxMethod: async (method, options) => {
        assert.equal(method, 'navigateTo');
        assert.equal(options.url, '/pages/activity-detail/index?id=synthetic');
        clock += 20;
      },
      currentPage: async () => page,
    },
    activityId: 'synthetic',
    now: () => clock,
    waitForPageReady: async (options) => {
      assert.equal(options.isDataReady({ item: null, loading: true }), false);
      if (++waits === 1) {
        assert.equal(options.isDataReady({ item: {}, loading: false, refreshing: true }), true);
        clock += 30;
      } else {
        assert.equal(options.isDataReady({ item: {}, loading: false, refreshing: true }), false);
        clock += 500;
      }
    },
  });
  assert.deepEqual(measured, { contentMs: 50, readyMs: 550 });
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
