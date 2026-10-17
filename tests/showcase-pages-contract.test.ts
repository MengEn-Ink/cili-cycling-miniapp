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
const templates = read('docs/templates.js');

const prototypeRoutes = [
  'activities',
  'activity-detail',
  'route-analysis',
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
  it('与 app.json 的 14 个可达页面逐一对应，官方路线页 route-view 不进入原型', () => {
    expect(prototypeRoutes).toHaveLength(14);
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
    expect(html).toContain('14 个真实页面原型');
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
    expect(schema.match(/\n {6}states: \[/g)).toHaveLength(14);
    expect(schema.match(/\n {6}problems: \[/g)).toHaveLength(14);
    expect(schema.match(/\n {6}fixes: \[/g)).toHaveLength(14);
    expect(schema.match(/\n {6}spec: \[/g)).toHaveLength(14);
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
    expect(html).toContain('此里骑行活动小程序 · 研发交付中心');
    expect(html).toContain('href="#delivery"');
    expect(html).toContain('href="#requirements"');
    expect(html).toContain('href="#guide"');
    expect(html).toContain('src="./delivery-center.js"');
    expect(script).toContain('id="requirements"');
    expect(script).toContain('id="prd"');
    expect(script).toContain('id="guide"');
    expect(script).toContain('id="prototype"');
    expect(script).toContain('产品需求与当前能力');
    expect(script).toContain('P0 真实报名旅程');
    expect(script).toContain("'delivery'");
    expect(script).toContain('deliveryCenter.extraOverviewAnchors');
    expect(deliveryCenter).toContain('沸点手稿与全套设计交接成果');
    expect(deliveryCenter).toContain('docs/designs/2026-10-16-boiling-point/index.html');
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
    expect(schema).toContain("state: 'V2026.10.17.79'");
    expect(schema).toContain(
      "['2026.10.17.79', '完整路线分析更快更稳', '路线分析与资料编辑按需加载；地图详情联动更完整，暂不可用时核心数据仍可查看。']",
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
    expect(schema).toContain("copy: '查看公开骑行资料与照片，不依赖第三方账号数据。'");
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
});
