# 微信 E2E 与上线准备状态

更新：2026-10-22。当前代码基线为 `origin/main` `062c8cedd1a81d8bd9e1fbe3845be676698d44bc`，客户端 `2026.10.21.7`。

## 当前结论

当前版本**尚不能声明完整 E2E 或正式上线就绪**。本轮只移植并验证测试工具及契约；没有在当前 SHA 上重新执行微信开发者工具、普通成员真实写链路或双真机验收。因此这些项目均为 `NOT_EXECUTED`，不能用 Node/Mock 测试、Pages 原型、IDE 模拟器或历史截图替代。

## 证据分层

| 证据类型 | 当前版本状态 | 能证明 | 不能证明 |
| --- | --- | --- | --- |
| Mock / Node 契约测试（`*.test.ts`、`*.node-test.*`） | 已执行定向测试 | 驱动、校验器、反例和云包清单契约 | 真实微信 E2E、真实云数据或真机 |
| Pages 原型 / UI sync | 以仓库门禁结果为准 | 原型、摘要和同步清单一致性 | 小程序运行、触控、业务成功 |
| 微信 DevTools 真实云只读运行 | `NOT_EXECUTED`（当前 SHA） | 执行后仅证明对应账号、环境和只读路由 | 普通成员写链路和物理真机 |
| 普通成员 + 管理员真实写链路 | `BLOCKED` | 执行后证明创建、报名、审批、取消、重报及回读 | 双平台系统能力 |
| iOS / Android 双真机 | `BLOCKED` | 执行后证明权限、相册、Canvas、分享、安全区等 | 未执行角色和网络场景 |

详细执行方式见 [微信开发者工具验收手册](wechat-devtools-e2e.md) 和 [P0 真实旅程手册](p0-real-registration-journey.md)。

## 历史证据（不得重标）

2026-10-21 的真实 DevTools 只读运行绑定旧代码 SHA `dd87949dbcf0069b5ba427c49f360948cf7ddcf2`、客户端 `2026.10.21.3`。该轮最终记录为 17/17 路由、20 张截图、27 项检查通过，但总结果仍是 `blocked`，阻塞项为 `PUBLIC_ATTENDEE_MEDIA_SAMPLE_NOT_READY`。这些结果仅是历史运行记录，**不属于**当前 `062c8ce` / `2026.10.21.7` 的验收。

历史 GitHub Actions 链接（只说明对应旧 SHA 的工作流状态）：[main CI](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/39547764535)、[Pages](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/39547764198)、[微信开发版上传](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/39547873613)、[CloudBase 部署](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/39547873523)。当前 Actions 事实应直接以 GitHub 为准，不从这些历史运行外推。

## 本轮工程补齐

- DevTools 驱动覆盖 `app.json` 的 17 条路由，并按页面 loading / mode / pageState 等待就绪。
- 截图失败最多重试一次；截图前后核对路由，持续失败或路由变化不得生成成功证据。
- 公开媒体将“地址安全”与“真实样本就绪”分开；HTTPS 安全空态仍不能冒充真实图片样本通过。
- `strava-bridge`、`strava-callback` 纳入全量云包安装、测试和审计，并与 `cloudbaserc.json` 部署清单交叉检查。
- 当前上线验收只接受 `schemaVersion: 2` 的真实旅程证据；缺失版本的历史 v1 不能绕过 v2 的路线、双平台和九类 UAT 要求。历史文件仍可保留用于审计，但不能作为当前验收通过证据。

## 仍然真实阻塞

1. 在当前 SHA 和目标云环境重新执行 DevTools 真实云只读运行，并保留脱敏报告；公开参与者必须具备合格头像与名片背景真实样本。
2. 以普通成员和管理员账号执行创建→发布→报名→审批/自动通过→凭证→取消→重报，并核对人数、状态、审计、幂等和失败补偿。
3. 在 iOS 与 Android 物理设备完成相册/隐私拒绝恢复、定位、群二维码、Canvas、海报保存分享、Strava/GPX、弱网和安全区验收。
4. 回读当前 SHA 对应的云函数、集合/索引、规则和密钥配置；开发版上传、部署计划或 Pages 成功均不能替代回读。
5. 主体、备案、类目、隐私声明、内容治理和提审材料仍需平台侧证据。

微信上传工具的 `fast-glob` / `request` 已由锁定且有期限的 allowlist 门禁管理；当前门禁通过，因此不再把旧审计结果列为现存阻塞。例外到期、出现新 advisory、可修复版本或清单漂移时门禁会重新失败。
