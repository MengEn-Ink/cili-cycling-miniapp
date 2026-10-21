// @ts-expect-error Vitest provides the Node runtime used by this repository.
import { globSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { APP_APPEARANCE, THEME_COLORS } from '../miniprogram/config/theme';
import { CLIENT_RELEASE_VERSION } from '../miniprogram/config/release';
import { uiTokens } from './theme-contract-helpers';

const read = (file: string) => readFileSync(file, 'utf8');
const appStyles = read('miniprogram/app.wxss');
const runtimeStyleRefs = globSync('miniprogram/**/*.{wxml,ts,js}').map(read).join('\n');
const pageStyles = read('docs/styles.css');
const miniTokens = uiTokens(appStyles);
const pagesTokens = Object.fromEntries(
  [
    ...(pageStyles.match(/:root\s*\{([^}]+)\}/)?.[1] || '').matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g),
  ].map((match) => [match[1], match[2].trim()]),
);

describe('统一主题设计契约', () => {
  it('建立 primitive -> semantic -> component 三层并保留既有语义名', () => {
    expect(appStyles).toMatch(/Primitive tokens[\s\S]*Semantic tokens[\s\S]*Component tokens/);
    expect(pageStyles).toMatch(/Primitive tokens[\s\S]*Semantic tokens[\s\S]*Component tokens/);
    expect(miniTokens['--primitive-color-vermilion']).toBe('#e13b2b');
    expect(miniTokens['--color-brand']).toBe('#e13b2b');
    expect(miniTokens['--button-bg']).toBe('var(--color-action)');
    expect(miniTokens['--card-radius']).toBe('var(--radius-card)');
    expect(miniTokens['--input-focus-ring']).toBe('var(--focus-ring)');
    expect(miniTokens['--segment-radius']).toBe('var(--radius-sm)');
  });

  it('被共享规则移除的旧选择器分支没有运行时引用', () => {
    const prunedSelectors = [
      'status-checked_in',
      'status-approved',
      'status-pending',
      'activity-picker',
      'snapshot-panel',
      'tag-warning',
      'tag-pending',
      'status-help',
      'status-card',
      'panel-index',
      'btn-text',
    ];
    for (const selector of prunedSelectors) {
      expect(runtimeStyleRefs).not.toMatch(
        new RegExp('(^|[^A-Za-z0-9_-])' + selector + '([^A-Za-z0-9_-]|$)'),
      );
    }
  });

  it('锁定朱红、米白、墨黑和双端克制圆角映射', () => {
    expect(THEME_COLORS).toMatchObject({
      brand: '#e13b2b',
      background: '#fbf5ea',
      ink: '#211f1c',
    });
    expect(miniTokens['--radius-xs']).toBe('8rpx');
    expect(miniTokens['--radius-sm']).toBe('12rpx');
    expect(miniTokens['--radius-md']).toBe('20rpx');
    expect(miniTokens['--radius-card']).toBe('28rpx');
    expect(miniTokens['--radius-display']).toBe('32rpx');
    expect(pagesTokens['--radius-xs']).toBe('4px');
    expect(pagesTokens['--radius-sm']).toBe('6px');
    expect(pagesTokens['--radius-md']).toBe('10px');
    expect(pagesTokens['--radius-card']).toBe('14px');
    expect(pagesTokens['--radius-display']).toBe('16px');
  });

  it('共享按钮、卡片、输入、标签与分段优先消费 component token', () => {
    for (const token of [
      '--button-bg',
      '--card-bg',
      '--input-bg',
      '--tag-bg',
      '--segment-bg',
      '--input-focus-ring',
    ]) {
      expect(appStyles).toContain(`var(${token})`);
      expect(pageStyles).toContain(`var(${token})`);
    }
  });

  it('theme-service 只消费 runtime SOT，app.json 核心静态色与其一致', () => {
    const service = read('miniprogram/services/theme-service.ts');
    const app = JSON.parse(read('miniprogram/app.json'));
    expect(service).toContain("import { APP_APPEARANCE } from '../config/theme'");
    expect(service).not.toMatch(/#[0-9a-f]{6}/i);
    expect(app.window.navigationBarBackgroundColor).toBe(APP_APPEARANCE.navigation.backgroundColor);
    expect(app.window.backgroundColor).toBe(APP_APPEARANCE.background.backgroundColor);
    expect(app.window.backgroundColorTop).toBe(APP_APPEARANCE.background.backgroundColorTop);
    expect(app.window.backgroundColorBottom).toBe(APP_APPEARANCE.background.backgroundColorBottom);
    expect(app.tabBar.backgroundColor).toBe(APP_APPEARANCE.tabBar.backgroundColor);
    expect(app.tabBar.color).toBe(APP_APPEARANCE.tabBar.color);
    expect(app.tabBar.selectedColor).toBe(APP_APPEARANCE.tabBar.selectedColor);
  });

  it('版本和用户可见更新说明升级且旧版本转为历史项', () => {
    const settings = read('miniprogram/pages/settings/index.ts');
    expect(CLIENT_RELEASE_VERSION).toBe('2026.10.21.2');
    expect(settings).toMatch(
      /version: CLIENT_RELEASE_VERSION[\s\S]*?title: '活动创建与审批恢复'[\s\S]*?latest: true/,
    );
    expect(settings).toMatch(
      /version: '2026\.10\.21\.1'[\s\S]*?title: '活动发布全流程恢复'[\s\S]*?latest: false/,
    );
    expect(settings).toMatch(
      /version: '2026\.10\.20\.7'[\s\S]*?title: '活动详情重点信息更突出'[\s\S]*?latest: false/,
    );
    expect(settings).toMatch(
      /version: '2026\.10\.20\.6'[\s\S]*?title: '唯一俱乐部主页上线'[\s\S]*?latest: false/,
    );
    expect(settings).toMatch(
      /version: '2026\.10\.20\.5'[\s\S]*?title: '俱乐部管理更清晰'[\s\S]*?latest: false/,
    );
    expect(settings).toMatch(
      /version: '2026\.10\.20\.4'[\s\S]*?title: '骑行名片、个人中心与路线分析修复'[\s\S]*?latest: false/,
    );
    expect(settings).toMatch(
      /version: '2026\.10\.20\.3'[\s\S]*?title: '管理端审核与活动安全修复'[\s\S]*?latest: false/,
    );
    expect(settings).toMatch(
      /version: '2026\.10\.20\.2'[\s\S]*?title: '报名凭证与活动详情更可靠'[\s\S]*?latest: false/,
    );
    expect(settings).toMatch(
      /version: '2026\.10\.19\.5'[\s\S]*?title: '俱乐部图片上传更稳定'[\s\S]*?latest: false/,
    );
    expect(settings).toMatch(
      /version: '2026\.10\.19\.4'[\s\S]*?title: '图片清理更可靠'[\s\S]*?latest: false/,
    );
    expect(settings).toMatch(
      /version: '2026\.10\.19\.3'[\s\S]*?title: '创建申请可撤回修改'[\s\S]*?latest: false/,
    );
    expect(settings).toMatch(
      /version: '2026\.10\.19\.2'[\s\S]*?title: '俱乐部活动投稿与审核'[\s\S]*?latest: false/,
    );
    expect(settings).toMatch(
      /version: '2026\.10\.19\.1'[\s\S]*?title: '图片上传链路全面统一'[\s\S]*?latest: false/,
    );
    expect(settings).toMatch(
      /version: '2026\.10\.18\.8'[\s\S]*?title: '界面风格统一'[\s\S]*?latest: false/,
    );
    expect(settings).toMatch(
      /version: '2026\.10\.18\.7'[\s\S]*?title: '图片上传稳定性升级'[\s\S]*?latest: false/,
    );
    expect(settings).toMatch(/version: '2026\.10\.18\.6'[\s\S]*?latest: false/);
    const latest = settings.match(/latest:\s*true/g) || [];
    expect(latest).toHaveLength(1);
    const currentEntry =
      settings.match(/const RELEASE_NOTES\s*=\s*\[\s*\{([\s\S]*?)\n\s*\},/)?.[1] || '';
    expect(currentEntry).not.toMatch(/令牌|Token|门禁/i);
  });

  it('route-analysis 高密度布局与 Canvas 语义色保持例外', () => {
    const routeStyles = read('miniprogram/pages/route-analysis/index.wxss');
    const chart = read('miniprogram/pages/route-analysis/utils/route-analysis-chart.ts');
    expect(routeStyles).toContain('border-radius: var(--radius-md)');
    expect(routeStyles).toContain('font-family: var(--font-mono)');
    expect(routeStyles).not.toContain('var(--card-radius)');
    expect(chart).toContain("selected ? '#211f1c' : '#e13b2b'");
    expect(chart).not.toContain('THEME_COLORS');
  });
});
