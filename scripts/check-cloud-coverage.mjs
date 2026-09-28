import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const report = JSON.parse(readFileSync(resolve('coverage/coverage-final.json'), 'utf8'));
const entry = Object.entries(report).find(([file]) =>
  file.replaceAll('\\', '/').endsWith('/miniprogram/repositories/cloud.ts'),
);
if (!entry) throw new Error('覆盖率报告中缺少 miniprogram/repositories/cloud.ts');

const [, coverage] = entry;
const ratio = (covered, total) => (total === 0 ? 100 : (covered / total) * 100);
const countHits = (values) => {
  const hits = values.flatMap((value) => (Array.isArray(value) ? value : [value]));
  return { covered: hits.filter((value) => value > 0).length, total: hits.length };
};
const statements = countHits(Object.values(coverage.s));
const functions = countHits(Object.values(coverage.f));
const branches = countHits(Object.values(coverage.b));
const lineHits = new Map();
for (const [id, location] of Object.entries(coverage.statementMap)) {
  const line = location.start.line;
  lineHits.set(line, Math.max(lineHits.get(line) || 0, coverage.s[id]));
}
const lines = countHits([...lineHits.values()]);
const metrics = {
  statements: ratio(statements.covered, statements.total),
  branches: ratio(branches.covered, branches.total),
  functions: ratio(functions.covered, functions.total),
  lines: ratio(lines.covered, lines.total),
};
console.log(
  `cloud.ts 覆盖率门禁：lines ${metrics.lines.toFixed(2)}%，branches ${metrics.branches.toFixed(2)}%，functions ${metrics.functions.toFixed(2)}%，statements ${metrics.statements.toFixed(2)}%`,
);
if (metrics.lines < 90 || metrics.branches < 85) {
  throw new Error('cloud.ts 覆盖率未达到 lines >= 90% 且 branches >= 85%');
}
