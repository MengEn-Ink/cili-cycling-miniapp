# 依赖安全审计刷新验收

## 范围

2026-10-30 夜间「每日全量审计」在 `main@86f4dc7e` 失败：`audit-miniprogram-ci.mjs` 报告 `follow-redirects`、`centra`、`phin`、`load-bmfont` 可升级修复，同时出现未评估的 `minimatch` 告警 GHSA-g3hv-75wg-m249。PR 首轮 CI 又发现 12 个云函数锁文件命中同一 `follow-redirects` 高危公告（GHSA-mrwp-f3q8-3g9p）与 `qs` 中危公告（GHSA-6pq8-jhm2-2vcw）。`main-audit` 失败会阻断微信开发版自动上传。本次只调整依赖锁文件、上传工具审计例外和当前版本更新说明，不改业务代码、数据库或工作流。

## 修改

- `tools/miniprogram-ci`：`follow-redirects` override 由 1.16.1 升到 1.16.2；`centra`、`phin`、`load-bmfont`、`@jimp/*` 的可修复链随之消失。
- `minimatch` 3.x 由 eslint、glob、archiver 传递引入，修复版本只在 11.x ESM 大版本，升级会破坏 miniprogram-ci 的 CJS 加载；按既有格式写入例外与理由，复核日期 2026-10-31，到期 2027-01-15。
- 12 个云函数锁文件：`npm audit fix --package-lock-only` 将 `follow-redirects` 1.16.1 → 1.16.2、`qs` 6.16.0 → 6.17.1，只改传递依赖，`package.json` 不变。
- 设置页当前版本 features 追加一条服务端依赖升级说明，沿用 #400 先例，不升客户端版本。

## 测试结果

- 沙箱默认 npm 镜像的审计库滞后，复现与修复统一使用 `https://registry.npmjs.org`。
- `npm run audit:all`：通过，根包 high 阈值通过，上传工具 5 个已评估告警，13 个云函数包 0 漏洞。
- `node --test scripts/audit-miniprogram-ci.node-test.mjs`、`scripts/project-governance-policy.node-test.mjs`：通过。
- `CILI_SKIP_UI_SYNC=1 npm run validate`：通过。普通 UI 同步按仓库既有 `sandbox-skip-ui-sync` 受控标签处理；本次没有 UI 改动。
- `npm run coverage`：通过，阈值未调整。
- `git diff --check`：通过。

## 边界

本次没有执行微信上传或 CloudBase 部署。合并后由 `main` CI 的 `main-audit`、「微信开发版自动上传」与 CloudBase 工作流在 GitHub Actions 上独立验证；未执行真机或体验版验收。
