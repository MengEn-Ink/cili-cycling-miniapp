// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { readFileSync } from 'node:fs';
// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(path), 'utf8');
const routes = [
  ['activities', ['switchView', 'selectDay', 'switchLayout', 'open', 'loadMore']],
  ['activity-detail', ['go', 'downloadGpx', 'navigate', 'openAttendeeCard', 'previewGroupQr']],
  ['route-analysis', ['markerTap', 'selectPoint', 'selectSegment', 'retryMap', 'backToActivity']],
  ['registration-form', ['profile', 'set', 'submit', 'back']],
  ['registrations', ['open', 'confirmDelete', 'onRowTouchStart', 'onRowTouchCancel']],
  ['credential', ['navigateToMeeting', 'cancel', 'retry', 'openRouteAnalysis']],
  ['profile', ['edit', 'openSettings', 'retryAuth', 'activities', 'clubApplications']],
  ['capability-card', ['openProfile']],
  ['profile-edit', ['chooseWechatAvatar', 'showConsent', 'acknowledgeConsent', 'save']],
  ['settings', ['chooseAppearance', 'manageNotifications', 'managePrivacy', 'clearSafeCache']],
  ['club/center', ['openActivity', 'retryActivities', 'editClub', 'createClub']],
  [
    'admin/activity-list',
    ['edit', 'reviewActivity', 'toggleOnline', 'startClone', 'confirmDelete'],
  ],
  [
    'admin/activity-edit',
    ['save', 'chooseImages', 'dateTimePicker', 'chooseRouteGpx', 'chooseGroupQrCode'],
  ],
  ['admin/reviews', ['choose', 'tab', 'open', 'sendReminders']],
  ['admin/review-detail', ['act', 'checkIn', 'reason', 'previewPhoto']],
  ['admin/club-applications', ['create', 'edit', 'load', 'coverError']],
  [
    'admin/club-application-detail',
    ['chooseAvatar', 'chooseCover', 'removeCover', 'input', 'save'],
  ],
] as const;

function assertBalanced(template: string) {
  const stack: string[] = [];
  const tags = template.matchAll(
    /<!--[\s\S]*?-->|<\/?([a-z][\w-]*)\b(?:[^>"']|"[^"]*"|'[^']*')*>/g,
  );
  for (const [tag, name] of tags) {
    if (!name) continue;
    if (tag.startsWith('</')) expect(stack.pop(), tag).toBe(name);
    else if (!tag.endsWith('/>')) stack.push(name);
  }
  expect(stack).toEqual([]);
}

describe('approved AI Hero layout migration (static production contracts, not IDE evidence)', () => {
  for (const [route, bindings] of routes) {
    it(`${route}: owns layout stylesheet, balanced WXML and retained real actions`, () => {
      const base = `miniprogram/pages/${route}/index`;
      const template = read(`${base}.wxml`);
      expect(read(`${base}.wxss`)).toContain('aihero-layout.wxss');
      assertBalanced(template);
      for (const event of bindings)
        expect(template).toMatch(new RegExp(`(?:bind|catch)[\\w:]*="${event}"`));
      expect(template).not.toContain('kit.toast');
    });
  }
  it('activity cards separate organiser/difficulty, bordered metrics and next action from media caption', () => {
    const source = read('miniprogram/pages/activities/index.wxml');
    expect(source).toContain('class="activity-toolbar"');
    expect(source).toContain('class="story-host"');
    expect(source).toContain('class="storymeta-action"');
    expect(source).toContain('<text class="pageheading-line">周末，</text>');
    expect(source.indexOf('class="story-host"')).toBeGreaterThan(source.indexOf('class="caption"'));
  });
  it('form v2 exposes genuine subscription readiness without inventing a local subscription toggle', () => {
    const source = read('miniprogram/pages/registration-form/index.wxml');
    expect(source).toContain('section-subscription');
    expect(source).toContain('notificationTemplateIds.length');
    expect(source).not.toContain('<switch');
    expect(source).not.toContain('id="agreement"');
    const logic = read('miniprogram/pages/registration-form/index.ts');
    const subscribe = logic.indexOf('await rideService.requestReviewNotificationSubscription');
    const save = logic.indexOf('await rideService.saveRegistration');
    expect(subscribe).toBeGreaterThan(-1);
    expect(save).toBeGreaterThan(-1);
    expect(subscribe).toBeLessThan(save);
  });
  it('numbered editorial sections are present on all content/forms that use approved Section', () => {
    for (const route of [
      'route-analysis',
      'registration-form',
      'profile-edit',
      'settings',
      'club/center',
      'admin/activity-edit',
      'admin/review-detail',
      'admin/club-applications',
      'admin/club-application-detail',
    ]) {
      expect(read(`miniprogram/pages/${route}/index.wxml`), route).toContain('chapterhead-index');
    }
  });
  it('conditional detail sections use natural labels and retain all original visibility gates', () => {
    const source = read('miniprogram/pages/activity-detail/index.wxml');
    expect(source).not.toContain('chapterhead-index');
    for (const gate of [
      '!item.registrationUnlimited && (item.fee || (item.feeIncluded && item.feeIncluded.length) || (item.feeExcluded && item.feeExcluded.length))',
      'canAnalyzeRoute || hasRouteDetails',
      'attendeesVisible',
      '(item.equipment && item.equipment.length) || (item.notices && item.notices.length)',
      'item.schedule && item.schedule.length',
      '!item.registrationUnlimited && item.route.end',
      'groupQrVisible && item.groupQrCode',
    ])
      expect(source).toContain(`wx:if="{{${gate}}}"`);
  });
  it('settings mirrors production groups while preserving admin visibility and existing actions', () => {
    const source = read('miniprogram/pages/settings/index.wxml');
    const sections = [
      ...source.matchAll(/chapterhead-index">(\d+)<\/text>[\s\S]*?chapterhead-title">([^<]+)/g),
    ].map((match) => [match[1], match[2]]);
    expect(sections).toEqual([
      ['00', '显示主题'],
      ['01', '通知'],
      ['02', '隐私'],
      ['03', '应用'],
      ['04', 'Strava 线路同步'],
    ]);
    expect(source).toContain('wx:if="{{isAdmin}}"');
    const mirror = read('docs/templates.js');
    for (const action of [
      'settings-appearance',
      'settings-notifications',
      'settings-privacy',
      'settings-clear-cache',
      'settings-strava-sync',
    ])
      expect(mirror).toContain(action);
    expect(mirror).toContain('section-strava" data-admin-only');
    expect(mirror).not.toContain("cardHead('02', '常用管理')");
  });
  it('credential has a distinct perforation and privacy note outside personal detail rows', () => {
    const source = read('miniprogram/pages/credential/index.wxml');
    expect(source).toContain('voucher-perforation');
    expect(source).toContain('open-type="share"');
    expect(source).toContain('仅分享公开活动链接');
  });
});
