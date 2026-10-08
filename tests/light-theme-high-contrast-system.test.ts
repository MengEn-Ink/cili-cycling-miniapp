import { describe, expect, it } from 'vitest';
// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { execFileSync } from 'node:child_process';
import {
  contrast,
  declaration,
  effectiveBlock,
  expectSemantic,
  read,
  themeTokens,
} from './theme-contract-helpers';

const app = read('miniprogram/app.wxss');
const light = themeTokens(app, 'light');

describe('approved high-contrast light theme', () => {
  it('uses the approved white, ink, gray and restrained orange palette', () => {
    expect(light['--color-bg']).toBe('#ffffff');
    expect(light['--color-surface']).toBe('#ffffff');
    expect(light['--color-raised']).toBe('#f1f1ef');
    expect(light['--color-text']).toBe('#080808');
    expect(light['--color-muted']).toBe('#4f4f4c');
    expect(light['--color-border']).toBe('#bdbdb8');
    expect(light['--color-border-strong']).toBe('#111111');
    expect(light['--color-input-bg']).toBe('#ffffff');
    expect(light['--color-brand']).toBe('#bd3f00');
    expect(light['--color-brand-active']).toBe('#8e2e00');
    expect(light['--color-on-brand']).toBe('#ffffff');
    expect(light['--color-card-border']).toBe('var(--color-border-strong)');
    expect(light['--shadow-card']).toBe('none');
    expect(light['--metric-align']).toBe('center');
    expect(light['--page-heading-align']).toBe('center');
    expect(light['--radius-display']).toBe('16rpx');
  });

  it('keeps body, secondary and primary action text above WCAG AA', () => {
    expect(contrast(light['--color-text'], light['--color-bg'])).toBeGreaterThanOrEqual(7);
    expect(contrast(light['--color-muted'], light['--color-bg'])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(light['--color-on-brand'], light['--color-brand'])).toBeGreaterThanOrEqual(4.5);
  });

  it('centers shared control labels without decorative letter spacing or gradients', () => {
    const button = effectiveBlock(app, '.btn');
    const lightButton = effectiveBlock(app, '.theme-light .btn');
    expect(declaration(button, 'justify-content')).toBe('center');
    expect(declaration(button, 'letter-spacing')).toBe('0');
    expect(declaration(button, 'background')).toBe('var(--color-brand) !important');
    expectSemantic(declaration(button, 'color'), '--color-on-brand');
    expect(declaration(lightButton, 'clip-path')).toBe('none');
  });

  it('uses strong light-theme activity chrome while preserving centered metrics', () => {
    const card = read('miniprogram/components/activity-card/index.wxss');
    const cardShell = effectiveBlock(card, '.activity-card');
    expectSemantic(declaration(cardShell, 'border-color'), '--color-card-border');
    expectSemantic(declaration(cardShell, 'background'), '--color-surface');
    expect(declaration(cardShell, 'box-shadow')).toBe('none');
    expect(declaration(effectiveBlock(card, '.metric-item'), 'text-align')).toBe('center');
    expect(
      declaration(effectiveBlock(card, '.activity-card--featured .metric-item'), 'text-align'),
    ).toBe('var(--metric-align)');
    expectSemantic(declaration(effectiveBlock(card, '.card-cta'), 'color'), '--color-on-brand');
  });

  it('centers the activity introduction and removes card shadows in light mode', () => {
    const activities = read('miniprogram/pages/activities/index.wxss');
    expect(declaration(effectiveBlock(activities, '.activities-intro'), 'text-align')).toBe(
      'var(--page-heading-align)',
    );

    const registrations = read('miniprogram/pages/registrations/index.wxss');
    const registrationCard = effectiveBlock(registrations, '.theme-light .registration-card');
    expect(declaration(registrationCard, 'box-shadow')).toBe('none');
    expectSemantic(declaration(registrationCard, 'border-color'), '--color-border-strong');
  });

  it('centers detail metrics and gives time facts a stable two-column grid', () => {
    const detail = read('miniprogram/pages/activity-detail/index.wxss');
    expect(declaration(effectiveBlock(detail, '.theme-light .detail-metric'), 'text-align')).toBe(
      'center',
    );
    expect(
      declaration(effectiveBlock(detail, '.theme-light .metric-value'), 'justify-content'),
    ).toBe('center');
    expect(declaration(effectiveBlock(detail, '.time-row'), 'display')).toBe('grid');
    expect(declaration(effectiveBlock(detail, '.time-row'), 'grid-template-columns')).toBe(
      '148rpx minmax(0, 1fr)',
    );
    expect(read('miniprogram/pages/activity-detail/index.wxml')).toContain(
      'class="fixed detail-action {{themeClass}}"',
    );
  });

  it('makes the profile edit action unmistakable and centers profile metrics', () => {
    const profile = read('miniprogram/pages/profile/index.wxss');
    const edit = effectiveBlock(profile, '.theme-light .edit-button');
    expectSemantic(declaration(edit, 'border-color'), '--color-text');
    expect(declaration(edit, 'background')).toBe('var(--color-text) !important');
    expect(declaration(edit, 'color')).toBe('var(--color-bg) !important');
    expect(
      declaration(effectiveBlock(profile, '.theme-light .hero-capability-metric'), 'text-align'),
    ).toBe('center');
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
