// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');
const appConfig = JSON.parse(read('miniprogram/app.json')) as { pages: string[] };
const html = read('docs/index.html');
const css = read('docs/styles.css');
const script = read('docs/app.js');
const schema = read('docs/schema.js');
const templates = read('docs/templates.js');

const prototypeRoutes = [
  'activities',
  'activity-detail',
  'registration-form',
  'registrations',
  'credential',
  'profile',
  'settings',
  'capability-card',
  'profile-edit',
  'admin-activity-list',
  'admin-activity-edit',
  'admin-reviews',
  'admin-review-detail',
];

const routeToPagePath = (route: string) =>
  route.startsWith('admin-')
    ? `pages/admin/${route.replace('admin-', '')}/index`
    : `pages/${route}/index`;

describe('GitHub Pages 全页面高保真原型门禁', () => {
  it('与 app.json 的 13 个可达页面逐一对应，官方路线页 route-view 不进入原型', () => {
    expect(prototypeRoutes).toHaveLength(13);
    // route-view 由 #210 从 app.json 删除；合并前后本断言都成立。
    expect(prototypeRoutes.map(routeToPagePath)).toEqual(
      appConfig.pages.filter((page) => page !== 'pages/route-view/index'),
    );
    for (const route of prototypeRoutes) {
      expect(schema).toContain(`id: '${route}'`);
      expect(schema).toContain(`path: '${routeToPagePath(route)}'`);
      expect(templates).toMatch(new RegExp(`(?:^|\\n)    ['"]?${route}['"]?: \\(\\) =>`));
    }
    expect(schema).not.toContain("id: 'route-view'");
    expect(templates).not.toMatch(/['"]?route-view['"]?: \(\) =>/);
    expect(html).toContain('13 / 13');
    expect(html).toContain('与 app.json 路由一一对应');
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

  it('每页都带浅色关键状态与“问题 → 改法 → 规范”设计说明，并提供总览页', () => {
    expect(schema.match(/\n {6}states: \[/g)).toHaveLength(13);
    expect(schema.match(/\n {6}problems: \[/g)).toHaveLength(13);
    expect(schema.match(/\n {6}fixes: \[/g)).toHaveLength(13);
    expect(schema.match(/\n {6}spec: \[/g)).toHaveLength(13);
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

  it('总览整理为需求、PRD、原型和验收资料入口，并支持章节直达', () => {
    expect(html).toContain('此里骑行活动小程序产品中心');
    expect(html).toContain('href="#requirements"');
    expect(html).toContain('href="#prd"');
    expect(script).toContain('id="requirements"');
    expect(script).toContain('id="prd"');
    expect(script).toContain('id="prototype"');
    expect(script).toContain('产品需求与当前能力');
    expect(script).toContain('P0 真实报名旅程');
    expect(script).toContain("new Set(['overview', 'requirements', 'prd', 'prototype'])");
    expect(script).toContain('document.getElementById(targetSection)?.scrollIntoView');
    expect(css).toContain('@media (max-width: 560px)');
    expect(css).toMatch(/\.product-card-grid,[^}]*grid-template-columns:\s*1fr/s);
  });

  it('保留票据式行程与凭证，并覆盖活动报名、能力和管理员审核旅程', () => {
    expect(templates).toContain('查看票据式行程凭证');
    expect(templates).toContain('class="credential-ticket"');
    expect(templates).toContain('class="credential-spotlight"');
    expect(templates).toContain('取消报名');
    expect(templates).toContain('队伍');
    expect(templates).toContain('data-route="registration-form"');
    expect(templates).toContain('data-route="admin-review-detail"');
    expect(script).toContain("registration: 'activities'");
    expect(script).toContain("credential: 'registrations'");
    expect(script).toContain("admin: 'admin-activity-list'");
  });

  it('支持哈希路由、页面回退、键盘切换和关键业务反馈', () => {
    expect(script).toContain("window.addEventListener('hashchange'");
    expect(script).toContain("window.addEventListener('keydown'");
    expect(script).toContain("if (action === 'back') goBack()");
    expect(script).toContain("if (action === 'submit-registration')");
    expect(script).toContain("if (action === 'approve-review' || action === 'reject-review')");
    expect(script).toContain("if (action === 'publish-activity')");
  });

  it('颜色变量与 miniprogram/app.wxss 同名同值（成功 / 警告色按规范先行），不引入装饰性渐变', () => {
    const wxss = read('miniprogram/app.wxss');
    const wxssVars = new Map(
      [...wxss.matchAll(/(--color-[a-z-]+):\s*(#[0-9a-f]{6})\b/gi)].map(([, name, value]) => [
        name,
        value.toLowerCase(),
      ]),
    );
    const statusVars = new Map([
      ['--color-status-success', '#1d7a3e'],
      ['--color-status-success-soft', '#e7f4eb'],
      ['--color-status-warning', '#7a5c00'],
      ['--color-status-warning-soft', '#fbf1cc'],
    ]);
    const prototypeInteractionVars = new Map([
      ['--color-on-brand', '#ffffff'],
      ['--color-action', '#e85b32'],
      ['--color-action-active', '#c84320'],
      ['--color-on-action', '#ffffff'],
    ]);
    const cssVars = [...css.matchAll(/(--color-[a-z-]+):\s*(#[0-9a-f]{6})\b/gi)];
    expect(cssVars.length).toBeGreaterThan(10);
    for (const [, name, value] of cssVars) {
      // 浏览器原型的交互别名先行切到品牌橙；其余共享变量与小程序保持同名同值。
      const expected =
        prototypeInteractionVars.get(name) ?? wxssVars.get(name) ?? statusVars.get(name);
      expect(expected, name).toBe(value.toLowerCase());
    }
    const declaredHex = new Set(cssVars.map(([, , value]) => value.toLowerCase()));
    const allHex = [...css.matchAll(/#[0-9a-f]{6}\b/gi)].map(([color]) => color.toLowerCase());
    expect(allHex.every((color) => declaredHex.has(color))).toBe(true);
    expect(css).not.toMatch(/navy|blue|linear-gradient|radial-gradient/i);
    expect(css).toContain('--color-text: #171717');
    expect(css).toContain('--color-brand: #e85b32');
    expect(css).toMatch(
      /\.credential-spotlight\s*\{[^}]*background:\s*var\(--color-media-card-bg\)/s,
    );
    expect(css).toMatch(/\.trip-ticket-info\s*\{[^}]*background:\s*var\(--color-raised\)/s);
  });

  it('成功 / 警告色只小范围用于小标签、行内提示和图标，不做底色、按钮、描边卡片', () => {
    for (const [name, value] of [
      ['--color-status-success', '#1d7a3e'],
      ['--color-status-success-soft', '#e7f4eb'],
      ['--color-status-warning', '#7a5c00'],
      ['--color-status-warning-soft', '#fbf1cc'],
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
    expect(css).toContain('--page-gutter: 24px');
    expect(css).toContain('--card-gap: 16px');
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

  it('活动详情同步四指标、报名状态、Strava 只复制链接与 GPX 原生详情', () => {
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
    expect(templates).toContain('GPX 路线详情');
    expect(templates).toContain('路线轮廓');
    expect(templates).toContain('海拔曲线');
    expect(templates).toContain('下载 GPX');
    expect(templates).toContain('活动群二维码');
  });

  it('不再展示 Strava 账号授权、同步或解绑能力', () => {
    const currentPrototype = [html, schema, templates, script].join('\n');
    expect(currentPrototype).not.toMatch(
      /(?<!无需 )Strava 授权|重新授权 Strava|解绑 Strava|同步最新 Strava|STRAVA 数据已同步|data-route="strava"/i,
    );
    expect(schema).toContain("copy: '查看公开骑行资料与照片，不依赖第三方账号数据。'");
    expect(templates).toContain('设置与升级日志');
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
    expect(templates).toContain('骑行照片');
    expect(templates).toContain('资料仅用于本次活动审核');
    expect(templates).toContain('活动中公开');
    expect(templates).not.toContain('仅本人查看');
    expect(templates).not.toContain('加权均速');
    expect(templates).not.toContain('累计爬升');
    expect(templates).not.toContain('90 天次数');
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
});
