import { CLIENT_RELEASE_VERSION } from '../../config/release';

// RELEASE_NOTES 保留一条最新记录，供 scripts/check-release-notes.mjs 门禁识别。
// 设置页只渲染第一条，不展示历史时间线；文案均面向普通用户，不出现门禁/接口/令牌等技术词。
const RELEASE_NOTES = [
  {
    version: CLIENT_RELEASE_VERSION,
    date: '2026-10-17',
    title: '俱乐部创建申请已可稳定使用',
    summary:
      '已登录骑友现在可以稳定提交俱乐部创建申请、保存草稿并查看审批进度，管理员审核通过后才会正式创建俱乐部。',
    latest: true,
    features: [
      '未加入俱乐部时可从“我的”页直接申请创建或查看进度',
      '支持草稿、待审批、驳回修改重提和审批通过完整状态',
      '提交失败可原地重试，重复点击不会重复创建俱乐部',
      '申请资料仅本人和平台管理员可见，联系方式只用于本次审核',
    ],
  },
] as const;

Page({
  data: {
    releaseNotes: RELEASE_NOTES,
    currentRelease: RELEASE_NOTES[0],
  },
});
