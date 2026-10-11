#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const projectPath = path.resolve(process.env.CILI_PROJECT_PATH || process.cwd());
const cliPath =
  process.env.WECHAT_DEVTOOLS_CLI || '/Applications/wechatwebdevtools.app/Contents/MacOS/cli';
const outputPath = path.resolve(
  process.env.CILI_E2E_OUTPUT || path.join(projectPath, 'artifacts', 'wechat-devtools-e2e'),
);
const modulePath =
  process.env.MINIPROGRAM_AUTOMATOR_PATH ||
  path.join(os.homedir(), '.cili-devtools-e2e', 'node_modules', 'miniprogram-automator');

function loadAutomator() {
  try {
    return require('miniprogram-automator');
  } catch (_) {
    try {
      return require(modulePath);
    } catch (error) {
      throw new Error(
        `未找到 miniprogram-automator。请先执行：mkdir -p ~/.cili-devtools-e2e && cd ~/.cili-devtools-e2e && npm init -y && npm install miniprogram-automator@0.12.1\n也可通过 MINIPROGRAM_AUTOMATOR_PATH 指定模块路径。原始错误：${error.message}`,
      );
    }
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function naturalTime(value) {
  return /^(凌晨|早上|上午|中午|下午|晚上) \d+ 点(?:整|半| \d+ 分)$/.test(value || '');
}

function splitDateAndTime(date, time) {
  return /月\d+日 周[一二三四五六日]/.test(date || '') && naturalTime(time) && !/月|周/.test(time);
}

async function main() {
  if (process.platform !== 'darwin') throw new Error('微信开发者工具 E2E 目前仅支持 macOS。');
  if (!fs.existsSync(cliPath)) throw new Error(`未找到微信开发者工具 CLI：${cliPath}`);
  if (!fs.existsSync(path.join(projectPath, 'project.config.json'))) {
    throw new Error(`不是有效的小程序项目目录：${projectPath}`);
  }
  fs.mkdirSync(outputPath, { recursive: true });

  const automator = loadAutomator();
  const result = {
    schemaVersion: 1,
    startedAt: new Date().toISOString(),
    git: execFileSync('git', ['-C', projectPath, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    projectPath,
    checks: [],
    exceptions: [],
  };
  const check = (name, ok, detail) => {
    result.checks.push({ name, ok: Boolean(ok), detail: detail || null });
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${JSON.stringify(detail || {})}`);
  };
  const screenshot = (miniProgram, file) =>
    miniProgram.screenshot({ path: path.join(outputPath, file) });

  const miniProgram = await automator.launch({ cliPath, projectPath, launchTimeout: 180000 });
  miniProgram.on('exception', (payload) => {
    result.exceptions.push(payload);
    console.error(`RUNTIME_EXCEPTION ${JSON.stringify(payload)}`);
  });

  try {
    await sleep(4000);

    let page = await miniProgram.reLaunch('/pages/activities/index');
    await sleep(6000);
    let data = await page.data();
    const activity = data.items?.[0];
    check('活动首页加载', !data.error && Boolean(activity), {
      error: data.error || null,
      count: data.items?.length || 0,
    });
    check('活动卡集合时间为自然表达', naturalTime(activity?.displayTimeLabel), {
      displayTimeLabel: activity?.displayTimeLabel,
    });
    const headers =
      data.rows?.filter((row) => row.kind === 'header').map((row) => row.dayLabel) || [];
    check('活动列表日期由分组标题承载', headers.length > 0, { headers });
    await screenshot(miniProgram, '01-activities.png');

    page = await miniProgram.reLaunch('/pages/registrations/index');
    await sleep(5000);
    data = await page.data();
    const trips = data.items || [];
    const trip = trips[0];
    check('我的行程加载', !data.error && Boolean(trip), {
      error: data.error || null,
      count: trips.length,
    });
    check(
      '行程日期与集合时间拆分',
      splitDateAndTime(trip?.activity?.displayDate, trip?.meetingTime),
      { displayDate: trip?.activity?.displayDate, meetingTime: trip?.meetingTime },
    );
    await screenshot(miniProgram, '02-trips.png');

    if (activity?.id) {
      page = await miniProgram.reLaunch(
        `/pages/activity-detail/index?id=${encodeURIComponent(activity.id)}`,
      );
      await sleep(4500);
      data = await page.data();
      check('活动详情日期与集合时间拆分', splitDateAndTime(data.displayDate, data.startTime), {
        displayDate: data.displayDate,
        startTime: data.startTime,
      });
      await screenshot(miniProgram, '03-detail.png');
    }

    const credentialTrip =
      trips.find((item) => item.status === 'approved' || item.status === 'checked_in') || trip;
    if (credentialTrip?.id) {
      page = await miniProgram.reLaunch(
        `/pages/credential/index?id=${encodeURIComponent(credentialTrip.id)}`,
      );
      await sleep(4500);
      data = await page.data();
      check(
        '报名凭证日期与集合时间拆分',
        splitDateAndTime(data.activity?.displayDate, data.meetingTime),
        {
          error: data.error || null,
          displayDate: data.activity?.displayDate,
          meetingTime: data.meetingTime,
        },
      );
      await screenshot(miniProgram, '04-credential.png');
    } else {
      check('报名凭证存在可验证记录', false, { reason: '当前账号没有行程记录' });
    }
  } finally {
    await miniProgram.close();
  }

  result.finishedAt = new Date().toISOString();
  result.passed = result.checks.filter((item) => item.ok).length;
  result.failed = result.checks.filter((item) => !item.ok).length;
  fs.writeFileSync(path.join(outputPath, 'results.json'), JSON.stringify(result, null, 2));
  console.log(
    `SUMMARY pass=${result.passed} fail=${result.failed} exceptions=${result.exceptions.length} output=${outputPath}`,
  );
  if (result.failed || result.exceptions.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`E2E_FAILED ${error.stack || error}`);
  process.exitCode = 2;
});
