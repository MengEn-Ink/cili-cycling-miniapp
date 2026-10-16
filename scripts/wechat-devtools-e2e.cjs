#!/usr/bin/env node
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
        { cause: error },
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

function isHttps(value) {
  return /^https:\/\//i.test(value || '');
}

function isRenderableMedia(value) {
  return /^(?:https?|wxfile):\/\//i.test(value || '');
}

function releaseVersion() {
  const source = fs.readFileSync(
    path.join(projectPath, 'miniprogram', 'config', 'release.ts'),
    'utf8',
  );
  const match = source.match(/CLIENT_RELEASE_VERSION\s*=\s*['"]([^'"]+)['"]/);
  if (!match) throw new Error('无法读取 CLIENT_RELEASE_VERSION');
  return match[1];
}

async function main() {
  if (process.platform !== 'darwin') throw new Error('微信开发者工具 E2E 目前仅支持 macOS。');
  if (!fs.existsSync(cliPath)) throw new Error(`未找到微信开发者工具 CLI：${cliPath}`);
  if (!fs.existsSync(path.join(projectPath, 'project.config.json'))) {
    throw new Error(`不是有效的小程序项目目录：${projectPath}`);
  }
  fs.mkdirSync(outputPath, { recursive: true });

  const automator = loadAutomator();
  const version = releaseVersion();
  const result = {
    schemaVersion: 2,
    releaseVersion: version,
    startedAt: new Date().toISOString(),
    git: execFileSync('git', ['-C', projectPath, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    projectPath,
    checks: [],
    exceptions: [],
  };
  console.log(`RELEASE_VERSION ${version}`);
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
    const activities = data.items || [];
    const activity = activities[0];
    const editableActivity = activities.find((item) => item.images?.length);
    check('活动首页加载', !data.error && Boolean(activity), {
      error: data.error || null,
      count: data.items?.length || 0,
    });
    check('存在带图片的活动编辑验收样本', Boolean(editableActivity), {
      count: activities.filter((item) => item.images?.length).length,
    });
    check('活动卡集合时间为自然表达', naturalTime(activity?.displayTimeLabel), {
      displayTimeLabel: activity?.displayTimeLabel,
    });
    check(
      '活动轮播日期与集合时间拆分',
      splitDateAndTime(activity?.displayDateLabel, activity?.displayTimeLabel),
      {
        displayDateLabel: activity?.displayDateLabel,
        displayTimeLabel: activity?.displayTimeLabel,
      },
    );
    await screenshot(miniProgram, '01-activities.png');

    if (editableActivity?.id) {
      page = await miniProgram.reLaunch(
        `/pages/admin/activity-edit/index?id=${encodeURIComponent(editableActivity.id)}`,
      );
      await sleep(7000);
      data = await page.data();
      const editImages = data.images || [];
      const editImagePreviewUrls = data.imagePreviewUrls || [];
      const hasGroupQr = Boolean(data.groupQrCode);
      const hasRoutePreviewFile = Boolean(
        data.originalActivity?.route?.generatedPreviewFileId ||
        data.routePreview?.generatedPreviewFileId,
      );
      check(
        '活动编辑页图片由管理云函数回显',
        !data.error &&
          editImages.length > 0 &&
          editImagePreviewUrls.length === editImages.length &&
          editImagePreviewUrls.every(isHttps) &&
          (!hasGroupQr || isHttps(data.groupQrPreviewUrl)) &&
          (!hasRoutePreviewFile || isHttps(data.routePreview?.generatedPreviewUrl)),
        {
          error: data.error || null,
          images: editImages.length,
          imageHttps: editImagePreviewUrls.filter(isHttps).length,
          groupQrHttps: !hasGroupQr || isHttps(data.groupQrPreviewUrl),
          routePreviewHttps:
            !hasRoutePreviewFile || isHttps(data.routePreview?.generatedPreviewUrl),
        },
      );
      await screenshot(miniProgram, '01b-activity-edit.png');
    }

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
      let attendeeActivity = null;
      for (const candidate of activities.slice(0, 5)) {
        page = await miniProgram.reLaunch(
          `/pages/activity-detail/index?id=${encodeURIComponent(candidate.id)}`,
        );
        await sleep(7000);
        data = await page.data();
        if (!attendeeActivity) attendeeActivity = { candidate, data };
        if ((data.attendees || []).length > 0) {
          attendeeActivity = { candidate, data };
          break;
        }
      }
      data = attendeeActivity?.data || data;
      check('活动详情日期与集合时间拆分', splitDateAndTime(data.displayDate, data.startTime), {
        displayDate: data.displayDate,
        startTime: data.startTime,
      });
      const attendees = data.attendees || [];
      check(
        '报名人员头像与骑行名片背景均为服务端 HTTPS 地址',
        attendees.length > 0 &&
          attendees.every((item) => isHttps(item.avatarUrl) && isHttps(item.backgroundUrl)),
        {
          count: attendees.length,
          avatarHttps: attendees.filter((item) => isHttps(item.avatarUrl)).length,
          backgroundHttps: attendees.filter((item) => isHttps(item.backgroundUrl)).length,
        },
      );
      const attendeeButton = await page.$('.attendee-mini-card');
      if (attendeeButton) {
        await attendeeButton.tap();
        await sleep(2500);
        data = await page.data();
      }
      check(
        '报名人员骑行名片弹层图片回显',
        Boolean(data.selectedAttendee) &&
          isHttps(data.selectedAttendee?.avatarUrl) &&
          isHttps(data.selectedAttendee?.backgroundUrl),
        {
          selected: Boolean(data.selectedAttendee),
          avatarHttps: isHttps(data.selectedAttendee?.avatarUrl),
          backgroundHttps: isHttps(data.selectedAttendee?.backgroundUrl),
        },
      );
      await screenshot(miniProgram, '03-detail-attendee-card.png');
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

    page = await miniProgram.reLaunch('/pages/profile/index');
    await sleep(7000);
    data = await page.data();
    const profileUrls = [data.heroAvatarUrl, data.heroBackgroundAvatarUrl].filter(Boolean);
    check(
      '个人中心图片回显',
      !data.error &&
        (data.heroBackgrounds || []).every((item) => isRenderableMedia(item.url)) &&
        profileUrls.every(isRenderableMedia),
      {
        error: data.error || null,
        backgrounds: data.heroBackgrounds?.length || 0,
        renderableBackgrounds: (data.heroBackgrounds || []).filter((item) =>
          isRenderableMedia(item.url),
        ).length,
        profileUrls: profileUrls.length,
        renderableProfileUrls: profileUrls.filter(isRenderableMedia).length,
      },
    );
    await screenshot(miniProgram, '05-profile.png');

    page = await miniProgram.reLaunch('/pages/profile-edit/index');
    await sleep(7000);
    data = await page.data();
    const photoItems = data.photoItems || [];
    check(
      '资料编辑页头像与照片回显',
      !data.error &&
        photoItems.length > 0 &&
        photoItems.every((item) => item.previewState === 'ready' && isHttps(item.previewUrl)) &&
        (!data.avatarPreviewUrl || isHttps(data.avatarPreviewUrl)),
      {
        error: data.error || null,
        photos: photoItems.length,
        readyHttps: photoItems.filter(
          (item) => item.previewState === 'ready' && isHttps(item.previewUrl),
        ).length,
        failed: photoItems.filter((item) => item.previewState === 'failed').length,
        avatarHttps: isHttps(data.avatarPreviewUrl),
      },
    );
    await screenshot(miniProgram, '06-profile-edit.png');

    page = await miniProgram.reLaunch('/pages/capability-card/index');
    await sleep(7000);
    data = await page.data();
    const backgrounds = data.card?.backgrounds || [];
    check(
      '骑行名片背景图回显',
      !data.error && backgrounds.length > 0 && backgrounds.every((item) => isHttps(item.url)),
      {
        error: data.error || null,
        backgrounds: backgrounds.length,
        httpsBackgrounds: backgrounds.filter((item) => isHttps(item.url)).length,
        needsProfilePhoto: Boolean(data.card?.needsProfilePhoto),
      },
    );
    await screenshot(miniProgram, '07-capability-card.png');

    page = await miniProgram.reLaunch('/pages/settings/index');
    await sleep(2500);
    data = await page.data();
    const currentVersion = data.releaseNotes?.[0]?.version;
    check('设置页版本与运行时一致', currentVersion === version, {
      expected: version,
      actual: currentVersion || null,
    });
    await screenshot(miniProgram, '08-settings.png');
  } finally {
    await miniProgram.close();
  }

  result.finishedAt = new Date().toISOString();
  result.passed = result.checks.filter((item) => item.ok).length;
  result.failed = result.checks.filter((item) => !item.ok).length;
  fs.writeFileSync(path.join(outputPath, 'results.json'), JSON.stringify(result, null, 2));
  console.log(
    `SUMMARY version=${version} pass=${result.passed} fail=${result.failed} exceptions=${result.exceptions.length} output=${outputPath}`,
  );
  if (result.failed || result.exceptions.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`E2E_FAILED ${error.stack || error}`);
  process.exitCode = 2;
});
