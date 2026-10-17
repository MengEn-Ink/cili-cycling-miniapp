import assert from 'node:assert/strict';
import test from 'node:test';

import { assessAuditReport } from './audit-miniprogram-ci.mjs';

const allowlist = {
  expiresAt: '2027-01-15',
  advisories: {
    'GHSA-AAAA-BBBB-CCCC': '受控输入且上游无修复',
  },
};

const report = (overrides = {}) => ({
  vulnerabilities: {
    dependency: {
      name: 'dependency',
      severity: 'high',
      fixAvailable: false,
      via: [{ url: 'https://github.com/advisories/GHSA-aaaa-bbbb-cccc' }],
      ...overrides,
    },
  },
  metadata: { vulnerabilities: { high: 1 } },
});

test('仅允许未过期且无上游修复的精确告警集合', () => {
  const result = assessAuditReport(report(), allowlist, new Date('2026-10-17T00:00:00Z'));
  assert.deepEqual(result.advisories, ['GHSA-AAAA-BBBB-CCCC']);
});

test('新增告警、可修复依赖和过期例外都会阻断', () => {
  assert.throws(
    () =>
      assessAuditReport(
        report({ via: [{ url: 'https://github.com/advisories/GHSA-dddd-eeee-ffff' }] }),
        allowlist,
        new Date('2026-10-17T00:00:00Z'),
      ),
    /未评估安全告警/,
  );
  assert.throws(
    () =>
      assessAuditReport(
        report({ fixAvailable: true }),
        allowlist,
        new Date('2026-10-17T00:00:00Z'),
      ),
    /可升级修复/,
  );
  assert.throws(
    () => assessAuditReport(report(), allowlist, new Date('2027-01-16T00:00:00+08:00')),
    /风险例外已过期/,
  );
});

test('上游修复后旧例外必须删除，避免永久豁免', () => {
  assert.throws(
    () =>
      assessAuditReport(
        { vulnerabilities: {}, metadata: { vulnerabilities: {} } },
        allowlist,
        new Date('2026-10-17T00:00:00Z'),
      ),
    /风险例外已失效/,
  );
});
