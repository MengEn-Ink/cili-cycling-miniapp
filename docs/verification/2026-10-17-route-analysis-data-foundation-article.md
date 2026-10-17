# 路线分析数据底座图文文章端到端验收报告

## 1. 验收对象

| 项目 | 内容 |
| --- | --- |
| PR | [#274](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/274) |
| Head SHA | PR #274 当前分支；验收完成后收拢为最终单提交，以 PR head 为准 |
| 客户端版本 | 不适用；本次不修改小程序产品代码 |
| 验收环境 | Aime Pages 临时预览、仓库本地静态页面；正式 GitHub Pages 待合并后回读 |
| 验收角色 | 公开文档读者 |
| 执行时间 | 2026-10-17 CST |
| 执行人 | Aime |

## 2. 影响范围

| 维度 | 结论 |
| --- | --- |
| 页面与交互 | 新增独立图文文章、右侧目录、章节锚点、表格与返回研发交付中心入口 |
| 云函数与数据 | 不适用；无云函数、数据库、接口或配置变更 |
| 权限与隐私 | 公开静态内容；未写入凭证、用户资料或受保护媒体 |
| Pages / 文档 | 研发交付中心新增“技术与架构”文章入口，并增加三张 WebP 配图 |
| 部署与回滚 | 仅由合并后的 GitHub Actions 发布 Pages；回滚该提交即可移除页面、入口和资源 |

## 3. 测试用例矩阵

| 用例 | 类型 | 前置条件 | 步骤 | 预期 | 实际 | 证据 | 结论 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 从研发交付中心进入文章 | 正常 | 加载 `docs/index.html` | 进入“技术与架构”并点击文章卡片 | 相对链接进入独立文章 | 入口和渲染链接均通过契约测试 | `tests/showcase-pages-contract.test.ts` | PASS |
| 文章核心内容完整 | 回归 | 加载文章 HTML | 核对 GPX、坐标、动态数据和反方观点章节 | 核心章节均存在 | 44 条 Pages 契约测试通过 | `npx vitest run tests/showcase-pages-contract.test.ts` | PASS |
| 图片资源与性能属性 | 边界 | 三张 WebP 位于文章资源目录 | 加载 Hero 与两张正文图 | 无失效资源；正文图懒加载 | 资源路径、文件名和 `loading="lazy"` 已验证 | 契约测试与浏览器预览 | PASS |
| 锚点与固定导航 | 根因反例 | 页面存在固定顶部导航 | 点击 `#raw-material`、`#freshness` | 章节标题不被导航遮挡 | 使用 `scroll-margin-top` 修复并完成浏览器复验 | Aime 临时预览 `https://4626ab74b60b.aime-site.bytedance.net/articles/route-analysis-data-foundation.html` | PASS |
| 窄屏排版 | 边界 | 移动端视口 | 检查章节编号、标题、表格和图片 | 标题不重叠，表格可读，页面无横向破坏 | 网格标题与响应式布局通过视觉复验 | 同一临时预览页面 | PASS |
| 小程序与云函数回归 | 存量兼容 | 本次仅 Pages 文件变化 | 检查最终 diff | 不修改产品代码和云函数 | 变更仅涉及 Pages、静态资源、契约测试和本报告 | `git diff --name-status origin/main...HEAD` | PASS |
| 图片加载失败恢复 | 失败恢复 | 纯静态文章资源由 Pages 托管 | 核对资源路径与部署边界 | 资源缺失由契约测试提前阻断，不引入运行时业务降级 | 三张资源均纳入测试；业务失败恢复不适用 | `tests/showcase-pages-contract.test.ts` | PASS |

## 4. 自动化门禁

| 门禁 | 结果 | 关键输出或链接 |
| --- | --- | --- |
| `npm run validate` | PASS | 基于最新 `main` 完整执行，源码完整性校验通过：17 个页面 |
| `npm run coverage` | PASS | 前端门禁 lines 90.24%、branches 88.43%、functions 95.93%、statements 88.94% |
| `npm run audit:all` | PASS | 主项目和云函数无高危漏洞；上传工具例外仍在既有有效期内 |
| `git diff --check` | PASS | 无空白错误 |
| PR checks | 待最新 head 重跑 | [PR #274](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/274) |

## 5. 端到端执行记录

1. 使用文章分支启动并部署 `docs/` 临时静态预览，打开文章正式相对路径。
2. 按真实读者路径检查 Hero、首屏结论、目录、章节锚点、三张配图、表格和相关资料。
3. 在桌面与窄屏视口核对章节编号、中文标题、固定导航遮挡、图片加载和表格布局。
4. 发现章节标题重叠和锚点被遮挡后，以网格标题和 `scroll-margin-top` 修复，再次复验通过。

**执行结论**：`PASS`

**未执行或阻塞说明**：正式 GitHub Pages 的生产部署只能在 PR 合并后由 GitHub Actions 完成，当前以临时预览和本地契约测试作为合并前证据；合并后回读正式 URL。

## 6. 部署与回读

| 流程 | 运行链接 | 结果 | 回读 |
| --- | --- | --- | --- |
| main CI | 待合并后回填 | 待执行 | 待最终 main SHA |
| Pages | 待合并后回填 | 待部署 | 待验证正式文章 URL、资源和导航 |
| CloudBase | 不适用 | 安全跳过 | 无云函数、数据库或配置变更 |
| 微信开发版 | 不适用 | 安全跳过 | 无小程序产品代码变更 |

## 7. 风险与回滚

- 剩余风险：正式 Pages CDN 尚未在合并前验证；通过 Actions 部署后回读关闭。
- 监控与观察：核对 Pages workflow、文章 HTTP 状态、三张 WebP 资源、返回导航和目录锚点。
- 回滚步骤：回滚本 PR 的 squash commit，重新执行 Pages workflow。
- 数据恢复：不适用；无数据写入和迁移。

## 8. 最终结论

合并前页面功能、视觉、定向测试和最新 `main` 全量门禁均已通过；待 PR checks 复跑通过后满足合并条件。正式 Pages 部署与回读在合并后完成。
