// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

const listWxssFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return listWxssFiles(path);
    return entry.isFile() && entry.name.endsWith('.wxss') ? [path] : [];
  });

describe('个人中心权限卡视觉对齐', () => {
  it('在个人中心持续展示资料权限状态和使用范围', () => {
    const template = read('miniprogram/pages/profile/index.wxml');
    expect(template).toContain('资料展示权限');
    expect(template).toContain("profile.avatarVisibility === 'public'");
    expect(template).toContain('公开身份用于活动页展示');
    expect(template).toContain('查看与调整');
  });

  it('权限卡、身份与列表信息在窄屏保持单行省略', () => {
    const style = read('miniprogram/pages/profile/index.wxss');
    expect(style).toContain('.profile-permission');
    expect(style).toContain('.profile-permission--active .profile-permission-badge');
    expect(style).toContain('.rowtext-title');
    expect(style).toContain('text-overflow: ellipsis');
    expect(style).toContain('white-space: nowrap');
  });

  it('按钮型权限卡覆盖全局 button 弹性布局，保证标题、徽标、说明与操作纵向堆叠', () => {
    const style = read('miniprogram/pages/profile/index.wxss');
    // app.wxss 对 button 的全局弹性行布局会把权限卡的三个块级子元素压成一行，
    // 导致「查看与调整」竖排断行、徽标挤压文案，这里要求显式回退为块级堆叠。
    expect(style).toMatch(/\.profile-permission\s*\{[^}]*display:\s*block;/s);
  });

  it('绝对定位覆盖层不使用旧 WebView 不支持的 inset 简写', () => {
    const offenders = listWxssFiles('miniprogram').filter((path) =>
      /(^|[^-])\binset\s*:/.test(read(path)),
    );
    expect(offenders).toEqual([]);
  });

  it('背景与俱乐部图片提供渐进加载反馈', () => {
    const template = read('miniprogram/pages/profile/index.wxml');
    expect(template).toContain('class="profile-background-image"');
    expect(template).toContain('fade-in="{{true}}"');
    expect(template).toContain('lazy-load="{{true}}" fade-in="{{true}}"');
  });
});
