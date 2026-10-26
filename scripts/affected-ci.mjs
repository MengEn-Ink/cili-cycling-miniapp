import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const CLOUD_FUNCTIONS = [
  'shared',
  'auth',
  'activity-read',
  'activity-admin',
  'registration',
  'admin-review',
  'club-application',
  'notification-send',
  'profile',
  'profile-media-cleanup',
  'route-maintenance',
];

const FULL_RISK_PATTERNS = [
  /^package(?:-lock)?\.json$/,
  /^tsconfig(?:\..+)?\.json$/,
  /^vitest\.config\./,
  /^eslint\.config\./,
  /^project\.config\.json$/,
  /^cloudfunctions\/shared\//,
  /^scripts\/prepare-cloudfunctions\.mjs$/,
  /^scripts\/affected-ci\.mjs$/,
  /^tools\/miniprogram-ci\/package(?:-lock)?\.json$/,
  /^\.github\/workflows\//,
];

const DOCS_PATTERN = /^(?:docs\/|README\.md$|CONTRIBUTING\.md$|DESIGN\.md$)/;
const VITEST_FILE_PATTERN = /^tests\/.*\.test\.[cm]?[jt]s$/;
const NODE_TEST_PATTERN = /\.node-test\.[cm]?js$/;

function lines(value) {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function unique(values) {
  return [...new Set(values)].sort();
}

export function createAffectedPlan(changedFiles) {
  const files = unique(changedFiles);
  if (files.length === 0) {
    return { mode: 'full', reason: '无法确认变更文件，按 fail-safe 执行全量门禁', files };
  }

  const rootPackageFiles = files.filter((file) => /^package(?:-lock)?\.json$/.test(file));
  const fullRiskFiles = files.filter((file) =>
    FULL_RISK_PATTERNS.some((pattern) => pattern.test(file)),
  );
  if (fullRiskFiles.length > 0) {
    return {
      mode: 'full',
      reason: '命中全局配置、根依赖、共享依赖或工作流',
      files,
      rootPackageFiles,
      fullRiskFiles,
    };
  }

  if (files.every((file) => DOCS_PATTERN.test(file))) {
    return {
      mode: 'docs',
      reason: '仅影响文档与 Pages',
      files,
      design: files.some((file) => /(?:DESIGN\.md|design|ui-)/i.test(file)),
      prototype: files.some((file) =>
        /docs\/(?:delivery-center|index|app|schema|templates|styles)\./.test(file),
      ),
    };
  }

  const unknownFiles = files.filter(
    (file) =>
      !file.startsWith('miniprogram/') &&
      !file.startsWith('cloudfunctions/') &&
      !file.startsWith('scripts/') &&
      !file.startsWith('tests/') &&
      !DOCS_PATTERN.test(file),
  );
  if (unknownFiles.length > 0) {
    return {
      mode: 'full',
      reason: '存在未纳入影响图的文件，按 fail-safe 执行全量门禁',
      files,
      fullRiskFiles: unknownFiles,
    };
  }

  const unknownCloudFunctions = unique(
    files
      .map((file) => /^cloudfunctions\/([^/]+)\//.exec(file)?.[1])
      .filter((name) => name && !CLOUD_FUNCTIONS.includes(name)),
  );
  if (unknownCloudFunctions.length > 0) {
    return {
      mode: 'full',
      reason: '存在未纳入影响图的云函数，按 fail-safe 执行全量门禁',
      files,
      fullRiskFiles: unknownCloudFunctions.map((name) => `cloudfunctions/${name}`),
    };
  }

  const cloudFunctions = unique(
    files
      .map((file) => /^cloudfunctions\/([^/]+)\//.exec(file)?.[1])
      .filter((name) => name && CLOUD_FUNCTIONS.includes(name)),
  );
  const vitestFiles = unique(files.filter((file) => VITEST_FILE_PATTERN.test(file)));
  const relatedSources = unique(
    files.filter(
      (file) => file.startsWith('miniprogram/') && /\.(?:ts|js|wxml|wxss|json)$/.test(file),
    ),
  );
  const scriptTests = unique([
    ...files.filter(
      (file) =>
        (file.startsWith('scripts/') || file.startsWith('tests/')) && NODE_TEST_PATTERN.test(file),
    ),
    ...files
      .filter((file) => /^scripts\/.*\.[cm]?js$/.test(file) && !NODE_TEST_PATTERN.test(file))
      .map((file) => file.replace(/\.[cm]?js$/, '.node-test.mjs'))
      .filter((file) => existsSync(file)),
  ]);

  const design = files.some((file) => /(?:design|ui-sync)/i.test(file));
  const deployment = files.some((file) => /(?:deploy|upload|release|experience)/i.test(file));
  const bootstrap = files.some((file) => /(?:cloudbase|storage|bootstrap)/i.test(file));
  const hasMappedVerification =
    cloudFunctions.length > 0 ||
    vitestFiles.length > 0 ||
    relatedSources.length > 0 ||
    scriptTests.length > 0 ||
    design ||
    deployment ||
    bootstrap;
  if (!hasMappedVerification) {
    return {
      mode: 'full',
      reason: '无法将变更映射到具体测试，按 fail-safe 执行全量门禁',
      files,
      fullRiskFiles: files,
    };
  }

  return {
    mode: 'targeted',
    reason: '已识别到可验证的局部影响范围',
    files,
    cloudFunctions,
    vitestFiles,
    relatedSources,
    scriptTests,
    design,
    deployment,
    bootstrap,
  };
}

export function changedFilesBetween(base, head) {
  const range = base && head ? `${base}...${head}` : '';
  if (!range) return [];
  return lines(execFileSync('git', ['diff', '--name-only', range], { encoding: 'utf8' }));
}

function run(command, args = []) {
  console.log(`\n$ ${command} ${args.join(' ')}`);
  execFileSync(command, args, { stdio: 'inherit', env: process.env });
}

function runNpm(script, extra = []) {
  run('npm', ['run', script, ...(extra.length ? ['--', ...extra] : [])]);
}

function runNodeTests(files) {
  if (files.length > 0) run('node', ['--test', ...files]);
}

function runRelatedVitest(sources, explicitTests) {
  if (explicitTests.length > 0) run('npx', ['vitest', 'run', ...explicitTests]);
  if (sources.length === 0) return;
  const result = spawnSync('npx', ['vitest', 'related', '--run', ...sources], {
    stdio: 'inherit',
    env: process.env,
  });
  if (result.status === 0) return;
  if (result.status === 1) {
    console.warn('未找到稳定的关联测试或关联测试失败，按 fail-safe 回退全部 Vitest。');
    runNpm('test');
    return;
  }
  throw new Error(`Vitest related 异常退出：${result.status ?? 'unknown'}`);
}

export function runAffectedPlan(plan) {
  console.log(`影响面模式：${plan.mode}（${plan.reason}）`);
  console.log(`变更文件：${plan.files.length}`);

  if (plan.mode === 'full') {
    runNpm('cloud:install');
    runNpm('validate');
    runNpm('coverage');
    runNpm('audit:all');
    return;
  }

  runNpm('format:check');
  runNpm('lint');
  runNpm('typecheck');

  if (plan.deployment) {
    // 上传脚本契约等 node 测试会直接加载 tools/miniprogram-ci，依赖安装必须
    // 先于任何 node 测试，否则 targeted 模式下这些测试必然因缺依赖失败。
    runNpm('tool:install');
  }

  if (plan.mode === 'docs') {
    run('npx', ['vitest', 'run', 'tests/showcase-pages-contract.test.ts']);
    if (plan.prototype) runNpm('test:ui-sync');
    runNpm('check:ui-sync');
    runNpm('check:governance');
    runNpm('build');
    return;
  }

  runRelatedVitest(plan.relatedSources, plan.vitestFiles);
  runNodeTests(plan.scriptTests);
  if (plan.design) {
    runNpm('test:ui-sync');
    runNpm('check:ui-sync');
  }
  if (plan.deployment) {
    // 部署测试会直接调用 tools/miniprogram-ci；工具依赖已在上方前置安装。
    runNpm('test:deploy');
  }
  if (plan.bootstrap) runNpm('test:bootstrap');

  if (plan.cloudFunctions.length > 0) {
    // prepare 必须先完成；shared 安装完成后，再按有上限并发安装实际受影响函数。
    runNpm('cloud:prepare');
    run('node', [
      'scripts/run-cloud-packages.mjs',
      'install',
      `--packages=${plan.cloudFunctions.join(',')}`,
    ]);
    for (const name of plan.cloudFunctions) {
      run('npm', ['--prefix', `cloudfunctions/${name}`, 'test']);
    }
    runNpm('verify:cloud-packages');
  }

  runNpm('check:release-notes');
  runNpm('check:main-package');
  runNpm('check:governance');
  runNpm('build');
}

function parseArgs(argv) {
  const command = argv[2] ?? 'plan';
  const options = {};
  for (let index = 3; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    options[token.slice(2)] = argv[index + 1];
    index += 1;
  }
  return { command, options };
}

export function main(argv = process.argv) {
  const { command, options } = parseArgs(argv);
  const base = options.base || process.env.AFFECTED_BASE || '';
  const head = options.head || process.env.AFFECTED_HEAD || 'HEAD';
  const files = options.files
    ? options.files.split(',').filter(Boolean)
    : changedFilesBetween(base, head);
  const plan = createAffectedPlan(files);

  if (options.output) writeFileSync(options.output, `${JSON.stringify(plan, null, 2)}\n`);
  console.log(JSON.stringify(plan, null, 2));
  if (command === 'run') runAffectedPlan(plan);
  if (!['plan', 'run'].includes(command)) throw new Error(`未知命令：${command}`);
  return plan;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
