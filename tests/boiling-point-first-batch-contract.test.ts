import { describe, expect, it } from 'vitest';
import { declaration, effectiveBlock, expectSemantic, read } from './theme-contract-helpers';

describe('沸点首批六页尺寸契约', () => {
  it('活动首页使用统一页边距，并以 pageheading + segment 承载时间与紧凑切换', () => {
    const app = read('miniprogram/app.wxss');
    const template = read('miniprogram/pages/activities/index.wxml');
    const styles = read('miniprogram/pages/activities/index.wxss');
    expect(app).toContain('padding: 32rpx var(--page-gutter);');
    expect(template).toContain('class="pageheading"');
    expect(template).toContain('class="pageheading-title editorial"');
    expect(template).toContain('class="segment"');
    expect(styles).toContain('.pageheading');
    expect(styles).toContain('.segment');
  });

  it('我的行程使用 pageheading + content.tight + ticket 票据结构', () => {
    const template = read('miniprogram/pages/registrations/index.wxml');
    const styles = read('miniprogram/pages/registrations/index.wxss');
    expect(template).toContain('class="pageheading"');
    expect(template).toContain('class="content tight"');
    expect(template).toMatch(/class="ticket status-\{\{item\.status\}\}"/);
    expect(styles).toContain('.ticket');
    expect(styles).toContain('.ticketbody');
    expect(styles).toContain('.ticketfooter');
    expect(styles).toContain('.trip-stats');
    // 旧 Oil UI 不得残留
    expect(styles).not.toMatch(/\.registration-list\s*\{/);
    expect(styles).not.toMatch(/\.registration-card\s*\{/);
    expect(template).not.toContain('<view class="ticket-body">');
  });

  it('活动详情使用 photo hero detail + ink + content 分区，并保留固定 actionbar', () => {
    const template = read('miniprogram/pages/activity-detail/index.wxml');
    const styles = read('miniprogram/pages/activity-detail/index.wxss');
    expect(template).toContain('photo hero detail');
    expect(template).toContain('class="ink"');
    expect(template).toContain('class="actionbar"');
    expect(styles).toContain('.photo.hero.detail');
    expect(styles).toContain('.ink');
    expect(styles).toContain('.actionbar');
    expect(styles).toMatch(/\.actionbar\s*\{[^}]*position:\s*fixed/s);
    // 旧 Oil UI 不得残留
    expect(styles).not.toMatch(/\.detail-decision\s*\{/);
  });

  it('创建活动使用统一页边距、扁平章节和 48px 控件', () => {
    const app = read('miniprogram/app.wxss');
    const styles = read('miniprogram/pages/admin/activity-edit/index.wxss');
    const card = effectiveBlock(app, '.form-card');
    expect(app).toContain('padding: 32rpx var(--page-gutter);');
    expect(styles).toMatch(
      /\.fieldgrid\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/s,
    );
    expect(styles).toMatch(
      /@media \(max-width: 340px\)[\s\S]*\.fieldgrid,[\s\S]*grid-template-columns:\s*1fr/s,
    );
    expect(styles).toMatch(
      /\.section\.form-card\.card\s*\{[^}]*padding:\s*0;[^}]*border:\s*0;[^}]*background:\s*transparent/s,
    );
    expect(declaration(card, 'padding')).toBe('var(--card-padding)');
    expect(declaration(card, 'border')).toBe('var(--card-border-width) solid var(--card-border)');
    expectSemantic(declaration(card, 'border-radius'), '--card-radius');
    expect(declaration(effectiveBlock(app, '.field input'), 'min-height')).toBe(
      'var(--control-height)',
    );
    expect(declaration(effectiveBlock(app, '.btn'), 'min-height')).toBe('var(--control-height)');
  });

  it('个人中心保留深色媒体 Hero，其余服务回到暖米白编辑列表', () => {
    const template = read('miniprogram/pages/profile/index.wxml');
    const styles = read('miniprogram/pages/profile/index.wxss');
    expect(template).toContain('bindtap="openSettings"');
    expect(template).toContain('aria-label="打开设置"');
    expect(template).not.toContain('<text>设置</text>');
    expect(styles).toMatch(/\.profile-hero\s*\{[^}]*aspect-ratio:\s*16 \/ 9/s);
    // v6 紧凑设计：三条 44px 分隔行替代旧 .menu-list / .menu-card，仍满足触控基线。
    const row = effectiveBlock(styles, '.row.rowlink.rowbutton');
    expect(declaration(row, 'min-height')).toBe('88rpx');
    expect(declaration(row, 'background')).toBe('transparent');
    expect(declaration(row, 'border-bottom')).toContain('var(--color-border)');
    expect(styles).not.toMatch(/\.menu-list\s*\{/);
    expect(styles).not.toMatch(/\.menu-card\s*\{/);
  });

  it('设置页按设计稿 settings.html 使用 pageheading + section 排版，不保留旧 release-card 结构', () => {
    const app = read('miniprogram/app.wxss');
    const styles = read('miniprogram/pages/settings/index.wxss');
    expect(app).toContain('padding: 32rpx var(--page-gutter);');
    // pageheading 字号与设计稿双行宋体对齐
    expect(declaration(effectiveBlock(styles, '.pageheading-title'), 'line-height')).toBe('80rpx');
    // row.rowlink.rowbutton 使用 52px 紧凑分隔行（保留完整触控区）
    const row = effectiveBlock(styles, '.row.rowlink.rowbutton');
    expect(declaration(row, 'min-height')).toBe('104rpx');
    expect(declaration(row, 'background')).toBe('transparent');
    expect(declaration(row, 'border-bottom')).toContain('var(--color-border)');
    // detailrows 用来承载"当前版本/本次更新"，不再是整块 release-card
    const detailrows = effectiveBlock(styles, '.detailrows');
    expect(declaration(detailrows, 'background')).toBe('transparent');
    expect(styles).not.toMatch(
      /theme-option|theme-preview|appearance-card|release-list|release-card/,
    );
  });

  it('报名凭证页禁用历史硬编码色并把关键文字收口到沸点 token', () => {
    const styles = read('miniprogram/pages/credential/index.wxss');
    const forbidden = [
      '#f7f7f5',
      '#c8c8cc',
      '#a8a8ad',
      '#9bc2aa',
      '#e9a071',
      '#6f9b82',
      '#1b1b1d',
      '#1c1c1e',
      '#151517',
      '#242427',
      '#2c2c2e',
      '#343438',
      '#3a3a3c',
      '#3a3a3e',
      '#ff8f86',
    ];
    for (const value of forbidden) {
      expect(styles.toLowerCase()).not.toContain(value);
    }
    expectSemantic(
      declaration(effectiveBlock(styles, '.credential-page'), 'background'),
      '--color-cinema-bg',
    );
    // 新结构：ticket.voucher 承载凭证主体
    expectSemantic(
      declaration(effectiveBlock(styles, '.ticket.voucher'), 'background'),
      '--color-surface',
    );
    expectSemantic(declaration(effectiveBlock(styles, '.person-meta'), 'color'), '--color-muted');
  });
});
