import { describe, expect, it } from 'vitest';
// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { execFileSync } from 'node:child_process';
import {
  contrast,
  declaration,
  effectiveBlock,
  expectSemantic,
  read,
  uiTokens,
} from './theme-contract-helpers';

const app = read('miniprogram/app.wxss');
const tokens = uiTokens(app);

describe('approved unified high-contrast UI', () => {
  it('uses the approved warm gray, charcoal, orange, green and warning palette', () => {
    expect(tokens['--color-bg']).toBe('#f3f3f1');
    expect(tokens['--color-surface']).toBe('#ffffff');
    expect(tokens['--color-raised']).toBe('#ececea');
    expect(tokens['--color-text']).toBe('#171717');
    expect(tokens['--color-muted']).toBe('#666666');
    expect(tokens['--color-border']).toBe('#d6d6d2');
    expect(tokens['--color-border-strong']).toBe('#171717');
    expect(tokens['--color-brand']).toBe('#e85b32');
    expect(tokens['--color-brand-active']).toBe('#c84320');
    expect(tokens['--color-status-success']).toBe('#1d7a3e');
    expect(tokens['--color-status-warning']).toBe('#7a5c00');
    expect(tokens['--metric-align']).toBe('left');
    expect(tokens['--page-heading-align']).toBe('left');
    expect(tokens['--radius-display']).toBe('32rpx');
  });

  it('keeps body, secondary and primary action text above WCAG AA', () => {
    expect(contrast(tokens['--color-text'], tokens['--color-bg'])).toBeGreaterThanOrEqual(7);
    expect(contrast(tokens['--color-muted'], tokens['--color-bg'])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(tokens['--color-on-brand'], tokens['--color-brand'])).toBeGreaterThanOrEqual(
      4.5,
    );
    expect(contrast(tokens['--color-on-action'], tokens['--color-action'])).toBeGreaterThanOrEqual(
      4.5,
    );
  });

  it('centers shared control labels without decorative gradients', () => {
    const button = effectiveBlock(app, '.btn');
    expect(declaration(button, 'display')).toBe('flex');
    expect(declaration(button, 'align-items')).toBe('center');
    expect(declaration(button, 'justify-content')).toBe('center');
    expect(declaration(button, 'min-height')).toBe('var(--control-height)');
    expect(declaration(button, 'background')).toBe('var(--color-action) !important');
    expect(declaration(button, 'color')).toBe('var(--color-on-action) !important');
    expect(button).not.toMatch(/gradient/i);
  });

  it('uses strong activity chrome while preserving a fixed metric grid', () => {
    const card = read('miniprogram/components/activity-card/index.wxss');
    const cardShell = effectiveBlock(card, '.activity-card');
    expect(declaration(cardShell, 'border')).toContain('var(--color-border)');
    expectSemantic(declaration(cardShell, 'background'), '--color-surface');
    expect(declaration(effectiveBlock(card, '.metrics'), 'grid-template-columns')).toBe(
      'repeat(3, minmax(0, 1fr))',
    );
    expect(card).not.toContain('.activity-card--compact');
    expect(card).not.toContain('.card-cta');
  });

  it('keeps the activity introduction on the reading axis and card borders visible', () => {
    const activities = read('miniprogram/pages/activities/index.wxss');
    expect(declaration(effectiveBlock(activities, '.activities-intro'), 'margin-top')).toBe(
      '16rpx',
    );
    const registrationCard = effectiveBlock(app, '.registration-card');
    expect(declaration(registrationCard, 'border')).toContain('var(--color-card-border)');
    expectSemantic(declaration(registrationCard, 'background'), '--color-surface');
  });

  it('uses a stable detail metric grid and reserves the fixed action area', () => {
    const detail = read('miniprogram/pages/activity-detail/index.wxss');
    expect(declaration(effectiveBlock(detail, '.metric-panel'), 'grid-template-columns')).toBe(
      'repeat(2, minmax(0, 1fr))',
    );
    expect(declaration(effectiveBlock(detail, '.detail-page'), 'padding-bottom')).toContain(
      'var(--fixed-action-reserve)',
    );
    expect(read('miniprogram/pages/activity-detail/index.wxml')).toContain(
      'class="fixed detail-action',
    );
  });

  it('makes the profile data action unmistakable and touch-safe', () => {
    const profile = read('miniprogram/pages/profile/index.wxss');
    const menuCard = effectiveBlock(profile, '.menu-card');
    const menuList = effectiveBlock(profile, '.menu-list');
    expect(declaration(menuList, 'border')).toContain('var(--color-border)');
    expectSemantic(declaration(menuCard, 'background'), '--color-surface');
    expect(declaration(menuCard, 'min-height')).toBe('120rpx');
  });

  it('keeps the fixed action reserve explicit across standard and narrow screens', () => {
    expect(tokens['--fixed-action-reserve']).toBe('224rpx');
    expect(tokens['--fixed-action-reserve-narrow']).toBe('276rpx');
    expect(app).toMatch(
      /@media \(max-width: 340px\)[\s\S]*?\.action-bar\s*\{[^}]*grid-template-columns:\s*1fr/s,
    );
  });

  it('keeps form titles centered, fields readable, and product UI free of negative tracking', () => {
    const registration = read('miniprogram/pages/registration-form/index.wxss');
    expect(declaration(effectiveBlock(registration, '.form-title'), 'text-align')).toBe('center');
    expect(declaration(effectiveBlock(registration, '.field-title'), 'text-align')).toBe('left');
    const output = execFileSync(
      'sh',
      ['-c', "rg -n 'letter-spacing:\\s*-' miniprogram -g '*.wxss' || true"],
      { encoding: 'utf8' },
    );
    expect(output).toBe('');
  });
});
