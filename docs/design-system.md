# 此里统一设计规范索引

当前正式 UI 规范以仓库根目录 [`DESIGN.md`](../DESIGN.md) 为唯一执行入口，适用于微信小程序 17 个注册页面、共享组件、GitHub Pages 原型和技术文章。

## 正式基线

- **完整设计规范**：[`DESIGN.md`](../DESIGN.md)——设计目标、Master System、页面 Overrides、平台边界、反模式与交付门禁。
- **机器设计契约**：[`design-contract.json`](design-contract.json)——双端 Token 与 WCAG 对比度门槛。
- **执行清单**：[`ui-design-checklist.md`](ui-design-checklist.md)——设计输入、状态矩阵、平台验收和部署核对。
- **可视化规范页**：[`ui-design-system.html`](ui-design-system.html)——面向设计、产品和研发共同阅读的 Pages 入口。
- **沸点设计交接**：[`designs/2026-10-16-boiling-point/`](designs/2026-10-16-boiling-point/)——原始视觉基线、页面手稿与 Token 清单。
- **设计令牌方案**：[`superpowers/specs/2026-10-16-boiling-point-design-tokens.md`](superpowers/specs/2026-10-16-boiling-point-design-tokens.md)——沸点主题的历史决策与实施依据。

## 维护口径

1. 数值调整先修改沸点交接 Token 与 `design-contract.json`，再同步 `miniprogram/app.wxss` 和 `docs/styles.css`。
2. 页面差异写入 `DESIGN.md` 的页面 Overrides，不在局部页面创建第二套品牌规范。
3. 新增页面必须说明 Intent、Master Mapping、Override、反模式和证据计划。
4. UI 改动同步设置页版本说明、`docs/ui-sync-manifest.json`、双端截图、契约测试和验收报告。
5. 第三方设计 Skill 或品牌规范只能参与推理；业务可用性、此里契约和小程序平台边界优先。

历史橙黑、暖灰主题和早期 13 页说明仅作决策背景，不再覆盖当前 17 页运行基线。
