# 微信上传错误脱敏诊断验收记录

## 1. 验收对象

| 项目 | 内容 |
| --- | --- |
| 分支 | `fix/wechat-ci-error-diagnostics-v2` |
| 目标 | 在不泄露 SDK 原始错误的前提下，为微信上传 `20003` 保留可操作的结构化内因 |
| 影响范围 | CI 上传脚本、上传监督器、部署说明与契约测试 |
| 产品行为 | 无小程序页面、接口、云函数或数据变化 |

## 2. 修复内容

- 上传 worker 只在内存中读取有限错误字段，输出白名单结构化 `errorDetail`。
- supervisor 再次校验 IPC 数据，只允许固定分类、安全摘要及合法微信整数错误码进入诊断产物。
- URL、IP、Token、密钥、文件路径与任意原始文本不会写入日志或 artifact。
- 保持 `outcome=UNKNOWN`、`reason=sdk-error`、`errorCode`、回执与副作用语义不变。

## 3. 验证结果

| 类型 | 命令 | 结果 |
| --- | --- | --- |
| 定向部署契约 | `npm run test:deploy` | PASS，65/65 |
| 全量校验 | `npm run validate` | PASS |
| 覆盖率 | `npm run coverage` | PASS；主覆盖率门禁及云端覆盖率门禁通过 |
| 安全审计 | `npm run audit:all` | PASS；根包及云函数无高危漏洞，微信上传工具仅保留已评估例外 |
| 空白字符 | `git diff --check` | PASS |

## 4. 关键用例

- `access_token missing` 被归类为 `access-token-missing`，不保留原始 Token。
- IP 限制错误被归类为 `invalid-ip`，不保留具体 IP。
- 编译错误被归类为 `compile-error`，只保留固定安全摘要。
- 含 URL、路径、密钥和恶意字符串的异常降级为安全的 `unknown`。
- 未知异常、现有整数错误码与 supervisor IPC 兼容性均保持原契约。

## 5. 部署与回滚

本次仅修改 CI 脚本和文档，无需部署 CloudBase 云函数。合并后通过 GitHub Actions 重跑微信开发版上传，并依据新的脱敏诊断处理真实根因。若需回滚，可 revert 本次单提交。
