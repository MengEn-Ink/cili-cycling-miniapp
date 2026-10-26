# 活动详情媒体与响应实现计划

**Goal:** 兼容已保存的真实头像/背景并缩短详情等待。

**Architecture:** 修复现有媒体查询和 canonical 校验；保持签名在云端，复用现有仓储失效和 DevTools runner。

**Tech Stack:** 微信小程序 TypeScript、Node 云函数、Vitest、miniprogram-automator。

## 1. 媒体协议

- [ ] 在 `cloudfunctions/activity-read/public-avatar.node-test.js` 补 source/canonical、新/旧用途路径与错配测试，执行并确认失败。
- [ ] 在 `cloudfunctions/activity-read/index.node-test.js` 补保存 canonical 引用的真实协议夹具，覆盖唯一登记与重复登记拒绝，执行并确认失败。
- [ ] 修复 `public-avatar.js` 与 `index.js`；仅签发经过完整绑定校验的地址，运行 activity-read 全套 Node 测试。

## 2. 响应与缓存

- [ ] 补 `tests/caching-repository.test.ts` 的头像/背景保存后活动回源测试。
- [ ] 补 cloud DTO、服务器发布者身份和页面优先使用明确身份的测试；补活动图片签名不等待报名查询的阻塞测试。
- [ ] 最小实现：写后失效活动缓存、服务端布尔身份、客户端使用已返回的身份、云端独立签名并行；执行相关测试。

## 3. 真实运行与交付

- [ ] 使用 `scripts/wechat-devtools-e2e.cjs` 记录导航与首屏/就绪耗时，验证头像、背景均可下载解码。
- [ ] 运行 runner Node 测试与 DevTools 真实云只读全路由；原图与标识只留私有目录。
- [ ] 执行 `npm run validate`、`npm run check:ui-sync -- --strict`、`npm run check:governance`。
- [ ] 记录目标云部署和回读结果，更新高优清单及脱敏交付报告；保留独立真机与写链路阻塞。
