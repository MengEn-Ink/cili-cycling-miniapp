import { CLIENT_RELEASE_VERSION } from '../../config/release';

// RELEASE_NOTES 保留一条最新记录，供 scripts/check-release-notes.mjs 门禁识别。
// 设置页只渲染第一条，不展示历史时间线；文案均面向普通用户，不出现门禁/接口/令牌等技术词。
const RELEASE_NOTES = [
  {
    version: CLIENT_RELEASE_VERSION,
    date: '2026-10-17',
    title: '俱乐部归属更清楚，路线分享更可靠',
    summary: '活动会统一展示俱乐部身份，路线图与海拔图也保持一致，大型 GPX 文件可以直接下载分享。',
    latest: true,
    features: [
      '活动、行程、凭证和个人中心统一展示俱乐部身份',
      '活动详情与完整路线分析统一路线颜色、坐标、采样和海拔图样式',
      '路线轮廓不再叠加路线名称，海拔曲线统一为清晰描边',
      'GPX 大文件改为直接下载，分享失败时可保存到微信文件继续操作',
    ],
  },
] as const;

Page({
  data: {
    releaseNotes: RELEASE_NOTES,
    currentRelease: RELEASE_NOTES[0],
  },
});
