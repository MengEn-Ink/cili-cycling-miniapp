import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
const deployMiniprogram = readFileSync('.github/workflows/deploy-miniprogram.yml', 'utf8');
const deployCloudbase = readFileSync('.github/workflows/deploy-cloudbase.yml', 'utf8');
const packageJson = readFileSync('package.json', 'utf8');

function jobBlock(name, nextName) {
  const end = nextName ? `\n  ${nextName}:` : '$';
  return ci.match(new RegExp(`\\n  ${name}:[\\s\\S]*?(?=${end})`))?.[0] ?? '';
}

test('PR 提交规范与影响面检查拆分为独立并行 job', () => {
  const submission = jobBlock('pr-submission', 'upload-decision');
  assert.match(submission, /Validate pull request submission/);
  assert.match(submission, /fetch-depth: 0/);
  assert.match(jobBlock('affected-pr', 'validate'), /Run affected pull request checks/);
  assert.doesNotMatch(jobBlock('affected-pr', 'validate'), /needs:/);
});

test('required validate 聚合普通 PR 与机器人 PR 的结果契约', () => {
  const aggregate = jobBlock('validate', 'main-validate');

  assert.match(aggregate, /if: always\(\) && github\.event_name == 'pull_request'/);
  assert.match(aggregate, /needs: \[pr-submission, affected-pr\]/);
  assert.match(aggregate, /AFFECTED_PR_RESULT: \$\{\{ needs\.affected-pr\.result \}\}/);
  assert.match(aggregate, /PR_SUBMISSION_RESULT: \$\{\{ needs\.pr-submission\.result \}\}/);
  assert.match(aggregate, /AFFECTED_PR_RESULT}" != "success"/);
  assert.match(aggregate, /PR_SUBMISSION_RESULT}" == "success"/);

  assert.match(aggregate, /github\.actor == 'dependabot\[bot\]'/);
  assert.match(aggregate, /github\.actor == 'github-actions\[bot\]'/);
  assert.match(aggregate, /startsWith\(github\.head_ref, 'fix\/nightly-'\)/);
  assert.match(
    aggregate,
    /SUBMISSION_EXEMPT}" == "true" && "\$\{PR_SUBMISSION_RESULT\}" == "skipped"/,
  );
  assert.match(aggregate, /仅 Dependabot\/夜间机器人允许 skipped/);
  assert.ok((aggregate.match(/exit 1/g) || []).length >= 2);
  assert.doesNotMatch(aggregate, /npm ci|actions\/setup-node/);
});

test('main 的 validate、coverage、audit 并行且每个 Node job 独立 npm ci 与缓存', () => {
  for (const [name, next] of [
    ['main-validate', 'main-coverage'],
    ['main-coverage', 'main-audit'],
    ['main-audit', null],
  ]) {
    const block = jobBlock(name, next);
    assert.match(block, /actions\/setup-node@v7/);
    assert.match(block, /cache: npm/);
    assert.match(block, /npm ci/);
    if (name === 'main-validate') assert.match(block, /fetch-depth: 0/);
    assert.doesNotMatch(block, /needs:/);
    assert.doesNotMatch(block, /node_modules/);
  }
});

test('decision artifact 与 main workflow_run 上传部署契约保持不变', () => {
  const decision = jobBlock('upload-decision', 'affected-pr');
  assert.match(decision, /name: miniprogram-upload-decision/);
  assert.match(decision, /actions\/upload-artifact@v7/);
  assert.match(deployMiniprogram, /workflow_run:[\s\S]*workflows: \[CI\][\s\S]*branches: \[main\]/);
  assert.match(deployMiniprogram, /Download miniprogram upload decision/);
  assert.match(deployCloudbase, /workflow_run:[\s\S]*workflows: \[CI\][\s\S]*branches: \[main\]/);
  assert.match(deployCloudbase, /github\.event\.workflow_run\.conclusion == 'success'/);
});

test('依赖审计维持 high 门槛且上传工具依赖保持隔离安装', () => {
  assert.match(packageJson, /npm audit --audit-level=high/);
  assert.match(packageJson, /npm@11 ci --ignore-scripts --prefix tools\/miniprogram-ci/);
  assert.match(jobBlock('main-audit', null), /npm run tool:install/);
});
