// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string): string => readFileSync(path, 'utf8');

function pageFiles(extension: string, dir = 'miniprogram/pages'): string[] {
  const files: string[] = [];
  for (const name of readdirSync(dir) as string[]) {
    const path = `${dir}/${name}`;
    if (statSync(path).isDirectory()) files.push(...pageFiles(extension, path));
    else if (path.endsWith(`index.${extension}`)) files.push(path);
  }
  return files;
}

describe('v2 设计稿精简', () => {
  it('页面标题区不再重复「此里 · xxx」品牌眉标', () => {
    for (const file of pageFiles('wxml')) {
      expect(read(file), file).not.toMatch(/<view class="eyebrow">此里 · /);
    }
  });

  it('页面字号不低于 24rpx 可读下限', () => {
    for (const file of pageFiles('wxss')) {
      const small = read(file).match(/font-size:\s*(1\d|2[0-3])rpx/g) ?? [];
      expect(small, file).toEqual([]);
    }
  });

  it('提示与强调不再使用竖向强调线，勾选图标不再使用字符', () => {
    for (const file of pageFiles('wxss')) {
      expect(read(file), file).not.toMatch(/border-left:\s*[3-9]rpx solid/);
    }
    for (const file of pageFiles('wxml')) {
      expect(read(file), file).not.toContain('>✓<');
    }
  });

  it('活动列表：标题直出，场次并入切换行，筛选条两端渐隐', () => {
    const wxml = read('miniprogram/pages/activities/index.wxml');
    const wxss = read('miniprogram/pages/activities/index.wxss');
    expect(wxml).toContain('周末，交给山路。');
    expect(wxml).not.toContain('pageheading-sub');
    expect(wxml).not.toContain('list-toolbar');
    expect(wxml).not.toContain('查看活动 →');
    expect(wxml).toMatch(/<view class="segment"[\s\S]*class="segment-count"[\s\S]*segment-end/);
    expect(wxml).toContain(
      '<text>{{item.displayDateLabel}}</text><text>{{item.displayTimeLabel}}</text>',
    );
    expect(wxss).toMatch(/\.day-chip-shell\s*\{[^}]*mask-image:\s*linear-gradient/s);
  });

  it('活动详情：导航贴在集合地点旁且保留 44px 触控，删去重复状态眉标', () => {
    const wxml = read('miniprogram/pages/activity-detail/index.wxml');
    const wxss = read('miniprogram/pages/activity-detail/index.wxss');
    expect(wxml).toMatch(
      /detailrow--action"><text class="detailrow-term">集合地点<\/text>[\s\S]*?class="meeting-nav" data-target="start" bindtap="navigate" aria-label="导航到集合地点"/,
    );
    expect(wxml).not.toContain('decision-kicker');
    expect(wxml).toContain('aria-label="报名状态"');
    expect(wxss).toMatch(/\.meeting-nav\s*\{[^}]*min-height:\s*88rpx/s);
    expect(wxml).toContain('data-target="end" bindtap="navigate"');
  });

  it('报名页：说教文案删除，必填/选填用标记，隐私说明保留为一句', () => {
    const wxml = read('miniprogram/pages/registration-form/index.wxml');
    expect(wxml).not.toContain('field-hint');
    expect(wxml).not.toContain('骑行经验 · 必选');
    expect(wxml).toContain('骑行经验<text class="field-flag">必选</text>');
    expect(wxml).toContain('报名备注<text class="field-flag">选填</text>');
    expect(wxml).toContain('实名与电话仅用于审核和现场联络，公开名单只展示昵称');
    expect(wxml).toContain('data-registration-mode-note');
  });

  it('凭证合并紧急联系人与电话；俱乐部无城市时隐藏该行', () => {
    const credential = read('miniprogram/pages/credential/index.wxml');
    expect(credential).not.toContain('紧急联系电话');
    expect(credential).toContain('{{item.profile.emergencyPhone}}');
    const club = read('miniprogram/pages/club/center/index.wxml');
    expect(club).not.toContain('城市未填写');
    expect(club).toContain('wx:if="{{club.city}}"');
  });
});
