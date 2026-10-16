import { CLIENT_RELEASE_VERSION } from '../../config/release';

// RELEASE_NOTES 保留一条最新记录，供 scripts/check-release-notes.mjs 门禁识别。
// 设置页只渲染第一条，不展示历史时间线；文案均面向普通用户，不出现门禁/接口/令牌等技术词。
const RELEASE_NOTES = [
  {
    version: CLIENT_RELEASE_VERSION,
    date: '2026-10-17',
    title: '背景图更好调整，页面加载更轻快',
    summary: '个人背景图支持移动和缩放后再上传，网络波动时会自动重试；活动列表与详情加载也更轻快。',
    latest: true,
    features: [
      '选择个人背景图后，可按 16:9 移动和缩放画面，横向照片效果更佳',
      '头像与背景图上传遇到短暂网络波动时自动重试，并清晰显示当前进度',
      '活动详情并行加载，骑友头像按需加载，活动首屏增加卡片骨架提示',
    ],
  },
] as const;

Page({
  data: {
    releaseNotes: RELEASE_NOTES,
    currentRelease: RELEASE_NOTES[0],
  },
});
