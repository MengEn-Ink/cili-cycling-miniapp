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
