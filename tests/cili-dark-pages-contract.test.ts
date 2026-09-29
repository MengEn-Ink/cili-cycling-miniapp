// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (file: string) => readFileSync(file, 'utf8');
const pageRoots = [
  'miniprogram/pages/registrations',
  'miniprogram/pages/profile',
  'miniprogram/pages/capability-card',
  'miniprogram/pages/admin/reviews',
  'miniprogram/pages/admin/review-detail',
];

describe('CILI 深色竞技页面静态契约', () => {
  it.each(pageRoots)('%s 使用极黑页面与赛事橙视觉令牌', (root) => {
    const styles = read(`${root}/index.wxss`).toLowerCase();
    const config = JSON.parse(read(`${root}/index.json`));

    expect(styles).toContain('#0b0b0c');
    expect(styles).toContain('#d55b1f');
    expect(config.navigationBarBackgroundColor.toLowerCase()).toBe('#0b0b0c');
    expect(config.navigationBarTextStyle).toBe('white');
  });

  it.each(pageRoots)('%s 展示 CILI 文字标且不依赖外部图片 Logo', (root) => {
    const template = read(`${root}/index.wxml`);

    expect(template).toContain('CILI');
    expect(template).toContain('此里');
    expect(template).not.toMatch(/<image[^>]+(?:logo|brand)/i);
  });

  it('审核列表保留权限校验、筛选和导航事件', () => {
    const source = read('miniprogram/pages/admin/reviews/index.ts');
    const template = read('miniprogram/pages/admin/reviews/index.wxml');

    expect(source).toContain("appStore.role !== 'admin'");
    expect(source).toContain("appStore.authStatus !== 'authenticated'");
    expect(template).toContain('bindchange="choose"');
    expect(template).toContain('bindtap="tab"');
    expect(template).toContain('bindtap="open"');
  });

  it('审核详情展示验证来源，但不展示用车方式、实名或手机号', () => {
    const template = read('miniprogram/pages/admin/review-detail/index.wxml');
    const source = read('miniprogram/pages/admin/review-detail/index.ts');

    expect(template).toContain('wx:if="{{x.gatheringMode}}"');
    expect(template).toContain('{{phoneSource}}');
    expect(source).toContain('phoneSource:');
    expect(template).not.toMatch(
      /card\.bikeMode|车辆方式|报名用车|profile\.realName|profile\.phone|实名资料/,
    );
    expect(source).not.toMatch(/maskPhone/);
  });

  it('个人名片继续保留 Strava 缺失修复条件和私有提示', () => {
    const template = read('miniprogram/pages/capability-card/index.wxml');

    expect(template).toContain('wx:if="{{card.needsStravaRepair}}"');
    expect(template).toContain('wx:if="{{card.needsProfilePhoto}}"');
    expect(template).toContain('仅自己可见');
  });
});
