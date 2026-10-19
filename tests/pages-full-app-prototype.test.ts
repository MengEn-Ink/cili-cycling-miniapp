// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { expandAppRoutes, type MiniProgramAppConfig } from './helpers/app-routes';

/**
 * 2026-10-18 · Pages 全套 App 原型契约
 *
 * 规划页面不得污染 17 条正式路由；正式俱乐部中心必须使用标准 id
 * club/center，并与生产保持单路由 mode-based 能力边界。
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

const renderClubCenter = (state: string, roleToken = 'OWNER') => {
  runtime.prototypeState = state;
  const viewer = data.clubCenterPrototype?.viewer;
  if (viewer) {
    viewer.roleToken = roleToken;
    viewer.roleLabel =
      roleToken === 'OWNER' ? '负责人' : roleToken === 'CLUB_ADMIN' ? '管理员' : '普通成员';
  }
  const template = runtime.pageTemplates?.['club/center'];
  if (!template) throw new Error('club/center template missing');
  return template();
};

const clubCenter = () => (data.pages ?? []).find((page) => page.id === 'club/center');

describe('Pages 全套 App 原型契约（design-only 不污染正式路由）', () => {
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

  it('3. plannedScreens 保持 15 个 design-only 页面且不进入 app.json', () => {
    const planned = data.plannedScreens ?? [];
    expect(planned).toHaveLength(15);
    for (const screen of planned) {
      expect(['p0', 'p1']).toContain(screen.status);
      expect(screen.code).toMatch(/^设计规划/);
      const inferredPath = screen.code.replace(/^设计规划\s*·\s*新增\s*/, '').trim();
      if (inferredPath.startsWith('pages/')) {
        expect(appRoutes).not.toContain(inferredPath.replace(/\/\[[^\]]+\]/g, ''));
      }
    }
    expect(data.experienceStats?.plannedP0).toBe(11);
    expect(data.experienceStats?.plannedP1).toBe(4);
    expect(data.experienceStats?.plannedTotal).toBe(15);
  });

  it('4. schema 总计 40 个画面，并隔离 17 个正式路由与 23 个原型画面', () => {
    const pages = data.pages ?? [];
    const canonical = pages.filter((page) => !page.path.startsWith('prototype/'));
    const prototype = pages.filter((page) => page.path.startsWith('prototype/'));
    expect(pages).toHaveLength(40);
    expect(canonical).toHaveLength(17);
    expect(prototype).toHaveLength(23);
    expect(data.experienceStats?.schemaPageCount).toBe(40);
    expect(`${indexSource}\n${appSource}`).toContain('17 个正式路由 + 23 个原型 / 40 个画面');
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

  it('5. admin-* 正式路由 role 字段含“管理员”', () => {
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
      'discovery',
      'detail',
      'manage',
      'pending-review',
      'withdraw-confirm',
      'withdrawing',
      'withdraw-error',
      'draft',
      'application-edit',
      'loading',
      'error',
    ]);
    expect(appSource).toContain('payload.startsWith(`${id}/`)');
    expect(templatesSource).not.toContain('data-route="club-center"');
  });

  it('7. club/center schema 包含管理与创建申请撤回的 mode', () => {
    const states = clubCenter()?.states?.map(([id]) => id);
    expect(states).toEqual([
      'discovery',
      'detail',
      'manage',
      'pending-review',
      'withdraw-confirm',
      'withdrawing',
      'withdraw-error',
      'draft',
      'application-edit',
      'loading',
      'error',
    ]);
    expect(clubCenter()?.copy).toMatch(/单路由 mode-based/);
  });

  it('7.1 创建申请撤回原型覆盖入口、确认、处理中、失败与回草稿', () => {
    const pending = renderClubCenter('pending-review');
    expect(pending).toContain('撤回申请');
    expect(pending).toContain('data-state="withdraw-confirm"');
    const confirmation = renderClubCenter('withdraw-confirm');
    expect(confirmation).toContain('确认撤回');
    expect(confirmation).toContain('data-state="withdrawing"');
    const withdrawing = renderClubCenter('withdrawing');
    expect(withdrawing).toContain('正在撤回');
    expect(withdrawing).toContain('disabled aria-disabled="true"');
    expect(renderClubCenter('withdraw-error')).toContain('撤回失败，申请仍在审核中；请重试');
    const draft = renderClubCenter('draft');
    expect(draft).toContain('进入草稿继续编辑');
    expect(draft).toContain('data-state="application-edit"');
    expect(draft).not.toContain('data-state="manage"');
    const applicationEdit = renderClubCenter('application-edit');
    expect(applicationEdit).toContain('data-mode="application-edit"');
    expect(applicationEdit).toContain('申请基本资料');
    expect(applicationEdit).toContain('保存草稿');
    expect(applicationEdit).toContain('重新提交审核');
    expect(applicationEdit).not.toContain('负责人管理模式');
  });

  it('8. discovery 过滤已加入俱乐部，并把推荐详情保持 disabled', () => {
    const output = renderClubCenter('discovery');
    expect(output).toContain('data-mode="discovery"');
    expect(output).toContain('已过滤已加入俱乐部');
    expect(output).toContain('推荐俱乐部 · 未加入');
    expect(output).toContain('申请加入');
    expect(output).toContain('原型示意，尚未提交或写入');
    expect(output).toMatch(/disabled[^>]*aria-disabled="true"|aria-disabled="true"[^>]*disabled/);
    expect(output).toContain('查看详情 · 暂不可用');
    expect(output).toContain('data-route="club/center" data-state="detail"');
  });

  it('9. detail 只展示本人/已加入详情、当前成员数与容量，不冒充成员名录或活动页', () => {
    const output = renderClubCenter('detail');
    expect(output).toContain('data-mode="detail"');
    expect(output).toContain('本人 / 已加入俱乐部详情');
    expect(output).toContain('当前成员数');
    expect(output).toContain('容量');
    expect(output).toContain('生产尚无独立成员名录');
    expect(output).not.toContain('club-center-members-list');
    expect(output).not.toContain('club-center-activity');
  });

  it('10. detail 仅向 OWNER / CLUB_ADMIN 提供管理入口，MEMBER 保持只读', () => {
    for (const role of ['OWNER', 'CLUB_ADMIN']) {
      const output = renderClubCenter('detail', role);
      expect(output).toContain('编辑俱乐部资料');
      expect(output).toContain('data-state="manage"');
      expect(output).toContain(`权限：${role} 可维护`);
    }
    const member = renderClubCenter('detail', 'MEMBER');
    expect(member).toContain('普通 MEMBER 仅可查看');
    expect(member).toContain('管理入口仅对 OWNER / CLUB_ADMIN 开放');
    expect(member).not.toContain('编辑俱乐部资料');
    expect(member).not.toContain('data-state="manage"');
  });

  it('11. manage 覆盖资料、joinMode、固定容量增量和分离媒体裁剪上传', () => {
    const output = renderClubCenter('manage');
    expect(output).toContain('data-mode="manage"');
    for (const term of ['名称', '城市', '简介', 'joinMode', '+50', '+100', '+500']) {
      expect(output).toContain(term);
    }
    expect(output).toContain('俱乐部头像 · 1:1');
    expect(output).toContain('俱乐部封面 · 16:9');
    expect(output).toContain('分别选择、分别裁剪、分别上传');
  });

  it('11. 正式 club/center 的全部 mode 均不渲染 tablist', () => {
    for (const mode of [
      'discovery',
      'detail',
      'manage',
      'pending-review',
      'withdraw-confirm',
      'withdrawing',
      'withdraw-error',
      'draft',
      'application-edit',
      'loading',
      'error',
    ]) {
      const output = renderClubCenter(mode);
      expect(output).not.toContain('role="tablist"');
      expect(output).not.toContain('role="tabpanel"');
    }
  });

  it('12. loading 与 error 是可恢复的独立状态', () => {
    expect(renderClubCenter('loading')).toContain('data-mode="loading"');
    const error = renderClubCenter('error');
    expect(error).toContain('data-mode="error"');
    expect(error).toContain('俱乐部中心加载失败');
    expect(error).toContain('重新加载');
    expect(error).toContain('返回发现');
  });

  it('13. 三个俱乐部 planned 页面准确表达增量边界', () => {
    const planned = new Map((data.plannedScreens ?? []).map((screen) => [screen.id, screen]));
    expect(planned.get('planned-club-discover')?.note).toMatch(/已有.*推荐列表.*独立页/u);
    expect(planned.get('planned-club-home')?.note).toMatch(/已支持本人.*完整访客链路/u);
    expect(planned.get('planned-club-profile-edit')?.note).toMatch(/已支持.*高级编辑增强/u);
    expect(planned.get('planned-club-home')?.note).toMatch(/推荐详情目前仍不可用/u);
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

  it('17. manifest 正式 routes 不含 planned-* 且仍为 17 条', () => {
    const ids = new Set(manifest.routes.map((route: { id: string }) => route.id));
    (data.plannedScreens ?? []).forEach((screen) => expect(ids.has(screen.id)).toBe(false));
    expect(manifest.routes).toHaveLength(17);
  });
});
