import { describe, expect, it } from 'vitest';

// @ts-expect-error PR 描述门禁是无 TypeScript 声明的 Node ESM 脚本。
import { parseDiffStats, validatePullRequest } from '../scripts/check-pr-description.mjs';

const validBody = `## 需求上下文

**一句话概要**：为维护者提供可复核的 PR 提交流程，本次完成自动门禁。

| 资料 | 链接 | 用途 |
| --- | --- | --- |
| 需求说明 | 暂无：以本 PR 验收标准为准 | 确认范围 |

## 背景

现有模板未强制验证完整测试、影响范围和验收报告，容易造成描述与最终 diff 漂移。

## 修改方案

复用现有 validate 检查，在 PR 事件中校验八段式描述和最终 diff 统计。

## 复现或验证路径

1. 创建缺少测试报告的 PR。
2. CI 执行描述门禁。
3. 门禁应给出缺失项。

## 改动

| 层 | 改动 | 说明 |
| --- | --- | --- |
| CI | 修改 PR 描述门禁 | 合并前阻断不完整描述 |

## 影响面

| 维度 | 影响 |
| --- | --- |
| 行为变化 | PR 描述不完整时 CI 失败 |
| 数据/兼容性 | 不影响运行数据 |
| 安全/隐私 | 不读取密钥和用户数据 |
| 部署 | 仅影响 PR CI |
| 回滚 | 回滚本提交即可 |

## 测试与端到端验收

| 类型 | 命令 | 结果 |
| --- | --- | --- |
| 单元测试 | \`npm run validate\` | 通过 |
| 覆盖率 | \`npm run coverage\` | 通过 |
| 安全审计 | \`npm run audit:all\` | 通过 |
| Diff 卫生 | \`git diff --check\` | 通过 |

- [x] 已执行并记录上述门禁

| 关键用例 | 覆盖场景 |
| --- | --- |
| \`完整描述通过\` | 八段式内容与统计一致 |

**端到端验收**：通过 PR CI 验证。
**验收报告**：\`docs/verification/pr-acceptance-report-template.md\`

## 改动文件

| 文件 / 目录 | 类型 | 改动 |
| --- | --- | --- |
| \`scripts/check-pr-description.mjs\` | 新增 | 校验 PR 描述 |

汇总：\`2 files changed, +10/-2\`
`;

describe('PR 提交规范门禁', () => {
  it('接受八段齐全、测试与影响说明完整且统计一致的描述', () => {
    expect(
      validatePullRequest({
        title: 'ci(pr): 强制校验完整测试与验收说明',
        body: validBody,
        stats: { files: 2, additions: 10, deletions: 2 },
      }),
    ).toEqual([]);
  });

  it('同时报告缺失章节、测试报告、未完成清单和统计漂移', () => {
    const errors = validatePullRequest({
      title: 'update pr template',
      body: validBody
        .replace('## 测试与端到端验收', '## 测试')
        .replace('- [x]', '- [ ]')
        .replace('汇总：`2 files changed, +10/-2`', '汇总：`1 files changed, +1/-0`'),
      stats: { files: 2, additions: 10, deletions: 2 },
    });
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('标题必须使用'),
        expect.stringContaining('缺少或未填写二级章节：测试与端到端验收'),
        expect.stringContaining('存在未勾选项目'),
        expect.stringContaining('最终 diff 一致'),
      ]),
    );
  });

  it('拒绝只填写路径但未把验收报告提交进仓库', () => {
    const errors = validatePullRequest({
      title: 'ci(pr): 强制校验完整测试与验收说明',
      body: validBody,
      stats: { files: 2, additions: 10, deletions: 2 },
      fileExists: () => false,
    });
    expect(errors).toContain(
      '验收报告文件不存在：docs/verification/pr-acceptance-report-template.md',
    );
  });

  it('拒绝通过路径穿越引用验收目录外的文件', () => {
    const errors = validatePullRequest({
      title: 'ci(pr): 强制校验完整测试与验收说明',
      body: validBody.replace(
        'docs/verification/pr-acceptance-report-template.md',
        'docs/verification/../../README.md',
      ),
      stats: { files: 2, additions: 10, deletions: 2 },
      fileExists: () => true,
    });
    expect(errors).toContain('验收报告路径越界：docs/verification/../../README.md');
  });

  it('正确统计文本与二进制文件的 numstat', () => {
    expect(parseDiffStats('10\t2\ta.ts\n-\t-\timage.png\n3\t0\tb.md\n')).toEqual({
      files: 3,
      additions: 13,
      deletions: 2,
    });
  });

  it('拒绝本地生成器留下的中文补充占位符', () => {
    const errors = validatePullRequest({
      title: 'ci(pr): 前置最终提交检查',
      body: validBody.replace('现有模板', '【请补充：背景】'),
      stats: { files: 2, additions: 10, deletions: 2 },
    });
    expect(errors).toContain('PR 描述仍包含“【请补充】”占位内容');
  });
});
