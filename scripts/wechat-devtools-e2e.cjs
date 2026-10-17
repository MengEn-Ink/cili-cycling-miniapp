#!/usr/bin/env node
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { expandAppRoutes } = require('./app-routes.cjs');

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
  const { runWithReport } = await import('./e2e-report.mjs');
  const { relaunchWhenReady, waitForPageReady } = await import('./p0-journey-driver.mjs');
  const { classifyUiPath, digestFiles } = await import('./ui-sync-policy.mjs');
  if (process.platform !== 'darwin') throw new Error('微信开发者工具 E2E 目前仅支持 macOS。');
  if (!fs.existsSync(cliPath)) throw new Error(`未找到微信开发者工具 CLI：${cliPath}`);
  if (!fs.existsSync(path.join(projectPath, 'project.config.json'))) {
    throw new Error(`不是有效的小程序项目目录：${projectPath}`);
  }
  fs.mkdirSync(outputPath, { recursive: true });

  const automator = loadAutomator();
  const version = releaseVersion();
  const appConfig = JSON.parse(
    fs.readFileSync(path.join(projectPath, 'miniprogram/app.json'), 'utf8'),
  );
  const tabPaths = new Set((appConfig.tabBar?.list || []).map((item) => item.pagePath));
  const uiFiles = execFileSync(
    'git',
    ['-C', projectPath, 'ls-files', '--cached', '--others', '--exclude-standard'],
    { encoding: 'utf8' },
  )
    .trim()
    .split('\n')
    .filter((file) => classifyUiPath(file).ui && fs.existsSync(path.join(projectPath, file)));
  const result = {
    schemaVersion: 3,
    releaseVersion: version,
    startedAt: new Date().toISOString(),
    git: execFileSync('git', ['-C', projectPath, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    projectPath,
    mode: 'real-cloud-readonly',
    dirty: Boolean(
      execFileSync('git', ['-C', projectPath, 'status', '--porcelain'], {
        encoding: 'utf8',
      }).trim(),
    ),
    uiDigest: digestFiles(
      new Map(uiFiles.map((file) => [file, fs.readFileSync(path.join(projectPath, file))])),
    ),
    routes: [],
    blockers: [],
    notCovered: ['ordinary-member-write-journey', 'ios-physical-device', 'android-physical-device'],
    checks: [],
    exceptions: [],
  };
  console.log(`RELEASE_VERSION ${version}`);
  const check = (name, ok, detail) => {
    result.checks.push({ name, ok: Boolean(ok), detail: detail || null });
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${JSON.stringify(detail || {})}`);
  };
  const screenshot = async (miniProgram, file) => {
    const current = await miniProgram.currentPage();
    await miniProgram.screenshot({ path: path.join(outputPath, file) });
    result.routes.push({ path: current.path, screenshot: file });
  };
  const waitLoaded = async (expectedPath, predicate = () => true) => {
    let currentPage;
    await waitForPageReady({
      expectedPath,
      timeoutMs: 30000,
      intervalMs: 250,
      readPage: async () => {
        currentPage = await miniProgram.currentPage();
        return {
          path: currentPage.path,
          data: await currentPage.data(),
        };
      },
      isDataReady: (data) => !data.loading && !data.refreshing && predicate(data),
    });
    return currentPage;
  };
  const relaunchLoaded = (url, predicate = () => true) => {
    const expectedPath = url.split(/[?#]/, 1)[0].replace(/^\/+/, '');
    return relaunchWhenReady({
      miniProgram,
      url,
      timeoutMs: 30000,
      intervalMs: 250,
      navigationMethod: tabPaths.has(expectedPath) ? 'switchTab' : 'reLaunch',
      isDataReady: (data) => !data.loading && !data.refreshing && predicate(data),
    });
  };
  let miniProgram;
  await runWithReport({
    report: result,
    close: async () => {
      if (miniProgram) await miniProgram.close();
    },
    save: (report) =>
      fs.writeFileSync(path.join(outputPath, 'results.json'), JSON.stringify(report, null, 2)),
    execute: async () => {
      miniProgram = await automator.launch({ cliPath, projectPath, timeout: 180000 });
      miniProgram.on('exception', (payload) => result.exceptions.push(payload));
      const device = await miniProgram.callWxMethod('getSystemInfoSync');
      result.device = Object.fromEntries(
        [
          'model',
          'platform',
          'system',
          'SDKVersion',
          'windowWidth',
          'windowHeight',
          'screenWidth',
          'screenHeight',
          'pixelRatio',
        ].map((key) => [key, device[key]]),
      );

      let page = await relaunchLoaded('/pages/activities/index');
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
        page = await relaunchLoaded(
          `/pages/admin/activity-edit/index?id=${encodeURIComponent(editableActivity.id)}`,
        );
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
        const imageAction = await page.$('.image-action');
        if (imageAction) {
          check(
            '图片删除按钮具有明确深色背景与白字',
            (await imageAction.style('background-color')) === 'rgb(23, 23, 23)' &&
              (await imageAction.style('color')) === 'rgb(255, 255, 255)',
          );
        }
      }

      page = await relaunchLoaded('/pages/registrations/index');
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
          page = await relaunchLoaded(
            `/pages/activity-detail/index?id=${encodeURIComponent(candidate.id)}`,
          );
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
        await screenshot(miniProgram, '03-detail.png');
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
          page = await waitLoaded(page.path, (value) => Boolean(value.selectedAttendee));
          data = await page.data();
        }
        check(
          '报名人员骑行名片弹层打开且图片地址有效',
          Boolean(data.selectedAttendee) &&
            isHttps(data.selectedAttendee?.avatarUrl) &&
            isHttps(data.selectedAttendee?.backgroundUrl),
          {
            selected: Boolean(data.selectedAttendee),
            avatarHttps: isHttps(data.selectedAttendee?.avatarUrl),
            backgroundHttps: isHttps(data.selectedAttendee?.backgroundUrl),
          },
        );
        if (data.selectedAttendee?.backgroundUrl) {
          const image = await miniProgram.callWxMethod('getImageInfo', {
            src: data.selectedAttendee.backgroundUrl,
          });
          check('名片背景可下载并解码', image.width > 0 && image.height > 0, {
            width: image.width,
            height: image.height,
          });
        }
        await screenshot(miniProgram, '03-detail-attendee-card.png');
      }

      const credentialTrip =
        trips.find((item) => item.status === 'approved' || item.status === 'checked_in') || trip;
      if (credentialTrip?.id) {
        page = await relaunchLoaded(
          `/pages/credential/index?id=${encodeURIComponent(credentialTrip.id)}`,
        );
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

      page = await relaunchLoaded('/pages/profile/index');
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

      page = await relaunchLoaded(
        '/pages/profile-edit/index',
        (value) =>
          value.error || (value.photoItems || []).every((item) => item.previewState !== 'loading'),
      );
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

      page = await relaunchLoaded('/pages/capability-card/index');
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

      page = await relaunchLoaded('/pages/settings/index');
      data = await page.data();
      const currentVersion = data.releaseNotes?.[0]?.version;
      check('设置页版本与运行时一致', currentVersion === version, {
        expected: version,
        actual: currentVersion || null,
      });
      await screenshot(miniProgram, '08-settings.png');

      page = await relaunchLoaded(
        `/pages/registration-form/index?id=${encodeURIComponent(activity?.id || '')}`,
      );
      data = await page.data();
      check('报名表加载活动与本人资料', !data.error && Boolean(data.activity));
      await screenshot(miniProgram, '09-registration-form.png');

      page = await relaunchLoaded('/pages/admin/activity-list/index');
      data = await page.data();
      check('活动管理列表可读', !data.error && Boolean(data.isAdmin), {
        count: data.items?.length || 0,
        isAdmin: Boolean(data.isAdmin),
      });
      await screenshot(miniProgram, '10-admin-activity-list.png');

      page = await relaunchLoaded('/pages/admin/reviews/index');
      data = await page.data();
      check('审核列表可读', !data.error, { count: data.all?.length || 0 });
      const review = (data.all || [])[0] || trip;
      await screenshot(miniProgram, '11-admin-reviews.png');

      if (review?.id) {
        page = await relaunchLoaded(
          `/pages/admin/review-detail/index?id=${encodeURIComponent(review.id)}`,
        );
        data = await page.data();
        check('审核详情可读', !data.error);
        const headSize = await (await page.$('.info-head')).size();
        const idSize = await (await page.$('.info-kicker')).size();
        const tagSize = await (await page.$('.info-tag')).size();
        check('长报名编号与状态标签保持在卡片内', idSize.width + tagSize.width <= headSize.width, {
          headWidth: headSize.width,
          idWidth: idSize.width,
          tagWidth: tagSize.width,
        });
        await screenshot(miniProgram, '12-admin-review-detail.png');
      } else {
        result.blockers.push('缺少可访问审核记录');
      }
      page = await relaunchLoaded('/pages/admin/activity-edit/index');
      await screenshot(miniProgram, '13-create-activity.png');
      const publish = await page.$('.button--primary');
      if (publish) {
        await publish.tap();
        page = await waitLoaded(page.path, (value) => Boolean(value.formErrors?.title));
        data = await page.data();
        check(
          '空白发布表单显示标题错误且未创建活动',
          Boolean(data.formErrors?.title) && !data.id && !data.saving,
        );
        await screenshot(miniProgram, '14-create-validation.png');
      } else {
        check('空白发布表单主操作存在', false);
      }
      const expected = expandAppRoutes(appConfig);
      const visited = new Set(result.routes.map((route) => route.path));
      check(
        '全部 app.json 路由已采集运行截图',
        expected.every((route) => visited.has(route)),
        { expected: expected.length, visited: visited.size },
      );
    },
  });
  console.log(
    `SUMMARY version=${version} pass=${result.passed} fail=${result.failed} exceptions=${result.exceptions.length} output=${outputPath}`,
  );
  if (result.outcome !== 'passed') process.exitCode = result.outcome === 'blocked' ? 2 : 1;
}

main().catch((error) => {
  console.error(`E2E_FAILED ${error.stack || error}`);
  process.exitCode = 2;
});
