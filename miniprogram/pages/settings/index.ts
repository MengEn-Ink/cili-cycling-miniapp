import { CLIENT_RELEASE_VERSION } from '../../config/release';

// RELEASE_NOTES 保留一条最新记录，供 scripts/check-release-notes.mjs 门禁识别。
// 设置页只渲染第一条，不展示历史时间线；文案均面向普通用户，不出现门禁/接口/令牌等技术词。
const RELEASE_NOTES = [
  {
    version: CLIENT_RELEASE_VERSION,
    date: '2026-10-17',
    title: '界面更清晰，操作更顺手',
    summary:
      '统一按钮与页面细节，放大个人中心背景图，并将设置页精简为当前版本更新，让常用信息更容易找到。',
    latest: true,
    features: [
      '操作按钮文字保持水平、垂直居中，状态标记与说明排列更整齐',
      '个人中心采用更开阔的大图背景，昵称与骑行身份更容易看清',
      '设置页集中展示当前版本更新，不再单独罗列历史记录',
      '权限与失败提示说明用途和下一步操作，遇到问题时更容易处理',
    ],
  },
] as const;

Page({
  data: {
    releaseNotes: RELEASE_NOTES,
    currentRelease: RELEASE_NOTES[0],
  },
});
