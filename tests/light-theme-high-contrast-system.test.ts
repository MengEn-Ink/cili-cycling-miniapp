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
  it('uses the approved warm gray, charcoal and orange-red palette', () => {
    expect(tokens['--color-bg']).toBe('#f3f3f1');
    expect(tokens['--color-surface']).toBe('#ffffff');
    expect(tokens['--color-raised']).toBe('#ececea');
    expect(tokens['--color-text']).toBe('#171717');
    expect(tokens['--color-muted']).toBe('#666666');
    expect(tokens['--color-border']).toBe('#d6d6d2');
    expect(tokens['--color-border-strong']).toBe('#171717');
    expect(tokens['--color-input-bg']).toBe('#ffffff');
    expect(tokens['--color-brand']).toBe('#e85b32');
    expect(tokens['--color-brand-active']).toBe('#c84320');
    expect(tokens['--color-on-brand']).toBe('#171717');
    expect(tokens['--color-action']).toBe('#171717');
    expect(tokens['--color-on-action']).toBe('#ffffff');
    expect(tokens['--color-card-border']).toBe('#171717');
    expect(tokens['--shadow-card']).toContain('rgba(0, 0, 0');
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
      7,
    );
  });

  it('centers shared control labels without decorative letter spacing or gradients', () => {
    const button = effectiveBlock(app, '.btn');
    expect(declaration(button, 'justify-content')).toBe('center');
    expect(declaration(button, 'letter-spacing')).toBe('0');
    expect(declaration(button, 'background')).toBe('var(--color-action) !important');
    expectSemantic(declaration(button, 'color'), '--color-on-action');
    expect(declaration(button, 'clip-path')).toBe('none');
  });

  it('uses strong activity chrome while preserving centered metrics', () => {
    const card = read('miniprogram/components/activity-card/index.wxss');
    const cardShell = effectiveBlock(card, '.activity-card');
    expectSemantic(declaration(cardShell, 'border-color'), '--color-card-border');
    expectSemantic(declaration(cardShell, 'background'), '--color-surface');
    expectSemantic(declaration(cardShell, 'box-shadow'), '--shadow-card');
    expect(declaration(effectiveBlock(card, '.metric-item'), 'text-align')).toBe('center');
    expect(card).not.toContain('.activity-card--compact');
    expect(card).not.toContain('.card-cta');
  });

  it('keeps the activity introduction on the reading axis and uses hard card shadows', () => {
    const activities = read('miniprogram/pages/activities/index.wxss');
    expect(declaration(effectiveBlock(activities, '.activities-intro'), 'text-align')).toBe(
      'var(--page-heading-align)',
    );

    const registrations = read('miniprogram/pages/registrations/index.wxss');
    const registrationCard = effectiveBlock(registrations, '.registration-card');
    expectSemantic(declaration(registrationCard, 'box-shadow'), '--shadow-card');
    expectSemantic(declaration(registrationCard, 'border-color'), '--color-card-border');
  });

  it('centers detail metrics and gives meeting facts a stable responsive grid', () => {
    const detail = read('miniprogram/pages/activity-detail/index.wxss');
    expect(declaration(effectiveBlock(detail, '.detail-metric'), 'text-align')).toBe('center');
    expect(declaration(effectiveBlock(detail, '.metric-value'), 'justify-content')).toBe('center');
    expect(declaration(effectiveBlock(detail, '.time-card-main'), 'display')).toBe('grid');
    expect(detail).toMatch(
      /\.time-card-main\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) minmax\(180rpx, 0\.8fr\)/s,
    );
    expect(declaration(effectiveBlock(detail, '.time-card-main'), 'grid-template-columns')).toBe(
      '1fr',
    );
    expect(read('miniprogram/pages/activity-detail/index.wxml')).toContain(
      'class="fixed detail-action"',
    );
  });

  it('makes the profile data action unmistakable and centers profile metrics', () => {
    const profile = read('miniprogram/pages/profile/index.wxss');
    const menuCard = effectiveBlock(profile, '.menu-card');
    const menuList = effectiveBlock(profile, '.menu-list');
    expect(declaration(menuList, 'border')).toContain('var(--color-border)');
    expectSemantic(declaration(menuCard, 'background'), '--color-surface');
    expect(declaration(effectiveBlock(profile, '.hero-capability-metric'), 'text-align')).toBe(
      'center',
    );
  });

  it('centers form-level titles but keeps field content on the reading axis', () => {
    const registration = read('miniprogram/pages/registration-form/index.wxss');
    expect(declaration(effectiveBlock(registration, '.form-title'), 'text-align')).toBe('center');
    expect(declaration(effectiveBlock(registration, '.field-title'), 'text-align')).toBe('left');

    const profile = read('miniprogram/pages/profile-edit/index.wxss');
    expect(declaration(effectiveBlock(profile, '.profile-form-page .title'), 'text-align')).toBe(
      'center',
    );
    expect(
      declaration(effectiveBlock(profile, '.profile-form-page .form-card .label'), 'text-align'),
    ).toBe('left');
  });

  it('does not use negative letter spacing in product UI', () => {
    const output = execFileSync(
      'sh',
      ['-c', "rg -n 'letter-spacing:\\s*-' miniprogram -g '*.wxss' || true"],
      { encoding: 'utf8' },
    );
    expect(output).toBe('');
  });
});
