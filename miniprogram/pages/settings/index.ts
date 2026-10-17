import { CLIENT_RELEASE_VERSION } from '../../config/release';

// RELEASE_NOTES 保留一条最新记录，供 scripts/check-release-notes.mjs 门禁识别。
// 设置页只渲染第一条，不展示历史时间线；文案均面向普通用户，不出现门禁/接口/令牌等技术词。
const RELEASE_NOTES = [
  {
    version: CLIENT_RELEASE_VERSION,
    date: '2026-10-17',
    title: '活动浏览与发布保障优化',
    summary:
      '活动图片轮播会准确显示当前位置，同时进一步完善发布前的一致性与安全检查，让版本交付更稳定。',
    latest: true,
    features: [
      '活动详情图片轮播会跟随滑动更新当前张数，图片加载失败后计数仍保持准确',
      '发布前统一核对页面、说明文档和界面验收材料，减少版本信息不一致',
      '每次代码合并都会重新执行完整质量与安全检查，再进入自动发布流程',
    ],
  },
] as const;

Page({
  data: {
    releaseNotes: RELEASE_NOTES,
    currentRelease: RELEASE_NOTES[0],
  },
});
