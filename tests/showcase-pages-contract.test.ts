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
  'strava',
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
});
