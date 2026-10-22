import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ALLOWLIST_URL = new URL('../tools/miniprogram-ci/audit-allowlist.json', import.meta.url);
const TOOL_ROOT = fileURLToPath(new URL('../tools/miniprogram-ci/', import.meta.url));

const MAX_EXCEPTION_DAYS = 120;

function advisoryId(url) {
  const match = String(url || '').match(/GHSA-[0-9a-z-]+$/i);
  return match ? match[0].toUpperCase() : '';
}

export function assessAuditReport(report, allowlist, now = new Date(), remediationReport = null) {
  if (!report || typeof report.vulnerabilities !== 'object') {
    throw new Error('微信上传工具审计结果缺少 vulnerabilities');
  }
  const reviewedAt = new Date(`${allowlist.reviewedAt}T00:00:00+08:00`);
  const expiresAt = new Date(`${allowlist.expiresAt}T23:59:59+08:00`);
  if (!Number.isFinite(reviewedAt.getTime()) || !Number.isFinite(expiresAt.getTime())) {
    throw new Error('微信上传工具风险例外日期无效');
  }
  const exceptionDays = (expiresAt.getTime() - reviewedAt.getTime()) / 86_400_000;
  if (exceptionDays <= 0 || exceptionDays > MAX_EXCEPTION_DAYS) {
    throw new Error(`微信上传工具风险例外最长只能保留 ${MAX_EXCEPTION_DAYS} 天`);
  }
  if (now > expiresAt) {
    throw new Error(`微信上传工具风险例外已过期：${allowlist.expiresAt}`);
  }

  const found = new Set();
  const fixable = new Set();
  for (const vulnerability of Object.values(report.vulnerabilities)) {
    if (
      vulnerability?.fixAvailable &&
      (!remediationReport?.vulnerabilities ||
        !remediationReport.vulnerabilities[vulnerability.name])
    ) {
      fixable.add(vulnerability.name);
    }
    for (const via of vulnerability?.via || []) {
      if (typeof via !== 'object') continue;
      const id = advisoryId(via.url);
      if (id) found.add(id);
    }
  }

  const allowed = new Set(Object.keys(allowlist.advisories || {}).map((id) => id.toUpperCase()));
  const unexpected = [...found].filter((id) => !allowed.has(id));
  const stale = [...allowed].filter((id) => !found.has(id));
  if (fixable.size) {
    throw new Error(`微信上传工具仍有可升级修复的依赖：${[...fixable].sort().join(', ')}`);
  }
  if (unexpected.length) {
    throw new Error(`微信上传工具出现未评估安全告警：${unexpected.sort().join(', ')}`);
  }
  if (stale.length) {
    throw new Error(`微信上传工具风险例外已失效，请删除后重审：${stale.sort().join(', ')}`);
  }

  return {
    advisories: [...found].sort(),
    expiresAt: allowlist.expiresAt,
    vulnerabilities: report.metadata?.vulnerabilities || {},
  };
}

function parseAuditOutput(output, label) {
  if (!output) {
    throw new Error(`微信上传工具${label}没有返回 JSON`);
  }
  const jsonStart = output.indexOf('{');
  if (jsonStart < 0) {
    throw new Error(`微信上传工具${label}返回了无效 JSON`);
  }
  try {
    return JSON.parse(output.slice(jsonStart));
  } catch {
    throw new Error(`微信上传工具${label}返回了无效 JSON`);
  }
}

export function runAudit() {
  const auditEnvironment = { ...process.env };
  delete auditEnvironment.npm_config_local_prefix;
  delete auditEnvironment.npm_package_json;
  const result = spawnSync(
    'npx',
    ['--yes', 'npm@11', 'audit', '--json', '--registry=https://registry.npmjs.org'],
    {
      cwd: TOOL_ROOT,
      env: auditEnvironment,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    },
  );
  const report = parseAuditOutput(result.stdout, '审计');
  let remediationReport = null;
  if (Object.values(report.vulnerabilities).some((item) => item?.fixAvailable)) {
    const remediation = spawnSync(
      'npx',
      [
        '--yes',
        'npm@11',
        'audit',
        'fix',
        '--dry-run',
        '--ignore-scripts',
        '--json',
        '--registry=https://registry.npmjs.org',
      ],
      {
        cwd: TOOL_ROOT,
        env: auditEnvironment,
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024,
      },
    );
    const remediationResult = parseAuditOutput(remediation.stdout, '审计修复预演');
    remediationReport = remediationResult.audit || remediationResult;
  }
  const allowlist = JSON.parse(readFileSync(ALLOWLIST_URL, 'utf8'));
  const assessment = assessAuditReport(report, allowlist, new Date(), remediationReport);
  console.log(
    `微信上传工具安全审计通过：${assessment.advisories.length} 个无上游修复的已评估告警，例外到期 ${assessment.expiresAt}`,
  );
  return assessment;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    runAudit();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
