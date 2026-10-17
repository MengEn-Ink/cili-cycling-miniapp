import { CLIENT_RELEASE_VERSION } from '../../config/release';

// RELEASE_NOTES 保留一条最新记录，供 scripts/check-release-notes.mjs 门禁识别。
// 设置页只渲染第一条，不展示历史时间线；文案均面向普通用户，不出现门禁/接口/令牌等技术词。
const RELEASE_NOTES = [
  {
    version: CLIENT_RELEASE_VERSION,
    date: '2026-10-17',
    title: '俱乐部封面上传与申请体验优化',
    summary: '俱乐部创建申请已恢复封面上传；遇到上传失败时，会保留已填写的表单并提示重新尝试。',
    latest: true,
    features: [
      '俱乐部申请封面可以正常选择并上传',
      '封面上传失败时保留已填写的申请内容，返回表单即可继续修改',
      '草稿和被驳回的申请都可继续完善后重新提交',
    ],
  },
] as const;

Page({
  data: {
    releaseNotes: RELEASE_NOTES,
    currentRelease: RELEASE_NOTES[0],
  },
});
