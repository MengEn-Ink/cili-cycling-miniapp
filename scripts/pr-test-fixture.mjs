import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export function createPrFixture(t) {
  const cwd = mkdtempSync(join(tmpdir(), 'cili-pr-preflight-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const write = (file, content) => {
    mkdirSync(dirname(join(cwd, file)), { recursive: true });
    writeFileSync(join(cwd, file), content);
  };
  const git = (...args) =>
    execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '-q');
  git('config', 'user.email', 'fixture@example.invalid');
  git('config', 'user.name', 'Fixture');
  git('config', 'commit.gpgsign', 'false');
  write('.gitignore', '.pr-body.md\n.pr-title.txt\nartifacts/\n');
  write('docs/verification/old.md', '# Old unrelated report\n');
  write('docs/evidence/phase3-three-width/fixture.png', 'baseline fixture\n');
  write('README.md', 'baseline\n');
  git('add', '.');
  git('commit', '-qm', 'baseline');
  git('update-ref', 'refs/remotes/origin/main', git('rev-parse', 'HEAD'));
  const commit = (file = 'README.md', value = 'changed\n') => {
    write(file, value);
    git('add', '.');
    git('commit', '-qm', 'change');
  };
  const run = (script, args = [], env = {}) =>
    spawnSync(process.execPath, [fileURLToPath(new URL(script, import.meta.url)), ...args], {
      cwd,
      encoding: 'utf8',
      timeout: 20000,
      env: { ...process.env, ...env },
    });
  const prepareCommands = () => {
    const stub = `#!/usr/bin/env node\nrequire('node:fs').appendFileSync(${JSON.stringify(join(cwd, 'artifacts/commands.log'))}, process.argv.slice(2).join(' ') + '\\n');\n`;
    mkdirSync(join(cwd, 'artifacts/bin'), { recursive: true });
    for (const name of ['npm', 'npx']) {
      const path = join(cwd, 'artifacts/bin', name);
      const visualOutput =
        name === 'npm'
          ? `if (process.argv.slice(2).join(' ') === 'run validate') {\nconst fs = require('node:fs'); const path = require('node:path');\nconst output = path.join(process.env.OUT_DIR || process.cwd(), 'docs/evidence/phase3-three-width/fixture.png');\nfs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, 'generated fixture\\n');\n}\n`
          : '';
      writeFileSync(path, stub + visualOutput);
      chmodSync(path, 0o755);
    }
    for (const name of [
      'check-project-governance',
      'check-main-package-size',
      'check-ui-sync',
      'check-release-notes',
      'harness',
    ]) {
      write(
        `scripts/${name}.mjs`,
        `import fs from 'node:fs';\n${stub.slice(stub.indexOf('\n') + 1).replace("require('node:fs')", 'fs')}`,
      );
    }
    git('add', '.');
    git('commit', '-qm', 'fixture command stubs');
    git('update-ref', 'refs/remotes/origin/main', git('rev-parse', 'HEAD'));
    return { PATH: `${join(cwd, 'artifacts/bin')}:${process.env.PATH}` };
  };
  return { cwd, git, write, commit, run, prepareCommands };
}

export function validPrBody(stats = '1 files changed, +1/-1') {
  return `## 需求上下文
一句话概要：验证最终提交检查。
| 资料 | 链接 | 用途 |
| --- | --- | --- |
| 需求 | README.md | 范围 |
## 背景
旧流程遗漏最终状态。
## 修改方案
复用同一门禁。
## 复现或验证路径
执行预检并核对结果。
## 改动
补充检查。
## 影响面
行为变化：提前失败。
数据/兼容性：无。
安全/隐私：无。
部署：无需。
回滚：revert。
## 测试与端到端验收
| 类型 | 命令 | 结果 |
| --- | --- | --- |
| 校验 | npm run validate | 通过 |
| 覆盖 | npm run coverage | 通过 |
| 审计 | npm run audit:all | 通过 |
| 卫生 | git diff --check | 通过 |
| 关键用例 | 覆盖场景 |
| --- | --- |
| 预检 | 最终提交 |
端到端验收：未执行，工程脚本无产品行为变更。
验收报告：docs/verification/old.md
## 改动文件
汇总：\`${stats}\`
`;
}

export function assertFailed(result, pattern) {
  assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
  assert.match(`${result.stdout}\n${result.stderr}`, pattern);
}
