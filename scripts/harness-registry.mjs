export const HARNESS_SCHEMA_VERSION = 2;

export const HARNESS_TASKS = Object.freeze({
  validate: {
    description: '执行代码质量、契约与构建校验',
    command: ['npm', ['run', 'validate']],
    requiresInstall: true,
    capabilities: ['node'],
  },
  coverage: {
    description: '执行前端与云函数覆盖率门禁',
    command: ['npm', ['run', 'coverage']],
    requiresInstall: true,
    capabilities: ['node'],
  },
  audit: {
    description: '执行根目录、云函数与上传工具安全审计',
    command: ['npm', ['run', 'audit:all']],
    requiresInstall: true,
    capabilities: ['node', 'network'],
  },
  'cloud-install': {
    description: '准备并安装全部云函数依赖',
    command: ['npm', ['run', 'cloud:install']],
    requiresInstall: true,
    capabilities: ['node', 'network'],
  },
  affected: {
    description: '按 Git 影响面执行 PR 校验',
    command: ['npm', ['run', 'test:affected']],
    requiresInstall: true,
    capabilities: ['node', 'git-history'],
    requiredEnv: ['AFFECTED_BASE', 'AFFECTED_HEAD'],
  },
  'devtools-e2e': {
    description: '在微信开发者工具执行真实只读 E2E',
    command: ['npm', ['run', 'test:devtools:e2e']],
    requiresInstall: true,
    capabilities: ['node', 'wechat-devtools'],
    platforms: ['darwin'],
  },
});

export const HARNESS_PROFILES = Object.freeze({
  verify: ['validate', 'coverage'],
  release: ['validate', 'coverage', 'audit'],
});

export function resolveHarnessTasks(selection) {
  const names = HARNESS_PROFILES[selection] ?? [selection];
  for (const name of names) {
    if (!HARNESS_TASKS[name]) {
      throw new Error(`未知 Harness 任务或配置：${selection}`);
    }
  }
  return names;
}
