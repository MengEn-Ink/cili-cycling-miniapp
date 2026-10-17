import { CLIENT_RELEASE_VERSION } from '../../config/release';

// RELEASE_NOTES 保留一条最新记录，供 scripts/check-release-notes.mjs 门禁识别。
// 设置页只渲染第一条，不展示历史时间线；文案均面向普通用户，不出现门禁/接口/令牌等技术词。
const RELEASE_NOTES = [
  {
    version: CLIENT_RELEASE_VERSION,
    date: '2026-10-17',
    title: '路线地图与 GPX 使用更顺畅',
    summary:
      'GPX 路线在地图上更贴合道路，路线轮廓与海拔图加入轻量动态呈现，文件分享和保存兼容更多名称。',
    latest: true,
    features: [
      'GPX 路线地图完成坐标纠偏，路线、标记与定位范围保持一致',
      'GPX 下载支持中文、空格和多点文件名，优先分享并为旧客户端提供明确保存结果',
      '活动详情的路线轮廓与海拔图渐进绘制，并与完整路线分析保持一致',
    ],
  },
] as const;

Page({
  data: {
    releaseNotes: RELEASE_NOTES,
    currentRelease: RELEASE_NOTES[0],
  },
});
