// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (file: string) => readFileSync(file, 'utf8');

function cssBlocks(source: string, selector: string): string[] {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [...source.matchAll(new RegExp(`(?:^|\\n)\\s*${escaped}\\s*\\{([^}]*)\\}`, 'g'))].map(
    (match) => match[1],
  );
}

function cssBlock(source: string, selector: string): string {
  const blocks = cssBlocks(source, selector);
  expect(blocks, `missing CSS selector ${selector}`).not.toHaveLength(0);
  return blocks[blocks.length - 1] || '';
}

function declaration(block: string, property: string): string {
  const match = block.match(new RegExp(`(?:^|\\n)\\s*${property}\\s*:\\s*([^;]+);`));
  expect(match, `missing CSS declaration ${property}`).not.toBeNull();
  return match?.[1].trim() || '';
}

function rpx(block: string, property: string): number {
  const value = declaration(block, property);
  const match = value.match(/^(\d+(?:\.\d+)?)rpx$/);
  expect(match, `${property} must use an rpx value`).not.toBeNull();
  return Number(match?.[1]);
}

function relativeLuminance(hex: string): number {
  const raw = hex.replace('#', '');
  const normalized = raw.length === 3 ? [...raw].map((value) => value + value).join('') : raw;
  const channels = normalized
    .match(/.{2}/g)!
    .map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(foreground: string, background: string): number {
  const first = relativeLuminance(foreground);
  const second = relativeLuminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

function hexColor(value: string): string {
  const match = value.match(/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/i);
  expect(match, `expected hex color in "${value}"`).not.toBeNull();
  return (match?.[0] || '').toLowerCase();
}

// 本轮完成暗色接入的页面：此前它们仍落在浅色基线，与其它深色页面不一致。
const pages = [
  { root: 'miniprogram/pages/strava', page: '.strava-page' },
  { root: 'miniprogram/pages/credential', page: '.credential-page' },
  { root: 'miniprogram/pages/admin/activity-list', page: '.activity-list-page' },
  { root: 'miniprogram/pages/profile-edit', page: '.profile-form-page' },
];

describe('其余页面 CILI 暗色主题接入静态契约', () => {
  it.each(pages)('$root 原生导航栏与页面底色接入暗色', ({ root, page }) => {
    const config = JSON.parse(read(`${root}/index.json`));
    expect(config.navigationBarBackgroundColor.toLowerCase()).toBe('#0b0b0c');
    expect(config.navigationBarTextStyle).toBe('white');

    const styles = read(`${root}/index.wxss`);
    const rootBlock = cssBlock(styles, page);
    expect(declaration(rootBlock, 'background').toLowerCase()).toContain('#0b0b0c');
    expect(contrast(hexColor(declaration(rootBlock, 'color')), '#0b0b0c')).toBeGreaterThanOrEqual(
      4.5,
    );
  });

  it('Strava 页状态卡、数据指标与次按钮在暗色面板上可读', () => {
    const styles = read('miniprogram/pages/strava/index.wxss');
    expect(declaration(cssBlock(styles, '.status-card'), 'background')).toContain('#1b1b1d');
    expect(
      contrast(hexColor(declaration(cssBlock(styles, '.status-help'), 'color')), '#0b0b0c'),
    ).toBeGreaterThanOrEqual(4.5);
    expect(declaration(cssBlock(styles, '.strava-page .card'), 'background')).toContain('#242427');

    const metricBlock = cssBlock(styles, '.strava-page .metric');
    expect(declaration(metricBlock, 'background')).toContain('#1b1b1d');
    expect(contrast(hexColor(declaration(metricBlock, 'color')), '#1b1b1d')).toBeGreaterThanOrEqual(
      4.5,
    );
    // 大号指标数字属大字场景，3:1 即可；用偏亮橙保证可读
    expect(
      contrast(hexColor(declaration(cssBlock(styles, '.strava-page .big'), 'color')), '#1b1b1d'),
    ).toBeGreaterThanOrEqual(3);
    expect(declaration(cssBlock(styles, '.error-card'), 'background')).toContain('rgba(200');
  });

  it('报名凭证页主视觉、凭证卡与时间线在暗色面板上可读', () => {
    const styles = read('miniprogram/pages/credential/index.wxss');
    expect(declaration(cssBlock(styles, '.status-hero'), 'background')).toContain('#1c1c1e');
    expect(declaration(cssBlock(styles, '.credential-card'), 'background')).toContain('#1c1c1e');
    expect(hexColor(declaration(cssBlock(styles, '.serial'), 'color'))).toBe('#ff5722');
    expect(declaration(cssBlock(styles, '.meet-info'), 'background')).toBe('#2c2c2e');
    expect(
      contrast(hexColor(declaration(cssBlock(styles, '.review-comment'), 'color')), '#2c2c2e'),
    ).toBeGreaterThanOrEqual(4.5);
    expect(declaration(cssBlock(styles, '.credential-page .card'), 'background')).toContain(
      '#1c1c1e',
    );
    expect(
      contrast(
        hexColor(declaration(cssBlock(styles, '.credential-page .muted'), 'color')),
        '#0b0b0c',
      ),
    ).toBeGreaterThanOrEqual(4.5);

    const genericHeroOffset = styles.lastIndexOf('.status-hero {');
    const statusColors = new Set<string>();
    for (const status of ['pending', 'approved', 'rejected', 'cancelled']) {
      const selector = `.status-${status}`;
      const block = cssBlock(styles, selector);
      expect(
        styles.lastIndexOf(`${selector} {`),
        `${selector} must follow the generic hero rule`,
      ).toBeGreaterThan(genericHeroOffset);
      expect(declaration(block, 'background')).toContain('#1c1c1e');
      expect(declaration(block, 'background')).toContain('rgba(');
      const borderColor = hexColor(declaration(block, 'border-color'));
      expect(declaration(block, 'box-shadow')).toContain(borderColor);
      statusColors.add(borderColor);
    }
    expect(statusColors).toHaveLength(4);
    expect(
      contrast(
        hexColor(declaration(cssBlocks(styles, '.status-hero')[0] || '', 'color')),
        '#1c1c1e',
      ),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it('活动管理页卡片、标签、克隆表单输入与次按钮接入暗色', () => {
    const styles = read('miniprogram/pages/admin/activity-list/index.wxss');
    expect(declaration(cssBlock(styles, '.activity-list-page .card'), 'background')).toContain(
      '#242427',
    );
    expect(
      declaration(cssBlock(styles, '.activity-list-page .card.danger'), 'background'),
    ).toContain('rgba(200');
    expect(hexColor(declaration(cssBlock(styles, '.activity-list-page .tag'), 'color'))).toBe(
      '#f38a50',
    );
    expect(declaration(cssBlock(styles, '.activity-list-page .field input'), 'background')).toBe(
      '#151517',
    );
    expect(declaration(cssBlock(styles, '.activity-list-page .secondary'), 'background')).toBe(
      '#151517',
    );
  });

  it('编辑输入在常见手机上使用 96rpx 高度与单列布局', () => {
    const activityStyles = read('miniprogram/pages/admin/activity-edit/index.wxss');
    const activityControls =
      activityStyles.match(/\.field input,\s*\.field textarea\s*\{([^}]*)\}/s)?.[1] || '';
    const narrowLayout =
      activityStyles.match(/@media \(max-width:\s*(\d+)px\)\s*\{([\s\S]*?)\n\}/)?.slice(1) || [];
    const profileInput = cssBlock(
      read('miniprogram/pages/profile-edit/index.wxss'),
      '.form-card .input',
    );
    const cloneInput = cssBlock(
      read('miniprogram/pages/admin/activity-list/index.wxss'),
      '.activity-list-page .field input',
    );

    expect(rpx(activityControls, 'min-height')).toBeGreaterThanOrEqual(96);
    expect(rpx(profileInput, 'min-height')).toBeGreaterThanOrEqual(96);
    expect(rpx(cloneInput, 'min-height')).toBeGreaterThanOrEqual(96);
    expect(Number(narrowLayout[0])).toBeGreaterThanOrEqual(430);
    expect(narrowLayout[1]).toMatch(/\.split\s*\{[^}]*grid-template-columns:\s*1fr;/s);
    expect(activityStyles).not.toContain('var(--accent)');
  });

  it('活动状态标签在炭灰表面保持正文级对比度', () => {
    const styles = read('miniprogram/pages/admin/activity-list/index.wxss');
    const tag = cssBlock(styles, '.activity-list-page .tag');

    expect(
      contrast(hexColor(declaration(tag, 'color')), hexColor(declaration(tag, 'background'))),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it('创建/编辑活动页错误卡、清单标题与次按钮都保持暗色主题', () => {
    const styles = read('miniprogram/pages/admin/activity-edit/index.wxss');
    expect(declaration(cssBlock(styles, '.activity-form-page .card'), 'background')).toBe(
      '#242427',
    );
    expect(
      declaration(cssBlock(styles, '.activity-form-page .card.danger'), 'background'),
    ).toContain('rgba(200');
    expect(declaration(cssBlock(styles, '.activity-form-page .secondary'), 'background')).toContain(
      '#151517',
    );
    expect(declaration(cssBlock(styles, '.section-title'), 'color')).toBe('#f7f7f5');
  });

  it('资料编辑页补齐标签、头像外壳、错误条与上传按钮的暗色样式', () => {
    const styles = read('miniprogram/pages/profile-edit/index.wxss');
    expect(declaration(cssBlock(styles, '.profile-form-page .form-card'), 'background')).toBe(
      '#1a1a1c',
    );
    expect(
      contrast(
        hexColor(declaration(cssBlock(styles, '.profile-form-page .form-card .label'), 'color')),
        '#1a1a1c',
      ),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      declaration(cssBlock(styles, '.profile-form-page .avatar-preview-shell'), 'background'),
    ).toBe('#151517');
    expect(declaration(cssBlock(styles, '.profile-form-page .form-error'), 'background')).toContain(
      'rgba(200',
    );
    expect(declaration(cssBlock(styles, '.profile-form-page .photo-action'), 'background')).toBe(
      '#151517',
    );
  });
});
