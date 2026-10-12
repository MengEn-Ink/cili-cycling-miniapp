# Strava 运动达人连接额度与扩容指引

更新日期：2026-10-12

## 当前结论

- 「此里」当前 Strava 应用处于 Standard Tier 的免审核阶段，应用级 athlete capacity 为 **10 人**。
- 10 人是整个 Strava 应用共享的已授权运动达人上限，不是单场活动报名人数，也不是 API 请求次数。
- 超过 10 人不能通过改代码或提高请求频率解决；必须向 Strava 提交应用审核。审核通过后，Standard Tier 可扩到 **11–9,999 人**。
- 达到 **10,000 人及以上**属于 Extended Access Tier，需要审核；官方说明该层级提供更高额度、优先支持及 Partner API 资格。
- 提交审核不保证获批。产品设计仍需保留满额提示，不能把扩容当作确定依赖。

## 官方扩容路径

1. 登录当前 Strava 开发者账号，打开 [API Settings Dashboard](https://www.strava.com/settings/api)，核对当前 athlete capacity、调用量和应用资料。
2. 确认开发者账号具备有效 Strava 订阅；官方 2026 FAQ 将订阅列为 Standard Tier API 使用前提。
3. 阅读并满足 [Strava API Agreement](https://www.strava.com/legal/api) 与 [Brand Guidelines](https://developers.strava.com/guidelines)。
4. 准备审核材料：
   - 产品名称、公开可访问的产品入口与测试方式；
   - 清晰说明产品如何补充 Strava 体验；
   - “Connect with Strava”入口截图；
   - 所有展示 Strava 数据的页面截图；
   - OAuth 授权范围及其必要性；
   - 隐私政策、数据保存/删除、用户断开连接流程；
   - 当前用户需求、10 人额度使用情况及目标容量；
   - API 调用优化说明，尤其是缓存、Webhook、限流与重试策略。
5. 通过官方 [Developer Program form](https://share.hsforms.com/1VXSwPUYqSH6IxK0y51FjHwcnkd8) 提交审核。
6. 审核期间不要反复创建 Strava 应用绕过上限；继续保留 10 人内测和满额提示。

## 「此里」提交前建议补齐

- 把当前 10 个名额用于真实内测，收集连接、同步、断开、数据删除和报名链路证据。
- 准备一组完整截图：设置页连接入口、OAuth 前置说明、骑行数据页、个人骑行名片、报名审核中的 Strava 数据、断开连接入口。
- 在隐私说明中明确：读取哪些字段、用于什么场景、保存多久、如何断开和删除。
- 说明当前实现已按用户隔离并加密保存 Token，且只申请产品需要的读取权限。
- 记录 API 调用与限流策略。若后续出现轮询活动数据，应优先使用 Webhook，避免用扩容掩盖低效请求。
- 审核目标建议先申请与近期真实增长匹配的容量，而不是无依据申请“无限”。

## 官方依据

- [Strava Rate Limits / Athlete Capacity](https://developers.strava.com/docs/rate-limits/)：1 人可自助升级到 10 人；超过 10 人需提交审核；同时列出审核材料与调整要求。
- [Strava API FAQ（2026-06-05 更新）](https://communityhub.strava.com/developers-knowledge-base-14/strava-api-faq-12906)：Standard Tier 审核后支持 11–9,999 人；10,000 人及以上进入 Extended Access Tier；说明订阅、审核与合规要求。

## 边界说明

- athlete capacity 与 rate limit 是两套额度。连接人数扩容不等于 API 调用额度自动提高。
- 官方建议只有在接近调用上限时申请 rate limit 调整；少于 100 名用户却频繁触发请求限流，通常应先优化轮询、缓存与回填节奏。
- Strava 明确限制受限的中间平台代调用场景；应用应直接控制凭证和数据链路，不能把凭证交给第三方中间服务代为转发。
