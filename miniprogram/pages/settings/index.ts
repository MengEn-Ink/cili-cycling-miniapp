import { CLIENT_RELEASE_VERSION } from '../../config/release';

// RELEASE_NOTES 保留一条最新记录，供 scripts/check-release-notes.mjs 门禁识别。
// 设置页只渲染第一条，不展示历史时间线；文案均面向普通用户，不出现门禁/接口/令牌等技术词。
const RELEASE_NOTES = [
  {
    version: CLIENT_RELEASE_VERSION,
    date: '2026-10-17',
    title: '背景图上传更稳更快',
    summary: '个人背景图会在裁剪后自适应压缩，并显示上传进度；网络波动时会自动重试。',
    latest: true,
    features: [
      '横向背景图在上传前自动压缩，兼顾清晰度与流量消耗',
      '上传过程显示实时百分比，弱网重试状态更清楚',
      '管理员页面按需加载，减少日常使用所需的主包内容',
    ],
  },
] as const;

Page({
  data: {
    releaseNotes: RELEASE_NOTES,
    currentRelease: RELEASE_NOTES[0],
  },
});
