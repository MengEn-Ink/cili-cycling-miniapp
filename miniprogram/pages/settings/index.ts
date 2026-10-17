import { CLIENT_RELEASE_VERSION } from '../../config/release';

// RELEASE_NOTES 保留一条最新记录，供 scripts/check-release-notes.mjs 门禁识别。
// 设置页只渲染第一条，不展示历史时间线；文案均面向普通用户，不出现门禁/接口/令牌等技术词。
const RELEASE_NOTES = [
  {
    version: CLIENT_RELEASE_VERSION,
    date: '2026-10-18',
    title: '俱乐部资料管理上线',
    summary: '俱乐部负责人和管理员现在可以在俱乐部中心修改对外展示资料。',
    latest: true,
    features: [
      '负责人和管理员可从俱乐部中心进入资料管理',
      '支持更新俱乐部头像、名称、城市、简介和加入方式',
      '保存前明确确认，失败时保留已填写内容并支持重试',
    ],
  },
] as const;

Page({
  data: {
    releaseNotes: RELEASE_NOTES,
    currentRelease: RELEASE_NOTES[0],
  },
});
