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
const agileDeliveryArticle = read('docs/articles/agile-delivery.html');
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
  'club/center',
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

// 2026-10-19 单俱乐部收口：原 M0 组织地基与审批 6 页 prototype-only 页面
// 与多俱乐部语义相关的 planned-club-* 页面已随之一同下线，不再进入 Pages 原型。
const retiredPrototypeRoutes = [
  'org-overview',
  'activity-publish-target',
  'admin-approval-inbox',
  'approval-detail',
  'approval-outcome',
  'approval-exceptions',
];

const routeToPagePath = (route: string) =>
  route === 'club/center'
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
    expect(html).toContain('17 个正式路由 + 4 个规划原型 / 21 个画面');
  });

  it('活动首页使用三张 v3 轮播卡并提供有界导航', () => {
    const output = renderPrototypeState('activities', 'default');
    expect(output).toContain('class="activity-carousel-shell"');
    expect(output).toContain('class="activity-carousel-track"');
    expect(output.match(/data-activity-slide/g)).toHaveLength(3);
    expect(output).toContain('class="activity-date-stamp"');
    expect(output).toContain('class="activity-club-chip');
    expect(output).toContain('data-action="activity-carousel-prev"');
    expect(output).toContain('data-action="activity-carousel-next"');
    expect(output).toContain('data-action="activity-carousel-dot"');
    expect(css).toMatch(
      /\.activities-v3 \.activity-card-v3\s*\{[^}]*flex:\s*0 0 min\(86%, 306px\);[^}]*height:\s*306px;[^}]*border-radius:\s*22px;/s,
    );
    expect(css).toMatch(/\.activities-v3 \.activity-card-cover\s*\{[^}]*height:\s*136px;/s);
    expect(script).toContain("event.key === 'ArrowRight'");
    expect(script).toContain("event.key === 'Home'");
    expect(script).toContain('activityCarouselController');
  });

  it('两条正式俱乐部管理路由收敛为唯一俱乐部资料概览与编辑', () => {
    const list = renderPrototypeState('admin-club-applications', 'default');
    expect(list).toContain('俱乐部管理');
    expect(list).toContain('全平台只有一个俱乐部');
    expect(list).toContain('data-route="admin-club-application-detail"');
    expect(list).toContain('data-state="edit"');
    expect(list).not.toContain('待审批');
    expect(list).not.toContain('驳回');
    expect(list).not.toMatch(/共\s*\d+\s*个俱乐部/);
    expect(list).not.toContain('创建俱乐部');

    const edit = renderPrototypeState('admin-club-application-detail', 'edit');
    expect(edit).toContain('编辑俱乐部资料');
    expect(edit).toContain('保存资料');
    expect(edit).toContain('不能创建第二个俱乐部');
    expect(edit).not.toContain('通过申请');
    expect(edit).not.toContain('驳回申请');

    const bootstrap = renderPrototypeState('admin-club-application-detail', 'bootstrap');
    expect(bootstrap).toContain('创建唯一俱乐部');
    expect(bootstrap).toContain('创建并立即生效');

    const bootstrapUploading = renderPrototypeState(
      'admin-club-application-detail',
      'bootstrap--avatar-uploading',
    );
    expect(bootstrapUploading).toContain('创建唯一俱乐部');
    expect(bootstrapUploading).toContain('正在更新俱乐部头像');
    expect(bootstrapUploading).toContain('创建并立即生效');

    const bootstrapSuccess = renderPrototypeState(
      'admin-club-application-detail',
      'bootstrap--success',
    );
    expect(bootstrapSuccess).toContain('唯一俱乐部创建成功');
    expect(script).toContain('state: `${operation}--avatar-uploading`');
    expect(script).toContain('state: `${operation}--submitting`');
  });

  it('唯一俱乐部编辑按个人资料编辑结构优先展示头像与背景图，无加入设置', () => {
    const edit = renderPrototypeState('admin-club-application-detail', 'edit');
    expect(edit).toContain('<span class="card-no">01</span><h3 class="card-title">俱乐部头像');
    expect(edit).toContain('<span class="card-no">02</span><h3 class="card-title">俱乐部背景图');
    expect(edit).toContain('<span class="card-no">03</span><h3 class="card-title">基本资料');
    expect(edit.indexOf('俱乐部头像')).toBeLessThan(edit.indexOf('俱乐部背景图'));
    expect(edit.indexOf('俱乐部背景图')).toBeLessThan(edit.indexOf('基本资料'));
    expect(edit).toContain('profile-avatar-editor');
    expect(edit).toContain('profile-avatar-preview');
    expect(edit).toContain('profile-avatar-panel');
    expect(edit).toContain('club-background-editor');
    expect(edit).toContain('data-aspect-ratio="16:9"');
    expect(css).toMatch(/\.club-background-preview\s*\{[^}]*aspect-ratio:\s*16 \/ 9;/s);
    expect(edit).toContain('data-action="club-create-submit"');
    expect(edit).not.toContain('加入设置');
    expect(edit).not.toContain('人数上限');
    expect(edit).not.toContain('保存草稿');
    expect(edit).not.toContain('提交审核');
  });

  it('唯一俱乐部表单状态覆盖编辑、首次创建与恢复，且旧多俱乐部申请状态已下线', () => {
    for (const state of [
      "['edit', '编辑唯一俱乐部']",
      "['bootstrap', '空库首次创建（仅平台管理员）']",
      "['validation-error', '校验错误']",
      "['avatar-uploading', '头像上传中']",
      "['cover-uploading', '背景上传中']",
      "['submitting', '保存中']",
      "['submit-error', '保存失败']",
      "['success', '保存成功']",
    ]) {
      expect(schema).toContain(state);
    }
    const center = renderPrototypeState('club/center', 'pending-review');
    expect(center).toContain('data-mode="home"');
    expect(center).not.toContain('撤回申请');
    expect(script).not.toContain("action === 'confirm-club-application'");
    expect(script).not.toContain("action === 'submit-club-application'");
  });

  it('单俱乐部收口：M0 组织地基审批原型与 planned-club-* 已全部下线', () => {
    for (const route of retiredPrototypeRoutes) {
      expect(schema).not.toMatch(new RegExp(`id: '${route}'`));
      expect(templates).not.toMatch(new RegExp(`(?:^|\\n)    ['"]?${route}['"]?: \\(\\) =>`));
      expect(appConfig.pages).not.toContain(routeToPagePath(route));
    }
    // 下线 app.js 的旧 journey、动作与 outcome 分支
    expect(script).not.toContain("'org-approval': 'org-overview'");
    expect(script).not.toContain("action === 'publish-target-admin'");
    expect(script).not.toContain("action === 'org-approve'");
    expect(script).not.toContain("action === 'org-reject'");
    expect(html).not.toContain('data-journey="org-approval"');
    expect(html).not.toContain('M0 待实施');
    // orgApproval 数据块随之删除，不再在 schema 中出现
    expect(schema).not.toMatch(/\n {2}orgApproval:/);
    // planned-club-* 规划页随多俱乐部语义一同下线
    expect(schema).not.toMatch(/id: 'planned-club-/);
    expect(templates).not.toMatch(/'planned-club-[a-z-]+': \(\) =>/);
    // 单俱乐部收口的组织地基表达保留在交付中心，仅做文案归档
    expect(deliveryCenter).toContain('组织地基与活动归属（单俱乐部收口）');
    expect(deliveryCenter).toContain('全平台始终只有一个俱乐部');
  });

  it('单俱乐部口径下的身份原型渲染唯一俱乐部与活动归属快照', () => {
    const activitiesPage = renderPrototypeState('activities', 'default');
    expect(activitiesPage).toContain('aria-label="辛庄桥小火车头像"');
    expect(activitiesPage).toContain('辛庄桥');
    expect(activitiesPage).not.toContain('此里公开活动');

    const detailPage = renderPrototypeState('activity-detail', 'approved');
    expect(detailPage).toContain('class="card host-card host-card-club"');
    expect(detailPage).toContain('辛庄桥小火车');
    expect(detailPage).toContain('所有活动都属于唯一俱乐部');

    const registrationsPage = renderPrototypeState('registrations', 'default');
    expect(registrationsPage).toContain('浦东滨江夜骑 · 鎏金落日线');
    expect(registrationsPage).toContain('辛庄桥小火车');
    expect(registrationsPage).toContain('成行时快照');
    expect(registrationsPage).toContain('奉贤海湾拉练');
    expect(registrationsPage).not.toContain('此里公开活动');

    const credentialPage = renderPrototypeState('credential', 'with-photo');
    expect(credentialPage).toContain('辛庄桥小火车');
    // 单俱乐部收口：凭证快照不再把活动归属标注为「（俱乐部活动）」或「此里公开活动」
    expect(credentialPage).not.toContain('（俱乐部活动）');
    expect(credentialPage).not.toContain('此里公开活动');
    expect(credentialPage).toContain('成行时快照');
    expect(credentialPage).toContain('历史行程与凭证保留成行时的活动归属');

    for (const state of ['single-club', 'member', 'admin', '']) {
      const output = renderPrototypeState('profile', state);
      expect(output).toContain('data-single-club');
      expect(output).toContain('辛庄桥小火车');
      expect(output).toContain('进入俱乐部主页');
      expect(output).toContain('data-state="home"');
      expect(output).not.toMatch(/发现附近俱乐部|查看全部俱乐部|已加入 \d+ 个俱乐部/);
      expect(output).not.toMatch(/主俱乐部|首选俱乐部/);
    }
    const adminProfile = renderPrototypeState('profile', 'admin');
    expect(adminProfile).toContain('管理俱乐部资料');
    expect(adminProfile).toContain('data-route="admin-club-applications"');
    const memberProfile = renderPrototypeState('profile', 'member');
    expect(memberProfile).not.toContain('管理俱乐部资料');
    expect(memberProfile).not.toContain('data-route="admin-club-applications"');
  });

  it('快照按 activityId/credentialId 查找，并保证缺失 clubIdentity 不抛错', () => {
    expect(templates).toContain('snapshotData.byActivityId[activityId]');
    expect(templates).toContain('snapshotData.byCredentialId[credentialId]');
    expect(templates).not.toMatch(/tripClubSnapshots\.(pudongSunset|fengxianCancelled)/);

    const missingIdentityRuntime = createPrototypeRuntime((data) => {
      delete data.clubIdentity;
    });
    const missingIdentityActivities = renderFromRuntime(
      missingIdentityRuntime,
      'activities',
      'default',
    );
    const missingIdentityDetail = renderFromRuntime(
      missingIdentityRuntime,
      'activity-detail',
      'approved',
    );
    const missingIdentityRegistrations = renderFromRuntime(
      missingIdentityRuntime,
      'registrations',
      'default',
    );
    const missingIdentityCredential = renderFromRuntime(
      missingIdentityRuntime,
      'credential',
      'with-photo',
    );
    for (const output of [
      missingIdentityActivities,
      missingIdentityDetail,
      missingIdentityRegistrations,
      missingIdentityCredential,
    ]) {
      expect(output).toContain('辛庄桥小火车');
      expect(output).not.toMatch(
        /host-card-public|club-avatar-public|club-identity is-public|>公开<|此里公开活动/,
      );
    }
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
    expect(templates).toContain('其他骑友缺少素材时只显示昵称和报名状态');
  });

  it('真实页面与 M0 原型页面都带浅色关键状态与“问题 → 改法 → 规范”设计说明，并提供总览页', () => {
    expect(schema.match(/\n {6}states: \[/g)).toHaveLength(17);
    expect(schema.match(/\n {6}problems: \[/g)).toHaveLength(17);
    expect(schema.match(/\n {6}fixes: \[/g)).toHaveLength(17);
    expect(schema.match(/\n {6}spec: \[/g)).toHaveLength(17);
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
    expect(deliveryCenter).toContain('组织地基与活动归属（单俱乐部收口）');
    expect(deliveryCenter).toContain('全平台始终只有一个俱乐部');
    expect(deliveryCenter).toContain('不再区分俱乐部活动与公开活动');
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

  it('敏捷研发流程文章接入交付中心并说明影响面、夜间全量与自治边界', () => {
    const deliveryRuntime: {
      deliveryCenter?: { render: () => string };
    } = {};
    new Function('window', deliveryCenter)(deliveryRuntime);
    const renderedDeliveryCenter = deliveryRuntime.deliveryCenter?.render() ?? '';

    expect(deliveryCenter).toContain("id: 'agile-delivery-article'");
    expect(deliveryCenter).toContain("href: 'articles/agile-delivery.html'");
    expect(renderedDeliveryCenter).toContain('href="articles/agile-delivery.html"');
    for (const content of [
      '把测试放到正确的时间窗口',
      '影响面快速通道',
      '凌晨全量审计',
      'PR 影响面矩阵',
      '自治修复有边界',
      '验收不是“跑得快”',
      'prefers-reduced-motion',
      '[1] GitHub Actions',
      '[2] Vitest CLI',
      '[3] Nx',
    ]) {
      expect(agileDeliveryArticle).toContain(content);
    }
    for (const asset of [
      {
        href: '../assets/articles/agile-delivery/dual-speed-delivery.webp',
        file: 'docs/assets/articles/agile-delivery/dual-speed-delivery.webp',
      },
      {
        href: '../assets/articles/agile-delivery/impact-graph-and-safety.webp',
        file: 'docs/assets/articles/agile-delivery/impact-graph-and-safety.webp',
      },
    ]) {
      expect(agileDeliveryArticle).toContain(asset.href);
      expect(read(asset.file).length).toBeGreaterThan(0);
    }
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
    expect(schema).toContain("state: '通知、隐私与缓存管理'");
    expect(schema).toContain(
      "['2026.10.21.1', '活动发布全流程恢复', '有限名额活动可正常创建发布，历史数据清理与真实全流程验收已闭环。']",
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
    const allowedSelectors =
      /^(\.(tag-success|tag-warning|inline-toast|club-admin-card-status)|\.activities-v3 \.activity-card-v3\.is-(closing|joined) \.activity-card-status|\.route-source-conn\.tone-(success|warning) \.route-source-conn-dot)$/;
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
    expect(templates).toContain('activity-card-v3 is-${presentation.state}');
    expect(templates).toContain("label: '即将满员'");
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

  it('活动详情同步关键指标、报名状态、Strava 只复制链接与完整路线分析入口', () => {
    expect(templates).toContain('预计骑行');
    expect(templates).toContain('已通过');
    expect(templates).toMatch(/class="detail-decision(\s|")/);
    expect(templates).toContain('Strava 官方路线');
    expect(templates).toContain('复制路线链接');
    expect(templates).toContain('data-action="copy-route"');
    expect(templates).toContain('路线链接已复制');
    expect(templates).toContain('复制失败，请稍后重试');
    expect(schema).toContain("['copied', '路线链接已复制']");
    expect(schema).toContain("['copy-failed', '复制失败']");
    expect(script).toContain("if (action === 'copy-route')");
    expect(css).toContain('.inline-toast');
    // 活动详情只保留关键路线指标与完整分析入口，不重复绘制轮廓或海拔曲线。
    expect(templates).toContain('class="card route-brief-card"');
    expect(templates).toContain('路线详情');
    expect(templates).not.toContain('route-brief-sparkline');
    expect(templates).toContain('查看完整路线分析');
    expect(templates).toContain("go('route-analysis')");
    expect(templates).toContain('授权获取头像与骑行背景');
    expect(templates).toContain('其他骑友缺少素材时只显示昵称和报名状态');
    expect(templates).toContain('活动群二维码');
    // 管理员活动编辑页收敛为「Strava 链接」唯一主路径；本地路线文件（原 GPX 入口）只隐藏在「+」展开的 bottom-sheet 中，
    // 保证"路线事实源"进入系统的路径不变，但默认态页面不再向用户暴露 GPX 等专业词或上传控件。
    expect(templates).toContain('粘贴 Strava 线路链接');
    expect(templates).toContain('公开路线轮廓');
    // 海拔曲线作为 metric 继续以数据格「海拔区间」承载（里程 / 爬升 / 下降 / 海拔区间）
    expect(templates).toContain('海拔区间');
    expect(templates).toContain('route-boost-sheet'); // 「+」展开后承载本地文件补充能力的 bottom-sheet
    expect(templates).toContain('本地路线文件（补充）'); // 弹层标题，默认态页面不可见
  });

  it('只保留面向用户的 Strava 线路同步表达，不恢复账号主页、解绑或技术词汇', () => {
    const currentPrototype = [html, schema, templates, script].join('\n');
    expect(currentPrototype).not.toMatch(
      /重新授权 Strava|解绑 Strava|同步最新 Strava|STRAVA 数据已同步|data-route="strava"/i,
    );
    // 面向用户的入口（docs/templates.js 内 Pages 原型）统一为「同步 Strava 线路信息」/「粘贴 Strava 线路链接」，
    // 不再出现「连接 Strava / 从 Strava 导入 / 复制授权链接」等技术化动词；
    // schema.js 的变更日志、app.js 的技术长读等历史叙事允许保留这些术语，仅页面原型（templates）严格收敛。
    expect(templates).toContain('同步 Strava 线路信息');
    expect(templates).toContain('粘贴 Strava 线路链接');
    expect(templates).not.toContain('连接 Strava');
    expect(templates).not.toContain('从 Strava 导入');
    expect(templates).not.toContain('复制授权链接');
    expect(schema).toContain(
      "copy: '查看个人资料与俱乐部信息；已加入俱乐部时直接显示名称并进入俱乐部主页。'",
    );
    expect(templates).toContain('App 更新');
    expect(templates).not.toContain('Strava 状态');
  });

  it('活动编辑默认只走 Strava 链接；本地路线文件补充能力隐藏在「+」里，默认态不暴露 GPX / 上传 / 本地文件文案', () => {
    // 创建 / 编辑态默认只有「粘贴 Strava 线路链接」作为唯一主路径
    expect(templates).toContain('粘贴 Strava 线路链接');
    expect(templates).toContain('route-source-conn'); // Strava 连接状态胶囊（已连接 / 即将失效 / 已失效 / 未连接）
    expect(templates).toContain('route-link-plus'); // 「+」隐藏增强入口
    expect(templates).toContain('aria-controls="route-boost-sheet"');
    // 本地文件补充路径只以 bottom-sheet 形态承载，默认态页面不可见；用户文案不出现技术词
    expect(templates).toContain('route-boost-sheet');
    expect(templates).toContain('本地路线文件（补充）');
    expect(templates).not.toContain('Strava 路线导入（可选）');
    expect(templates).not.toContain('复制授权链接');
    expect(templates).not.toContain('从 Strava 导入');
    expect(templates).not.toContain('GPX 路线详情（推荐）');
    expect(templates).not.toContain('data-legacy-copy');
    // 覆盖确认 / 已失效 / 已就绪等关键状态文案保留
    expect(templates).toContain('覆盖并使用文件');
    expect(templates).toContain('线路已解析');
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
    // 关键公里点：地名 + km + 海拔 + 用途/注意；原始经纬度不得进入普通用户 UI。
    expect(templates).toContain('ra-tl-caution');
    expect(templates).not.toContain('ra-tl-geo');
    // 补给方案：节奏 + 补给点 + ETA + 携带下限
    expect(templates).toContain('ra-rhythm-list');
    expect(templates).toContain('ra-sp-row');
    expect(templates).toContain('ra-sp-eta');
    expect(templates).toContain('预计到达');
    expect(templates).toContain('随身携带下限');
    expect(templates).toContain('ra-carry-list');
    // 卫生间 POI：WC 标记 + 名称 + 偏离距离 + 开放备注，不展示原始坐标。
    expect(templates).toContain('ra-wc-list');
    expect(templates).toContain('ra-wc-mark');
    expect(templates).not.toContain('ra-wc-geo');
    expect(templates).toContain('偏离主路');
    expect(templates).toContain('全天开放');
    // V3 高保真"路线走向·关键地名"模块（对齐最终设计参考）
    expect(templates).toContain('路线走向 · 关键地名');
    expect(templates).toContain('按海拔着色 · 骑行方向顺序 · 点击可查看地名与路线提示');
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
    // 普通用户详情不展示原始坐标；起点卡只保留地名、必要描述和导航快捷按钮。
    expect(templates).toContain('ra-map-detail');
    expect(templates).toContain('ra-map-detail-start');
    expect(templates).toContain('data-action="navigate-route-start"');
    expect(script).toContain("action === 'navigate-route-start'");
    expect(templates).toContain('导航到起点');
    expect(templates).not.toContain('ra-detail-coord');
    expect(templates).not.toContain('copy-route-coord');
    expect(templates).not.toContain('fmtLatLng');
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
    expect(script).toContain('全平台始终只有一个俱乐部');
    // 05 隐私与产品边界 · Strava OAuth 仅恢复路线 GPX 导入
    expect(script).toContain('✓ 公开可见');
    expect(script).toContain('✗ 公开不可见');
    expect(script).toContain('Strava OAuth 仅恢复路线 GPX 导入');
    expect(script).toContain('AES-256-GCM');
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
    // 单俱乐部收口：仅保留 4 个 Pages 规划原型；多俱乐部治理 / 组织地基演进原型已下线
    expect(script).toContain('4 个规划原型画面');
    expect(script).toContain('隐私与授权说明、通知中心、全局离线 / 网络错误、活动分享海报');
    expect(script).toContain('报名信息同步腾讯文档 — 需求阶段');
    expect(script).not.toContain('组织地基与审批演进原型');
    expect(script).not.toContain('多俱乐部 / 多组织租户');
  });

  it('事实边界：Strava token 仅在云端；GPX 可下载预览；CloudBase 仅变更时部署；路由只写已上线', () => {
    const page = [html, script, deliveryCenter].join('\n');
    expect(page).toContain('前端不接触 token');
    expect(page).toContain('手动上传 GPX');
    expect(page).toMatch(/只部署受影响|仅.{0,2}变更/);
    expect(page).toContain('GPX');
    // 退役文档不再被当作 external-apis 的 source 链接
    expect(deliveryCenter).not.toContain('docs/strava-athlete-capacity.md');
    // 单俱乐部收口：全平台只有一个俱乐部，由平台管理员直接创建；活动统一归属该俱乐部
    expect(deliveryCenter).toContain('全平台始终只有一个俱乐部');
    expect(deliveryCenter).toContain('所有活动统一归属该唯一俱乐部');
    // 旧的俱乐部活动 / 公开活动审批表达不得作为后续目标残留
    expect(deliveryCenter).not.toContain('俱乐部活动与公开活动发布审批');
    expect(deliveryCenter).not.toContain('尚未进入生产');
    // 扫码核销入口已退役：凭证只展示活动与审核状态，签到由管理员二次确认。
    expect(script).toContain('当前没有扫码核销入口');
    expect(script).not.toMatch(/Code 128|wx\.scanCode/);
  });

  it('header / footer / meta 的叙事与新章节一致', () => {
    expect(html).toContain('<title>此里 · 一次骑行是如何被设计、报名、审批、交付的');
    expect(html).toContain('content="此里骑行活动小程序研发交付中心 · 技术长读');
    expect(html).toContain('<b>7 章</b><span>技术长读</span>');
    expect(html).toContain('此里 CILI · 一次骑行是如何被设计、报名、审批、交付的 · 研发交付中心');
    expect(html).toContain('Strava OAuth 仅用于云端 GPX 路线导入，手动上传仍可降级');
  });
});

describe('路线分析 Pages 降级状态契约', () => {
  it('no-waypoint 仍渲染真实剖面 DOM，parse-fail 重试进入 loading', () => {
    const noWaypoint = renderPrototypeState('route-analysis', 'no-waypoint');
    expect(noWaypoint).toContain('class="ra-chart"');
    expect(noWaypoint).toContain('data-profile-chart="no-waypoint"');
    expect(noWaypoint).toContain('按剖面曲线自行判断强度');

    const parseFail = renderPrototypeState('route-analysis', 'parse-fail');
    expect(parseFail).toContain('重试解析');
    expect(parseFail).toContain('data-route="route-analysis" data-state="loading"');
    expect(parseFail).not.toContain('正在重新解析 GPX');
  });
});

describe('俱乐部中心（club/center）主页原型契约', () => {
  const forbiddenUniquenessCopy = /全网唯一|全平台唯一|唯一俱乐部/;

  it('schema 与正式路由统一，并声明 home / empty / manage / loading / error 五种 mode', () => {
    expect(prototypeRoutes).toContain('club/center');
    expect(schema).toContain("id: 'club/center'");
    expect(schema).toContain("path: 'pages/club/center/index'");
    expect(schema).toContain("title: '俱乐部中心'");
    for (const state of [
      "['home', '主页 · 3 场近期活动']",
      "['empty', '近期暂无活动']",
      "['manage', '编辑资料（仅平台管理员 / 被授权管理员）']",
      "['loading', '加载中']",
      "['error', '加载失败']",
    ]) {
      expect(schema).toContain(state);
    }
    expect(schema).toContain('clubCenterPrototype:');
    expect(schema).toContain("name: '辛庄桥小火车'");
    const clubCenterBlock = schema.match(/clubCenterPrototype:\s*\{[\s\S]*?\n\s{2,4}\},/);
    expect(clubCenterBlock, 'expected to locate clubCenterPrototype block').not.toBeNull();
    expect(clubCenterBlock?.[0]).not.toMatch(/memberCount|capacity|joinMode|recommended/);
    expect(clubCenterBlock?.[0]).not.toMatch(forbiddenUniquenessCopy);
  });

  it('home 使用纯视觉封面与独立身份区，城市位于右上安全区且名称不叠在背景上', () => {
    const output = renderPrototypeState('club/center', 'home');
    expect(output).toContain('data-mode="home"');
    expect(output).toContain('class="club-center-cover"');
    expect(output).toContain('class="club-center-cover-loc"');
    expect(output).toContain('class="club-center-identity"');
    expect(output).toContain('class="club-center-name"');
    expect(output).toContain('class="club-center-intro"');
    expect(output.indexOf('class="club-center-cover"')).toBeLessThan(
      output.indexOf('class="club-center-identity"'),
    );
    const cover = output.slice(
      output.indexOf('class="club-center-cover"'),
      output.indexOf('class="club-center-identity"'),
    );
    expect(cover).not.toContain('club-center-name');
    expect(cover).not.toContain('辛庄桥小火车</h2>');
    expect(css).toMatch(
      /\.club-center-cover-loc\s*\{[^}]*top:\s*var\(--space-5\);[^}]*right:\s*var\(--space-5\);/s,
    );
    expect(css).toMatch(/\.club-center-identity\s*\{[^}]*background:\s*var\(--color-surface\);/s);
    expect(output).not.toMatch(forbiddenUniquenessCopy);
  });

  it('近期活动是白色容器内三行紧凑列表，整行进入详情且不是完整大卡片', () => {
    const output = renderPrototypeState('club/center', 'home');
    expect(output).toContain('class="club-event-list"');
    expect(output.match(/class="club-event-row"/g)).toHaveLength(3);
    expect(output.match(/data-route="activity-detail"/g)).toHaveLength(3);
    for (const content of [
      'club-event-date',
      'club-event-titleline',
      'club-event-status',
      'club-event-meta',
      'club-event-stats',
      'club-event-chevron',
      '妙峰山早骑 · 轻松节奏',
      '辛庄桥东北角',
      '62</b>km',
      '980</b>m 爬升',
      '18/24 报名',
    ]) {
      expect(output).toContain(content);
    }
    expect(output).not.toContain('activity-card');
    expect(output).not.toContain('club-event-cover');
    expect(output).not.toMatch(/立即报名|查看详情/);
    expect(css).toMatch(/\.club-event-list\s*\{[^}]*background:\s*var\(--color-surface\);/s);
    expect(css).toMatch(/\.club-event-row\s*\{[^}]*min-height:\s*96px;/s);
  });

  it('管理身份与编辑入口降级，普通 MEMBER 只读', () => {
    for (const roleToken of ['ADMIN', 'OWNER', 'CLUB_ADMIN', 'PLATFORM_OWNER']) {
      const runtime = createPrototypeRuntime((data) => {
        data.clubCenterPrototype.viewer.roleToken = roleToken;
        data.clubCenterPrototype.viewer.roleLabel = '管理员';
      });
      const output = renderFromRuntime(runtime, 'club/center', 'home');
      expect(output).toContain('class="club-center-admin-meta"');
      expect(output).toContain('编辑资料 ›');
      expect(output).toContain('data-state="manage"');
      expect(output).not.toContain('编辑俱乐部资料</button>');
      expect(output).not.toMatch(forbiddenUniquenessCopy);
    }
    const memberRuntime = createPrototypeRuntime((data) => {
      data.clubCenterPrototype.viewer.roleToken = 'MEMBER';
      data.clubCenterPrototype.viewer.roleLabel = '骑友';
    });
    const member = renderFromRuntime(memberRuntime, 'club/center', 'home');
    expect(member).not.toContain('data-state="manage"');
    expect(member).not.toContain('club-center-admin-meta');
  });

  it('manage 仅允许管理角色直达，并只覆盖基础资料与分离媒体裁剪', () => {
    const member = renderPrototypeState('club/center', 'manage');
    expect(member).toContain('data-mode="home"');
    expect(member).not.toContain('保存资料');

    const adminRuntime = createPrototypeRuntime((data) => {
      data.clubCenterPrototype.viewer.roleToken = 'ADMIN';
    });
    const output = renderFromRuntime(adminRuntime, 'club/center', 'manage');
    expect(output).toContain('data-mode="manage"');
    for (const text of ['俱乐部名称', '所在地区', '俱乐部简介']) {
      expect(output).toContain(text);
    }
    expect(output).toContain('俱乐部头像 · 1:1');
    expect(output).toContain('俱乐部背景图 · 16:9');
    expect(output).toContain('更换头像');
    expect(output).toContain('更换背景图');
    expect(output).not.toMatch(/加入方式|仅邀请|当前容量|\+50|\+100|\+500|人数上限/);
    expect(output).not.toMatch(forbiddenUniquenessCopy);
  });

  it('loading / error / empty 文案自然并保留恢复路径，所有 mode 均无旧 tablist', () => {
    const loading = renderPrototypeState('club/center', 'loading');
    expect(loading).toContain('data-mode="loading"');
    expect(loading).toContain('正在加载俱乐部主页…');
    const error = renderPrototypeState('club/center', 'error');
    expect(error).toContain('data-mode="error"');
    expect(error).toContain('暂时没能打开俱乐部主页');
    expect(error).toContain('请检查网络后重试');
    expect(error).toContain('重新加载');
    expect(error).toContain('data-route="club/center"');
    const empty = renderPrototypeState('club/center', 'empty');
    expect(empty).toContain('data-mode="empty"');
    expect(empty).toContain('近期还没有活动');
    expect(empty).toContain('新活动发布后会出现在这里');
    expect(empty).toContain('data-route="activities"');
    for (const mode of ['home', 'empty', 'manage', 'discovery', 'detail', 'loading', 'error']) {
      const output = renderPrototypeState('club/center', mode);
      expect(output).not.toContain('role="tablist"');
      expect(output).not.toContain('role="tab"');
      expect(output).not.toContain('role="tabpanel"');
      expect(output).not.toMatch(forbiddenUniquenessCopy);
    }
  });

  it('模板与 app.js 不再保留旧 tab 状态机、cover retry 或旧 route id 接线', () => {
    expect(templates).toContain("'club/center': () =>");
    expect(templates).not.toContain('window.clubCenterStateMachine');
    expect(templates).not.toContain('data-club-center-tabs');
    expect(templates).not.toContain('club-center-retry-cover');
    expect(script).not.toContain('clubCenterStateMachine');
    expect(script).not.toContain('data-club-center-tabs');
    expect(script).not.toContain('club-center-retry-cover');
    expect(script).toContain('payload.startsWith(`${id}/`)');
  });

  it('样式只保留主页、紧凑活动列表与媒体编辑视觉 class，并支持全局动效降级', () => {
    expect(css).not.toContain('.club-center-discovery-row');
    expect(css).not.toContain('.club-center-recommended');
    expect(css).not.toContain('.planned-club-');
    expect(css).not.toContain('.club-avatar-public');
    expect(css).toContain('.club-center-media-grid');
    expect(css).toContain('.club-event-list');
    expect(css).toContain('.club-event-row');
    expect(css).toMatch(
      /\.club-center-page:is\(\[data-mode='loading'\], \[data-mode='error'\], \[data-mode='manage'\]\)\s*\{[^}]*padding:\s*16px 16px 32px;/s,
    );
    expect(css).toContain('aspect-ratio: 1');
    expect(css).toContain('aspect-ratio: 16 / 9');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    for (const legacySelector of [
      '.club-center-tabs',
      '.club-center-tab',
      '.club-center-capacity',
      '.club-center-members',
      '.club-center-cover-retry',
      '.club-center-more-menu',
    ]) {
      expect(css).not.toContain(legacySelector);
    }
    expect(css).not.toMatch(/\.club-center-[a-z-]+\s*\{[^}]*backdrop-filter/s);
  });
});

describe('报名模式（公开 / 审批）· Pages 原型契约', () => {
  it('事实源文档声明 Pages-only、open/approval 两模式、T+1 结束与模式锁定', () => {
    const req = read('docs/requirements-design.md');
    expect(req).toMatch(/registration_mode/);
    expect(req).toMatch(/公开报名/);
    expect(req).toMatch(/审批报名/);
    // 发布审批与报名模式解耦
    expect(req).toMatch(/解耦|独立/);
    // T+1 自然结束规则
    expect(req).toMatch(/T\s*\+\s*1/);
    // 已有报名时禁止切换模式
    expect(req).toMatch(/已有报名|锁定/);
  });

  it('schema 导出 registrationModes 配置并声明两类 option', () => {
    const runtime = createPrototypeRuntime();
    const modes = runtime.prototypeData?.registrationModes;
    expect(modes).toBeTruthy();
    expect(modes.switchLockRule).toBeTruthy();
    expect(modes.endDisplay).toBeTruthy();
    const keys = (modes.options || []).map((option: any) => option.key).sort();
    expect(keys).toEqual(['approval', 'open']);
  });

  it('活动详情区分 open-public / open-approval / 结束态并给出不同 CTA 与徽标', () => {
    const openPublic = renderPrototypeState('activity-detail', 'open-public');
    expect(openPublic).toContain('data-registration-mode="open"');
    expect(openPublic).toContain('mode-pill-open');
    expect(openPublic).toContain('立即加入');
    // 公开报名不出现「待审批」承诺
    expect(openPublic).not.toContain('提交后由管理员审核');

    const openApproval = renderPrototypeState('activity-detail', 'open-approval');
    expect(openApproval).toContain('data-registration-mode="approval"');
    expect(openApproval).toContain('mode-pill-approval');
    expect(openApproval).toMatch(/pending|审核/);

    const full = renderPrototypeState('activity-detail', 'open-public-full');
    expect(full).toContain('名额已满');
    expect(full).toContain('is-disabled');

    const ended = renderPrototypeState('activity-detail', 'ended');
    expect(ended).toContain('T+1');
    expect(ended).toContain('活动已结束');
  });

  it('报名页公开模式走轻确认 → open 直接成功，审批模式仍走完整申请表 → pending', () => {
    const confirm = renderPrototypeState('registration-form', 'confirm');
    expect(confirm).toContain('data-registration-mode="open"');
    expect(confirm).toContain('确认加入');
    expect(confirm).toContain('data-action="submit-registration"');
    expect(confirm).toMatch(/data-registration-mode="open"/);
    // 公开确认不出现「能力自评 必选」门禁
    expect(confirm).not.toContain('请选择骑行经验后再提交');

    const full = renderPrototypeState('registration-form', 'confirm-full');
    expect(full).toContain('名额已满');

    const capacityChanged = renderPrototypeState('registration-form', 'confirm-capacity-changed');
    expect(capacityChanged).toContain('data-capacity-available="false"');

    const approval = renderPrototypeState('registration-form', 'selected');
    expect(approval).toContain('data-registration-mode="approval"');
    expect(approval).toContain('提交报名申请');
    expect(approval).toContain('能力自评');
  });

  it('app.js submit-registration 按 data-registration-mode 分支：open 跳凭证，approval 跳行程', () => {
    expect(script).toContain("if (action === 'submit-registration')");
    expect(script).toContain('target.dataset.registrationMode');
    // open 分支：直接成功并进入凭证
    expect(script).toMatch(
      /mode === 'open'[\s\S]*capacityAvailable === 'false'[\s\S]*confirm-full/,
    );
    expect(script).toMatch(/mode === 'open'[\s\S]*showPage\('credential'\)/);
    // approval 分支：保留 pending 提交反馈
    expect(script).toMatch(/报名已提交，等待管理员审核[\s\S]*showPage\('registrations'\)/);

    const capacityFull = renderPrototypeState('admin-review-detail', 'capacity-full');
    expect(capacityFull).toContain('名额已满');
    expect(capacityFull).toContain('申请仍保持待审核');
    expect(capacityFull).toContain('data-capacity-available="false"');
    expect(script).toMatch(
      /approve-review'[\s\S]*capacityAvailable === 'false'[\s\S]*capacity-full/,
    );
  });

  it('活动编辑页加入“报名设置”卡：edit-open 预览公开模式，mode-locked 禁用切换', () => {
    const editOpen = renderPrototypeState('admin-activity-edit', 'edit-open');
    expect(editOpen).toContain('mode-settings-card');
    expect(editOpen).toContain('data-mode-option="open"');
    expect(editOpen).toContain('data-mode-option="approval"');
    expect(editOpen).toContain('data-registration-mode="open"');

    const locked = renderPrototypeState('admin-activity-edit', 'mode-locked');
    // 锁定态仅通过 radio 的禁用来体现，不再出现 "已有报名/禁止切换/锁定" 文案
    expect(locked).toContain('aria-disabled="true"');
    expect(locked).not.toMatch(/已有报名|禁止切换|模式已锁定/);
  });

  it('管理端 admin-reviews 仅审批模式进入审核；公开模式进入 open-mode-members 参与成员管理', () => {
    const approvalList = renderPrototypeState('admin-reviews', 'default');
    expect(approvalList).toContain('data-registration-mode="approval"');
    expect(approvalList).toContain('待审核');

    const openMembers = renderPrototypeState('admin-reviews', 'open-mode-members');
    expect(openMembers).toContain('data-registration-mode="open"');
    expect(openMembers).toContain('参与成员');
    // 公开模式不出现 pending/rejected 流程
    expect(openMembers).not.toContain('待审核');
    expect(openMembers).not.toContain('已驳回');
  });

  it('我的行程卡片在骑友端标注报名方式，公开模式不出现审核中入口', () => {
    const trips = renderPrototypeState('registrations', 'default');
    expect(trips).toContain('mode-pill-open');
    expect(trips).toContain('mode-pill-approval');
    // 顶部计数：公开报名直接成功，审核中为 0
    expect(trips).toMatch(/>0<[\s\S]{0,120}审核中/);
  });

  it('样式复用现有 token，不把成功 / 警告色扩展到模式徽标与模式 CTA 上', () => {
    // 模式徽标不使用 status-success/warning tokens（会被独立契约断言）
    expect(css).toMatch(/\.mode-pill-open\s*\{[^}]*var\(--color-text\)/s);
    expect(css).toMatch(/\.mode-pill-approval\s*\{[^}]*var\(--color-action\)/s);
    expect(css).toMatch(/\.mode-cta-open\s*\{[^}]*var\(--color-text\)/s);
    expect(css).not.toMatch(/\.mode-(pill|cta)-open[^{}]*\{[^}]*--color-status-/s);
  });

  it('Pages 报名模式契约已同步到运行小程序与云函数', () => {
    const repository = readFileSync('miniprogram/repositories/cloud.ts', 'utf8');
    const editor = readFileSync('miniprogram/pages/admin/activity-edit/index.wxml', 'utf8');
    const registration = readFileSync('cloudfunctions/registration/domain/use-cases.js', 'utf8');
    expect(repository).toContain('registration_mode');
    expect(editor).toContain('data-mode="open"');
    expect(editor).toContain('data-mode="approval"');
    expect(editor).not.toContain('form.deadlineDate');
    expect(registration).toContain("activity.registration_mode === 'open'");
  });
});
