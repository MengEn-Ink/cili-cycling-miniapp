# CloudBase 统一媒体生产写入 smoke 修复验收

- 日期：2026-10-19
- 目标：生产俱乐部申请写入 smoke 必须使用与已部署云函数一致的媒体路径密钥，并实际经过 canonical registry 校验、激活与清理。
- 失败基线：[CloudBase run 39151162047](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/39151162047)
- 配置缺口复现：[CloudBase run 39154165321](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/39154165321)
- 配置传播延迟复现：[CloudBase run 39156938692](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/39156938692)

## 现象与根因

PR #291 合并后的 CloudBase 自动部署已成功应用存储规则、部署函数并验证环境，但 production club application write smoke 约 79 秒后输出“请重新上传俱乐部头像”并退出 1。

根因包含两部分：

1. GitHub Actions runner 与六个媒体相关云函数均未配置 `PROFILE_MEDIA_PATH_SECRET`，smoke 以空密钥计算 owner alias，云函数也会对 canonical 媒体 fail closed；首次修复尝试从已部署函数读取密钥，因此在确认函数配置缺失后按预期阻断。
2. smoke 的 CLI store 未实现 canonical registry 查询与激活方法，旧实现即使路径字符串正确也会跳过统一媒体登记校验，存在虚假通过风险。

## 修复与边界

- `cloudbase-production` 环境统一保存媒体路径密钥；部署前生成仅存在于 runner 临时目录的 `cloudbaserc.deploy.json`，已变更函数按部署范围更新，未变更但缺少密钥的媒体函数补做完整 deploy，确保 `profile`、`profile-media-cleanup`、`admin-review`、`activity-read`、`activity-admin`、`club-application` 六个函数同值。
- 部署后逐个轮询函数详情并校验密钥同值，最多等待 60 秒吸收 CloudBase 配置传播延迟，再运行生产 smoke；密钥缺失、长度不足或任一函数最终配置漂移时 fail closed。
- smoke 为俱乐部头像和封面创建 `profile_media` canonical 登记，按 `canonical_file_id + owner_openid + category` 精确匹配，激活后回读状态。
- 成功或中途失败均清理媒体登记、申请、俱乐部、成员与审计测试记录，并回读确认无残留。
- 不修改小程序或云函数业务行为，不迁移存量数据，不恢复任何 legacy 图片写协议。

## 自动化验证

| 验证 | 结果 |
| --- | --- |
| `npm run test:bootstrap` | 101/101 通过；包含 37 个媒体 smoke 与密钥配置定向用例 |
| `CILI_SKIP_UI_SYNC=1 npm run validate` | 99 个测试文件、1240 个用例通过；17 个页面源码校验通过 |
| `npm run coverage` | 通过；`cloud.ts` lines 90.85%、branches 88.96%、functions 96.24%、statements 89.94% |
| `npm run audit:all` | 通过；业务依赖无高危漏洞，微信工具告警仍在既有评估例外有效期内 |
| `git diff --check` 与 Prettier | 通过 |

关键回归场景：

- 缺少媒体路径密钥时在任何清理或写入前立即阻断。
- CLI store 对 canonical 登记执行真实查询、归属校验和 active 状态迁移。
- 完整俱乐部申请状态机验证头像传播，并在 finally 中清理全部测试记录。
- 工作流保证密钥解析发生在 production smoke 之前。

## 端到端验收

代码层与自动化门禁已通过。最终生产端到端验收以本修复合入 `main` 后的 CloudBase 自动部署为准，必须同时满足：存储规则成功、受影响范围部署成功、环境验证成功、production club application write smoke 成功且无测试数据残留。最终 run 链接随交付结果记录在 PR 与任务结论中。
