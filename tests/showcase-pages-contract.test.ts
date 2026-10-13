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
  'route-view',
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
  it('与 app.json 的 14 个真实页面逐一对应，不遗漏也不虚构路由', () => {
    expect(prototypeRoutes).toHaveLength(14);
    expect(prototypeRoutes.map(routeToPagePath)).toEqual(appConfig.pages);
    for (const route of prototypeRoutes) {
      expect(schema).toContain(`id: '${route}'`);
      expect(schema).toContain(`path: '${routeToPagePath(route)}'`);
      expect(templates).toMatch(new RegExp(`(?:^|\\n)    ['"]?${route}['"]?: \\(\\) =>`));
    }
    expect(html).toContain('14 / 14');
    expect(html).toContain('与 app.json 路由一一对应');
  });

  it('使用项目真实夹具口径填充活动和骑行指标，同时对隐私字段脱敏', () => {
    expect(schema).toContain("title: '秋日环湖耐力骑'");
    expect(schema).toContain('distanceKm: 82');
    expect(schema).toContain('elevationM: 680');
    expect(schema).toContain("title: '海风新手友好骑'");
    expect(schema).toContain("nickname: '风向骑手'");
    expect(schema).toContain("phone: '138****5678'");
    expect(schema).not.toMatch(/access_token|refresh_token|emergencyPhone/);
    expect(html).toContain('手机号等隐私字段已按产品规则脱敏');
  });

  it('保留票据式行程与凭证，并覆盖活动报名、能力和管理员审核旅程', () => {
    expect(templates).toContain('查看票据式行程凭证');
    expect(templates).toContain('class="credential-ticket"');
    expect(templates).toContain('class="credential-spotlight"');
    expect(templates).toContain('管理员扫码签到');
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

  it('网站继续遵循黑白橙三色规范且不引入装饰性渐变', () => {
    const hexColors = [...css.matchAll(/#[0-9a-f]{6}\b/gi)].map(([color]) => color.toLowerCase());
    expect(new Set(hexColors)).toEqual(new Set(['#f2f3ef', '#20241f', '#e85b32']));
    expect(css).not.toMatch(/navy|blue|linear-gradient|radial-gradient/i);
    expect(css).toContain('--bg: #f2f3ef');
    expect(css).toContain('--text: #20241f');
    expect(css).toContain('--brand: #e85b32');
    expect(css).toMatch(/\.credential-spotlight\s*\{[^}]*background:\s*var\(--text\)/s);
    expect(css).toMatch(/\.trip-ticket-info\s*\{[^}]*background:\s*var\(--text\)/s);
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

  it('活动详情同步四指标、报名状态、官方路线与 GPX 原生详情', () => {
    expect(templates).toContain('预计骑行');
    expect(templates).toContain('已通过');
    expect(templates).toContain('class="detail-decision"');
    expect(templates).toContain('Strava 官方路线');
    expect(templates).toContain('查看官方路线');
    expect(templates).toContain('GPX 路线详情');
    expect(templates).toContain('路线轮廓');
    expect(templates).toContain('海拔曲线');
    expect(templates).toContain('下载 GPX');
    expect(templates).toContain('活动群二维码');
  });

  it('不再展示 Strava 账号授权、同步或解绑能力', () => {
    const currentPrototype = [html, schema, templates, script].join('\n');
    expect(currentPrototype).not.toMatch(
      /Strava 授权|重新授权 Strava|解绑 Strava|同步最新 Strava|STRAVA 数据已同步|data-route="strava"/i,
    );
    expect(schema).toContain("copy: '查看公开骑行资料与照片，不依赖第三方账号数据。'");
    expect(templates).toContain('设置与升级日志');
    expect(templates).not.toContain('Strava 状态');
  });

  it('活动编辑同步官方链接与 GPX 双模式，路线查看页提供失败回退', () => {
    expect(templates).toContain('Strava 官方路线（可选）');
    expect(templates).toContain('粘贴公开路线链接');
    expect(templates).toContain('添加官方路线');
    expect(templates).toContain('GPX 路线详情（推荐）');
    expect(templates).toContain('上传 GPX');
    expect(templates).toContain('路线详情已准备好');
    expect(templates).toContain('设为活动背景');
    expect(templates).toContain('路线暂时无法显示');
    expect(templates).toContain('复制路线链接');
    expect(templates).toContain('无需连接 Strava 账号');
    expect(script).toContain("if (action === 'toggle-route-fallback')");
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
