# 微信开发者工具模拟器 E2E

这套流程用于在已登录的微信开发者工具中，对当前 Git 工作区运行真实小程序页面与云端数据链路。它是单元测试、CI 之后的运行态补充门禁，不能替代物理真机手势、扫码和系统权限验证。

## 覆盖范围

固定检查以下只读流程：

1. 活动首页成功加载，存在真实活动；
2. 活动卡集合时间使用“早上 8 点整 / 早上 8 点半 / 早上 6 点 20 分”等自然表达；
3. 日期由活动分组标题承载；
4. 我的行程成功加载，日期与集合时间不重复；
5. 活动详情的日期与集合时间拆开展示；
6. 报名凭证的日期与集合时间拆开展示；
7. 全流程无 `RUNTIME_EXCEPTION`。

脚本全程只读，不报名、不发布、不删除、不修改个人资料或线上业务数据。

## 一次性准备（macOS）

1. 安装并登录微信开发者工具，确认项目 AppID 与当前仓库的 `project.config.json` 一致。
2. 在独立目录安装官方 automator，避免旧依赖进入产品依赖和安全审计：

```bash
mkdir -p ~/.cili-devtools-e2e
cd ~/.cili-devtools-e2e
npm init -y
npm install miniprogram-automator@0.12.1
```

3. 微信开发者工具中使用具备真实活动和行程数据的测试账号登录。账号至少需要一条可访问的行程记录，报名凭证检查才能通过。

## 标准执行

在待验证的仓库分支根目录执行：

```bash
npm run test:devtools:e2e
```

脚本会自动：

- 校验 macOS、微信开发者工具 CLI 与小程序项目配置；
- 启动微信开发者工具自动化会话，无需提前手动开放固定端口；
- 依次打开活动首页、我的行程、活动详情和报名凭证；
- 对页面运行态数据做断言并截图；
- 关闭本次自动化会话；
- 在 `artifacts/wechat-devtools-e2e/` 输出 `results.json` 和四张截图。

成功标志：命令退出码为 `0`，末行类似：

```text
SUMMARY pass=7 fail=0 exceptions=0
```

## 可配置项

| 环境变量 | 默认值 | 用途 |
| --- | --- | --- |
| `CILI_PROJECT_PATH` | 当前工作目录 | 指定待验证的小程序项目 |
| `CILI_E2E_OUTPUT` | `<项目>/artifacts/wechat-devtools-e2e` | 指定结果和截图目录 |
| `WECHAT_DEVTOOLS_CLI` | `/Applications/wechatwebdevtools.app/Contents/MacOS/cli` | 指定开发者工具 CLI |
| `MINIPROGRAM_AUTOMATOR_PATH` | `~/.cili-devtools-e2e/node_modules/miniprogram-automator` | 指定 automator 模块目录 |

## 失败排查

- **未找到 automator**：重新执行一次性安装，或设置 `MINIPROGRAM_AUTOMATOR_PATH`。
- **未找到 CLI**：确认微信开发者工具安装在 `/Applications`，或设置 `WECHAT_DEVTOOLS_CLI`。
- **页面无活动/行程**：切换到有测试数据的登录账号，再重新执行。
- **登录或云调用错误**：先在开发者工具内手动打开项目并确认云环境、登录状态正常。
- **截图存在但断言失败**：以 `results.json` 中失败项为准，不得把“能打开页面”当作 E2E 通过。

## 交付门禁建议

涉及活动首页、活动时间、我的行程、活动详情或报名凭证的改动，合并并上传微信开发版后应至少执行一次本流程，并在 PR 或验收记录中附上：

- 被测 Git SHA；
- `results.json` 的 pass/fail/exception 统计；
- 四张页面截图；
- 明确注明“开发者工具模拟器验证”，不要冒充物理真机验收。
