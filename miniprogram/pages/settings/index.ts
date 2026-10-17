import { CLIENT_RELEASE_VERSION } from '../../config/release';

// RELEASE_NOTES 保留一条最新记录，供 scripts/check-release-notes.mjs 门禁识别。
// 设置页只渲染第一条，不展示历史时间线；文案均面向普通用户，不出现门禁/接口/令牌等技术词。
const RELEASE_NOTES = [
  {
    version: CLIENT_RELEASE_VERSION,
    date: '2026-10-17',
    title: '主题体验与路线分析焕新',
    summary:
      '路线分析在保留完整数据密度的同时融入此里沸点主题，并统一了关键页面的操作尺寸、视觉层级和隐私说明。',
    latest: true,
    features: [
      '路线分析改用统一卡片、圆角和沸点红强调，地图、海拔与分段信息仍完整保留',
      '关键锚点、地图操作和重试入口扩大触控区域，小屏浏览更稳定',
      '报名凭证适配全面屏底部安全区域，并补充照片与头像的清晰说明',
      '活动卡片操作按钮恢复胶囊样式，报名资料的隐私角色称呼保持一致',
    ],
  },
] as const;

Page({
  data: {
    releaseNotes: RELEASE_NOTES,
    currentRelease: RELEASE_NOTES[0],
  },
});
