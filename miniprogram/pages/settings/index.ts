import { CLIENT_RELEASE_VERSION } from '../../config/release';

// RELEASE_NOTES 保留一条最新记录，供 scripts/check-release-notes.mjs 门禁识别。
// 设置页只渲染第一条，不展示历史时间线；文案均面向普通用户，不出现门禁/接口/令牌等技术词。
const RELEASE_NOTES = [
  {
    version: CLIENT_RELEASE_VERSION,
    date: '2026-10-17',
    title: '活动归属俱乐部更清楚',
    summary: '活动、行程、凭证和个人中心会统一展示俱乐部身份，历史活动也会保留发布时的归属。',
    latest: true,
    features: [
      '活动列表与详情展示主办俱乐部头像和名称',
      '行程与骑行凭证保留活动发布时的俱乐部身份',
      '个人中心支持查看已加入的一个或多个俱乐部',
    ],
  },
] as const;

Page({
  data: {
    releaseNotes: RELEASE_NOTES,
    currentRelease: RELEASE_NOTES[0],
  },
});
