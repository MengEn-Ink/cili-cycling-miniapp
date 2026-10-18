// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { expandAppRoutes, type MiniProgramAppConfig } from './helpers/app-routes';

const read = (path: string) => readFileSync(path, 'utf8');
const appConfig = JSON.parse(read('miniprogram/app.json')) as MiniProgramAppConfig;
const appRoutes = expandAppRoutes(appConfig);
const html = read('docs/index.html');
const css = read('docs/styles.css');
const script = read('docs/app.js');
const schema = read('docs/schema.js');
const deliveryCenter = read('docs/delivery-center.js');
const routeAnalysisDataPlatformPlan = read('docs/route-analysis-data-platform-plan.md');
const routeAnalysisDataFoundationArticle = read(
  'docs/articles/route-analysis-data-foundation.html',
);
const uiDesignSystem = read('docs/ui-design-system.html');
const designSystemIndex = read('docs/design-system.md');
const designChecklist = read('docs/ui-design-checklist.md');
const executableDesignSpec = read('DESIGN.md');
const templates = read('docs/templates.js');

type PrototypeRuntime = {
  prototypeData?: Record<string, any>;
  prototypeState?: string;
  pageTemplates?: Record<string, () => string>;
};
const createPrototypeRuntime = (mutate?: (data: Record<string, any>) => void): PrototypeRuntime => {
  const runtime: PrototypeRuntime = {};
  new Function('window', schema)(runtime);
  if (!runtime.prototypeData) throw new Error('Missing prototype data');
  mutate?.(runtime.prototypeData);
  new Function('window', templates)(runtime);
  return runtime;
};
const prototypeRuntime = createPrototypeRuntime();
const renderPrototypeState = (route: string, state: string) => {
  prototypeRuntime.prototypeState = state;
  const template = prototypeRuntime.pageTemplates?.[route];
  if (!template) throw new Error(`Missing prototype template: ${route}`);
  return template();
};
const renderFromRuntime = (runtime: PrototypeRuntime, route: string, state = '') => {
  runtime.prototypeState = state;
  const template = runtime.pageTemplates?.[route];
  if (!template) throw new Error(`Missing prototype template: ${route}`);
  return template();
};

const prototypeRoutes = [
  'activities',
  'activity-detail',
  'route-analysis',
  'registration-form',
  'registrations',
  'credential',
  'profile',
  'club-center',
  'settings',
  'capability-card',
  'profile-edit',
  'admin-activity-list',
  'admin-activity-edit',
  'admin-reviews',
  'admin-review-detail',
  'admin-club-applications',
  'admin-club-application-detail',
];

// M0 组织地基与审批 prototype-only 页面：
// 不进入 miniprogram/app.json，仅在 docs 原型内呈现设计表达。
const orgApprovalPrototypeRoutes = [
  'org-overview',
  'club-applications',
  'club-application-edit',
  'activity-publish-target',
  'admin-approval-inbox',
  'approval-detail',
  'approval-outcome',
  'approval-exceptions',
];

const routeToPagePath = (route: string) =>
  route === 'club-center'
    ? 'pages/club/center/index'
    : route.startsWith('admin-')
      ? `pages/admin/${route.replace('admin-', '')}/index`
      : `pages/${route}/index`;

describe('GitHub Pages 全页面高保真原型门禁', () => {
  it('与 app.json 的 17 个可达页面逐一对应，官方路线页 route-view 不进入原型', () => {
    expect(prototypeRoutes).toHaveLength(17);
    // route-view 由 #210 从 app.json 删除；新增完整路线分析页同步进入原型。
    expect(prototypeRoutes.map(routeToPagePath)).toEqual(
      expect.arrayContaining(appRoutes.filter((page) => page !== 'pages/route-view/index')),
    );
    for (const route of prototypeRoutes) {
      expect(schema).toContain(`id: '${route}'`);
      expect(schema).toContain(`path: '${routeToPagePath(route)}'`);
      expect(templates).toMatch(new RegExp(`(?:^|\\n)    ['"]?${route}['"]?: \\(\\) =>`));
    }
    expect(schema).not.toContain("id: 'route-view'");
    expect(templates).not.toMatch(/['"]?route-view['"]?: \(\) =>/);
    expect(html).toContain('17 个真实页面原型 + 8 页组织地基与审批演进原型');
  });

  it('M0 组织地基与审批原型以 prototype-only 页面接入，不污染 app.json 真实路由', () => {
    expect(orgApprovalPrototypeRoutes).toHaveLength(8);
    for (const route of orgApprovalPrototypeRoutes) {
      expect(schema).toContain(`id: '${route}'`);
      expect(schema).toContain(`path: 'prototype/${route}'`);
      expect(schema).toContain("group: '组织地基与审批（M0 待实施）'");
      expect(templates).toMatch(new RegExp(`(?:^|\\n)    ['"]?${route}['"]?: \\(\\) =>`));
      // prototype-only 路由不得在 app.json pages 中出现
      expect(appConfig.pages).not.toContain(routeToPagePath(route));
    }
    expect(script).toContain("'org-approval': 'org-overview'");
    expect(html).toContain('data-journey="org-approval"');
    expect(html).toContain('组织地基与审批（M0 待实施）');
    // 关键状态锚点：俱乐部申请状态机、角色/目标矩阵、异常
    for (const state of [
      "'pending_review'",
      "'name-conflict'",
      "'submit-confirm'",
      "'admin-club'",
      "'admin-public'",
      "'platform-public'",
      "'admin-club-activity'",
      "'platform-public-activity'",
      "'role-auto'",
      "'platform-owner-public'",
      "'club-suspended'",
      "'role-expired'",
      "'version-expired'",
      "'already-processed'",
    ]) {
      expect(schema).toContain(`[${state},`);
    }
    // 关键文案锚点：审批模式、必填说明、服务端判权、俱乐部停用处置
    for (const copy of [
      'role_auto_publish',
      'review_version',
      '平台所有者审批后创建正式俱乐部',
      '非成员不能向俱乐部投稿',
      '平台所有者本人公开活动需显式',
      '俱乐部已停用',
      '版本已过期',
      '已被他人处理',
      '审批不设置自动超时',
    ]) {
      expect([schema, templates, script].join('\n')).toContain(copy);
    }
    // 交付中心入口直达 M0 原型
    expect(deliveryCenter).toContain('组织地基与发布审批（俱乐部创建已实现 · 活动审批仍为原型）');
    expect(deliveryCenter).toContain("href: '#org-overview'");
  });

  it('普通成员提交后按 club/public 进入各自 pending_review，而不是人工审批通过', () => {
    expect(schema).toContain("['pending-club', '俱乐部活动提交成功 · pending_review']");
    expect(schema).toContain("['pending-public', '公开活动提交成功 · pending_review']");
    expect(script).toContain('const pendingState = target.dataset.pendingState');
    expect(templates).toContain('data-pending-state="pending-club--${info.clubEligible}"');
    expect(templates).toContain('data-pending-state="pending-public"');
    expect(templates).toContain("afterStatus: 'pending_review'");
  });

  it('pending 结果态不提供活动链接，只有已发布分支可以复制', () => {
    expect(templates).toContain("fixedBar('审批通过前活动链接不可用'");
    expect(templates).toContain("btn('查看审核进度'");
    expect(templates).toMatch(
      /pending\s*\? fixedBar\('审批通过前活动链接不可用'[\s\S]+?: fixedBar\('', \[btn\('复制活动链接'/,
    );
  });

  it('俱乐部申请新建态使用同源示例数据，并保留不可提交的必填错误演示', () => {
    expect(schema).toContain("['create', '新建（示例数据已填好）']");
    expect(templates).toContain('const example = {');
    expect(templates).toContain('与表单完全一致的静态原型示例数据');
    expect(templates).toContain("['名称', example.name]");
    expect(templates).toContain("input(error ? '' : example.city");
    expect(templates).toContain("error ? btn('请先补全必填项', 'disabled'");
  });

  it('我的俱乐部申请将 all 与真实 empty 分离，all 展示完整列表', () => {
    expect(schema).toContain("['all', '全部申请']");
    expect(schema).toContain("['empty', '真实空数据']");
    expect(templates).toContain("const activeFilter = filterOrder.includes(st()) ? st() : 'all'");
    expect(templates).toContain("['全部', 'all', 4]");
    expect(templates).toContain("const emptyState = activeFilter === 'empty'");
  });

  it('俱乐部管理员可选择公开活动，但必须进入平台所有者审核', () => {
    expect(schema).toContain("['admin-public', '俱乐部管理员 · 公开活动（平台审核）']");
    expect(templates).toContain("'admin-public': { role: 'ADMIN', target: 'public'");
    expect(templates).toContain('俱乐部管理员发起公开活动不享有直发权限');
    expect(templates).toContain("info.role === 'ADMIN' ? 'admin-public' : 'member-public'");
    expect(templates).toContain("primaryBtn = btn('提交平台审核'");
  });

  it('俱乐部选择会写入 club ID 并重新计算选中态和资格', () => {
    expect(templates).toContain("const [stateId, selectedClubFromState] = rawState.split('--')");
    expect(templates).toContain(
      'const selectedClubId = selectedClubFromState || baseInfo.defaultClubId',
    );
    expect(templates).toContain('const selected = c.id === selectedClubId');
    expect(templates).toContain('data-state="${stateId}--${c.id}"');
    expect(templates).toContain('所选俱乐部已停用，不能提交或直接发布');
    expect(templates).toContain("primaryBtn = btn('无权发起', 'disabled'");
  });

  it('待办进入详情携带审批对象类型、ID 和版本，并动态展示匹配快照', () => {
    expect(schema).toContain("id: 'activity-201'");
    expect(schema).toContain("id: 'application-801'");
    expect(schema).toContain("id: 'public-901'");
    expect(templates).toContain('data-state="${item.kind}-${item.version}--${item.id}"');
    expect(templates).toContain("const stateParts = rawState.split('--')");
    expect(templates).toContain('const matchedItem = reviewItems.find');
    expect(templates).toContain("['审批对象 ID', item.id]");
    expect(templates).toContain("['review_version', item.version]");
  });

  it('平台所有者的俱乐部申请和公开活动进入各自类型详情', () => {
    expect(schema).toContain("['club-application-v1', '俱乐部申请 v1']");
    expect(schema).toContain("['public-activity-v1', '公开活动 v1']");
    expect(templates).toContain("item.kind === 'club-application'");
    expect(templates).toContain("? { label: '俱乐部申请', scope: 'platform'");
    expect(templates).toContain("item.kind === 'public-activity'");
    expect(templates).toContain("? { label: '公开活动', scope: 'public'");
    expect(templates).toContain('${item.submitter} 的${typeInfo.label}审批 · ${item.version}');
  });

  it('pending club/public 明确展示目标、scope 和审批角色', () => {
    expect(templates).toContain("reviewScope: pendingClub ? 'club' : 'public'");
    expect(templates).toContain('reviewTargetId: pendingTargetId');
    expect(templates).toContain("pendingClub ? '等待 OWNER / ADMIN' : '等待 PLATFORM_OWNER'");
    expect(templates).not.toContain("reviewScope: 'club / public（按提交目标）'");
  });

  it('管理待办显式切换角色视角，并禁用当前角色无权限的标签', () => {
    expect(schema).toContain("['admin-club-activity', '俱乐部管理员 · 俱乐部活动待办']");
    expect(schema).toContain("['platform-club-application', '平台所有者 · 俱乐部申请待办']");
    expect(templates).toContain('切换待办身份视角（显式操作）');
    expect(templates).toContain('切换标签不会改变身份');
    expect(templates).toContain(
      "['club-activity', '俱乐部活动', counts.clubActivity, !platformView",
    );
    expect(templates).toContain(
      "['club-application', '俱乐部申请', counts.clubApplication, platformView",
    );
    expect(templates).toContain('disabled aria-disabled="true" title="${reason}"');
  });

  it('两类驳回每次都从 textarea 读取非空理由，不以状态或点击次数绕过', () => {
    expect(templates).toContain('id="registration-reject-reason"');
    expect(templates).toContain('id="org-reject-reason"');
    expect(script).toContain("document.getElementById('registration-reject-reason')?.value.trim()");
    expect(script).toContain("document.getElementById('org-reject-reason')?.value.trim()");
    expect(script).not.toContain("currentState !== 'reject-error'");
    expect(templates).toContain('重复点击不会绕过校验');
  });

  it('role_auto_publish 审计明确记录 approved_by = created_by', () => {
    expect(schema).toContain("createdBy: '风向骑手（OWNER）'");
    expect(schema).toContain("approvedBy: '风向骑手（OWNER）'");
    expect(templates).toContain("['created_by', auditPayload.createdBy || auditPayload.actor]");
    expect(templates).toContain('created_by: auditPayload.createdBy || auditPayload.actor');
    expect(templates).toContain('approved_by: auditPayload.approvedBy');
  });

  it('实际执行 showPage 状态归一逻辑：动态后缀保留，静态与非法状态行为不变', () => {
    const source = script.match(/function normalizePrototypeState\([\s\S]*?\n {2}\}/)?.[0];
    expect(source).toBeDefined();
    const normalize = new Function(`${source}; return normalizePrototypeState;`)() as (
      stateIds: string[],
      requestedState?: string,
    ) => string;
    expect(
      normalize(
        ['club-activity-v1', 'club-application-v1', 'public-activity-v1'],
        'club-application-v1--application-801',
      ),
    ).toBe('club-application-v1--application-801');
    expect(normalize(['pending-club', 'pending-public'], 'pending-club--club-0023')).toBe(
      'pending-club--club-0023',
    );
    expect(normalize(['manual', 'rejected'], 'manual')).toBe('manual');
    expect(normalize(['manual', 'rejected'], 'unknown--id')).toBe('manual');
    expect(normalize(['manual', 'rejected'])).toBe('manual');
    expect(script).toContain('currentState = normalizePrototypeState(stateIds, options.state)');
    expect(script).toContain('`#${page.id}/${currentState}`');
  });

  it('审批详情与结果模板实际按对象上下文渲染操作、标题和审计', () => {
    const applicationDetail = renderPrototypeState(
      'approval-detail',
      'club-application-v1--application-801',
    );
    expect(applicationDetail).toContain('通过并创建俱乐部');
    expect(applicationDetail).toContain(
      'data-outcome-context="club-application-v1--application-801"',
    );

    const applicationApproved = renderPrototypeState(
      'approval-outcome',
      'manual--club-application-v1--application-801',
    );
    expect(applicationApproved).toContain('申请已通过并创建俱乐部');
    expect(applicationApproved).toContain('review_scope');
    expect(applicationApproved).toContain('platform-owner');
    expect(applicationApproved).toContain('application-801');
    expect(applicationApproved).toContain('v1');

    const publicApproved = renderPrototypeState(
      'approval-outcome',
      'manual--public-activity-v1--public-901',
    );
    expect(publicApproved).toContain('公开活动已通过并发布');
    expect(publicApproved).toContain('public-901');

    const clubApproved = renderPrototypeState(
      'approval-outcome',
      'manual--club-activity-v2--activity-201',
    );
    expect(clubApproved).toContain('俱乐部活动已通过并发布');
    expect(clubApproved).toContain('activity-201');

    const publicRejected = renderPrototypeState(
      'approval-outcome',
      'rejected--public-activity-v1--public-901',
    );
    expect(publicRejected).toContain('公开活动已驳回');
    expect(publicRejected).toContain('review_target_id');
    expect(templates).toContain('modeTitle = `${audit.actor} 的审批请求被驳回`');
    expect(templates).not.toContain("replace('MEMBER', 'MEMBER')");
    expect(publicRejected).toContain('public-901');
  });

  it('五个身份原型实际渲染当前资料、公开兜底、成行快照和单/多/无俱乐部状态', () => {
    const activitiesPage = renderPrototypeState('activities', 'default');
    expect(activitiesPage).toContain('aria-label="周日纯化骑行头像"');
    expect(activitiesPage).toContain('周日纯化');
    expect(activitiesPage).toContain('此里公开活动');

    const detailPage = renderPrototypeState('activity-detail', 'approved');
    expect(detailPage).toContain('class="card host-card host-card-club"');
    expect(detailPage).toContain('周日纯化骑行');
    expect(detailPage).toContain('活动列表与详情优先使用当前俱乐部资料');

    const publicDetailRuntime = createPrototypeRuntime((data) => {
      data.activities = [data.activities[1], data.activities[0]];
    });
    const publicDetail = renderFromRuntime(publicDetailRuntime, 'activity-detail', 'open');
    expect(publicDetail).toContain('class="card host-card host-card-public"');
    expect(publicDetail).toContain('此里公开活动');

    const registrationsPage = renderPrototypeState('registrations', 'default');
    expect(registrationsPage).toContain('浦东滨江夜骑 · 鎏金落日线');
    expect(registrationsPage).toContain('望京巡游骑行俱乐部');
    expect(registrationsPage).toContain('成行时快照');
    expect(registrationsPage).toContain('历史归属');
    expect(registrationsPage).toContain('奉贤海湾拉练');
    expect(registrationsPage).toContain('此里公开活动');

    const credentialPage = renderPrototypeState('credential', 'with-photo');
    expect(credentialPage).toContain('望京巡游骑行俱乐部（俱乐部活动）');
    expect(credentialPage).toContain('成行时快照');
    expect(credentialPage).toContain('历史归属');
    expect(credentialPage).toContain('历史行程与凭证保留发布或成行时的活动归属');
    expect(credentialPage).not.toContain('活动列表与详情优先使用当前俱乐部资料');

    const singleProfile = renderPrototypeState('profile', 'single-club');
    expect(singleProfile).toContain('已加入 1 个俱乐部');
    expect(singleProfile).toContain('本人角色 · 俱乐部所有者');

    const multiProfile = renderPrototypeState('profile', 'multi-club');
    expect(multiProfile).toContain('已加入 5 个俱乐部');
    expect(multiProfile.match(/class="club-avatar club-avatar-sm/g)).toHaveLength(5);
    expect(multiProfile).toContain('<b>+1</b>');
    expect(multiProfile).not.toContain('<b>潮汐</b>');
    expect(multiProfile).not.toContain('club-0099');

    const noClubProfile = renderPrototypeState('profile', 'no-club');
    expect(noClubProfile).toContain('暂未加入俱乐部');
    expect(noClubProfile).toContain('仍可参与此里公开活动');

    for (const output of [singleProfile, multiProfile, noClubProfile]) {
      expect(output).not.toMatch(/主俱乐部|首选俱乐部/);
    }
  });

  it('快照按 activityId/credentialId 查找，退会、停用与缺失 clubIdentity 均保持中性回退', () => {
    expect(templates).toContain('snapshotData.byActivityId[activityId]');
    expect(templates).toContain('snapshotData.byCredentialId[credentialId]');
    expect(templates).not.toMatch(/tripClubSnapshots\.(pudongSunset|fengxianCancelled)/);

    const suspendedRuntime = createPrototypeRuntime((data) => {
      data.activities[0].hostClub.status = 'suspended';
    });
    const suspendedList = renderFromRuntime(suspendedRuntime, 'activities', 'default');
    const suspendedDetail = renderFromRuntime(suspendedRuntime, 'activity-detail', 'approved');
    expect(suspendedList).toContain('发布时快照');
    expect(suspendedList).toContain('历史归属');
    expect(suspendedDetail).toContain('发布时俱乐部快照');
    expect(suspendedDetail).toContain('历史归属');

    const missingIdentityRuntime = createPrototypeRuntime((data) => {
      delete data.clubIdentity;
    });
    expect(() => renderFromRuntime(missingIdentityRuntime, 'activities', 'default')).not.toThrow();
    expect(() =>
      renderFromRuntime(missingIdentityRuntime, 'activity-detail', 'approved'),
    ).not.toThrow();
    expect(() =>
      renderFromRuntime(missingIdentityRuntime, 'registrations', 'default'),
    ).not.toThrow();
    expect(() =>
      renderFromRuntime(missingIdentityRuntime, 'credential', 'with-photo'),
    ).not.toThrow();
    expect(renderFromRuntime(missingIdentityRuntime, 'activities', 'default')).toContain(
      '此里公开活动',
    );
  });

  it('使用项目真实夹具口径填充活动和骑行指标，并按已确认的个人信息展示规则显示', () => {
    expect(schema).toContain("title: '秋日环湖耐力骑'");
    expect(schema).toContain('distanceKm: 82');
    expect(schema).toContain('elevationM: 680');
    expect(schema).toContain("title: '海风新手友好骑'");
    expect(schema).toContain("nickname: '风向骑手'");
    expect(schema).toContain("phone: '138 0000 5678'");
    expect(schema).not.toContain('****');
    expect(schema).not.toMatch(/access_token|refresh_token|emergencyPhone/);
    expect(html).toContain('本人与审核管理员完整显示实名和电话，其他骑友只见昵称');
    expect(templates).toContain('其他骑友只显示昵称');
  });

  it('真实页面与 M0 原型页面都带浅色关键状态与“问题 → 改法 → 规范”设计说明，并提供总览页', () => {
    expect(schema.match(/\n {6}states: \[/g)).toHaveLength(25);
    expect(schema.match(/\n {6}problems: \[/g)).toHaveLength(25);
    expect(schema.match(/\n {6}fixes: \[/g)).toHaveLength(25);
    expect(schema.match(/\n {6}spec: \[/g)).toHaveLength(25);
    for (const state of [
      "'empty'",
      "'loading'",
      "'error'",
      "'uploading'",
      "'no-photo'",
      "'with-photo'",
      "'selected'",
    ]) {
      expect(schema).toContain(`[${state},`);
    }
    expect(templates).toContain('btn is-disabled');
    expect(html).toContain('id="overview-view"');
    expect(html).toContain('id="state-switch"');
    expect(script).toContain('window.prototypeState = currentState');
    expect(script).toContain("currentState === 'create' ? '创建活动'");
  });

  it('总览整理为研发交付中心、需求、搭建指南、原型和验收资料入口，并支持章节直达', () => {
    const deliveryRuntime: {
      deliveryCenter?: { render: () => string };
    } = {};
    new Function('window', deliveryCenter)(deliveryRuntime);
    const renderedDeliveryCenter = deliveryRuntime.deliveryCenter?.render() ?? '';

    expect(html).toContain('此里骑行活动小程序 · 研发交付中心');
    expect(html).toContain('href="#delivery"');
    expect(html).toContain('href="#requirements"');
    expect(html).toContain('href="#guide"');
    expect(html).toContain('href="#deploy"');
    expect(html).toContain('src="./delivery-center.js"');
    expect(script).toContain('id="requirements"');
    expect(script).toContain('id="prd"');
    expect(script).toContain('id="guide"');
    expect(script).toContain('id="deploy"');
    expect(script).toContain('id="prototype"');
    expect(script).toContain('产品需求与当前能力');
    expect(script).toContain('P0 真实报名旅程');
    expect(script).toContain("'delivery'");
    expect(script).toContain('deliveryCenter.extraOverviewAnchors');
    expect(deliveryCenter).toContain('路线分析数据平台与开源方案');
    expect(deliveryCenter).toContain('docs/route-analysis-data-platform-plan.md');
    expect(renderedDeliveryCenter).toContain(
      'href="https://github.com/MengEn-Ink/cili-cycling-miniapp/blob/main/docs/route-analysis-data-platform-plan.md"',
    );
    expect(routeAnalysisDataPlatformPlan).toContain('国内商业地图与开放数据应组合使用');
    expect(routeAnalysisDataPlatformPlan).toContain('云端预计算支撑小程序轻量展示');
    expect(routeAnalysisDataPlatformPlan).toContain('先补确定性能力再接动态数据');
    expect(deliveryCenter).toContain('一条 GPX 不等于路线分析');
    expect(deliveryCenter).toContain('articles/route-analysis-data-foundation.html');
    expect(renderedDeliveryCenter).toContain('href="articles/route-analysis-data-foundation.html"');
    expect(routeAnalysisDataFoundationArticle).toContain('GPX 只是原料');
    expect(routeAnalysisDataFoundationArticle).toContain('WGS84 保存事实，GCJ-02 生成展示结果');
    expect(routeAnalysisDataFoundationArticle).toContain('真正的反对意见');
    expect(routeAnalysisDataFoundationArticle).toContain('hero-route-foundation.webp');
    expect(routeAnalysisDataFoundationArticle).toContain('gpx-to-route-fact.webp');
    expect(routeAnalysisDataFoundationArticle).toContain('route-semantics-weather.webp');
    expect(routeAnalysisDataFoundationArticle).toContain('loading="lazy"');
    expect(deliveryCenter).toContain('沸点手稿与全套设计交接成果');
    expect(deliveryCenter).toContain('docs/designs/2026-10-16-boiling-point/index.html');
    expect(deliveryCenter).toContain('组织地基与发布审批（俱乐部创建已实现 · 活动审批仍为原型）');
    expect(deliveryCenter).toContain(
      'docs/superpowers/plans/2026-10-17-org-foundation-approval.md',
    );
    expect(deliveryCenter).toContain('俱乐部创建</b>：所有申请统一进入平台所有者待办');
    expect(deliveryCenter).toContain('管理员本人活动默认发布');
    expect(deliveryCenter).toContain('role_auto_publish');
    expect(deliveryCenter).toContain('深行动红白字、48px 主控件');
    expect(deliveryCenter).not.toContain('深橙主操作白字 4.91:1');
    expect(html).toContain('沸点视觉验收');
    expect(html).toContain('沸点手稿与全套设计交接成果');
    expect(html).not.toContain('<h3>截图问题</h3>');
    expect(html).not.toContain('<h3>改版方案</h3>');
    expect(script).toContain('沸点设计系统与验收依据');
    expect(script).not.toContain('历史问题对照表');
    expect(script).not.toContain('主题橙线条');
    expect(script).not.toContain('橙底');
    expect(script).not.toContain('深橙');
    expect(css).not.toContain('品牌橙');
    expect(script).toContain('document.getElementById(targetSection)?.scrollIntoView');
    expect(css).toContain('@media (max-width: 560px)');
    expect(css).toMatch(/\.product-card-grid,[^}]*grid-template-columns:\s*1fr/s);
  });

  it('完整 UI 规范接入交付中心，并同时约束主系统、页面差异和反模式', () => {
    const deliveryRuntime: {
      deliveryCenter?: { render: () => string };
    } = {};
    new Function('window', deliveryCenter)(deliveryRuntime);
    const renderedDeliveryCenter = deliveryRuntime.deliveryCenter?.render() ?? '';

    expect(deliveryCenter).toContain("id: 'ui-design-system'");
    expect(deliveryCenter).toContain("href: 'ui-design-system.html'");
    expect(deliveryCenter).toContain("href: BASE + 'DESIGN.md'");
    expect(deliveryCenter).toContain("href: BASE + 'docs/ui-design-checklist.md'");
    expect(renderedDeliveryCenter).toContain('完整 UI 设计规范');
    expect(renderedDeliveryCenter).toContain('href="ui-design-system.html"');

    for (const content of [
      'Master Design System',
      '页面 Overrides',
      '跨平台实现规则',
      '设计推理流程',
      '反模式',
      '交付门禁',
    ]) {
      expect(executableDesignSpec).toContain(content);
    }
    expect(designChecklist).toContain('UI 设计与验收清单');
    expect(designChecklist).toContain('小程序平台');
    expect(designChecklist).toContain('Pages 平台');
    expect(designSystemIndex).toContain('../DESIGN.md');
    expect(designSystemIndex).toContain('ui-design-system.html');

    for (const content of [
      'MASTER SYSTEM',
      'PRODUCT PRINCIPLES',
      'PAGE OVERRIDES',
      'ANTI-PATTERNS',
      'DESIGN INTELLIGENCE',
      'QUALITY GATES',
      'prefers-reduced-motion',
    ]) {
      expect(uiDesignSystem).toContain(content);
    }
  });

  it('搭建指南覆盖九步交付、技术选型、核心变量、合规清单与项目审计', () => {
    expect(script.match(/\['0[1-9]',/g)).toHaveLength(9);
    for (const content of [
      '先判断交付物',
      '原生小程序',
      '跨端框架',
      '微信云开发',
      '自建后端',
      '小程序 CI 私钥',
      'CloudBase API Key',
      '提审前检查',
      '不把经验帖当平台规则',
      '当前项目审计',
      'msgSecCheck / mediaCheckAsync',
    ]) {
      expect(script).toContain(content);
    }
    expect(script).toContain('https://mp.weixin.qq.com/');
    expect(script).toContain('https://developers.weixin.qq.com/miniprogram/dev/framework/');
    expect(script).toContain(
      'https://developers.weixin.qq.com/miniprogram/dev/framework/user-privacy/',
    );
    expect(script).toContain(
      'https://developers.weixin.qq.com/miniprogram/dev/server/API/sec-center/sec-check/',
    );
    expect(script).not.toMatch(/30\s*元|300\s*元|19\.9\s*元|1\s*[-~到]\s*7\s*天/);
    expect(css).toContain('.guide-timeline');
    expect(css).toContain('.guide-table');
    expect(css).toContain('.audit-list');
  });

  it('Pages 说明 GitHub 托管凭证和三端并行发布的完整交付闭环', () => {
    for (const content of [
      '自动化部署链路',
      'cloudbase-production',
      'CLOUDBASE_API_KEY',
      'CLOUDBASE_ENV_ID',
      'CLOUDBASE_REGION',
      'WECHAT_MINIPROGRAM_PRIVATE_KEY',
      '以上次成功部署为基线',
      'EnvID 双重校验',
      '手动恢复',
      'PR 门禁',
      'main CI 复验',
      'CloudBase',
      '微信开发版',
      'GitHub Pages',
      '三端验收',
      '并行点',
    ]) {
      expect(script).toContain(content);
    }
    expect(script).toContain('从 Pull Request 到三端验收的七步交付链路');
    expect(script).toContain('https://docs.cloudbase.net/cli-v1/install');
    expect(script).not.toContain('TENCENTCLOUD_SECRETKEY');
    expect(css).toContain('.deploy-flow');
    expect(css).toContain('@keyframes deploy-step-pulse');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain('.deploy-security-grid');
  });

  it('保留票据式行程与凭证，并覆盖活动报名、能力和管理员审核旅程', () => {
    expect(templates).toContain('查看凭证');
    expect(templates).toContain('class="credential-ticket"');
    expect(templates).toContain('class="credential-spotlight"');
    expect(templates).toContain('取消报名');
    expect(templates).toContain('队伍');
    expect(templates).toContain('data-route="registration-form"');
    expect(templates).toContain('data-route="admin-review-detail"');
    expect(script).toContain("registration: 'activities'");
    expect(script).toContain("credential: 'registrations'");
    expect(script).toContain("admin: 'admin-activity-list'");
    expect(script).toContain(
      "classList.toggle('custom-tab-navigation', tabRoutes.includes(page.id))",
    );
    expect(css).toMatch(/\.custom-tab-navigation \.mini-program-bar\s*\{[^}]*height:\s*0;/s);
  });

  it('设置页原型同步当前客户端版本与当前 App 更新', () => {
    expect(schema).toContain("state: 'V2026.10.18.4'");
    expect(schema).toContain(
      "['2026.10.18.4', '俱乐部首页与人数上限', '俱乐部首页现在统一展示已加入和推荐俱乐部，并支持管理员设置人数上限。']",
    );
    expect(templates).toContain('App 更新');
    expect(templates).not.toContain('最近五次');
  });

  it('支持哈希路由、页面回退、键盘切换和关键业务反馈', () => {
    expect(script).toContain("window.addEventListener('hashchange'");
    expect(script).toContain("window.addEventListener('keydown'");
    expect(script).toContain("if (action === 'back') goBack()");
    expect(script).toContain("if (action === 'submit-registration')");
    expect(script).toContain("if (action === 'approve-review' || action === 'reject-review')");
    expect(script).toContain("if (action === 'publish-activity')");
  });

  it('颜色变量与 miniprogram/app.wxss 同名同值，不引入装饰性渐变', () => {
    const wxss = read('miniprogram/app.wxss');
    const wxssVars = new Map(
      [...wxss.matchAll(/(--color-[a-z-]+):\s*(#[0-9a-f]{6})\b/gi)].map(([, name, value]) => [
        name,
        value.toLowerCase(),
      ]),
    );
    const cssVars = [...css.matchAll(/(--color-[a-z-]+):\s*(#[0-9a-f]{6})\b/gi)];
    expect(cssVars.length).toBeGreaterThan(10);
    for (const [, name, value] of cssVars) {
      const expected = wxssVars.get(name);
      if (expected !== undefined) expect(expected, name).toBe(value.toLowerCase());
    }
    for (const name of [
      '--color-bg',
      '--color-surface',
      '--color-text',
      '--color-muted',
      '--color-brand',
      '--color-status-success',
      '--color-status-warning',
    ]) {
      expect(wxssVars.get(name), name).toBeDefined();
      expect(
        cssVars.some(([, cssName]) => cssName === name),
        name,
      ).toBe(true);
    }
    const declaredHex = new Set(cssVars.map(([, , value]) => value.toLowerCase()));
    // route-analysis V2 作为"高密度特殊页面"豁免：地图青绿 / 海拔橙红 / 路段黄 / 暖白底等功能色
    // 以及活动详情路线摘要卡的海拔线色，可直接内联 hex 以保证可读性与信息密度。
    const routeAnalysisExemptHex = new Set([
      '#fbf5ea', // 暖白底
      '#f3e6d0', // 轨道底 / 分段弱
      '#fdf4e3', // 风险提示底
      '#fff8ec', // 选中态底
      '#e2eceb', // 地图底（旧）
      '#e4ede8', // 简单段徽章底
      '#f8ecc9', // 中等段徽章底
      '#fbe0d8', // 困难段徽章底
      '#211f1c', // 深炭字 / 顶棒
      '#0c0a07', // 极深 active
      '#6f675d', // 次级灰
      '#e8d9b6', // 时间轴虚线
      '#ededed', // 分隔线
      '#fff', // 面板白底（短 hex 不触发断言，这里留作文档）
      '#d64520', // 海拔橙红
      '#0f766e', // 地图青绿
      '#d4a017', // 路段黄
      '#185a4a', // 简单段文字
      '#7a5a0f', // 中等段文字
      '#a52a1c', // 困难段文字
      '#4b7aa8', // 卫生间地图标记与列表色（V2+ 扩展：沿线 WC POI）
      // V3 高保真"路线走向·关键地名"模块：对齐最终设计参考（纸质路线手册质感）
      '#fdfaf2', // 米黄纸底（地图画布 / marker 内描边 / 选中环对比）
      '#c7c0b2', // 未覆盖段条纹灰
      '#5f8e59', // 低海拔段 / 村镇 / 置信度 high
      '#d9a93a', // 中海拔段 / 施工条纹 / 置信度 mid / 观景
      '#c1392b', // 爬顶段 / 补给 / 风险 / 封路 / 置信度 low
      '#ffffff', // marker 白色符号（SVG fill 使用的长 hex）
    ]);
    const allHex = [...css.matchAll(/#[0-9a-f]{6}\b/gi)].map(([color]) => color.toLowerCase());
    expect(
      allHex.every((color) => declaredHex.has(color) || routeAnalysisExemptHex.has(color)),
    ).toBe(true);
    expect(css).not.toMatch(/\bnavy\b|\bblue\b|radial-gradient/i);
    // profile-hero 顶图使用从透明到墨黑的垂直渐变遮罩，保证昵称可读；
    // 这是唯一允许的 linear-gradient，用于与小程序 .hero-shade 对齐。
    const gradientMatches = css.match(/linear-gradient\([^)]*\)/g) || [];
    expect(gradientMatches.length).toBeGreaterThanOrEqual(1);
    for (const gradient of gradientMatches) {
      expect(gradient).toMatch(/rgba\(0,\s*0,\s*0/);
    }
    expect(css).toMatch(/\.profile-hero-shade\s*\{[^}]*linear-gradient/s);
    expect(css).toContain('--color-text: #211f1c');
    expect(css).toContain('--color-brand: #e13b2b');
    expect(css).toMatch(
      /\.credential-spotlight\s*\{[^}]*background:\s*var\(--color-media-card-bg\)/s,
    );
    expect(css).toMatch(/\.trip-ticket-info\s*\{[^}]*background:\s*var\(--color-bg\)/s);
    expect(css).toMatch(
      /\.trip-summary > span\.is-ready\s*\{[^}]*background:\s*var\(--color-media-card-bg\)/s,
    );
    expect(css).toMatch(/\.trip-ticket-top\s*\{[^}]*background:\s*var\(--color-media-card-bg\)/s);
    expect(css).toMatch(/\.trip-ticket-primary\s*\{[^}]*width:\s*100%/s);
    expect(templates).toContain('class="trip-ticket trip-ticket-cancelled"');
    expect(templates).toContain('data-action="delete-trip"');
    expect(templates).toContain('data-action="cancelled-trip-detail"');
    expect(templates).toContain("is('empty') ? 0 : cancelledDeleted ? 1 : 2");
    expect(script).toContain("if (action === 'delete-trip')");
    expect(script).toContain("if (action === 'cancelled-trip-detail')");
    expect(templates).toContain('浦东滨江夜骑 · 鎏金落日线');
    expect(templates).toContain('奉贤海湾拉练');
  });

  it('成功 / 警告色只小范围用于小标签、行内提示和图标，不做底色、按钮、描边卡片', () => {
    for (const [name, value] of [
      ['--color-status-success', '#16633a'],
      ['--color-status-success-soft', '#e7f4eb'],
      ['--color-status-warning', '#7a5c00'],
      ['--color-status-warning-soft', '#fff2c7'],
    ]) {
      expect(css).toContain(`${name}: ${value}`);
    }
    const allowedSelectors = /^\.(tag-success|tag-warning|inline-toast)$/;
    const cssNoComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
    for (const [, selector, body] of cssNoComments.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
      if (!/var\(--color-status-/.test(body)) continue;
      for (const one of String(selector)
        .split(',')
        .map((item: string) => item.trim())) {
        expect(one, one).toMatch(allowedSelectors);
      }
    }
    expect(templates).toContain("tag('success', '✓ 已通过')");
    expect(templates).not.toContain("tag('solid', '已通过')");
    expect(templates).toContain("tag('warning', '⚠ 名额紧张')");
    expect(templates).toContain('⚠ 即将截止');
    expect(templates).toContain('可能过期');
    expect(templates).not.toContain("tag('new'");
    expect(css).not.toContain('.tag-new');
    expect(css).toMatch(/\.card-no\s*\{[^}]*color:\s*var\(--color-text\)/s);
    expect(css).toMatch(/\.info-tag\s*\{[^}]*border:\s*1px solid var\(--color-border\)/s);
    expect(css).toContain('--page-gutter: 16px');
    expect(css).toContain('--card-gap: 14px');
    expect(script).toContain("showToast('驳回时请填写理由', 'error')");
  });

  it('GitHub Pages 使用 docs 根目录的相对静态资源', () => {
    expect(html).toContain('href="./styles.css"');
    expect(html).toContain('src="./schema.js"');
    expect(html).toContain('src="./templates.js"');
    expect(html).toContain('src="./app.js"');
    expect(html).not.toMatch(/href="\/(styles|app)|src="\/(schema|templates|app)/);
  });

  it('用用户可理解的路线双模式标记当前原型并复用正式 Logo 物料', () => {
    expect(html).toContain('路线双模式');
    expect(html).not.toContain('feat/route-embed-gpx-no-oauth');
    expect(html).toContain('./brand/logo-materials/generated/logo-square-1024.png');
    expect(html).not.toContain('<span class="logo-word">');
    expect(templates).toContain('class="prototype-brand-logo"');
  });

  it('活动详情同步四指标、报名状态、Strava 只复制链接与路线概览入口', () => {
    expect(templates).toContain('预计骑行');
    expect(templates).toContain('已通过');
    expect(templates).toContain('class="detail-decision"');
    expect(templates).toContain('Strava 官方路线');
    expect(templates).toContain('复制路线链接');
    expect(templates).toContain('data-action="copy-route"');
    expect(templates).toContain('路线链接已复制');
    expect(templates).toContain('复制失败，请稍后重试');
    expect(schema).toContain("['copied', '路线链接已复制']");
    expect(schema).toContain("['copy-failed', '复制失败']");
    expect(script).toContain("if (action === 'copy-route')");
    expect(css).toContain('.inline-toast');
    // V2：活动详情只做路线摘要 + 完整路线分析入口；GPX 原生详情由管理员活动编辑页承载。
    expect(templates).toContain('class="card route-brief-card"');
    expect(templates).toContain('路线概览');
    expect(templates).toContain('查看完整路线分析');
    expect(templates).toContain("go('route-analysis')");
    expect(templates).toContain('活动群二维码');
    // 管理员活动编辑页仍提供 GPX 原生详情能力，保证"路线事实源"进入系统的路径不变。
    expect(templates).toContain('GPX 路线详情');
    expect(templates).toContain('公开路线轮廓');
    expect(templates).toContain('海拔曲线');
    expect(templates).toContain('上传 GPX');
  });

  it('不再展示 Strava 账号授权、同步或解绑能力', () => {
    const currentPrototype = [html, schema, templates, script].join('\n');
    expect(currentPrototype).not.toMatch(
      /(?<!无需 )Strava 授权|重新授权 Strava|解绑 Strava|同步最新 Strava|STRAVA 数据已同步|data-route="strava"/i,
    );
    expect(schema).toContain(
      "copy: '查看公开骑行资料与照片，不依赖第三方账号数据；展示本人加入的俱乐部，不设置主俱乐部。'",
    );
    expect(templates).toContain('App 更新');
    expect(templates).not.toContain('Strava 状态');
  });

  it('活动编辑只填写并解析 Strava 链接，全原型不跳转第三方页面', () => {
    expect(templates).toContain('Strava 官方路线（可选）');
    expect(templates).toContain('粘贴公开路线链接');
    expect(templates).toContain('添加并解析路线');
    expect(templates).toContain('公开路线已解析');
    expect(templates).toContain('GPX 路线详情（推荐）');
    expect(templates).toContain('上传 GPX');
    expect(templates).toContain('路线详情已准备好');
    expect(templates).toContain('设为活动背景');
    const currentPrototype = [html, schema, templates, script].join('\n');
    expect(currentPrototype).not.toContain('查看官方路线');
    expect(currentPrototype).not.toContain('data-route="route-view"');
    expect(currentPrototype).not.toContain("go('route-view')");
    expect(currentPrototype).not.toContain('toggle-route-fallback');
    expect(currentPrototype).not.toContain('无需连接 Strava 账号');
    expect(currentPrototype).not.toMatch(/打开 Strava|查看 Strava|跳转 Strava|在 Strava 中打开/);
    expect([schema, templates].join('\n')).not.toContain('web-view');
  });

  it('个人名片与审核页面只保留资料、照片和骑行经验', () => {
    expect(templates).toContain('公开骑行名片');
    expect(templates.indexOf('credential-rider-heading')).toBeLessThan(
      templates.indexOf('<article class="credential-ticket">'),
    );
    expect(templates).toContain('骑行照片');
    expect(templates).toContain('资料仅用于本次活动审核');
    expect(templates).toContain('活动中公开');
    expect(templates).not.toContain('仅本人查看');
    // 个人名片 / 凭证不展示任何汇总型骑行数据（加权均速、90 天次数等）；
    // 路线相关的"累计爬升"仅出现在活动详情路线概览和完整路线分析页。
    const creditSlice = templates.slice(
      templates.indexOf('credential:'),
      templates.indexOf('profile:') > templates.indexOf('credential:')
        ? templates.indexOf('profile:')
        : templates.length,
    );
    expect(creditSlice).not.toContain('加权均速');
    expect(creditSlice).not.toContain('累计爬升');
    expect(creditSlice).not.toContain('90 天次数');
  });

  it('活动管理同步四态筛选与真实运行态示例', () => {
    expect(templates).toContain('全部');
    expect(templates).toContain('已下架');
    expect(templates).toContain('已上线');
    expect(templates).toContain('已结束');
    expect(schema).toContain("title: '云蒙山&喇叭沟 RIDE'");
    expect(schema).toContain("title: '黑分解 RIDE'");
    expect(schema).toContain("time: '早上 6 点 20 分'");
    expect(schema).toContain("time: '早上 8 点整'");
  });

  it('完整路线分析 V2+ 覆盖骑行走向、爬升变化、关键地名、补给方案与卫生间 POI', () => {
    // 五个新模块的面板标题（高密度路线手册）
    for (const panel of ['骑行走向', '爬升与下降', '关键公里点', '补给方案', '沿线卫生间']) {
      expect(templates).toContain(panel);
    }
    // 骑行走向：按公里分段 + 方位 + 道路 + 转向 + 注意
    expect(templates).toContain('ra-dir-list');
    expect(templates).toContain('ra-dir-km');
    expect(templates).toContain('ra-dir-bearing');
    expect(templates).toContain('ra-dir-turn');
    expect(templates).toContain('北偏东');
    expect(templates).toContain('盘山公路');
    // 爬升变化：爬升段 / 下降段 + 坡长 + 爬升 + 平均/最大坡度 + 趋势 + 最高点
    expect(templates).toContain('ra-climb-list');
    expect(templates).toContain("type: 'climb'");
    expect(templates).toContain("type: 'descent'");
    expect(templates).toContain('is-ascent');
    expect(templates).toContain('is-descent');
    expect(templates).toContain('ra-climb-delta');
    expect(templates).toContain('ra-climb-metrics');
    expect(templates).toContain('ra-climb-highest');
    expect(templates).toContain('段爬升');
    expect(templates).toContain('段下降');
    // 关键公里点：地名 + km + 海拔 + 经纬度 + 用途/注意
    expect(templates).toContain('ra-tl-geo');
    expect(templates).toContain('ra-tl-caution');
    expect(templates).toContain('°N');
    expect(templates).toContain('°E');
    // 补给方案：节奏 + 补给点 + ETA + 携带下限
    expect(templates).toContain('ra-rhythm-list');
    expect(templates).toContain('ra-sp-row');
    expect(templates).toContain('ra-sp-eta');
    expect(templates).toContain('预计到达');
    expect(templates).toContain('随身携带下限');
    expect(templates).toContain('ra-carry-list');
    // 卫生间 POI：WC 标记 + 名称 + 经纬度 + 偏离距离 + 开放备注
    expect(templates).toContain('ra-wc-list');
    expect(templates).toContain('ra-wc-mark');
    expect(templates).toContain('ra-wc-geo');
    expect(templates).toContain('偏离主路');
    expect(templates).toContain('全天开放');
    // V3 高保真"路线走向·关键地名"模块（对齐最终设计参考）
    expect(templates).toContain('路线走向 · 关键地名');
    expect(templates).toContain('按海拔着色 · 骑行方向顺序 · 点击可查看地名与坐标');
    expect(templates).toContain('脱敏演示样本');
    // 图层筛选芯片（全部 / 地名 / 补给 / 风险 / 卫生间 / 坡段）
    expect(templates).toContain('ra-map-filters');
    expect(templates).toContain('ra-filter');
    // 分级图例（起终点 / 坡顶 / 长下坡 / 补给 / 风险 / 卫生间 WC）
    expect(templates).toContain('ra-map-legend-grid');
    expect(templates).toContain('ra-lg-start');
    expect(templates).toContain('ra-lg-peak');
    expect(templates).toContain('ra-lg-descent');
    expect(templates).toContain('ra-lg-supply');
    expect(templates).toContain('ra-lg-risk');
    expect(templates).toContain('ra-lg-wc');
    expect(templates).toContain('坡顶');
    expect(templates).toContain('长下坡');
    expect(templates).toContain('卫生间');
    // 点位详情浮层：类型 chip + 子信息 + 数据来源 + 坐标 + 复制坐标
    expect(templates).toContain('ra-map-detail');
    expect(templates).toContain('ra-detail-type');
    expect(templates).toContain('ra-detail-provenance');
    expect(templates).toContain('ra-detail-coord');
    expect(templates).toContain('复制坐标');
    expect(templates).toContain('data-action="copy-route-coord"');
    // 不得退回技术痕迹文案（最终设计参考允许"数据来源 / 置信度"作为常规字段，
    // 真正要禁的是"未接入 / 待接入 / 事实源 / 数据边界 / 数据质量 / 逆地理编码 / 坐标复制 / TODO"等开发态话术）
    const raSlice = templates.slice(
      templates.indexOf("'route-analysis':"),
      templates.indexOf("'registration-form':") > templates.indexOf("'route-analysis':")
        ? templates.indexOf("'registration-form':")
        : templates.length,
    );
    for (const forbidden of [
      '未接入',
      '待接入',
      '事实源',
      '数据边界',
      '数据质量',
      '逆地理编码',
      '坐标复制',
      'TODO',
    ]) {
      expect(raSlice).not.toContain(forbidden);
    }
  });

  it('技术长读首屏按「问题钩子 → 阅读地图 → 三类读者」展开，不以 SDLC 八大类自说自话开场', () => {
    // header meta / title 与导航反映技术长读定位
    expect(html).toContain('一次骑行是如何被设计、报名、审批、交付的 · 研发交付中心');
    expect(html).toContain('技术长读');
    expect(html).toContain('骑友 / 组织者 / 开发者三视角');
    expect(html).toContain('href="#story-hook"');
    expect(html).toContain('href="#audience"');
    expect(html).toContain('href="#journey-rider"');
    expect(html).toContain('href="#pipeline"');
    // 首屏不再以「8 / 8 SDLC 类目」开场
    expect(html).not.toContain('<b>8 / 8</b><span>SDLC 类目</span>');
    // 开篇三个问题钩子
    expect(script).toContain('id="story-hook"');
    expect(script).toContain('一次骑行从被想到');
    expect(script).toContain('为什么不是直接扫个群接龙');
    expect(script).toContain('要不要做成互联网产品那套');
    expect(script).toContain('怎么保证代码上线不翻车');
    // 阅读地图直达 7 章
    expect(script).toContain('story-map');
    for (const anchor of [
      '#audience',
      '#product',
      '#journey-rider',
      '#journey-organizer',
      '#privacy',
      '#pipeline',
      '#prototype',
    ]) {
      expect(script).toContain(`href="${anchor}"`);
    }
    // overview 哈希路由认得新章节
    expect(script).toContain("'story-hook'");
    expect(script).toContain("'audience'");
    expect(script).toContain("'journey-rider'");
    expect(script).toContain("'journey-organizer'");
    expect(script).toContain("'pipeline'");
    expect(script).toContain("'roadmap'");
  });

  it('三类读者（骑友 / 组织者 / 开发者）都有明确视角入口和完整内容路径', () => {
    expect(script).toContain('audience-rider');
    expect(script).toContain('audience-organizer');
    expect(script).toContain('audience-dev');
    expect(script).toContain('我周末骑一次，中间会被怎样处理？');
    expect(script).toContain('我要发车，怎么把路线、名额和审批放上来？');
    expect(script).toContain('我提交一行代码，要走哪些门禁才能上线？');
    // 每个读者入口都给出至少 3 条下一步
    expect(script.match(/class="audience-steps"/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it('产品全貌、骑手旅程、组织者旅程、隐私边界章节按「结论→机制→证据→边界→检查点」组织', () => {
    // 02 产品全貌 · 做什么 / 不做什么 / 活动状态机
    expect(script).toContain('做什么 · 做到什么程度');
    expect(script).toContain('不做什么 · 边界检查');
    expect(script).toContain('图 2.1 · 活动状态机');
    expect(script).toContain('发布就等于允许报名吗？不等于');
    expect(script).toContain('state-canvas-activity');
    // 03 骑手旅程 · 五步 + 报名状态机
    expect(script).toContain('data-journey-canvas');
    for (const step of ['discover', 'judge', 'apply', 'credential', 'checkin']) {
      expect(script).toContain(`data-step="${step}"`);
      expect(script).toContain(`data-pane="${step}"`);
      expect(script).toContain(`data-node="${step}"`);
    }
    expect(script).toContain('图 3.1 · 报名状态机');
    expect(script).toContain('被驳回了还能再报吗？能，沿用同一条记录');
    // 04 组织者旅程 · 创建 → 导入路线 → 发布 ≠ 可报名 → 审批与现场
    expect(script).toContain('organizer-flow');
    expect(script).toContain('发布 ≠ 可报名');
    expect(script).toContain('registration_setup_pending');
    expect(script).toContain('俱乐部创建申请已统一进入平台管理员待办');
    // 05 隐私与产品边界 · 可见 / 不可见 / Strava OAuth 退役
    expect(script).toContain('✓ 公开可见');
    expect(script).toContain('✗ 公开不可见');
    expect(script).toContain('Strava OAuth 已退役');
    expect(script).toContain('无需 Strava 授权');
    // 开发态话术也不出现在产品边界描述中
    expect(script).not.toMatch(/Strava 账号授权 ·|重新授权 Strava/);
  });

  it('七步交付链路从 PR 到三端验收，并把三路部署标注为契约验证视图', () => {
    expect(script).toContain('id="pipeline"');
    expect(script).toContain('pipeline-flow');
    expect(script).toContain('契约验证视图');
    expect(script).toContain('data-lane="cloud"');
    expect(script).toContain('data-lane="wechat"');
    expect(script).toContain('data-lane="pages"');
    expect(script).toContain('pipeline-step-verify');
    expect(script).toContain('三路并行');
    // 7 步编号 01..07 齐备
    for (const no of ['01', '02', '03', '04', '05', '06', '07']) {
      expect(script).toContain(`<span>${no}</span>`);
    }
  });

  it('动画默认开启，支持 prefers-reduced-motion 关闭', () => {
    expect(css).toContain('@keyframes pipeline-pulse');
    expect(css).toContain('@keyframes journey-pulse');
    expect(css).toContain('@keyframes state-pulse');
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*state-node-published[\s\S]*animation: none/,
    );
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*pipeline-step[\s\S]*animation: none/,
    );
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*journey-flow-node\.is-active circle[\s\S]*animation: none/,
    );
  });

  it('路线图把「当前已实现」与「待实施」显式分开', () => {
    expect(script).toContain('id="roadmap"');
    expect(script).toContain('✓ 当前已实现（17 个真实路由）');
    expect(script).toContain('⌛ 后续演进');
    // 俱乐部创建申请已上线；俱乐部活动 / 公开活动审批、多租户和腾讯文档仍归入后续演进
    expect(script).toContain('组织地基与审批演进原型：俱乐部创建申请已生产落地');
    expect(script).toContain('多俱乐部 / 多组织租户、独立 Web 后台 — 未来需求');
    expect(script).toContain('报名信息同步腾讯文档 — 需求阶段');
  });

  it('事实边界：无强制 Strava 授权；GPX 可下载预览；CloudBase 仅变更时部署；Routes/M0 不写成已上线', () => {
    const page = [html, script, deliveryCenter].join('\n');
    // 不得出现"必须授权 Strava"或"CloudBase 全量部署"等反事实
    expect(page).not.toMatch(/必须.{0,4}授权.{0,4}Strava|强制.{0,4}Strava.{0,4}授权/);
    expect(page).toContain('无需 Strava 授权');
    expect(page).toMatch(/只部署受影响|仅.{0,2}变更/);
    expect(page).toContain('GPX');
    // 退役文档不再被当作 external-apis 的 source 链接
    expect(deliveryCenter).not.toContain('docs/strava-athlete-capacity.md');
    // 俱乐部创建申请已经生产实现，俱乐部活动与公开活动审批仍是后续目标
    expect(script).toContain('俱乐部创建申请已生产落地');
    expect(deliveryCenter).toContain('俱乐部活动与公开活动发布审批');
    expect(deliveryCenter).toContain('尚未进入生产');
    // 扫码核销入口已退役：凭证只展示活动与审核状态，签到由管理员二次确认。
    expect(script).toContain('当前没有扫码核销入口');
    expect(script).not.toMatch(/Code 128|wx\.scanCode/);
  });

  it('header / footer / meta 的叙事与新章节一致', () => {
    expect(html).toContain('<title>此里 · 一次骑行是如何被设计、报名、审批、交付的');
    expect(html).toContain('content="此里骑行活动小程序研发交付中心 · 技术长读');
    expect(html).toContain('<b>7 章</b><span>技术长读</span>');
    expect(html).toContain('此里 CILI · 一次骑行是如何被设计、报名、审批、交付的 · 研发交付中心');
    expect(html).toContain('Strava OAuth 已退役，无需 Strava 授权即可解析公开路线');
  });
});

describe('俱乐部中心（club-center）交互原型契约', () => {
  it('schema 中的 club-center 覆盖主页结构：三页签、容量字段、禁用话术', () => {
    // 入口在 prototypeRoutes 名单中；交付中心侧栏按 pages 顺序渲染
    expect(prototypeRoutes).toContain('club-center');
    expect(schema).toContain("id: 'club-center'");
    expect(schema).toContain("title: '俱乐部中心'");
    expect(schema).toContain("navTitle: '俱乐部中心'");
    expect(schema).toContain("group: '真实运行页 · 俱乐部主页'");
    // 核心状态：三页签 + 加载 / 错误 / 背景降级 / 更多菜单
    for (const state of [
      "['default', '活动 · 有报名']",
      "['activities-empty', '活动 · 暂无']",
      "['members', '成员 · 查看列表']",
      "['profile', '资料 · 查看']",
      "['loading', '加载中']",
      "['error', '网络失败']",
      "['bg-fallback', '背景加载失败']",
      "['more-open', '更多菜单（负责人）']",
    ]) {
      expect(schema).toContain(state);
    }
    // Mock 数据声明：严格对应用户确认过的字段
    expect(schema).toContain('clubCenterPrototype:');
    expect(schema).toContain("name: '辛庄桥小火车'");
    expect(schema).toContain('memberCount: 2');
    expect(schema).toContain('capacity: 50');
    // 禁止话术：没有“成立 N 个月”、“邀请成员”、“搜索成员”、
    // 以及“还可加入 N 名 / 位骑友”这种暗示容量招募的话术（“已加入 N 个俱乐部”属于用户视角文案，豁免）
    expect(schema).not.toMatch(/成立\s*\d+\s*个月/);
    expect(schema).not.toContain('邀请成员');
    expect(schema).not.toContain('搜索成员');
    expect(schema).not.toMatch(/还可加入\s*\d*\s*(?:名|位)?\s*骑友/);
  });

  it('club-center 模板在默认态渲染容量区（无白卡）、三页签与 Mock 数据标识', () => {
    const output = renderPrototypeState('club-center', 'default');
    expect(output).toContain('设计原型 · Mock 数据');
    expect(output).toContain('class="club-center-hero"');
    expect(output).toContain('class="club-center-cover"');
    // 容量区：显示“2 人 / 50 人”，不出现白色卡片类名或禁用话术
    expect(output).toContain('class="club-center-capacity"');
    expect(output).toContain('用户数');
    expect(output).toContain('<em>2</em>人');
    expect(output).toContain('容量');
    expect(output).toContain('<em>50</em>人');
    expect(output).not.toMatch(/class="[^"]*capacity-card[^"]*"/);
    expect(output).not.toMatch(/还可加入\s*\d*\s*(?:名|位)?\s*骑友/);
    expect(output).not.toContain('邀请骑友');
    expect(output).not.toMatch(/成立\s*\d+\s*个月/);
    // ARIA tablist 三页签
    expect(output).toContain('role="tablist"');
    expect(output).toContain('id="club-center-tab-activities"');
    expect(output).toContain('id="club-center-tab-members"');
    expect(output).toContain('id="club-center-tab-profile"');
    expect(output).toContain('role="tab"');
    expect(output).toContain('role="tabpanel"');
    // 默认活动态可见活动卡与报名 toast
    expect(output).toContain('class="club-center-activity"');
    expect(output).toContain('立即报名');
    expect(output).toContain('data-message="报名已提交，等待负责人确认（原型示意）"');
    // 成员区“查看全部”入口，不出现邀请 CTA
    expect(output).toContain('查看全部');
    expect(output).toContain('aria-label="查看全部成员"');
    expect(output).not.toMatch(/邀请成员|邀请骑友|分享邀请码/);
  });

  it('更多菜单（负责人）折叠编辑资料入口，普通成员视角不可见', () => {
    const admin = renderPrototypeState('club-center', 'more-open');
    expect(admin).toContain('role="menu"');
    expect(admin).toContain('编辑俱乐部资料');
    expect(admin).toContain('仅负责人可见');
    expect(admin).toContain('aria-expanded="true"');
    // 默认页右上角仅有分享与更多按钮，没有常显的“编辑资料”字样
    const defaultOutput = renderPrototypeState('club-center', 'default');
    expect(defaultOutput).toContain('aria-label="更多操作"');
    expect(defaultOutput).toContain('aria-label="分享俱乐部"');
    expect(defaultOutput.indexOf('编辑俱乐部资料')).toBe(-1);
  });

  it('背景或网络失败态保留占位 + 重试表达，不留空白容器', () => {
    const bgError = renderPrototypeState('club-center', 'bg-fallback');
    expect(bgError).toContain('is-fallback');
    expect(bgError).toContain('CILI CLUB');
    expect(bgError).toContain('重新加载');
    expect(bgError).toContain('data-action="club-center-retry-cover"');

    const network = renderPrototypeState('club-center', 'error');
    expect(network).toContain('活动加载失败');
    expect(network).toContain('重新加载');
    expect(network).toContain('data-route="club-center"');

    const loading = renderPrototypeState('club-center', 'loading');
    expect(loading).toContain('class="club-center-skeleton"');
  });

  it('成员列表态仅做查看，不包含邀请 / 剔除等运营动作', () => {
    const members = renderPrototypeState('club-center', 'members');
    expect(members).toContain('class="club-center-members-list"');
    expect(members).toContain('全部成员');
    expect(members).toContain('仅查看');
    expect(members).toContain('不包含邀请、剔除等运营动作');
    // 去掉说明条中的“不包含邀请、剔除”再做反面检查，确保没有可点击的运营 CTA
    const withoutDisclaimer = members.replace(/不包含邀请[^<]*运营动作/g, '');
    expect(withoutDisclaimer).not.toMatch(/>\s*(?:邀请|剔除|踢出|移除成员)\s*(?:[→›>]|<\/)/);
    // 真正敏感的 action 名称也不应出现在模板中
    expect(members).not.toContain('data-action="invite-member"');
    expect(members).not.toContain('data-action="kick-member"');
  });

  it('资料页签展示俱乐部基础事实，不展示未确认字段（如成立月数、搜索）', () => {
    const profile = renderPrototypeState('club-center', 'profile');
    expect(profile).toContain('class="club-center-profile"');
    expect(profile).toContain('俱乐部名称');
    expect(profile).toContain('辛庄桥小火车');
    expect(profile).toContain('容量上限');
    expect(profile).toContain('50 人');
    expect(profile).not.toMatch(/成立\s*\d+\s*个月/);
    expect(profile).not.toContain('搜索');
  });

  it('button 与菜单项带 focus-visible / aria 属性，并复用现有 token 样式', () => {
    expect(css).toContain('.club-center-tab:focus-visible');
    expect(css).toContain('.club-center-icon-btn:focus-visible');
    expect(css).toContain('.club-center-cover-retry:focus-visible');
    expect(css).toContain('.club-center-more-item:focus-visible');
    // 容量区使用边框分隔，而不是白色卡片
    expect(css).toMatch(
      /\.club-center-capacity-cell\s*\{[^}]*border-right:\s*1px solid var\(--color-border\)/s,
    );
    expect(css).toMatch(
      /\.club-center-capacity\s*\{[^}]*background:\s*transparent|\.club-center-capacity\s*\{[^}]*padding:/s,
    );
    // 不使用蓝紫 / 玻璃拟态
    expect(css).not.toMatch(/\.club-center-[a-z-]+\s*\{[^}]*backdrop-filter/s);
    expect(css).not.toMatch(/\.club-center-[a-z-]+\s*\{[^}]*color:\s*#\d*(?:0f|1[0-9a-f])/i);
  });

  it('clubCenter 入口写入导航组，交付中心侧栏按分组渲染，可从研发交付中心进入', () => {
    // 侧栏按 schema.pages[].group 分组；此里只需保证 group 文案中含“俱乐部主页”
    expect(script).toContain('.filter((page) => page.group === group)');
    expect(schema).toContain("group: '真实运行页 · 俱乐部主页'");
  });

  it('activity 卡与成员 CTA 都带可读 aria，支持 prefers-reduced-motion', () => {
    const output = renderPrototypeState('club-center', 'default');
    expect(output).toContain('aria-labelledby="club-center-activity-title"');
    expect(output).toContain('aria-label="查看全部成员"');
    const bgError = renderPrototypeState('club-center', 'bg-fallback');
    expect(bgError).toContain('aria-label="重新加载背景图"');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*club-center-avatar/);
  });
});

/* ------------------------------------------------------------------ *
 * 俱乐部中心运行时契约                                                 *
 *                                                                      *
 * 直接执行 schema.js / templates.js 暴露 window.clubCenterStateMachine  *
 * 纯函数，覆盖 tab 切换、键盘导航、overlay 保留 activeTab、cover         *
 * error / retry 的状态转换；再对 app.js 做静态接线断言，确保 handler、    *
 * ARIA / hidden / 原型标识都已挂上。不引入 DOM 依赖。                     *
 * ------------------------------------------------------------------ */

type ClubCenterMachine = {
  parseState: (s: string) => { tab: string; overlays: string[] };
  composeState: (tab: string, overlays: string[]) => string;
  nextTab: (s: string, k: string) => { tab: string; state: string; tabId: string } | null;
  toggleMore: (s: string) => string;
  coverError: (s: string) => string;
  retryCover: (s: string) => string;
};
const clubRuntime = createPrototypeRuntime();
const machine = (clubRuntime as unknown as { clubCenterStateMachine: ClubCenterMachine })
  .clubCenterStateMachine;
const renderCC = (state: string) =>
  renderFromRuntime(clubRuntime as PrototypeRuntime, 'club-center', state);
const panelAttrs = (html: string, name: string) =>
  html.match(new RegExp(`<section([^>]*id="club-center-panel-${name}"[^>]*)>`))?.[1] ?? '';
const tabAttrs = (html: string, name: string) =>
  html.match(new RegExp(`<button([^>]*id="club-center-tab-${name}"[^>]*)>`))?.[1] ?? '';

describe('俱乐部中心状态机（纯函数运行时）', () => {
  it('暴露 parseState / composeState / nextTab / toggleMore / coverError / retryCover', () => {
    expect(machine).toBeTruthy();
    for (const k of [
      'parseState',
      'composeState',
      'nextTab',
      'toggleMore',
      'coverError',
      'retryCover',
    ] as const) {
      expect(typeof machine[k]).toBe('function');
    }
  });

  it('nextTab：Arrow/Home/End 在三 tab 间循环，more-open 浮层被清掉，bg-fallback 保留', () => {
    const r1 = machine.nextTab('default', 'ArrowRight')!;
    expect(r1.tab).toBe('members');
    expect(r1.state).toBe('members');
    expect(r1.tabId).toBe('club-center-tab-members');
    expect(machine.nextTab('members', 'ArrowRight')!.tab).toBe('profile');
    expect(machine.nextTab('profile', 'ArrowRight')!.tab).toBe('activities');
    expect(machine.nextTab('default', 'ArrowLeft')!.tab).toBe('profile');
    expect(machine.nextTab('profile', 'Home')!.tab).toBe('activities');
    expect(machine.nextTab('default', 'End')!.tab).toBe('profile');
    // 不支持的键交回全局
    expect(machine.nextTab('default', 'ArrowUp')).toBeNull();
    expect(machine.nextTab('default', 'Enter')).toBeNull();
    // more-open 清掉，bg-fallback 保留
    const r2 = machine.nextTab('more-open', 'ArrowRight')!;
    expect(machine.parseState(r2.state).overlays).not.toContain('more-open');
    const r3 = machine.nextTab('members--bg-fallback', 'ArrowRight')!;
    expect(machine.parseState(r3.state).tab).toBe('profile');
    expect(machine.parseState(r3.state).overlays).toContain('bg-fallback');
  });

  it('toggleMore：在 members / profile 上打开 / 关闭菜单保留 activeTab', () => {
    expect(machine.toggleMore('members')).toBe('members--more-open');
    expect(machine.toggleMore('members--more-open')).toBe('members');
    expect(machine.toggleMore('profile')).toBe('profile--more-open');
    expect(machine.toggleMore('profile--more-open')).toBe('profile');
    expect(machine.toggleMore('default')).toBe('more-open');
    expect(machine.toggleMore('more-open')).toBe('default');
  });

  it('coverError / retryCover：overlay 与 activeTab 正交，重试只去 bg-fallback', () => {
    expect(machine.coverError('default')).toBe('bg-fallback');
    expect(machine.retryCover('bg-fallback')).toBe('default');
    const e2 = machine.coverError('members');
    expect(machine.parseState(e2).tab).toBe('members');
    expect(machine.parseState(e2).overlays).toContain('bg-fallback');
    expect(machine.retryCover(e2)).toBe('members');
    // more-open + bg-fallback：retry 只去 bg-fallback
    const after = machine.retryCover('members--more-open--bg-fallback');
    expect(machine.parseState(after).overlays).toContain('more-open');
    expect(machine.parseState(after).overlays).not.toContain('bg-fallback');
    expect(machine.parseState(after).tab).toBe('members');
  });
});

describe('俱乐部中心模板渲染（状态机驱动）', () => {
  it('默认态：activities panel 可见，其它 panel hidden，aria-selected / tabindex 一致', () => {
    const html = renderCC('default');
    expect(panelAttrs(html, 'activities')).not.toMatch(/\bhidden\b/);
    expect(panelAttrs(html, 'members')).toMatch(/\bhidden\b/);
    expect(panelAttrs(html, 'profile')).toMatch(/\bhidden\b/);
    expect(tabAttrs(html, 'activities')).toContain('aria-selected="true"');
    expect(tabAttrs(html, 'members')).toContain('aria-selected="false"');
    expect(tabAttrs(html, 'activities')).toContain('tabindex="0"');
    expect(tabAttrs(html, 'members')).toContain('tabindex="-1"');
    // 原型标识 + Mock 数据声明
    expect(html).toContain('设计原型 · Mock 数据');
  });

  it('ArrowRight 后：成员 panel 可见，activity / profile 带 hidden，aria 同步切换', () => {
    const next = machine.nextTab('default', 'ArrowRight')!;
    const html = renderCC(next.state);
    expect(panelAttrs(html, 'members')).not.toMatch(/\bhidden\b/);
    expect(panelAttrs(html, 'activities')).toMatch(/\bhidden\b/);
    expect(panelAttrs(html, 'profile')).toMatch(/\bhidden\b/);
    expect(tabAttrs(html, 'members')).toContain('aria-selected="true"');
    expect(tabAttrs(html, 'members')).toContain('tabindex="0"');
    expect(html).toContain('class="club-center-members-list"');
  });

  it('toggleMore 在 members / profile 上保留 activeTab，菜单 aria-expanded="true"', () => {
    for (const tab of ['members', 'profile'] as const) {
      const html = renderCC(machine.toggleMore(tab));
      expect(panelAttrs(html, tab)).not.toMatch(/\bhidden\b/);
      expect(tabAttrs(html, tab)).toContain('aria-selected="true"');
      expect(html).toContain('id="club-center-more-menu"');
      expect(html).toContain('role="menu"');
      expect(html).toContain('aria-expanded="true"');
      expect(html).toContain('aria-controls="club-center-more-menu"');
      // 关闭菜单按钮 / 更多按钮都带 data-state="<tab>" 保证不丢 tab
      expect(html).toMatch(new RegExp(`class="club-center-more-close"[^>]*data-state="${tab}"`));
      expect(html).toMatch(new RegExp(`data-state="${tab}"[^>]*aria-label="更多操作"`));
    }
  });

  it('coverError + retryCover：bg-fallback 显示重试入口，retry 后恢复封面与 activeTab', () => {
    const html = renderCC(machine.coverError('members'));
    expect(html).toContain('is-fallback');
    expect(html).toContain('data-action="club-center-retry-cover"');
    expect(html).toContain('aria-label="重新加载背景图"');
    expect(tabAttrs(html, 'members')).toContain('aria-selected="true"');
    const html2 = renderCC(machine.retryCover(machine.coverError('members')));
    expect(html2).not.toContain('class="club-center-cover is-fallback"');
    expect(html2).toContain('data-club-center-cover');
    expect(tabAttrs(html2, 'members')).toContain('aria-selected="true"');
  });
});

describe('俱乐部中心 app.js 关键代码接线（静态契约）', () => {
  it('文档级 keydown 捕获阶段 + stopPropagation 阻止全局箭头导航劫持', () => {
    expect(script).toMatch(/document\.addEventListener\(\s*['"]keydown['"]/);
    expect(script).toMatch(/data-club-center-tabs/);
    expect(script).toMatch(/event\.stopPropagation\(\)/);
    expect(script).toMatch(/event\.preventDefault\(\)/);
    expect(script).toMatch(/clubCenterStateMachine/);
    // 结尾用了 true 启用捕获阶段
    expect(script).toMatch(/document\.addEventListener\(\s*[\s\S]*?,\s*true,?\s*\)/);
  });

  it('showPage 支持 focusTargetId，rAF 回调里真实调用 .focus()，tab click 带 focusTargetId', () => {
    expect(script).toContain('focusTargetId');
    expect(script).toMatch(
      /focusTargetId[\s\S]*requestAnimationFrame[\s\S]*getElementById[\s\S]*\.focus\(\)/,
    );
    expect(script).toMatch(/clubCenterTab[\s\S]*focusTargetId/);
  });

  it('封面 img 错误 + 重试：window.clubCenterOnCoverError 与 club-center-retry-cover 都已挂载', () => {
    expect(script).toContain('window.clubCenterOnCoverError');
    expect(script).toMatch(/clubCenterOnCoverError[\s\S]*coverError/);
    expect(script).toMatch(/club-center-retry-cover[\s\S]*retryCover/);
    expect(templates).toContain(
      'window.clubCenterOnCoverError && window.clubCenterOnCoverError(event)',
    );
    expect(script).toMatch(/club-center-retry-cover[\s\S]*正在重新加载背景图/);
  });

  it('ui-sync-manifest.json 未被本次改动修改（避免旧截图冒充新原型证据）', () => {
    const manifest = read('docs/ui-sync-manifest.json');
    expect(manifest).not.toContain('设计原型 · Mock 数据');
    expect(manifest).not.toContain('clubCenterPrototype');
  });
});
