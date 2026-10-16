import { CLIENT_RELEASE_VERSION } from '../../config/release';

// RELEASE_NOTES 保留一条最新记录，供 scripts/check-release-notes.mjs 门禁识别。
// 设置页只渲染第一条，不展示历史时间线；文案均面向普通用户，不出现门禁/接口/令牌等技术词。
const RELEASE_NOTES = [
  {
    version: CLIENT_RELEASE_VERSION,
    date: '2026-10-17',
    title: '完整路线分析已上线',
    summary: '活动路线新增关键公里点、坡段策略、海拔与地图联动分析，并明确展示天气和交通数据边界。',
    latest: true,
    features: [
      '从活动详情或骑行凭证进入完整路线分析，查看距离、爬升、最高海拔和预计骑行时间',
      '关键公里点、主要分段、海拔剖面与路线地图支持选择联动和坐标复制',
      '基础装备建议仅依据真实路线数据，并明确不含实时天气与交通事件判断',
    ],
  },
] as const;

Page({
  data: {
    releaseNotes: RELEASE_NOTES,
    currentRelease: RELEASE_NOTES[0],
  },
});
