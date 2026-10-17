import { CLIENT_RELEASE_VERSION } from '../../config/release';

// RELEASE_NOTES 保留一条最新记录，供 scripts/check-release-notes.mjs 门禁识别。
// 设置页只渲染第一条，不展示历史时间线；文案均面向普通用户，不出现门禁/接口/令牌等技术词。
const RELEASE_NOTES = [
  {
    version: CLIENT_RELEASE_VERSION,
    date: '2026-10-18',
    title: '俱乐部加入与活动页面修复',
    summary: '没有俱乐部时可先选择公开俱乐部加入；创建或编辑活动遇到网络波动时也不再停留空白页。',
    latest: true,
    features: [
      '没有俱乐部时先展示可加入的公开俱乐部，也可继续创建新俱乐部',
      '创建活动和编辑历史活动加载失败时显示原因并支持重试',
      '俱乐部头像在个人资料和俱乐部活动中正常显示',
    ],
  },
] as const;

Page({
  data: {
    releaseNotes: RELEASE_NOTES,
    currentRelease: RELEASE_NOTES[0],
  },
});
