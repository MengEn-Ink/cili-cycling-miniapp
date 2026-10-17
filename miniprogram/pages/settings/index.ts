import { CLIENT_RELEASE_VERSION } from '../../config/release';

// RELEASE_NOTES 保留一条最新记录，供 scripts/check-release-notes.mjs 门禁识别。
// 设置页只渲染第一条，不展示历史时间线；文案均面向普通用户，不出现门禁/接口/令牌等技术词。
const RELEASE_NOTES = [
  {
    version: CLIENT_RELEASE_VERSION,
    date: '2026-10-17',
    title: '完整路线分析更快更稳',
    summary:
      '路线分析与资料编辑按需加载；路线走向、海拔和分段策略集中呈现，地图暂不可用时核心数据仍可查看。',
    latest: true,
    features: [
      '路线分析与资料编辑按需加载，日常启动更轻量',
      '地图展示完整路线与骑行方向，标记、海拔锚点、关键点和分段可同步联动',
      '地图显示失败时保留核心路线数据并支持重试，快速连点入口也不会重复打开页面',
    ],
  },
] as const;

Page({
  data: {
    releaseNotes: RELEASE_NOTES,
    currentRelease: RELEASE_NOTES[0],
  },
});
