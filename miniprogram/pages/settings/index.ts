import { CLIENT_RELEASE_VERSION } from '../../config/release';

// RELEASE_NOTES 保留一条最新记录，供 scripts/check-release-notes.mjs 门禁识别。
// 设置页只渲染第一条，不展示历史时间线；文案均面向普通用户，不出现门禁/接口/令牌等技术词。
const RELEASE_NOTES = [
  {
    version: CLIENT_RELEASE_VERSION,
    date: '2026-10-17',
    title: '发布流程更稳，安全维护更及时',
    summary: '自动发布会先完成依赖安全和运行兼容检查，减少更新后功能异常与版本不同步。',
    latest: true,
    features: [
      '每次更新统一经过完整测试、依赖安全和运行兼容检查',
      'CloudBase、微信开发版和项目说明页按同一主版本发布并分别验收',
      '低风险安全更新通过全部检查后可自动合入，缩短漏洞修复等待时间',
      '清理不再使用的客户端名额计算代码，继续以统一结果为准',
    ],
  },
] as const;

Page({
  data: {
    releaseNotes: RELEASE_NOTES,
    currentRelease: RELEASE_NOTES[0],
  },
});
