// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const APP_WXSS = readFileSync('miniprogram/app.wxss', 'utf8');
const PROFILE_WXSS = readFileSync('miniprogram/pages/profile/index.wxss', 'utf8');
const PROFILE_WXML = readFileSync('miniprogram/pages/profile/index.wxml', 'utf8');
const PROFILE_EDIT_WXSS = readFileSync('miniprogram/pages/profile-edit/index.wxss', 'utf8');
const PROFILE_EDIT_TS = readFileSync('miniprogram/pages/profile-edit/index.ts', 'utf8');
const REGISTRATIONS_WXSS = readFileSync('miniprogram/pages/registrations/index.wxss', 'utf8');
const PILL_WXSS = readFileSync('miniprogram/components/status-pill/index.wxss', 'utf8');
const PILL_WXML = readFileSync('miniprogram/components/status-pill/index.wxml', 'utf8');
const SETTINGS_WXML = readFileSync('miniprogram/pages/settings/index.wxml', 'utf8');
const SETTINGS_TS = readFileSync('miniprogram/pages/settings/index.ts', 'utf8');
const ACTIVITY_EDIT_TS = readFileSync('miniprogram/pages/admin/activity-edit/index.ts', 'utf8');
const APP_JSON = JSON.parse(readFileSync('miniprogram/app.json', 'utf8'));
const PROFILE_TEMPLATE_JS = readFileSync('docs/templates.js', 'utf8');

describe('2026-10-17 UX 复查：按钮居中、profile 大图、设置简化、文案成熟', () => {
  it('全局 button 默认 flex 居中，文字水平/垂直居中', () => {
    const buttonBlock = APP_WXSS.match(/\nbutton\s*\{[^}]*\}/)?.[0] || '';
    expect(buttonBlock).toContain('display: flex');
    expect(buttonBlock).toContain('align-items: center');
    expect(buttonBlock).toContain('justify-content: center');
  });

  it('profile-hero 调整为约 472rpx 并使用渐变遮罩', () => {
    expect(PROFILE_WXSS).toMatch(/\.profile-hero\s*\{[^}]*min-height:\s*472rpx/s);
    const shade = PROFILE_WXSS.match(/\.hero-shade\s*\{[^}]*\}/s)?.[0] || '';
    expect(shade).toContain('linear-gradient');
    expect(shade).toMatch(/rgba\(0,\s*0,\s*0,\s*0.68\)/);
    expect(PROFILE_WXSS).toMatch(/\.hero-identity\s*\{[^}]*text-shadow:/s);
  });

  it('profile-edit avatar-action 使用 flex 居中并保留 88rpx 触控高度', () => {
    const avatarAction = PROFILE_EDIT_WXSS.match(/\.avatar-action\s*\{[^}]*\}/s)?.[0] || '';
    expect(avatarAction).toContain('display: flex');
    expect(avatarAction).toContain('align-items: center');
    expect(avatarAction).toContain('justify-content: center');
    expect(avatarAction).toContain('min-height: 88rpx');
  });

  it('profile-edit 背景图卡片文案明确指向个人中心大图背景', () => {
    const wxml = readFileSync('miniprogram/pages/profile-edit/index.wxml', 'utf8');
    expect(wxml).toContain('用作个人中心顶部的大图背景');
  });

  it('status-pill 用图标与文字分别包裹，保证基线稳定', () => {
    expect(PILL_WXML).toContain('class="pill-icon"');
    expect(PILL_WXML).toContain('class="pill-label"');
    const pillIcon = PILL_WXSS.match(/\.pill-icon\s*,?\s*\.pill-label\s*\{[^}]*\}/s)?.[0] || '';
    expect(pillIcon).toContain('align-items: center');
    expect(pillIcon).toContain('line-height: 1');
    const pill = PILL_WXSS.match(/\.pill\s*\{[^}]*\}/s)?.[0] || '';
    expect(pill).toContain('align-items: center');
    expect(pill).toContain('justify-content: center');
    expect(pill).toContain('gap:');
  });

  it('设置页模板只渲染当前版本卡片', () => {
    expect(SETTINGS_WXML).toContain('App 更新');
    expect(SETTINGS_WXML).toContain('wx:if="{{currentRelease}}"');
    expect(SETTINGS_WXML).not.toContain('wx:for="{{releaseNotes}}"');
    expect(SETTINGS_WXML).not.toContain('功能升级日志');
    expect(SETTINGS_WXML).not.toContain('最近五次');
  });

  it('设置页 TS 保留一条 RELEASE_NOTES 供发布门禁，面向用户文案不含技术词', () => {
    expect(SETTINGS_TS).toMatch(/latest:\s*true/);
    const latestMatches = SETTINGS_TS.match(/latest:\s*true/g) || [];
    expect(latestMatches).toHaveLength(1);
    expect(SETTINGS_TS).toContain("date: '2026-10-18'");
    // 技术词检查仅针对面向用户的 RELEASE_NOTES 字段内容，不包含源码注释。
    const releaseNotesBlock =
      SETTINGS_TS.match(/const RELEASE_NOTES[\s\S]*?\]\s*as const;/)?.[0] || '';
    expect(releaseNotesBlock).not.toMatch(
      /门禁|接口|令牌|token|OpenID|openid|fileID|FileID|云开发|云存储/,
    );
  });

  it('管理活动编辑的地图选点失败弹窗不暴露后台配置', () => {
    expect(ACTIVITY_EDIT_TS).not.toContain('接口权限');
    expect(ACTIVITY_EDIT_TS).not.toContain('隐私保护指引');
    expect(ACTIVITY_EDIT_TS).toContain('可直接在集合地点中输入地址');
    expect(ACTIVITY_EDIT_TS).not.toContain('云端未返回文件标识');
  });

  it('面向用户的 wxml 不包含 token/门禁/云端/OpenID/FileID 等技术词', () => {
    const pageDirs = [
      'miniprogram/pages/activities/index.wxml',
      'miniprogram/pages/activity-detail/index.wxml',
      'miniprogram/pages/registration-form/index.wxml',
      'miniprogram/pages/registrations/index.wxml',
      'miniprogram/pages/credential/index.wxml',
      'miniprogram/pages/profile/index.wxml',
      'miniprogram/pages/settings/index.wxml',
      'miniprogram/pages/capability-card/index.wxml',
      'miniprogram/pages/profile-edit/index.wxml',
      'miniprogram/pages/admin/activity-list/index.wxml',
      'miniprogram/pages/admin/activity-edit/index.wxml',
      'miniprogram/pages/admin/reviews/index.wxml',
      'miniprogram/pages/admin/review-detail/index.wxml',
    ];
    for (const path of pageDirs) {
      const content = readFileSync(path, 'utf8');
      expect(content, path).not.toMatch(
        /门禁|令牌|token|OpenID|openid|FileID|fileID|接口权限|隐私保护指引|云端未返回/,
      );
    }
  });

  it('registrations 的 meeting-row 使用 baseline 对齐，集合标签与内容首行齐平', () => {
    const block = REGISTRATIONS_WXSS.match(/^\.meeting-row\s*\{[^}]*\}/ms)?.[0] || '';
    expect(block).toContain('align-items: baseline');
    expect(block).not.toContain('align-items: flex-start');
  });

  it('小程序与 Pages 个人中心“设置”说明都只提当前版本与本次更新', () => {
    expect(PROFILE_WXML).toContain('查看当前版本与本次更新内容');
    expect(PROFILE_WXML).not.toContain('功能升级记录');
    expect(PROFILE_TEMPLATE_JS).toContain('查看当前版本与本次更新内容');
    expect(PROFILE_TEMPLATE_JS).not.toContain('功能升级记录');
    expect(PROFILE_TEMPLATE_JS).not.toContain('应用设置与功能升级');
  });

  it('app.json 只声明当前真正使用的位置能力', () => {
    expect(APP_JSON.requiredPrivateInfos).toEqual(['chooseLocation']);
    expect(APP_JSON.permission).toBeUndefined();
  });

  it('profile-edit 媒体错误文案成熟中文、不含方括号技术码，选择图片明确权限引导', () => {
    expect(PROFILE_EDIT_TS).toContain('选择图片失败，请确认已允许使用相册或相机，也可稍后再试');
    // 技术码不出现在用户文案的字面常量里（stage/code 消息两个字典均无方括号）。
    const stageMessages = PROFILE_EDIT_TS.match(
      /messageByStage:\s*Record<string, string>\s*=\s*\{[\s\S]*?\};/,
    )?.[0];
    expect(stageMessages).toBeTruthy();
    expect(stageMessages).not.toMatch(/\[[A-Z0-9_]+\]/);
    const codeMessages = PROFILE_EDIT_TS.match(
      /messageByCode:\s*Record<string, string>\s*=\s*\{[\s\S]*?\};/,
    )?.[0];
    expect(codeMessages).toBeTruthy();
    expect(codeMessages).not.toMatch(/\[[A-Z0-9_]+\]/);
    // 面向用户的字符串没有 `[${code}]` 的拼接方式。
    expect(PROFILE_EDIT_TS).not.toMatch(/`\[\$\{code\}\]/);
    // 技术码只走内部诊断。
    expect(PROFILE_EDIT_TS).toContain("console.warn('[profile-edit] media failure'");
  });
});
