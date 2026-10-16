import { CLIENT_RELEASE_VERSION } from '../../config/release';

// RELEASE_NOTES 保留一条最新记录，供 scripts/check-release-notes.mjs 门禁识别。
// 设置页只渲染第一条，不展示历史时间线；文案均面向普通用户，不出现门禁/接口/令牌等技术词。
const RELEASE_NOTES = [
  {
    version: CLIENT_RELEASE_VERSION,
    date: '2026-10-17',
    title: '骑行名片支持滑动浏览与专属活动封面',
    summary:
      '报名骑友名片改为沉浸式无边框展示，多人可左右滑动查看；活动未上传照片时自动生成路线主题封面。',
    latest: true,
    features: [
      '骑行名片移除白色外框，多名报名骑友可在弹层中连续左右滑动查看',
      '头像使用墨黑与主题红边框快速区分男女，未标注性别保持中性边框',
      '活动缺少封面或图片失效时，使用主题、日期、路线、里程和爬升生成专属封面',
    ],
  },
] as const;

Page({
  data: {
    releaseNotes: RELEASE_NOTES,
    currentRelease: RELEASE_NOTES[0],
  },
});
