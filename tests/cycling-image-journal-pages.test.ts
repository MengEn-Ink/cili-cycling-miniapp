// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');
const schema = read('docs/schema.js');
const templates = read('docs/templates.js');
const app = read('docs/app.js');
const styles = read('docs/styles.css');
const index = read('docs/index.html');
const deliveryCenter = read('docs/delivery-center.js');
const contract = JSON.parse(read('docs/design-contract.json')) as {
  tokens: Record<string, string | { pages: string }>;
};

type Runtime = {
  prototypeData?: {
    pages?: Array<{ id: string; states?: Array<[string, string]> }>;
    experienceStats?: { newStateVariants?: Record<string, string[]> };
  };
  prototypeState?: string;
  prototypeRegistrationOutcome?: string;
  pageTemplates?: Record<string, () => string>;
};

const runtime: Runtime = {};
new Function('window', schema)(runtime);
new Function('window', templates)(runtime);

describe('FORMAL GitHub Pages 骑行影像志', () => {
  it('保留 17 条正式路由，并把历史名片地址兼容跳转到“我的”', () => {
    expect(runtime.prototypeData?.pages).toHaveLength(21);
    expect(runtime.pageTemplates?.['capability-card']).toBeTypeOf('function');
    expect(app).toContain(
      "const canonicalRoute = route === 'capability-card' ? 'profile' : route;",
    );
    expect(app).toContain(".filter((page) => page.id !== 'capability-card')");
    expect(schema).toContain("title: '历史名片入口'");
    expect(schema).toContain("copy: '历史地址保留兼容，访问后回到“我的”");
  });

  it('正式模板只引用批准的本地 WebP，并提供深色无人物图片失败兜底', () => {
    for (const asset of ['mountain.webp', 'lakeside.webp', 'club.webp', 'rider.webp']) {
      expect(templates).toContain(`./designs/2026-10-22-cycling-image-journal/assets/${asset}`);
    }
    expect(templates).not.toContain('./assets/prototype/');
    expect(templates).toContain('class="journal-image-fallback"');
    expect(templates).toContain('data-image-fallback');
    expect(styles).toMatch(
      /\.journal-image-fallback\s*\{[^}]*background:\s*var\(--color-media-card-bg\)/s,
    );
  });

  it('“我的”以背景和头像组成骑行名片，媒体各自可操作且不再显示独立名片菜单', () => {
    runtime.prototypeState = 'member';
    const profile = runtime.pageTemplates?.profile?.() ?? '';
    expect(profile).toContain('profile-hero-card journal-profile-card');
    expect(profile).toContain('data-action="preview-profile-background"');
    expect(profile).toContain('data-action="preview-profile-avatar"');
    expect(profile).toContain('骑行背景');
    expect(profile).not.toContain('data-route="capability-card"');
    expect(profile).not.toContain('资料完整度');
  });

  it('17 路由共享摄影编辑式长屏，并覆盖 340/375/430 与安全区', () => {
    expect(styles).toContain('CYCLING IMAGE JOURNAL · FORMAL PAGES');
    expect(styles).toContain('font-family: "Songti SC", "STSong"');
    expect(styles).toContain('@media (max-width: 350px)');
    expect(styles).toContain('@media (min-width: 376px)');
    expect(styles).toContain('@media (min-width: 431px)');
    expect(styles).toContain('env(safe-area-inset-bottom)');
    expect(styles).toContain('@media (prefers-reduced-motion: reduce)');
  });

  it('保持双端 token 数值来源不变', () => {
    for (const token of [
      '--color-bg',
      '--color-text',
      '--color-action',
      '--page-gutter',
      '--control-height',
      '--route-preview-canvas-height',
      '--group-qr-code-size',
    ]) {
      const expected = contract.tokens[token];
      const pagesValue = typeof expected === 'string' ? expected : expected.pages;
      expect(styles).toMatch(
        new RegExp(`${token}:\\s*${pagesValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
      );
    }
  });

  it('首屏与交付中心立即提供正式最终版入口，同时保留技术文章和历史设计', () => {
    expect(index).toContain('骑行影像志 · 正式 Pages');
    expect(index).toContain('href="#profile"');
    expect(index).toContain('href="#activities"');
    expect(deliveryCenter).toContain("id: 'cycling-image-journal-formal'");
    expect(deliveryCenter).toContain("href: '#profile'");
    expect(deliveryCenter).toContain('当前正式 Pages');
    expect(deliveryCenter).toContain('Oil UI 全页面高信息密度交互方案');
    expect(deliveryCenter).toContain('设计演进记录');
  });

  it('设置页以 2026.10.22.2 展示骑行影像志当前版本', () => {
    expect(schema).toContain(
      "['2026.10.22.2', '骑行影像志正式上线', '活动、行程、资料与管理页面统一为摄影编辑式长屏；“我的”即骑行名片，历史名片地址自动回到“我的”。']",
    );
    runtime.prototypeState = 'default';
    const settings = runtime.pageTemplates?.settings?.() ?? '';
    expect(settings).toContain('V2026.10.22.2');
    expect(settings).toContain('2026.10.22');
  });

  it('报名提交按审核中、公开通过和满员候补展示真实行程结果', () => {
    const registrations = runtime.pageTemplates?.registrations;
    expect(registrations).toBeTypeOf('function');

    for (const [state, status, nextAction] of [
      ['review-pending', '待审核', '查看报名'],
      ['open-approved', '已报名', '查看凭证'],
      ['full-waiting', '候补中', '查看报名'],
    ]) {
      runtime.prototypeState = state;
      const output = registrations?.() ?? '';
      expect(output).toContain(`data-registration-outcome="${state}"`);
      expect(output).toContain(status);
      expect(output).toContain(nextAction);
    }

    expect(app).toMatch(
      /mode === 'open'[\s\S]*full-waiting[\s\S]*open-approved[\s\S]*review-pending/,
    );
    expect(app).not.toMatch(/mode === 'open'[\s\S]*showPage\('credential'\)/);
  });

  it('取消报名先确认，再回到已取消行程并提供重新报名', () => {
    runtime.prototypeState = 'with-photo';
    const credential = runtime.pageTemplates?.credential?.() ?? '';
    expect(credential).toContain('data-action="request-cancel-registration"');

    runtime.prototypeState = 'cancelled';
    const cancelled = runtime.pageTemplates?.registrations?.() ?? '';
    expect(cancelled).toContain('data-registration-outcome="cancelled"');
    expect(cancelled).toContain('已取消');
    expect(cancelled).toContain('重新报名');
    expect(app).toContain('showCancelRegistrationConfirmation');
    expect(app).toContain("action === 'confirm-cancel-registration'");
  });

  it('审批留在详情进入已通过，签到二次确认后进入已签到', () => {
    runtime.prototypeState = 'approved';
    const approved = runtime.pageTemplates?.['admin-review-detail']?.() ?? '';
    expect(approved).toContain('data-action="request-checkin"');

    runtime.prototypeState = 'checked-in';
    const checkedIn = runtime.pageTemplates?.['admin-review-detail']?.() ?? '';
    expect(checkedIn).toContain('已签到');
    expect(checkedIn).not.toContain('data-action="request-checkin"');
    expect(app).toMatch(
      /action === 'approve-review'[\s\S]*showPage\('admin-review-detail', \{ state: 'approved'/,
    );
    expect(app).toContain('showCheckinConfirmation');
    expect(app).toContain("action === 'confirm-checkin'");
  });

  it('活动通知按次请求，并明确提供接受和拒绝两种不阻断选择', () => {
    expect(app).toContain('showNotificationChoice');
    expect(app).toContain('data-action="notification-accept"');
    expect(app).toContain('data-action="notification-decline"');
    expect(app).toContain('不代表永久开启');
    expect(app).toContain('仍可在行程中查看报名状态');
  });

  it('背景上传期间整表不能编辑或保存，失败后保留原图并允许重试', () => {
    runtime.prototypeState = 'uploading';
    const uploading = runtime.pageTemplates?.['profile-edit']?.() ?? '';
    expect(uploading).toMatch(/<button[^>]*disabled[^>]*>上传处理中<\/button>/);
    expect(uploading).toContain('inert aria-busy="true"');

    runtime.prototypeState = 'upload-fail';
    const failed = runtime.pageTemplates?.['profile-edit']?.() ?? '';
    expect(failed).toContain('上传失败');
    expect(failed).toContain('原背景图已保留');
    expect(failed).toMatch(/<button[^>]*>重试<\/button>/);
    expect(failed).not.toContain('inert aria-busy="true"');
  });

  it('“我的”俱乐部信息扁平为一行，头像为圆形且不重复平台规则', () => {
    runtime.prototypeState = 'member';
    const profile = runtime.pageTemplates?.profile?.() ?? '';
    expect(profile).toContain('profile-club-row');
    expect(profile).not.toContain('profile-club-card');
    expect(profile).not.toContain('全平台唯一俱乐部');
    expect(styles).toMatch(/\.journal-avatar-action\s*\{[^}]*border-radius:\s*50%/s);
  });

  it('“我的”匹配最终原生名片尺度、深色遮罩与暖底扁平服务行', () => {
    expect(styles).toMatch(/\.journal-profile-card\s*\{[^}]*height:\s*340px/s);
    expect(styles).toMatch(
      /\.journal-profile-card \.profile-hero-identity h2\s*\{[^}]*font-size:\s*36px/s,
    );
    expect(styles).toMatch(
      /\.journal-profile-card \.profile-hero-shade\s*\{[^}]*rgba\(0,\s*0,\s*0,\s*0\.96\)[^}]*pointer-events:\s*none/s,
    );
    expect(styles).toMatch(
      /\.profile-club-row\s*\{[^}]*border-radius:\s*0[^}]*background:\s*var\(--color-bg\)/s,
    );
    expect(styles).toMatch(
      /\.journal-profile-page \.menu-card\s*\{[^}]*border-radius:\s*0[^}]*background:\s*var\(--color-bg\)/s,
    );
  });

  it('凭证不再重复骑行名片大图，并仅提供公开活动详情分享', () => {
    runtime.prototypeState = 'with-photo';
    const credential = runtime.pageTemplates?.credential?.() ?? '';
    expect(credential).not.toContain('credential-rider-heading');
    expect(credential).not.toContain('rider-card-poster');
    expect(credential).toContain('data-action="share-activity"');
    expect(credential).toContain('仅分享公开活动详情');
    expect(app).toContain("action === 'share-activity'");
    expect(app).toContain('不含本人的凭证、实名或电话');
  });

  it('活动卡使用封面底部墨黑标题栏，里程、爬升与预计骑行置于图外', () => {
    runtime.prototypeState = 'default';
    const activities = runtime.pageTemplates?.activities?.() ?? '';
    expect(activities).toContain('activity-journal-list');
    expect(activities).not.toContain('activity-carousel-shell');
    expect(activities).not.toContain('data-activity-slide');
    expect(activities).not.toContain('当前第 1 场');
    expect(activities).not.toContain('activity-carousel-prev');
    expect(activities).not.toContain('activity-carousel-next');
    expect(activities).not.toContain('activity-carousel-dot');
    expect(app).not.toContain('setupActivityCarousel');
    expect(app).not.toContain('activityCarouselController');
    expect(activities).toContain('journal-activity-caption');
    expect(activities.indexOf('journal-activity-caption')).toBeLessThan(
      activities.indexOf('activity-card-v3-body'),
    );
    for (const metric of ['里程', '爬升', '预计骑行']) {
      expect(activities).toContain(metric);
    }
    expect(styles).toMatch(
      /\.journal-activity-caption\s*\{[^}]*background:\s*var\(--color-media-card-bg\)[^}]*color:\s*var\(--color-on-media\)/s,
    );
  });

  it('card-v3 继续作为状态别名，但标签不再描述旧轮播尺寸', () => {
    const activities = runtime.prototypeData?.pages?.find((page) => page.id === 'activities');
    const alias = activities?.states?.find(([id]) => id === 'card-v3');
    expect(alias?.[1]).toBe('摄影编辑式长屏（兼容状态别名）');
    expect(runtime.prototypeData?.experienceStats?.newStateVariants?.activities).toContain(
      'card-v3',
    );
    expect(schema).not.toContain('主卡 86% · 306px · 封面 136px · 下一卡露出');
  });

  it('活动近期、历史及空态入口进入对应路由状态', () => {
    runtime.prototypeState = 'default';
    const upcoming = runtime.pageTemplates?.activities?.() ?? '';
    expect(upcoming).toMatch(/<button[^>]*data-state="history"[^>]*>历史活动<\/button>/);
    runtime.prototypeState = 'history';
    const history = runtime.pageTemplates?.activities?.() ?? '';
    expect(history).toMatch(
      /<button[^>]*is-active[^>]*data-state="history"[^>]*>历史活动<\/button>/,
    );
    expect(history).toMatch(/<button[^>]*data-state="default"[^>]*>即将开始<\/button>/);
    runtime.prototypeState = 'empty';
    expect(runtime.pageTemplates?.activities?.()).toMatch(
      /<button[^>]*data-state="history"[^>]*>查看历史活动<\/button>/,
    );
  });
});
