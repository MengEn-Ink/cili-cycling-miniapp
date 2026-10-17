import { CLIENT_RELEASE_VERSION } from '../../config/release';

// RELEASE_NOTES 保留一条最新记录，供 scripts/check-release-notes.mjs 门禁识别。
// 设置页只渲染第一条，不展示历史时间线；文案均面向普通用户，不出现门禁/接口/令牌等技术词。
const RELEASE_NOTES = [
  {
    version: CLIENT_RELEASE_VERSION,
    date: '2026-10-17',
    title: '项目说明更完整，运行包更轻',
    summary:
      '项目说明页现在按骑友、组织者和开发维护者完整讲清使用流程，运行包也移除了不再使用的旧海报代码。',
    latest: true,
    features: [
      '从发现活动、判断路线到报名、签到和凭证，使用路径更容易理解',
      '组织者可以快速了解创建活动、导入路线、审核报名和现场管理的完整流程',
      '发布说明补充测试、自动发布和多端验收的图解，项目状态更透明',
      '旧海报绘制代码移出运行包，保留测试能力但不再占用正式源码',
    ],
  },
] as const;

Page({
  data: {
    releaseNotes: RELEASE_NOTES,
    currentRelease: RELEASE_NOTES[0],
  },
});
