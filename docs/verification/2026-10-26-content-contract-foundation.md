# 内容审核基础协议独立拆分验证

日期：2026-10-26。用户授权按最新版本拆解 PR #341；基线 `main@93ad577f1390321e04a2e515a92ffc1dec19f562`，来源 `0908a0214f02b0817fcaefbe188e928905535d5b`。本报告是协议与工程证据，不是内容审核业务上线或端到端验收。

## 改动边界

- 从旧 PR 提取协议到 `scripts/content-safety/content.cjs` 和七项原测试到 `content.node-test.cjs`；模块与来源逐字节一致，测试仅调整 require 扩展名。
- 根 package 仅增加 `test:content-contract` 并在当前 `validate` 的 `npm test` 后注册；其余命令、依赖、lock、审计和发布入口保留。
- 未增加运行引用或修改 prepare、云函数列表、集合/索引、网关、Timer、密钥、客户端、Pages、版本与历史截图。模块只依赖 Node 内建 crypto，没有微信 SDK 或原生依赖。
- 原 PR 完整业务与已授权需求保全；基础协议未接入口，不能把原 callback、隐私或 Strava 的缺陷视为已修复。

## 验证

| 类型 | 命令 / 证据 | 结果 |
| --- | --- | --- |
| RED | 先只提取测试，`node --test cloudfunctions/compliance-shared/content.node-test.js` | 按预期失败，`MODULE_NOT_FOUND './content'` |
| GREEN | `npm run test:content-contract` | 7/7 通过 |
| 单模块覆盖 | `node --experimental-test-coverage --test scripts/content-safety/content.node-test.cjs` | content.cjs lines 98.40%、branches 81.61%、functions 100% |
| 全量门禁 | `npm run validate` | 通过；88 Vitest 文件、1297 用例、七项协议、工程/旅程/部署/视觉节点测试、13 云包、17 页面构建 |
| 三宽度 | 当前影像志 16 页 × 340/375/430 | 通过；生成截图仅临时留存，未覆盖已提交同步证据 |
| 覆盖率 | `npm run coverage` | 通过；cloud.ts lines 91.02%、branches 89.00%、functions 96.60%、statements 90.06% |
| 审计 | `npm run audit:all` | 通过；根包及 13 云包 0 漏洞，上传工具沿主线有期限例外通过 |
| UI 同步 | `npm run check:ui-sync -- --strict` | 通过；双端摘要与截图一致，零未同步提交 |
| 治理 | `npm run check:governance` | 通过；17 路由、统一上传、源码与 Actions 安全基线 |
| 空白字符 | `git diff --check` | 通过 |
| 引用与打包 | `rg`、prepare 源码和配置消费者核对 | 当前生产入口零引用，prepare 不复制新模块，部署目录未注册 |

隔离工作树首次全量检查因根依赖尚未安装而退出（prettier/vitest 不存在）；完成 `npm ci` 后重跑通过。该环境恢复未修改依赖版本或门禁。

最终预检把最初的云目录归类为产品变更，要求更新客户端说明；因此移到未部署的脚本契约目录，再执行最终预检。CommonJS 扩展名由现有 ESLint 配置覆盖；没有改分类器或绕过版本规则，后续实际运行接入仍按产品版本门禁交付。

## 部署判定与独立验收

脚本契约不属于部署函数，新增内容不改变现有 12 函数的打包源码；客户端内容也没有变化。根 package 测试注册按现有上传策略触发开发版上传，未修改发布分类器。

| 远端证据 | 结果 |
| --- | --- |
| 独立 PR #370 | 正常 squash 合入 `0c7463e3be78d72b8ba52be928f03855a1ddb08b`；PR CI `40280987402` / CodeQL `40280987399` 通过，reviews/threads 均 0 |
| 主线 CI / Pages / CodeQL | `40281273514` / `40281273571` / `40281273279` 全部通过 |
| 微信实际上传 | `40281488762` 开发版 `0.0.374.1`；实际 receipt、artifact digest、运行 attempt、同 SHA CI、Git 内容与环境核对通过 |
| 云累计范围跳过 | `40281488773`；真实部署基线 `d0ea0b5a` / `40274362993`、同 SHA CI、artifact/outcome、累计范围均通过，`SKIPPED` 且 `sideEffectsStarted=false` |

端到端验收：**NOT_EXECUTED / BLOCKED**。此次没有调用微信内容安全 API、回调网关、目标云写链路、公开媒体 smoke、普通成员写旅程或物理真机。开发版 `0.0.374.1` 的平台体验选版、candidate/verified 与 UAT 未执行；独立 P0 保留，协议基础通过不代表新审核行为已部署。

原始测试日志和本次三宽度生成图保存在本地私有临时证据目录；公开报告只有有界结果，不包含真实用户资料、媒体 URL 或密钥。
