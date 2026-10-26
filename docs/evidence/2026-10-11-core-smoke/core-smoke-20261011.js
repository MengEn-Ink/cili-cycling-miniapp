// 2026-10-11 13:15 定时对齐：当前 main(608590d，对应开发版 0.0.119.1) 核心流程只读 smoke
// 覆盖：N3 首页日期分组、N8 发布人数据、N2 详情分享契约、N6 管理列表滑动删除结构、
//       N1/N10 创建三层必填拦截、N4 资料必填拦截、主要页面无运行态异常
// 不发布、不删除、不写入任何线上数据（保存路径均在前端校验层被拦截）。
const path = require('node:path');
const fs = require('node:fs');
const automator = require('miniprogram-automator');

const cliPath = '/Applications/wechatwebdevtools.app/Contents/MacOS/cli';
const projectPath = path.join(process.env.HOME, 'cili-deploy-workspace/cili-cycling-miniapp');
const out = '/private/tmp/aime-agent-shared-dir/69394ef5e88d/core-smoke-results';
fs.mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const result = { startedAt: new Date().toISOString(), git: '608590d', version: '0.0.119.1', checks: [], exceptions: [] };
function check(name, ok, detail) {
  result.checks.push({ name, ok: !!ok, detail: detail === undefined ? null : detail });
  console.log((ok ? 'PASS ' : 'FAIL ') + name + ' ' + JSON.stringify(detail ?? {}));
}
const shot = (mp, file) => mp.screenshot({ path: path.join(out, file) }).catch((e) => console.log('SCREENSHOT-SKIP ' + file + ' ' + e.message));

(async () => {
  const mp = await automator.launch({ cliPath, projectPath, launchTimeout: 180000 });
  mp.on('exception', (e) => {
    result.exceptions.push(e);
    console.log('RUNTIME-EXCEPTION ' + JSON.stringify(e));
  });
  try {
    await sleep(4000);

    // 1) 首页：加载、卡片宿主、日期分组/快捷 chip、发布人（N3/N8）
    let page = await mp.reLaunch('/pages/activities/index');
    await sleep(6000);
    let d = await page.data();
    const itemCount = Array.isArray(d.items) ? d.items.length : 0;
    const hosts = await page.$$('activity-card');
    const heads = await page.$$('.day-group-head');
    const chips = await page.$$('.day-chip');
    const headerRows = Array.isArray(d.rows) ? d.rows.filter((r) => r.kind === 'header').length : 0;
    const itemRows = Array.isArray(d.rows) ? d.rows.filter((r) => r.kind !== 'header').length : 0;
    check('home-loads-no-error', !d.error, { view: d.view, loading: d.loading, error: d.error || null });
    check('home-items-and-cards', itemCount > 0 && hosts.length === itemCount && itemRows === itemCount, { items: itemCount, cardHosts: hosts.length, itemRows });
    check('home-day-group-headers', headerRows >= 1 && heads.length === headerRows, { headerRows, renderedHeads: heads.length });
    const expectedChips = d.dayChips && d.dayChips.length > 1 ? d.dayChips.length : 0;
    check('home-day-chips-gating', chips.length === expectedChips, { dayChips: d.dayChips ? d.dayChips.length : 0, renderedChips: chips.length });
    const headLabels = await Promise.all(heads.slice(0, 4).map((el) => el.text().catch(() => null)));
    const chipLabels = await Promise.all(chips.slice(0, 6).map((el) => el.text().catch(() => null)));
    const first = itemCount ? d.items[0] : null;
    check('home-publisher-dto', !!first && !!first.publisher && !!first.publisher.nickname, {
      publisher: first && first.publisher ? { nickname: first.publisher.nickname, hasAvatar: !!first.publisher.avatarUrl } : null,
    });
    let pubDomText = null;
    if (hosts.length) {
      const pubEl = await hosts[0].$('.publisher-name').catch(() => null);
      if (pubEl) pubDomText = await pubEl.text().catch(() => null);
    }
    result.home = { items: itemCount, headerRows, groupHeadLabels: headLabels, chips: chips.length, chipLabels, publisherData: first && first.publisher, publisherDom: pubDomText };
    await shot(mp, '01-home.png');

    // 2) 活动详情：分享好友/朋友圈契约（N2）
    if (first && first.id) {
      page = await mp.reLaunch('/pages/activity-detail/index?id=' + encodeURIComponent(first.id));
      await sleep(3000);
      let share = null;
      let timeline = null;
      try { share = await page.callMethod('onShareAppMessage'); } catch (e) { share = { error: String(e) }; }
      try { timeline = await page.callMethod('onShareTimeline'); } catch (e) { timeline = { error: String(e) }; }
      check('detail-share-friend-contract', !!(share && share.title && share.path && !share.error), { hasTitle: !!share && !!share.title, hasPath: !!share && !!share.path, hasImageUrl: !!share && !!share.imageUrl, title: share && share.title });
      check('detail-share-timeline-contract', !!(timeline && timeline.title && !timeline.error), { hasTitle: !!timeline && !!timeline.title, query: timeline && timeline.query });
      result.detailPath = page.path;
      await shot(mp, '02-detail.png');
    } else {
      check('detail-share-friend-contract', false, { reason: '首页无活动数据' });
      check('detail-share-timeline-contract', false, { reason: '首页无活动数据' });
    }

    // 3) 管理列表：滑动删除结构与数据一致（N6）
    page = await mp.reLaunch('/pages/admin/activity-list/index');
    await sleep(4000);
    d = await page.data();
    const rows = await page.$$('.swipe-row');
    const delBtns = await page.$$('.swipe-delete');
    check('admin-list-loads', !d.error, { allowed: d.allowed, isAdmin: d.isAdmin, items: d.items ? d.items.length : null, error: d.error || null });
    check('admin-swipe-rows-match-items', rows.length === (d.items ? d.items.length : -1), { swipeRows: rows.length, items: d.items ? d.items.length : null });
    check('admin-delete-buttons-present', delBtns.length > 0, { deleteButtons: delBtns.length });
    await shot(mp, '03-admin-list.png');

    // 4) 创建活动：空标题→填标题缺日期→有日期缺时间，三层拦截（N1/N10，不触达云端）
    page = await mp.reLaunch('/pages/admin/activity-edit/index');
    await sleep(3000);
    await page.callMethod('save', { currentTarget: { dataset: { status: 'draft' } } });
    await sleep(600);
    d = await page.data();
    check('create-empty-title-blocks', d.error === '请输入活动标题', { error: d.error, formErrors: d.formErrors });
    await page.setData({ 'form.title': 'SMOKE 不会保存' });
    await page.callMethod('save', { currentTarget: { dataset: { status: 'draft' } } });
    await sleep(500);
    d = await page.data();
    check('create-missing-date-blocks', d.error === '请选择集合日期', { error: d.error });
    await page.setData({ 'form.startDate': '2026-10-20' });
    await page.callMethod('save', { currentTarget: { dataset: { status: 'draft' } } });
    await sleep(500);
    d = await page.data();
    check('create-missing-time-blocks', d.error === '请选择集合时间', { error: d.error });
    await shot(mp, '04-create-validation.png');

    // 5) 资料编辑：必填拦截（N4），清空性别后保存必须被拦
    page = await mp.reLaunch('/pages/profile-edit/index');
    await sleep(4000);
    d = await page.data();
    if (d && d.p) {
      await page.setData({ 'p.gender': '' });
      await page.callMethod('save');
      await sleep(800);
      d = await page.data();
      check('profile-gender-required-blocks', typeof d.error === 'string' && d.error.length > 0, { error: d.error });
      await shot(mp, '05-profile-edit.png');
    } else {
      check('profile-gender-required-blocks', false, { reason: '资料未加载（可能未登录）', keys: Object.keys(d || {}) });
    }

    // 6) 其余主要页面可达且无异常
    const targets = ['/pages/registrations/index', '/pages/profile/index', '/pages/settings/index'];
    for (const t of targets) {
      page = await mp.reLaunch(t);
      await sleep(2400);
      d = await page.data();
      check('nav-' + t, page.path != null, { path: page.path, error: d.error || null });
    }
    await shot(mp, '06-settings.png');
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
