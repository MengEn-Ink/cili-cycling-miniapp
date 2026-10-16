# Agent 工作约定

在处理本仓库的任何任务前，必须先阅读 [`docs/high-priority-issues.md`](docs/high-priority-issues.md)。

- 优先处理清单中的 P0、P1 未解决问题。
- 用户指定的当前首要可执行 P0 是[沸点风格设计令牌方案](docs/superpowers/specs/2026-10-16-boiling-point-design-tokens.md)的实施与验收。下一轮 UI 工作先迁移双端令牌与公共组件，再按方案推进 13 页；保持大字号与呼吸感、浅色可读性和 44px 实际触控范围，不新增业务功能或字段。部署与验收完成前保留在高优清单。
- 新发现的问题先去重、澄清和拆分，再追加到清单。
- 代码完成不等于问题解决；只有部署并验收通过后，才能从清单移除。
- 每次提交、部署、验收或阻塞变化后，都要同步更新清单状态和下一步。
- 不在清单中保留已完成事项，Git 历史即归档。
- 个人信息展示规则（用户已确认）：本人与审核管理员完整显示实名和电话，其他骑友只见昵称，后援车司机电话公开完整显示；详见 [`docs/cloudbase-schema.md`](docs/cloudbase-schema.md) 的“个人信息展示规则”。
- UI 修改前先读 [`docs/design-system.md`](docs/design-system.md) 与对应 Pages 路由；变量遵循 `docs/design-contract.json`，浅色文字和控件必须可读。
- UI 交付须通过 `check:design`、`check:ui-sync -- --strict` 与全量 `validate`；13 页双端截图须绑定实际内容摘要并标注状态、脱敏和差异。模拟器通过不能替代物理真机或完整写链路验收。
