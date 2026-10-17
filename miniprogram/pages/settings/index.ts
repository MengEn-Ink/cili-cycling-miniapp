import { CLIENT_RELEASE_VERSION } from '../../config/release';

// RELEASE_NOTES 保留一条最新记录，供 scripts/check-release-notes.mjs 门禁识别。
// 设置页只渲染第一条，不展示历史时间线；文案均面向普通用户，不出现门禁/接口/令牌等技术词。
const RELEASE_NOTES = [
  {
    version: CLIENT_RELEASE_VERSION,
    date: '2026-10-18',
    title: '俱乐部资料保存稳定性修复',
    summary: '俱乐部负责人和管理员保存资料时，现在能更稳定地识别最新版本。',
    latest: true,
    features: [
      '修复线上时间格式差异导致资料保存被误判为冲突的问题',
      '保留多管理员并发保护，避免旧页面覆盖他人刚保存的资料',
      '资料管理入口、可编辑字段和失败重试体验保持不变',
    ],
  },
] as const;

Page({
  data: {
    releaseNotes: RELEASE_NOTES,
    currentRelease: RELEASE_NOTES[0],
  },
});
