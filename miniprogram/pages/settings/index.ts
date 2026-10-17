import { CLIENT_RELEASE_VERSION } from '../../config/release';

// RELEASE_NOTES 保留一条最新记录，供 scripts/check-release-notes.mjs 门禁识别。
// 设置页只渲染第一条，不展示历史时间线；文案均面向普通用户，不出现门禁/接口/令牌等技术词。
const RELEASE_NOTES = [
  {
    version: CLIENT_RELEASE_VERSION,
    date: '2026-10-17',
    title: '打开更快，路线查看更稳',
    summary: '路线分析与资料编辑改为按需加载；地图暂不可用时仍可查看海拔、坡度和分段。',
    latest: true,
    features: [
      '路线分析与资料编辑按需加载，日常启动更轻量',
      '地图显示失败时保留核心路线数据，并支持轻点重试',
      '快速连点活动、报名或编辑入口时不再重复打开页面',
    ],
  },
] as const;

Page({
  data: {
    releaseNotes: RELEASE_NOTES,
    currentRelease: RELEASE_NOTES[0],
  },
});
