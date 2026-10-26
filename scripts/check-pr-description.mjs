import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { normalize } from 'node:path';
import { pathToFileURL } from 'node:url';

const REQUIRED_SECTIONS = [
  '需求上下文',
  '背景',
  '修改方案',
  '复现或验证路径',
  '改动',
  '影响面',
  '测试与端到端验收',
  '改动文件',
];

function sectionContent(body, heading) {
  const lines = body.split('\n');
  const start = lines.findIndex((line) => line.trim() === `## ${heading}`);
  if (start < 0) return '';
  const end = lines.findIndex((line, index) => index > start && /^##\s+/.test(line.trim()));
  return lines
    .slice(start + 1, end < 0 ? lines.length : end)
    .join('\n')
    .trim();
}

function requireAll(content, expected, section, errors) {
  for (const item of expected)
    if (!content.includes(item)) errors.push(`「${section}」缺少必填项：${item}`);
}

export function parseDiffStats(numstat) {
  let files = 0;
  let additions = 0;
  let deletions = 0;
  for (const line of numstat.split('\n').filter(Boolean)) {
    const [added, deleted] = line.split('\t');
    files += 1;
    if (/^\d+$/.test(added)) additions += Number(added);
    if (/^\d+$/.test(deleted)) deletions += Number(deleted);
  }
  return { files, additions, deletions };
}

export function validatePullRequest({ title, body, stats, fileExists = existsSync }) {
  const errors = [];
  if (!/^(feat|fix|refactor|docs|test|chore|ci|perf)(\([^)]+\))?: .*[\u3400-\u9fff]/.test(title)) {
    errors.push('标题必须使用 <type>(<scope>): <中文结果>，且 type 为约定类型');
  }
  if (title.length > 72) errors.push('标题不得超过 72 个字符');
  if (!body.trim()) return [...errors, 'PR 描述不能为空'];
  if (body.includes('<!--')) errors.push('PR 描述仍包含模板注释，请填写完成后删除占位内容');
  if (body.includes('[请填写]')) errors.push('PR 描述仍包含“[请填写]”占位内容');
  if (/\[ \]/.test(body)) errors.push('PR 描述存在未勾选项目，未完成项应写明“未执行/阻塞 + 原因”');
  if (/<(?:填写|标题|链接|命令|结果|path|sha|n|m|k)>/i.test(body))
    errors.push('PR 描述仍包含模板占位符');

  const sections = new Map();
  for (const heading of REQUIRED_SECTIONS) {
    const content = sectionContent(body, heading);
    if (!content) errors.push(`缺少或未填写二级章节：${heading}`);
    sections.set(heading, content);
  }

  requireAll(
    sections.get('需求上下文') || '',
    ['一句话概要', '| 资料 | 链接 | 用途 |'],
    '需求上下文',
    errors,
  );
  requireAll(
    sections.get('影响面') || '',
    ['行为变化', '数据/兼容性', '安全/隐私', '部署', '回滚'],
    '影响面',
    errors,
  );
  requireAll(
    sections.get('测试与端到端验收') || '',
    ['| 类型 | 命令 | 结果 |', '| 关键用例 | 覆盖场景 |', '端到端验收', '验收报告'],
    '测试与端到端验收',
    errors,
  );

  const testSection = sections.get('测试与端到端验收') || '';
  requireAll(
    testSection,
    ['npm run validate', 'npm run coverage', 'npm run audit:all', 'git diff --check'],
    '测试与端到端验收',
    errors,
  );
  if (!/(通过|未执行|不适用|阻塞)/.test(testSection))
    errors.push('「测试与端到端验收」必须给出通过、未执行、不适用或阻塞结论');
  const reportMatch = testSection.match(/验收报告[^\n]*(docs\/verification\/[^\s`)\]]+\.md)/);
  if (!reportMatch) errors.push('「测试与端到端验收」必须提供 docs/verification/ 下的验收报告路径');
  else {
    const reportPath = reportMatch[1];
    const normalizedReportPath = normalize(reportPath).replaceAll('\\', '/');
    if (
      normalizedReportPath !== reportPath ||
      !normalizedReportPath.startsWith('docs/verification/')
    )
      errors.push(`验收报告路径越界：${reportPath}`);
    else if (!fileExists(reportPath)) errors.push(`验收报告文件不存在：${reportPath}`);
  }

  if (stats) {
    const expected = `汇总：\`${stats.files} files changed, +${stats.additions}/-${stats.deletions}\``;
    if (!body.includes(expected)) errors.push(`「改动文件」统计必须与最终 diff 一致：${expected}`);
  }
  return errors;
}

function currentDiffStats(base, head) {
  const result = spawnSync('git', ['diff', '--numstat', `${base}...${head}`], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`无法统计 PR diff：${result.stderr.trim()}`);
  return parseDiffStats(result.stdout);
}

export function runFromEnvironment(env = process.env) {
  const { PR_TITLE = '', PR_BODY = '', PR_BASE_SHA = '', PR_HEAD_SHA = '' } = env;
  if (!PR_BASE_SHA || !PR_HEAD_SHA) throw new Error('缺少 PR_BASE_SHA 或 PR_HEAD_SHA');
  const stats = currentDiffStats(PR_BASE_SHA, PR_HEAD_SHA);
  const errors = validatePullRequest({ title: PR_TITLE, body: PR_BODY, stats });
  if (errors.length) throw new Error(`PR 提交规范校验失败：\n- ${errors.join('\n- ')}`);
  console.log(`PR 提交规范校验通过：${stats.files} files, +${stats.additions}/-${stats.deletions}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  runFromEnvironment();
