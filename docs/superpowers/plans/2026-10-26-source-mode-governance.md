# Source Mode Governance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Git executable-bit set explicit and fail closed, then normalize all 68 unintended `100755` entries without changing file contents.

**Architecture:** A pure policy module owns the exact 15-path executable allowlist and stable mode/shebang validation. A dedicated source-mode CLI reads `git ls-files --stage -z`, while the `check:governance` package script composes it after the existing governance CLI; this keeps all 68 normalized files, including the existing CLI, blob-identical. Tests first exercise the real package command through an alternate Git index, then cover shebang validation and the live repository set before the mechanical mode repair.

**Tech Stack:** Node.js 24, `node:test`, Git index plumbing, existing npm Harness and GitHub Actions.

**Execution mode:** Inline in the current session. Multi-agent implementation is not authorized; TraeX 审判者 remains read-only and reviews the finished PR.

---

### Task 1: Reconfirm the frozen boundary and executable allowlist

**Files:**
- Read: `docs/high-priority-issues.md`
- Read: `docs/superpowers/specs/2026-10-26-governance-hygiene-v2-design.md`
- Read: `scripts/check-project-governance.mjs`
- Read: Git index at `4e69367f21139c8d9dab068fea5ed67926ef872b`

- [ ] **Step 1: Prove the branch is based on the approved main SHA and the worktree is clean**

Run:

```bash
git merge-base --is-ancestor 4e69367f21139c8d9dab068fea5ed67926ef872b HEAD
git status --porcelain=v1
git rev-parse HEAD
```

Expected: the ancestor check exits 0, porcelain is empty, and HEAD is the approved design commit descended directly from `4e69367f`.

- [ ] **Step 2: Recompute the current executable set and require the approved counts**

Run:

```bash
node <<'NODE'
const { execFileSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const rows = execFileSync('git', ['ls-files', '--stage'], { encoding: 'utf8' })
  .trim()
  .split('\n');
const executables = rows.flatMap((row) => {
  const match = row.match(/^100755 [0-9a-f]+ \d+\t(.+)$/);
  return match ? [match[1]] : [];
});
const withShebang = executables.filter((file) =>
  readFileSync(file, 'utf8').split(/\r?\n/, 1)[0].startsWith('#!'),
);
if (executables.length !== 83 || withShebang.length !== 15) {
  throw new Error(`unexpected mode inventory: executable=${executables.length}, shebang=${withShebang.length}`);
}
console.log(JSON.stringify({ executables: executables.length, withShebang }, null, 2));
NODE
```

Expected: `executables=83` and the exact 15 paths below, all with `#!/usr/bin/env node`:

```text
scripts/bootstrap-cloudbase.mjs
scripts/cloudbase-activity-flow-smoke.mjs
scripts/cloudbase-club-application-smoke.mjs
scripts/cloudbase-deploy-decision.mjs
scripts/cloudbase-function-env.mjs
scripts/cloudbase-historical-activity-purge.mjs
scripts/cloudbase-prelaunch-media-purge.mjs
scripts/cloudbase-storage-rules.mjs
scripts/gen-tabbar-icons.mjs
scripts/harness.mjs
scripts/pages-visual-acceptance/capture-routes.mjs
scripts/pages-visual-acceptance/sync-ui-digests.mjs
scripts/phase3-three-width-walkthrough.mjs
scripts/run-phase3-three-width.mjs
scripts/wechat-devtools-e2e.cjs
```

- [ ] **Step 3: Confirm no other writer moved the branch**

Run:

```bash
git status --short --branch
git log -1 --format='%H %cI %s'
```

Expected: only `chore/governance-hygiene-20261026-v2` is active here and there are no uncommitted changes.

### Task 2: Write the real-CLI RED test

**Files:**
- Create: `scripts/project-governance-policy.node-test.mjs`
- Test: `scripts/project-governance-policy.node-test.mjs`

- [ ] **Step 1: Create an alternate-index integration test before changing production code**

Create `scripts/project-governance-policy.node-test.mjs` with:

```js
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

test('governance CLI rejects an executable bit outside the explicit allowlist', () => {
  const directory = mkdtempSync(join(tmpdir(), 'cili-governance-index-'));
  const index = join(directory, 'index');
  const env = { ...process.env, GIT_INDEX_FILE: index };

  try {
    execFileSync('git', ['read-tree', 'HEAD'], { env });
    execFileSync('git', ['update-index', '--chmod=+x', '--', 'README.md'], { env });
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const result = spawnSync(npm, ['run', 'check:governance'], {
      encoding: 'utf8',
      env,
    });
    const output = `${result.stdout}\n${result.stderr}`;

    assert.notEqual(result.status, 0);
    assert.match(output, /README\.md/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run the test and capture the required RED evidence**

Run:

```bash
set -o pipefail
node --test scripts/project-governance-policy.node-test.mjs 2>&1 | tee /tmp/cili-pr-a-red.log
```

Expected: FAIL because the current governance CLI exits 0 even when the alternate index marks `README.md` executable. Preserve `/tmp/cili-pr-a-red.log` until the verification record contains the failure signature.

- [ ] **Step 3: Confirm production files remain untouched after RED**

Run:

```bash
git status --short
```

Expected: only `scripts/project-governance-policy.node-test.mjs` is untracked.

### Task 3: Add the explicit mode policy and integrate it into governance

**Files:**
- Create: `scripts/project-governance-policy.mjs`
- Create: `scripts/check-source-modes.mjs`
- Modify: `package.json`
- Test: `scripts/project-governance-policy.node-test.mjs`

- [ ] **Step 1: Implement the minimal exact-path mode policy**

Create `scripts/project-governance-policy.mjs` with:

```js
export const EXECUTABLE_PATH_ALLOWLIST = Object.freeze([
  'scripts/bootstrap-cloudbase.mjs',
  'scripts/cloudbase-activity-flow-smoke.mjs',
  'scripts/cloudbase-club-application-smoke.mjs',
  'scripts/cloudbase-deploy-decision.mjs',
  'scripts/cloudbase-function-env.mjs',
  'scripts/cloudbase-historical-activity-purge.mjs',
  'scripts/cloudbase-prelaunch-media-purge.mjs',
  'scripts/cloudbase-storage-rules.mjs',
  'scripts/gen-tabbar-icons.mjs',
  'scripts/harness.mjs',
  'scripts/pages-visual-acceptance/capture-routes.mjs',
  'scripts/pages-visual-acceptance/sync-ui-digests.mjs',
  'scripts/phase3-three-width-walkthrough.mjs',
  'scripts/run-phase3-three-width.mjs',
  'scripts/wechat-devtools-e2e.cjs',
]);

export function parseTrackedModes(indexOutput) {
  return indexOutput
    .split('\0')
    .filter(Boolean)
    .map((entry) => {
      const separator = entry.indexOf('\t');
      if (separator < 0) throw new Error(`无法解析 Git index 记录：${entry}`);
      const [mode] = entry.slice(0, separator).split(' ');
      return { mode, path: entry.slice(separator + 1) };
    });
}

export function findTrackedModeViolations(indexOutput) {
  const entries = parseTrackedModes(indexOutput);
  const modes = new Map(entries.map((entry) => [entry.path, entry.mode]));
  const allowed = new Set(EXECUTABLE_PATH_ALLOWLIST);
  const violations = [];

  for (const path of EXECUTABLE_PATH_ALLOWLIST) {
    const mode = modes.get(path);
    if (mode !== '100755') {
      violations.push(`${path}: 预期 100755，实际 ${mode || '未跟踪'}`);
    }
  }
  for (const { mode, path } of entries) {
    if (mode === '100755' && !allowed.has(path)) {
      violations.push(`${path}: 不在可执行入口白名单却为 100755`);
    }
  }

  return violations.sort();
}
```

- [ ] **Step 2: Add the dedicated source-mode CLI without changing any of the 68 files**

Create `scripts/check-source-modes.mjs` with:

```js
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { findTrackedModeViolations } from './project-governance-policy.mjs';

const trackedModes = spawnSync('git', ['ls-files', '--stage', '-z'], { encoding: 'utf8' });
if (trackedModes.status !== 0) {
  throw new Error(`无法读取 Git 文件模式：${trackedModes.stderr.trim()}`);
}
const modeViolations = findTrackedModeViolations(trackedModes.stdout);
if (modeViolations.length) {
  throw new Error(`Git 文件模式不符合源码卫生策略：${modeViolations.join(', ')}`);
}

console.log('Git 文件模式校验通过：15 个显式 CLI 入口，无额外 100755 文件');
```

- [ ] **Step 3: Add the failing package-composition contract**

Add `readFileSync` to the existing `node:fs` import, then add:

```js
const packageScripts = JSON.parse(readFileSync('package.json', 'utf8')).scripts;

test('check:governance composes the source-mode CLI', () => {
  assert.match(packageScripts['check:governance'], /check-source-modes\.mjs/);
});
```

Run:

```bash
node --test scripts/project-governance-policy.node-test.mjs
```

Expected: FAIL because the public command does not yet contain `check-source-modes.mjs`.

- [ ] **Step 4: Compose the new CLI into the public governance command**

Change the package script to:

```json
"check:governance": "node scripts/check-project-governance.mjs && node scripts/check-source-modes.mjs"
```

- [ ] **Step 5: Re-run the alternate-index and package-composition tests**

Run:

```bash
node --test scripts/project-governance-policy.node-test.mjs
```

Expected: PASS; the CLI rejects `README.md: 不在可执行入口白名单却为 100755`.

- [ ] **Step 6: Prove the repository itself is now fail-closed before chmod**

Run:

```bash
npm run check:governance
```

Expected: FAIL and list the current unexpected `100755` paths. This is the second RED signal: the new door is active before the repository is repaired.

### Task 4: Add shebang and live-set tests before completing the policy

**Files:**
- Modify: `scripts/project-governance-policy.node-test.mjs`
- Modify: `scripts/project-governance-policy.mjs`

- [ ] **Step 1: Add tests for the exact allowlist, supported shebang, and live index**

Append these policy imports and tests to `scripts/project-governance-policy.node-test.mjs`:

```js
import {
  EXECUTABLE_PATH_ALLOWLIST,
  findTrackedModeViolations,
} from './project-governance-policy.mjs';

const EXPECTED_EXECUTABLES = [
  'scripts/bootstrap-cloudbase.mjs',
  'scripts/cloudbase-activity-flow-smoke.mjs',
  'scripts/cloudbase-club-application-smoke.mjs',
  'scripts/cloudbase-deploy-decision.mjs',
  'scripts/cloudbase-function-env.mjs',
  'scripts/cloudbase-historical-activity-purge.mjs',
  'scripts/cloudbase-prelaunch-media-purge.mjs',
  'scripts/cloudbase-storage-rules.mjs',
  'scripts/gen-tabbar-icons.mjs',
  'scripts/harness.mjs',
  'scripts/pages-visual-acceptance/capture-routes.mjs',
  'scripts/pages-visual-acceptance/sync-ui-digests.mjs',
  'scripts/phase3-three-width-walkthrough.mjs',
  'scripts/run-phase3-three-width.mjs',
  'scripts/wechat-devtools-e2e.cjs',
];

test('executable allowlist is an exact path list', () => {
  assert.deepEqual(EXECUTABLE_PATH_ALLOWLIST, EXPECTED_EXECUTABLES);
});

test('allowlisted executable without the Node shebang is rejected', () => {
  const indexOutput = EXPECTED_EXECUTABLES.map(
    (path) => `100755 ${'a'.repeat(40)} 0\t${path}\0`,
  ).join('');
  const violations = findTrackedModeViolations(indexOutput, (path) =>
    path === 'scripts/harness.mjs' ? 'import process from \'node:process\';' : '#!/usr/bin/env node',
  );

  assert.deepEqual(violations, ['scripts/harness.mjs: 100755 入口缺少 #!/usr/bin/env node']);
});

test('current Git index contains only approved executable entries', () => {
  const indexOutput = execFileSync('git', ['ls-files', '--stage', '-z'], { encoding: 'utf8' });
  const violations = findTrackedModeViolations(
    indexOutput,
    (path) => readFileSync(path, 'utf8').split(/\r?\n/, 1)[0],
  );
  assert.deepEqual(violations, []);
});
```

- [ ] **Step 2: Run the focused tests and verify RED for the missing shebang contract and live modes**

Run:

```bash
node --test scripts/project-governance-policy.node-test.mjs
```

Expected: the exact allowlist test and alternate-index test pass; the missing-shebang assertion fails because the policy does not yet inspect content; the live-index test fails with 68 unexpected executable entries.

- [ ] **Step 3: Add the minimal shebang check**

Change the policy signature and allowlist loop to:

```js
export function findTrackedModeViolations(indexOutput, readFirstLine = () => '') {
  const entries = parseTrackedModes(indexOutput);
  const modes = new Map(entries.map((entry) => [entry.path, entry.mode]));
  const allowed = new Set(EXECUTABLE_PATH_ALLOWLIST);
  const violations = [];

  for (const path of EXECUTABLE_PATH_ALLOWLIST) {
    const mode = modes.get(path);
    if (mode !== '100755') {
      violations.push(`${path}: 预期 100755，实际 ${mode || '未跟踪'}`);
      continue;
    }
    if (readFirstLine(path) !== '#!/usr/bin/env node') {
      violations.push(`${path}: 100755 入口缺少 #!/usr/bin/env node`);
    }
  }
  for (const { mode, path } of entries) {
    if (mode === '100755' && !allowed.has(path)) {
      violations.push(`${path}: 不在可执行入口白名单却为 100755`);
    }
  }

  return violations.sort();
}
```

Update the source-mode CLI call to read the real first line:

```js
const modeViolations = findTrackedModeViolations(
  trackedModes.stdout,
  (file) => readFileSync(file, 'utf8').split(/\r?\n/, 1)[0],
);
```

- [ ] **Step 4: Re-run the focused tests**

Run:

```bash
node --test scripts/project-governance-policy.node-test.mjs
```

Expected: only `current Git index contains only approved executable entries` remains RED, listing exactly 68 unexpected paths.

### Task 5: Normalize the 68 unintended executable modes

**Files:**
- Mode-only modify: the 68 tracked files reported by Task 4
- Preserve content: every mode-only file blob

- [ ] **Step 1: Apply mode-only changes while excluding the exact 15-path allowlist**

Run:

```bash
git ls-files --stage -z | while IFS= read -r -d '' record; do
  mode=${record%% *}
  path=${record#*$'\t'}
  [[ "$mode" == '100755' ]] || continue
  case "$path" in
    scripts/bootstrap-cloudbase.mjs|scripts/cloudbase-activity-flow-smoke.mjs|scripts/cloudbase-club-application-smoke.mjs|scripts/cloudbase-deploy-decision.mjs|scripts/cloudbase-function-env.mjs|scripts/cloudbase-historical-activity-purge.mjs|scripts/cloudbase-prelaunch-media-purge.mjs|scripts/cloudbase-storage-rules.mjs|scripts/gen-tabbar-icons.mjs|scripts/harness.mjs|scripts/pages-visual-acceptance/capture-routes.mjs|scripts/pages-visual-acceptance/sync-ui-digests.mjs|scripts/phase3-three-width-walkthrough.mjs|scripts/run-phase3-three-width.mjs|scripts/wechat-devtools-e2e.cjs)
      continue
      ;;
  esac
  chmod a-x "$path"
  git update-index --chmod=-x -- "$path"
done
```

- [ ] **Step 2: Verify the mode count and focused tests are GREEN**

Run:

```bash
node --test scripts/project-governance-policy.node-test.mjs
npm run check:governance
git diff --summary 4e69367f21139c8d9dab068fea5ed67926ef872b | rg -c 'mode change 100755 => 100644'
```

Expected: all focused tests pass, governance passes, and the mode-change count is exactly 68.

- [ ] **Step 3: Prove every mode-only file retained the identical blob**

Run:

```bash
node <<'NODE'
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const base = '4e69367f21139c8d9dab068fea5ed67926ef872b';
const output = execFileSync('git', ['diff', '--raw', '--no-abbrev', base, '--'], {
  encoding: 'utf8',
});
const modeOnly = output
  .trim()
  .split('\n')
  .filter((line) => line.startsWith(':100755 100644 '));
assert.equal(modeOnly.length, 68);
for (const line of modeOnly) {
  const metadata = line.slice(1, line.indexOf('\t')).split(' ');
  assert.equal(metadata[2], metadata[3], line);
}
console.log('68 mode-only paths keep identical blob IDs');
NODE
```

Expected: `68 mode-only paths keep identical blob IDs`.

- [ ] **Step 4: Confirm protected files are unchanged**

Run:

```bash
git diff --exit-code 4e69367f21139c8d9dab068fea5ed67926ef872b -- docs/ui-sync-manifest.json
git diff -- docs/high-priority-issues.md
```

Expected: manifest has zero diff; the ledger diff contains only the single unresolved governance P1 row from the approved design.

### Task 6: Register the new test and preserve release-note semantics

**Files:**
- Modify: `scripts/project-governance-policy.node-test.mjs`
- Modify: `scripts/check-release-notes.mjs`
- Modify: `scripts/check-release-notes.node-test.mjs`
- Modify: `package.json`
- Test: `scripts/project-governance-policy.node-test.mjs`
- Test: `scripts/check-release-notes.node-test.mjs`

- [ ] **Step 1: Add a failing package-script contract**

Add this constant beside `EXPECTED_EXECUTABLES` and append the test to `scripts/project-governance-policy.node-test.mjs`:

```js
const packageScripts = JSON.parse(readFileSync('package.json', 'utf8')).scripts;

test('CI contract runs the source-mode governance regression test', () => {
  assert.match(packageScripts['test:ci-contract'], /project-governance-policy\.node-test\.mjs/);
});
```

- [ ] **Step 2: Run RED**

Run:

```bash
node --test scripts/project-governance-policy.node-test.mjs
```

Expected: FAIL because `test:ci-contract` does not yet include `project-governance-policy.node-test.mjs`.

- [ ] **Step 3: Add the new test file to `test:ci-contract`**

Change the script to:

```json
"test:ci-contract": "node --test scripts/pr-source-evidence.node-test.mjs scripts/affected-ci.node-test.mjs scripts/run-cloud-packages.node-test.mjs scripts/ci-workflow-contract.node-test.mjs scripts/project-governance-policy.node-test.mjs scripts/pr-preflight.node-test.mjs scripts/pr-body.node-test.mjs"
```

- [ ] **Step 4: Run GREEN**

Run:

```bash
npm run test:ci-contract
```

Expected: all CI-contract tests pass, including all six source-mode governance tests; `scripts/ci-workflow-contract.node-test.mjs` remains content-identical and changes mode only.

- [ ] **Step 5: Write the failing release-note regression test**

Import `check-release-notes.mjs` as a namespace and append:

```js
test('纯 Git mode 变更不触发产品发布说明', () => {
  assert.equal(typeof releaseNotes.parseContentChangedFiles, 'function');

  const modeOnlyHash = 'a'.repeat(40);
  const oldContentHash = 'b'.repeat(40);
  const newContentHash = 'c'.repeat(40);
  const rawDiff = [
    `:100755 100644 ${modeOnlyHash} ${modeOnlyHash} M\0miniprogram/pages/profile/index.ts\0`,
    `:100644 100644 ${oldContentHash} ${newContentHash} M\0cloudfunctions/registration/index.js\0`,
  ].join('');

  assert.deepEqual(releaseNotes.parseContentChangedFiles(rawDiff), [
    'cloudfunctions/registration/index.js',
  ]);
});
```

- [ ] **Step 6: Run RED**

Run:

```bash
node --test scripts/check-release-notes.node-test.mjs
```

Expected: 6 PASS / 1 FAIL because `parseContentChangedFiles` does not exist.

- [ ] **Step 7: Filter only executable-bit-only raw diff records**

Add `parseContentChangedFiles(rawDiff)` to `scripts/check-release-notes.mjs`; it must parse `git diff --raw --no-abbrev --no-renames -z`, ignore only `100755↔100644` records whose old/new blob IDs are equal, and retain every content change or other mode transition. Change `run()` to pass this filtered path list into the existing validator.

```js
export function parseContentChangedFiles(rawDiff) {
  const fields = rawDiff.split('\0');
  if (fields.at(-1) === '') fields.pop();
  if (fields.length % 2 !== 0) throw new Error('无法解析 Git raw diff：记录不完整');

  const contentChangedFiles = [];
  for (let index = 0; index < fields.length; index += 2) {
    const metadata = fields[index];
    const file = fields[index + 1];
    const match = metadata.match(
      /^:(\d{6}) (\d{6}) ([0-9a-f]{40}) ([0-9a-f]{40}) [A-Z]$/,
    );
    if (!match) throw new Error(`无法解析 Git raw diff 元数据：${metadata}`);

    const [, oldMode, newMode, oldHash, newHash] = match;
    const executableModeOnly =
      oldHash === newHash &&
      ((oldMode === '100755' && newMode === '100644') ||
        (oldMode === '100644' && newMode === '100755'));
    if (!executableModeOnly) contentChangedFiles.push(file);
  }

  return contentChangedFiles;
}
```

Replace the name-only diff in `run()` with:

```js
const rawDiff = execFileSync(
  'git',
  ['diff', '--raw', '--no-abbrev', '--no-renames', '-z', base],
  { encoding: 'utf8' },
);
const changedFiles = parseContentChangedFiles(rawDiff);
```

- [ ] **Step 8: Run GREEN and the real gate**

Run:

```bash
node --test scripts/check-release-notes.node-test.mjs
npm run check:release-notes
```

Expected: 7 PASS / 0 FAIL and `App 更新校验通过：本次无产品代码改动`.

### Task 7: Record fail-closed evidence and ledger state

**Files:**
- Create: `docs/verification/2026-10-26-source-mode-governance.md`
- Modify: `docs/verification/README.md`
- Modify: `docs/high-priority-issues.md`

- [ ] **Step 1: Create the immutable verification record**

Create `docs/verification/2026-10-26-source-mode-governance.md` with these concrete sections and statuses:

```markdown
# 源码文件模式治理验收

日期：2026-10-26。基线：`main@4e69367f21139c8d9dab068fea5ed67926ef872b`。交付分支：`chore/governance-hygiene-20261026-v2`。本片只修改 Git 文件模式与治理检查，不改变产品、CloudBase、UI、客户端版本或 `docs/ui-sync-manifest.json`。

## 范围

- 15 个显式 Node CLI 入口保留 `100755`，且首行为 `#!/usr/bin/env node`。
- 68 个无 shebang 的异常 `100755` 文件改为 `100644`，blob ID 全部保持不变。
- `check:governance` 读取 Git index 并拒绝白名单外 `100755`、白名单缺项、错误模式和缺失 shebang。

## TDD 证据

| 阶段 | 命令 | 结果 |
| --- | --- | --- |
| RED 1 | `node --test scripts/project-governance-policy.node-test.mjs` | 旧治理 CLI 对 alternate index 中的可执行 README 返回 0，测试按预期失败 |
| RED 2 | `npm run check:governance` | 新门禁生效后拒绝 68 个异常执行位 |
| GREEN | `npm run test:ci-contract` | 模式策略、shebang、alternate index 和当前仓库集合全部通过 |
| Blob 等价 | Git raw diff 校验 | 68 个 mode-only 路径 old/new blob ID 完全相同 |

## 自动化门禁

| 门禁 | 状态 | 结论 |
| --- | --- | --- |
| `npm run validate` | `NOT_EXECUTED` | 初始记录创建时命令尚未执行，不得推断 PASS |
| `npm run coverage` | `NOT_EXECUTED` | 初始记录创建时命令尚未执行，不得推断 PASS |
| `npm run audit:all` | `NOT_EXECUTED` | 初始记录创建时命令尚未执行，不得推断 PASS |
| `git diff --check` | `NOT_EXECUTED` | 初始记录创建时命令尚未执行，不得推断 PASS |

## 运行态与部署

本片不改变运行代码、UI、云函数、数据库、存储规则或小程序包；真实用户旅程、CloudBase 部署和物理真机为 `N/A`。合并后的 main CI、CloudBase/微信 workflow 安全跳过结果仍需独立回读，不能由本地绿色推断。

## 当前结论

`IMPLEMENTED / REVIEW_PENDING`。本地实现完成不等于合并或治理闭环；等待审判者只读复审、PR checks、main CI 与适用 workflow 回读。
```

After each command runs, replace its `NOT_EXECUTED` state with the observed `PASS` or `FAIL`, plus stable counts from that run. If a command fails, record `FAIL` and stop; do not write `PASS`.

- [ ] **Step 2: Add the report to the verification index**

Add this item under `## 当前文档` in `docs/verification/README.md`:

```markdown
- [2026-10-26 源码文件模式治理验收](2026-10-26-source-mode-governance.md)：记录显式 CLI 白名单、68 个 mode-only 修正、TDD 红绿证据和 blob 等价证明。
```

- [ ] **Step 3: Move only the PR A status forward, fail closed**

Change the governance P1 state in `docs/high-priority-issues.md` from:

```text
DESIGN_APPROVED / IMPLEMENTATION_PENDING
```

to:

```text
PR_A_IMPLEMENTED / REVIEW_PENDING
```

Keep the other three slices pending and retain the row. Do not change any product, deployment, media, UAT, #382–#386, or historical release statement.

### Task 8: Run the complete validation ladder

**Files:**
- Verify: entire PR A diff
- Update observed results: `docs/verification/2026-10-26-source-mode-governance.md`

- [ ] **Step 1: Run formatting, focused tests, governance, and diff checks**

Run:

```bash
npm run format:check
npm run test:ci-contract
npm run check:governance
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 2: Run full validation**

Run:

```bash
npm run validate
```

Expected: exit 0. A missing browser/tool dependency is BLOCKED, not PASS, and must be resolved before PR creation.

- [ ] **Step 3: Run coverage and dependency audit**

Run:

```bash
npm run coverage
npm run audit:all
```

Expected: both exit 0 under the repository's current thresholds and allowlist policy.

- [ ] **Step 4: Update the verification record with only observed outcomes**

Change the four rows in the verification report to their real PASS/FAIL status and concise stable counts. Keep runtime/deployment as `N/A` and overall state as `IMPLEMENTED / REVIEW_PENDING`.

- [ ] **Step 5: Re-run formatting and state fences after the report update**

Run:

```bash
npx prettier --check scripts/project-governance-policy.mjs scripts/project-governance-policy.node-test.mjs scripts/check-source-modes.mjs scripts/check-project-governance.mjs scripts/ci-workflow-contract.node-test.mjs package.json docs/verification/2026-10-26-source-mode-governance.md docs/verification/README.md docs/high-priority-issues.md
git diff --check
git status --short --branch
```

Expected: formatting and diff checks pass; only PR A files and the approved design/plan files are changed.

### Task 9: Produce one reviewable commit and open PR A

**Files:**
- Commit: all PR A implementation, tests, mode changes, approved design/plan, verification record, and one ledger row
- Generate locally: `.pr-title`, `.pr-body.md`

- [ ] **Step 1: Amend the existing unpublished design commit into one semantic PR commit**

Run:

```bash
git add scripts/project-governance-policy.mjs scripts/project-governance-policy.node-test.mjs scripts/check-source-modes.mjs scripts/check-project-governance.mjs scripts/ci-workflow-contract.node-test.mjs package.json docs/superpowers/specs/2026-10-26-governance-hygiene-v2-design.md docs/superpowers/plans/2026-10-26-source-mode-governance.md docs/verification/2026-10-26-source-mode-governance.md docs/verification/README.md docs/high-priority-issues.md
git add -u
git diff --cached --check
git commit --amend -m "chore(governance): 收紧源码文件模式门禁"
```

Expected: the branch has one commit above `origin/main` and the worktree is clean.

- [ ] **Step 2: Re-prove commit shape and protected-file boundaries**

Run:

```bash
git rev-list --count origin/main..HEAD
git diff --exit-code origin/main...HEAD -- docs/ui-sync-manifest.json
git diff --summary origin/main...HEAD | rg -c 'mode change 100755 => 100644'
git status --porcelain=v1
```

Expected: commit count `1`, manifest zero diff, mode count `68`, porcelain empty.

- [ ] **Step 3: Generate and complete the PR description**

Run:

```bash
npm run pr:body
```

Use title `chore(governance): 收紧源码文件模式门禁`. Fill every generated section with the exact base/head diff, RED/GREEN evidence, 15-path allowlist, 68 blob-equivalent mode changes, N/A runtime impact, and verification report path. Remove every `【占位】` marker.

- [ ] **Step 4: Run final preflight before publishing**

Run:

```bash
npm run pr:preflight
git diff --check origin/main...HEAD
```

Expected: both exit 0.

- [ ] **Step 5: Push and create the PR**

Run:

```bash
git push -u origin chore/governance-hygiene-20261026-v2
gh pr create --base main --head chore/governance-hygiene-20261026-v2 --title "chore(governance): 收紧源码文件模式门禁" --body-file .pr-body.md
```

Expected: one open PR targeting `main`; no deployment claim is made.

- [ ] **Step 6: Hand off a read-only review package to TraeX 审判者**

Send a structured in-thread handoff containing: target reviewer, current conclusion `IMPLEMENTED / REVIEW_PENDING`, base/head SHAs, PR URL, RED log signature, 15 allowlisted entries, 68 mode-only blob proof, full gate results, expected next step, and completion standard. Mention the judge explicitly; do not ask the judge to edit the branch.

- [ ] **Step 7: Stop at review pending**

Do not merge, change Ruleset, prune worktrees, or delete local/remote branches in PR A. Wait for independent review and PR checks.
