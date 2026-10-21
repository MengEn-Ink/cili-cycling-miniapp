// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { expandAppRoutes, type MiniProgramAppConfig } from './helpers/app-routes';

/**
 * 2026-10-19 · Pages 全套 App 原型契约（单俱乐部收敛）
 *
 * - 规划页面不得污染 17 条正式路由。
 * - 正式俱乐部中心使用标准 id `club/center`，并以单俱乐部主页为默认 mode。
 * - 全平台只有一个俱乐部；原型不得保留多俱乐部发现 / 推荐 / 申请加入 / 容量上限等入口。
 */
const read = (path: string) => readFileSync(path, 'utf8');
const appConfig = JSON.parse(read('miniprogram/app.json')) as MiniProgramAppConfig;
const appRoutes = expandAppRoutes(appConfig);
const schemaSource = read('docs/schema.js');
const templatesSource = read('docs/templates.js');
const appSource = read('docs/app.js');
const indexSource = read('docs/index.html');
const stylesSource = read('docs/styles.css');
const manifest = JSON.parse(read('docs/ui-sync-manifest.json'));

type Page = {
  id: string;
  path: string;
  title?: string;
  copy?: string;
  role?: string;
  states?: Array<[string, string]>;
};
type PlannedScreen = {
  id: string;
  status: string;
  code: string;
  role: string[];
  group: string;
  title: string;
  note: string;
};
type Runtime = {
  prototypeState?: string;
  prototypeActivityId?: string;
  prototypeData?: {
    pages?: Page[];
    rolesMatrix?: Array<{ key: string; scope: string; note: string }>;
    plannedScreens?: PlannedScreen[];
    experienceStats?: {
      canonicalRoutes?: number;
      schemaPageCount?: number;
      plannedP0?: number;
      plannedP1?: number;
      plannedTotal?: number;
      newStateVariants?: Record<string, string[]>;
    };
    clubCenterPrototype?: {
      viewer?: { roleToken?: string; roleLabel?: string };
    };
  };
  pageTemplates?: Record<string, () => string>;
};

const runtime: Runtime = {};
new Function('window', schemaSource)(runtime);
new Function('window', templatesSource)(runtime);
const data = runtime.prototypeData;
if (!data) throw new Error('schema.js runtime missing prototypeData');

const renderClubCenter = (state: string, roleToken = 'ADMIN') => {
  runtime.prototypeState = state;
  const viewer = data.clubCenterPrototype?.viewer;
  if (viewer) {
    viewer.roleToken = roleToken;
    viewer.roleLabel =
      roleToken === 'ADMIN' || roleToken === 'OWNER' || roleToken === 'CLUB_ADMIN'
        ? '平台管理员'
        : '骑友';
  }
  const template = runtime.pageTemplates?.['club/center'];
  if (!template) throw new Error('club/center template missing');
  return template();
};

const clubCenter = () => (data.pages ?? []).find((page) => page.id === 'club/center');

describe('Pages 全套 App 原型契约（单俱乐部收敛 · design-only 不污染正式路由）', () => {
  it('1. miniprogram/app.json 展开仍是 17 条正式运行路由', () => {
    expect(appRoutes).toHaveLength(17);
    expect(data.experienceStats?.canonicalRoutes).toBe(17);
  });

  it('2. docs/schema.js 的真实 pagePath 与 app.json 完全对齐', () => {
    const schemaRealPaths = (data.pages ?? [])
      .filter((page) => !page.path.startsWith('prototype/'))
      .map((page) => page.path)
      .sort();
    expect(schemaRealPaths).toEqual([...appRoutes].sort());
  });

  it('3. plannedScreens 保持 4 个 design-only 页面且不进入 app.json', () => {
    const planned = data.plannedScreens ?? [];
    expect(planned).toHaveLength(4);
    for (const screen of planned) {
      expect(['p0', 'p1']).toContain(screen.status);
      expect(screen.code).toMatch(/^设计规划/);
      const inferredPath = screen.code.replace(/^设计规划\s*·\s*新增\s*/, '').trim();
      if (inferredPath.startsWith('pages/')) {
        expect(appRoutes).not.toContain(inferredPath.replace(/\/\[[^\]]+\]/g, ''));
      }
    }
    // 单俱乐部收口：原 11 页 planned-club-* 已随多俱乐部语义一同下线。
    expect(planned.some((screen) => screen.id.startsWith('planned-club'))).toBe(false);
    expect(data.experienceStats?.plannedP0).toBe(3);
    expect(data.experienceStats?.plannedP1).toBe(1);
    expect(data.experienceStats?.plannedTotal).toBe(4);
  });

  it('4. schema 总计 21 个画面，并隔离 17 个正式路由与 4 个规划原型画面', () => {
    const pages = data.pages ?? [];
    const canonical = pages.filter((page) => !page.path.startsWith('prototype/'));
    const prototype = pages.filter((page) => page.path.startsWith('prototype/'));
    expect(pages).toHaveLength(21);
    expect(canonical).toHaveLength(17);
    expect(prototype).toHaveLength(4);
    expect(data.experienceStats?.schemaPageCount).toBe(21);
    expect(`${indexSource}\n${appSource}`).toContain('17 个正式路由 + 4 个规划原型 / 21 个画面');
  });

  it('5. rolesMatrix 覆盖 6 种角色，俱乐部角色不等同平台管理员', () => {
    const roles = data.rolesMatrix ?? [];
    expect(new Set(roles.map((role) => role.key))).toEqual(
      new Set(['PUBLIC', 'MEMBER', 'ORGANIZER', 'CLUB_ADMIN', 'OWNER', 'ADMIN']),
    );
    expect(roles.find((role) => role.key === 'ADMIN')?.scope).toBe('平台后台');
    for (const key of ['OWNER', 'CLUB_ADMIN', 'ORGANIZER']) {
      const role = roles.find((item) => item.key === key)!;
      expect(role.scope).toBe('俱乐部内部');
      expect(role.note).toMatch(/不是平台管理员/);
    }
  });

  it('5b. admin-* 正式路由 role 字段含“管理员”', () => {
    const adminPages = (data.pages ?? []).filter(
      (page) => page.id.startsWith('admin-') && page.path.startsWith('pages/admin/'),
    );
    expect(adminPages.length).toBeGreaterThanOrEqual(6);
    adminPages.forEach((page) => expect(page.role).toMatch(/管理员/));
  });

  it('6. club/center 正式路由 id 在 schema、manifest、templates、app 与 experienceStats 中一致', () => {
    expect(clubCenter()?.path).toBe('pages/club/center/index');
    expect((data.pages ?? []).some((page) => page.id === 'club-center')).toBe(false);
    expect(
      manifest.routes.find(
        (route: { pagePath: string }) => route.pagePath === 'pages/club/center/index',
      )?.id,
    ).toBe('club/center');
    expect(runtime.pageTemplates?.['club/center']).toBeTypeOf('function');
    expect(runtime.pageTemplates?.['club-center']).toBeUndefined();
    expect(data.experienceStats?.newStateVariants?.['club/center']).toEqual([
      'home',
      'manage',
      'loading',
      'error',
    ]);
    expect(appSource).toContain('payload.startsWith(`${id}/`)');
    expect(templatesSource).not.toContain('data-route="club-center"');
  });

  it('7. club/center schema 保留 home / empty / manage / loading / error', () => {
    const states = clubCenter()?.states?.map(([id]) => id);
    expect(states).toEqual(['home', 'empty', 'manage', 'loading', 'error']);
    expect(clubCenter()?.copy).toMatch(/封面只承担视觉表达[\s\S]*近期活动/);
  });

  it('7.1 旧多俱乐部状态统一回落到单俱乐部主页 home', () => {
    for (const obsolete of [
      'discovery',
      'detail',
      'pending-review',
      'withdraw-confirm',
      'withdrawing',
      'withdraw-error',
      'draft',
      'application-edit',
    ]) {
      const output = renderClubCenter(obsolete);
      expect(output).toContain('data-mode="home"');
      expect(output).not.toMatch(/推荐俱乐部|申请加入|撤回申请|保存草稿|重新提交审核/);
    }
  });

  it('8. home 直达俱乐部主页，以紧凑列表展示近期活动且不出现旧平台话术', () => {
    const output = renderClubCenter('home');
    expect(output).toContain('data-mode="home"');
    expect(output).toContain('近期活动');
    expect(output).toContain('club-event-list');
    expect(output.match(/class="club-event-row"/g)).toHaveLength(3);
    expect(output).not.toMatch(
      /全平台唯一|全网唯一|唯一俱乐部|推荐俱乐部|申请加入|退出俱乐部|成员名录|容量上限/,
    );
    expect(output).not.toContain('data-mode="discovery"');
    expect(output).not.toContain('data-mode="detail"');
    expect(output).toContain('更多 ›');
    expect(appSource).toContain('activityId: target.dataset.activityId');

    runtime.prototypeActivityId = 'club-ride-chaobaihe';
    runtime.prototypeState = 'open-public';
    const detail = runtime.pageTemplates?.['activity-detail']?.() || '';
    expect(detail).toContain('潮白河夜骑绕圈 · 3 圈');
    expect(detail).toContain('潮白河森林公园北门');
    expect(detail).toContain('12 / 20');
    expect(detail).toContain('剩余 8 个名额');
    runtime.prototypeActivityId = '';
    runtime.prototypeState = 'home';
  });

  it('9. home 对普通成员保持只读，对管理员提供低干扰的资料编辑入口', () => {
    const member = renderClubCenter('home', 'MEMBER');
    expect(member).not.toContain('编辑资料 ›');
    for (const role of ['ADMIN', 'OWNER', 'CLUB_ADMIN']) {
      const output = renderClubCenter('home', role);
      expect(output).toContain('编辑资料 ›');
      expect(output).toContain('data-state="manage"');
    }
  });

  it('10. manage 只允许管理员直达，并只提供名称、地区、简介与媒体裁剪上传', () => {
    const member = renderClubCenter('manage', 'MEMBER');
    expect(member).toContain('data-mode="home"');
    expect(member).not.toContain('保存资料');

    const output = renderClubCenter('manage', 'ADMIN');
    expect(output).toContain('data-mode="manage"');
    for (const term of ['俱乐部名称', '所在地区', '俱乐部简介']) {
      expect(output).toContain(term);
    }
    expect(output).toContain('俱乐部头像 · 1:1');
    expect(output).toContain('俱乐部背景图 · 16:9');
    expect(output).not.toMatch(
      /joinMode|申请加入|仅邀请|\+50|\+100|\+500|人数上限|全平台唯一|唯一俱乐部/,
    );
    expect(output).toContain('保存资料');
  });

  it('11. 正式 club/center 的全部 mode 均不渲染 tablist', () => {
    for (const mode of [
      'home',
      'manage',
      'discovery',
      'detail',
      'pending-review',
      'loading',
      'error',
    ]) {
      const output = renderClubCenter(mode);
      expect(output).not.toContain('role="tablist"');
      expect(output).not.toContain('role="tabpanel"');
    }
  });

  it('12. loading 与 error 是可恢复的独立状态，错误态提供重新加载', () => {
    expect(renderClubCenter('loading')).toContain('data-mode="loading"');
    const error = renderClubCenter('error');
    expect(error).toContain('data-mode="error"');
    expect(error).toContain('暂时没能打开俱乐部主页');
    expect(error).toContain('重新加载');
    expect(error).not.toContain('返回发现');
  });

  it('13. 单俱乐部收口：planned-club-* / 6 页 M0 组织审批原型已全部下线', () => {
    const pageIds = new Set((data.pages ?? []).map((page) => page.id));
    const plannedIds = new Set((data.plannedScreens ?? []).map((screen) => screen.id));
    const retired = [
      'planned-club-discover',
      'planned-club-home',
      'planned-club-member-home',
      'planned-club-join-form',
      'planned-club-cockpit',
      'planned-club-member-list',
      'planned-club-invite',
      'planned-club-join-reviews',
      'planned-club-join-review-detail',
      'planned-club-profile-edit',
      'planned-club-settings-danger',
      'org-overview',
      'activity-publish-target',
      'admin-approval-inbox',
      'approval-detail',
      'approval-outcome',
      'approval-exceptions',
    ];
    for (const id of retired) {
      expect(pageIds.has(id)).toBe(false);
      expect(plannedIds.has(id)).toBe(false);
    }
  });

  it('14. route-analysis 仍覆盖 no-waypoint/parse-fail', () => {
    const routeAnalysis = (data.pages ?? []).find((page) => page.id === 'route-analysis');
    const stateIds = new Set(routeAnalysis?.states?.map(([id]) => id));
    expect(stateIds.has('no-waypoint')).toBe(true);
    expect(stateIds.has('parse-fail')).toBe(true);
  });

  it('15. 旧三 tab、成员、活动与封面重试状态机样式已删除', () => {
    for (const selector of [
      '.club-center-tabs',
      '.club-center-tab',
      '.club-center-activity',
      '.club-center-members',
      '.club-center-cover-retry',
      '.club-center-more-menu',
    ]) {
      expect(stylesSource).not.toContain(selector);
    }
  });

  it('16. route-analysis 的降级状态保留剖面 DOM，重试会进入 loading', () => {
    const template = runtime.pageTemplates?.['route-analysis'];
    if (!template) throw new Error('route-analysis template missing');
    runtime.prototypeState = 'no-waypoint';
    const noWaypoint = template();
    expect(noWaypoint).toContain('data-profile-chart="no-waypoint"');
    expect(noWaypoint).toContain('class="ra-chart"');
    expect(noWaypoint).toContain('按剖面曲线自行判断强度');
    runtime.prototypeState = 'parse-fail';
    const parseFail = template();
    expect(parseFail).toContain('重试解析');
    expect(parseFail).toContain('data-route="route-analysis" data-state="loading"');
    expect(parseFail).not.toContain('正在重新解析 GPX');
  });

  it('17. 设置页同步活动通知、隐私管理与安全缓存清理，并保留确认边界', () => {
    const template = runtime.pageTemplates?.settings;
    if (!template) throw new Error('settings template missing');
    runtime.prototypeState = 'default';
    const output = template();
    for (const term of ['活动通知', '隐私管理', '清理缓存', '不会退出登录或删除业务数据']) {
      expect(output).toContain(term);
    }
    expect(output).toContain('data-action="settings-notifications"');
    expect(output).toContain('data-action="settings-privacy"');
    expect(output).toContain('data-action="settings-clear-cache"');
    expect(appSource).toContain('settings-confirm-clear-cache');
    expect(appSource).toContain('不会删除报名、行程或个人资料');
  });

  it('18. 活动编辑页对齐真实小程序：自动截止、不显示归属选择器、Strava-only 默认路线来源，无原型辅助文案', () => {
    const template = runtime.pageTemplates?.['admin-activity-edit'];
    if (!template) throw new Error('admin-activity-edit template missing');

    // 默认（公开报名）编辑态：报名截止自动化、报名模式唯一入口、Strava 链接是唯一可见路线来源，
    // 页面严禁出现「GPX / 上传 / 本地文件」等任何用户可见文案或控件。
    runtime.prototypeState = 'edit-open';
    const ready = template();
    expect(ready).toMatch(/活动开始日.{0,4}00:00/);
    expect(ready).not.toContain('选择截止日期');
    expect(ready).not.toContain('选择截止时间');
    expect(ready).toContain('公开报名');
    expect(ready).toContain('审批报名');
    // 活动归属：默认唯一俱乐部，不展示选择器、也不以任何说明性文案出现在页面内
    expect(ready).not.toContain('全平台唯一俱乐部');
    expect(ready).not.toContain('自动归属');
    expect(ready).not.toContain('activity-owner-field');
    expect(ready).not.toContain('此里公开活动');
    expect(ready).not.toContain('club-picker-value');
    // 不出现设计稿里的说明性 chip / 说明段 / 顶部状态提示
    expect(ready).not.toContain('查看公开模式');
    expect(ready).not.toContain('查看锁定态');
    expect(ready).not.toContain('输入中</button>');
    expect(ready).not.toContain('连接即将失效</button>');
    expect(ready).not.toContain('活动级设置');
    expect(ready).not.toContain('class="neutral-note"');
    expect(ready).not.toContain('deadline-auto-note');
    expect(ready).not.toMatch(/报名方式与唯一俱乐部归属相互独立/);
    expect(ready).not.toMatch(/活动一旦产生任意报名记录即锁定/);
    // Strava 链接是唯一可见的路线来源入口；GPX / 上传 / 本地文件默认都不可见
    expect(ready).toContain('粘贴 Strava 线路链接');
    expect(ready).toContain('线路已解析');
    expect(ready).not.toContain('GPX');
    expect(ready).not.toContain('本地路线文件');
    expect(ready).not.toContain('选择本地路线文件');
    expect(ready).not.toContain('上传 GPX');
    // route-boost-sheet 容器默认折叠
    expect(ready).not.toContain('id="route-boost-sheet"');
    expect(ready).not.toMatch(/更换\s*GPX|重新上传\s*GPX|重试解析已上传\s*GPX|GPX 解析失败/);
    // 「+」是隐藏增强入口：默认折叠，不展开 bottom-sheet
    expect(ready).toContain('class="route-link-plus"');
    expect(ready).toContain('aria-expanded="false"');
    expect(ready).not.toContain('class="route-boost-sheet"');

    // 点击「+」后进入 boost-open 状态，底部弹层「本地路线文件（补充）」才出现
    runtime.prototypeState = 'boost-open';
    const boost = template();
    expect(boost).toContain('class="route-boost-sheet"');
    expect(boost).toContain('id="route-boost-sheet"');
    expect(boost).toContain('本地路线文件（补充）');
    expect(boost).toContain('选择本地路线文件');
    expect(boost).toContain('aria-expanded="true"');

    // gpx-missing：弹层内保留原 GPX 恢复入口（本地文件补充路径）
    runtime.prototypeState = 'gpx-missing';
    const missing = template();
    expect(missing).toContain('class="route-boost-sheet"');
    expect(missing).toContain('原 GPX 路线详情不可用');
    expect(missing).toContain('重新上传 GPX');

    // gpx-failed：弹层内保留重试 / 放弃本次上传入口
    runtime.prototypeState = 'gpx-failed';
    const failed = template();
    expect(failed).toContain('class="route-boost-sheet"');
    expect(failed).toContain('GPX 解析失败');
    expect(failed).toContain('重试解析已上传 GPX');
    expect(failed).toContain('放弃本次上传');

    // Strava 链接解析细节交互覆盖：解析中 / 无效 / 网络失败 三态（无 is-typing 文案）
    runtime.prototypeState = 'link-parsing';
    const parsing = template();
    expect(parsing).toContain('正在解析线路信息');
    expect(parsing).toContain('is-parsing');

    runtime.prototypeState = 'link-invalid';
    const invalid = template();
    expect(invalid).toContain('这不是 Strava 线路链接');
    expect(invalid).toContain('is-error');

    runtime.prototypeState = 'link-net-error';
    const netError = template();
    expect(netError).toContain('网络异常');
    expect(netError).toContain('重试解析');

    // Strava 账号连接状态在创建页只做提示，不在页内连接（通过胶囊徽标体现）
    runtime.prototypeState = 'strava-expiring';
    const expiring = template();
    expect(expiring).toContain('即将失效');

    runtime.prototypeState = 'strava-expired';
    const expired = template();
    expect(expired).toContain('已失效');

    // 报名模式切换：mode-locked 态锁定按钮，但不再以文字额外解释
    runtime.prototypeState = 'mode-locked';
    const locked = template();
    expect(locked).toContain('aria-disabled="true"');
    expect(locked).not.toContain('已有报名 · 禁止切换');
    expect(locked).not.toContain('报名模式已锁定');
  });

  it('19. manifest 正式 routes 不含 planned-* 且仍为 17 条', () => {
    const ids = new Set(manifest.routes.map((route: { id: string }) => route.id));
    (data.plannedScreens ?? []).forEach((screen) => expect(ids.has(screen.id)).toBe(false));
    expect(manifest.routes).toHaveLength(17);
  });
});
