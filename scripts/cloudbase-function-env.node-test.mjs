import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  MEDIA_SECRET_CONSUMERS,
  PII_SECRET_CONSUMERS,
  createRuntimeConfig,
  extractExistingFunctionNames,
  extractFunctionEnvironment,
  resolveMediaSecret,
  resolvePiiSecret,
  run,
  verifyFunctionDetail,
  verifyMediaSecret,
  verifyPiiSecret,
} from './cloudbase-function-env.mjs';

const SECRET = 'same-profile-media-path-secret-32-bytes';
const PII_SECRET = Buffer.alloc(32, 7).toString('base64');

function environments(overrides = {}) {
  return new Map(
    MEDIA_SECRET_CONSUMERS.map((name) => [
      name,
      {
        EXISTING: `${name}-value`,
        PROFILE_MEDIA_PATH_SECRET: SECRET,
        ...(PII_SECRET_CONSUMERS.includes(name) ? { PII_ENCRYPTION_KEY: PII_SECRET } : {}),
        ...(overrides[name] || {}),
      },
    ]),
  );
}

test('fn list 清单只把确认存在的函数列为 donor，新增函数保持 missing', () => {
  const configured = ['profile', 'new-function'];
  assert.deepEqual(
    extractExistingFunctionNames(
      {
        Response: {
          Data: JSON.stringify({
            Functions: [{ FunctionName: 'profile', Status: 'Active' }],
          }),
        },
      },
      configured,
    ),
    ['profile'],
  );
  assert.throws(
    () => extractExistingFunctionNames({ Response: { RequestId: 'only-metadata' } }, configured),
    /缺少可识别的函数列表/,
  );
});

test('inventory 对无效 fn list JSON fail closed，而不是把异常当函数不存在', () => {
  const directory = mkdtempSync(join(tmpdir(), 'cloudbase-inventory-test-'));
  try {
    const configPath = join(directory, 'cloudbaserc.json');
    const listPath = join(directory, 'functions.json');
    writeFileSync(configPath, JSON.stringify({ functions: [{ name: 'new-function' }] }));
    writeFileSync(listPath, 'not-json');
    assert.throws(
      () =>
        run([
          'inventory',
          '--config',
          configPath,
          '--list',
          listPath,
          '--output',
          join(directory, 'inventory.json'),
        ]),
      /fn list 输出\s+不是有效 JSON/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('解析 CloudBase 常见环境变量结构且不读取无关同名字段', () => {
  assert.deepEqual(
    extractFunctionEnvironment({
      Response: {
        Environment: { Variables: [{ Key: 'A', Value: 'one' }] },
        EnvVariables: { B: 'two' },
        metadata: { PROFILE_MEDIA_PATH_SECRET: 'must-not-be-read' },
      },
    }),
    { A: 'one', B: 'two' },
  );
});

test('可信云函数非空密钥必须唯一，Actions secret 也必须与其一致', () => {
  assert.equal(resolveMediaSecret(environments(), ''), SECRET);
  assert.equal(resolveMediaSecret(environments(), SECRET), SECRET);
  assert.throws(
    () =>
      resolveMediaSecret(
        environments({
          profile: { PROFILE_MEDIA_PATH_SECRET: 'different-secret-value-that-is-long-enough' },
        }),
      ),
    /不一致/,
  );
});

test('PII 密钥只接受严格 base64 编码的 32 字节值且两个消费者必须一致', () => {
  assert.equal(resolvePiiSecret(environments(), PII_SECRET), PII_SECRET);
  for (const invalid of [
    Buffer.alloc(31).toString('base64'),
    Buffer.alloc(33).toString('base64'),
    'not-base64',
    `${PII_SECRET}\n`,
  ]) {
    assert.throws(() => resolvePiiSecret(environments(), invalid), /严格 base64.*32 字节/);
  }
  assert.throws(
    () =>
      resolvePiiSecret(
        environments({ profile: { PII_ENCRYPTION_KEY: Buffer.alloc(32, 8).toString('base64') } }),
      ),
    /不一致/,
  );
});

test('没有 donor 时失败并给出环境管理员配置 Actions secret 的路径', () => {
  const empty = new Map(MEDIA_SECRET_CONSUMERS.map((name) => [name, {}]));
  assert.throws(() => resolveMediaSecret(empty), /cloudbase-production.*GitHub Actions secret/);
  assert.equal(resolveMediaSecret(empty, SECRET), SECRET);
});

test('运行时配置只改部署函数并为所有已选消费者注入密钥和保留配置', () => {
  const config = {
    envId: 'env-test',
    custom: true,
    functions: MEDIA_SECRET_CONSUMERS.map((name) => ({
      name,
      timeout: 10,
      envVariables: { FROM_REPOSITORY: name },
    })).concat({ name: 'auth', timeout: 5 }),
  };
  const runtime = createRuntimeConfig(
    config,
    environments(),
    [...MEDIA_SECRET_CONSUMERS],
    SECRET,
    PII_SECRET,
  );
  assert.equal(runtime.custom, true);
  for (const name of MEDIA_SECRET_CONSUMERS) {
    const fn = runtime.functions.find((item) => item.name === name);
    assert.equal(fn.timeout, 10);
    assert.equal(fn.envVariables.EXISTING, `${name}-value`);
    assert.equal(fn.envVariables.FROM_REPOSITORY, name);
    assert.equal(fn.envVariables.PROFILE_MEDIA_PATH_SECRET, SECRET);
    assert.equal(
      fn.envVariables.PII_ENCRYPTION_KEY,
      PII_SECRET_CONSUMERS.includes(name) ? PII_SECRET : undefined,
    );
  }
  assert.deepEqual(
    runtime.functions.find(({ name }) => name === 'auth'),
    { name: 'auth', timeout: 5 },
  );
});

test('逐函数验证要求唯一 Active 详情，媒体消费者还必须携带同值 secret', () => {
  const detail = {
    Response: {
      Data: JSON.stringify({
        FunctionName: 'profile',
        Status: 'Active',
        Environment: {
          Variables: [
            { Key: 'PROFILE_MEDIA_PATH_SECRET', Value: SECRET },
            { Key: 'PII_ENCRYPTION_KEY', Value: PII_SECRET },
          ],
        },
      }),
    },
  };
  assert.deepEqual(verifyFunctionDetail(detail, 'profile', SECRET, PII_SECRET), {
    name: 'profile',
    status: 'Active',
  });
  assert.throws(
    () => verifyFunctionDetail({ FunctionName: 'profile', Status: 'Updating' }, 'profile', SECRET),
    /Active/,
  );
  assert.throws(
    () =>
      verifyFunctionDetail(
        {
          FunctionName: 'profile',
          Status: 'Active',
          EnvVariables: { PROFILE_MEDIA_PATH_SECRET: 'different-secret-value-that-is-long-enough' },
        },
        'profile',
        SECRET,
      ),
    /缺失或不一致/,
  );
  assert.deepEqual(verifyFunctionDetail({ FunctionName: 'auth', Status: 'ACTIVE' }, 'auth'), {
    name: 'auth',
    status: 'ACTIVE',
  });
});

test('部署后任一消费者缺失或不一致均失败', () => {
  verifyMediaSecret(environments(), SECRET);
  assert.throws(
    () =>
      verifyMediaSecret(
        environments({ 'activity-admin': { PROFILE_MEDIA_PATH_SECRET: '' } }),
        SECRET,
      ),
    /activity-admin.*缺失或不一致/,
  );
});

test('部署后两个 PII 消费者缺失或不一致均失败', () => {
  verifyPiiSecret(environments(), PII_SECRET);
  assert.throws(
    () => verifyPiiSecret(environments({ 'admin-review': { PII_ENCRYPTION_KEY: '' } }), PII_SECRET),
    /admin-review.*缺失或不一致/,
  );
});

test('prepare 立即输出 add-mask，写 runner 临时配置但不生成随机密钥', () => {
  const directory = mkdtempSync(join(tmpdir(), 'cloudbase-env-test-'));
  const details = join(directory, 'details');
  const configPath = join(directory, 'cloudbaserc.json');
  const decisionPath = join(directory, 'decision.json');
  const inventoryPath = join(directory, 'inventory.json');
  const outputPath = join(directory, 'cloudbaserc.runtime.json');
  const githubEnv = join(directory, 'github-env');
  try {
    mkdirSync(details);
    writeFileSync(
      configPath,
      JSON.stringify({ functions: MEDIA_SECRET_CONSUMERS.map((name) => ({ name })) }),
    );
    writeFileSync(decisionPath, JSON.stringify({ functions: MEDIA_SECRET_CONSUMERS }));
    writeFileSync(inventoryPath, JSON.stringify({ existing: MEDIA_SECRET_CONSUMERS, missing: [] }));
    for (const name of MEDIA_SECRET_CONSUMERS) {
      writeFileSync(
        join(details, `${name}.json`),
        JSON.stringify({
          Environment: {
            Variables: [
              { Key: 'PROFILE_MEDIA_PATH_SECRET', Value: SECRET },
              ...(PII_SECRET_CONSUMERS.includes(name)
                ? [{ Key: 'PII_ENCRYPTION_KEY', Value: PII_SECRET }]
                : []),
            ],
          },
        }),
      );
    }
    let output = '';
    const originalWrite = process.stdout.write;
    process.stdout.write = (value) => {
      output += value;
      return true;
    };
    try {
      run(
        [
          'prepare',
          '--config',
          configPath,
          '--decision',
          decisionPath,
          '--inventory',
          inventoryPath,
          '--details-dir',
          details,
          '--output',
          outputPath,
        ],
        { GITHUB_ENV: githubEnv },
      );
    } finally {
      process.stdout.write = originalWrite;
    }
    assert.ok(output.startsWith(`::${'add'}-mask::${SECRET}\n::${'add'}-mask::${PII_SECRET}\n`));
    assert.equal(
      readFileSync(githubEnv, 'utf8'),
      `PROFILE_MEDIA_PATH_SECRET=${SECRET}\nPII_ENCRYPTION_KEY=${PII_SECRET}\n`,
    );
    const runtime = JSON.parse(readFileSync(outputPath, 'utf8'));
    assert.ok(
      runtime.functions.every(
        ({ envVariables }) => envVariables.PROFILE_MEDIA_PATH_SECRET === SECRET,
      ),
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('prepare 将 inventory 明确标记的新增函数视为空 env，不要求 detail 文件', () => {
  const directory = mkdtempSync(join(tmpdir(), 'cloudbase-new-function-test-'));
  const details = join(directory, 'details');
  const githubEnv = join(directory, 'github-env');
  try {
    mkdirSync(details);
    const configPath = join(directory, 'cloudbaserc.json');
    const decisionPath = join(directory, 'decision.json');
    const inventoryPath = join(directory, 'inventory.json');
    const outputPath = join(directory, 'runtime.json');
    writeFileSync(
      configPath,
      JSON.stringify({ functions: [{ name: 'profile' }, { name: 'new-function' }] }),
    );
    writeFileSync(decisionPath, JSON.stringify({ functions: ['new-function'] }));
    writeFileSync(
      inventoryPath,
      JSON.stringify({ existing: ['profile'], missing: ['new-function'] }),
    );
    writeFileSync(
      join(details, 'profile.json'),
      JSON.stringify({
        FunctionName: 'profile',
        Status: 'Active',
        Environment: {
          Variables: [
            { Key: 'PROFILE_MEDIA_PATH_SECRET', Value: SECRET },
            { Key: 'PII_ENCRYPTION_KEY', Value: PII_SECRET },
          ],
        },
      }),
    );
    const originalWrite = process.stdout.write;
    process.stdout.write = () => true;
    try {
      run(
        [
          'prepare',
          '--config',
          configPath,
          '--decision',
          decisionPath,
          '--inventory',
          inventoryPath,
          '--details-dir',
          details,
          '--output',
          outputPath,
        ],
        { GITHUB_ENV: githubEnv },
      );
    } finally {
      process.stdout.write = originalWrite;
    }
    assert.deepEqual(
      JSON.parse(readFileSync(outputPath, 'utf8')).functions.find(
        ({ name }) => name === 'new-function',
      ),
      { name: 'new-function', envVariables: {} },
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('实现先掩码再写临时配置，且不存在随机密钥生成路径', () => {
  const source = readFileSync('scripts/cloudbase-function-env.mjs', 'utf8');
  assert.ok(
    source.indexOf("${'add'}-mask") < source.indexOf('writeFileSync(resolve(options.output)'),
  );
  assert.doesNotMatch(source, /randomBytes|randomUUID|openssl|Math\.random/);
});

test('workflow 在 baseline 和 deploy 前解析，部署使用临时替换配置，always 清理后再 smoke 结束', () => {
  const workflow = readFileSync('.github/workflows/deploy-cloudbase.yml', 'utf8');
  const prepare = workflow.indexOf('name: Resolve, mask, and prepare runtime function config');
  const baseline = workflow.indexOf('name: Plan and apply database baseline');
  const deploy = workflow.indexOf('name: Deploy affected cloud functions');
  const reconcile = workflow.indexOf('name: Reconcile critical function secrets');
  const verify = workflow.indexOf('name: Verify deployed environment and media secret consistency');
  const purge = workflow.indexOf('name: Purge explicitly confirmed prelaunch media data');
  const smoke = workflow.indexOf('name: Run production club application write smoke');
  const cleanup = workflow.indexOf(
    'name: Restore repository config and clear runtime secret files',
  );
  assert.ok(
    prepare < baseline &&
      baseline < deploy &&
      deploy < reconcile &&
      reconcile < verify &&
      verify < purge &&
      purge < smoke &&
      smoke < cleanup,
  );
  assert.match(workflow, /secrets\.PROFILE_MEDIA_PATH_SECRET/);
  assert.match(workflow, /secrets\.PII_ENCRYPTION_KEY/);
  assert.match(workflow, /purge_prelaunch_media_data:[\s\S]*type: boolean/);
  assert.match(
    workflow,
    /github\.event_name == 'workflow_dispatch'[\s\S]*DELETE_PRELAUNCH_MEDIA_DATA/,
  );
  assert.match(workflow, /cloudbase-prelaunch-media-purge\.mjs[\s\S]*--apply/);
  assert.match(workflow, /cp "\$\{runtime_config\}" cloudbaserc\.json/);
  assert.match(workflow, /fn list --json > "\$\{functions_list\}"/);
  assert.match(workflow, /cloudbase-function-env\.mjs inventory/);
  assert.match(workflow, /jq -r '\.existing\[\]'/);
  assert.match(workflow, /fn deploy "\$\{function_name\}" --force --json/);
  assert.ok(
    workflow.indexOf('fn deploy "${function_name}" --force --json') <
      workflow.indexOf('cloudbase-function-env.mjs verify-one'),
  );
  assert.match(workflow, /状态不是可服务终态 Active|verify-one/);
  assert.match(workflow, /云函数部署未全部完成；已完成并验证/);
  assert.match(workflow, /尚未完成（含当前失败项）/);
  assert.match(workflow, /--include-secret-consumers true/);
  assert.match(workflow, /cloudbase-function-env\.mjs verify/);
  const reconciliation = workflow.slice(reconcile, verify);
  for (const functionName of [
    'profile',
    'profile-media-cleanup',
    'admin-review',
    'activity-read',
    'activity-admin',
    'club-application',
  ]) {
    assert.match(reconciliation, new RegExp(`\\b${functionName}\\b`));
  }
  assert.match(reconciliation, /fn detail "\$\{function_name\}"/);
  assert.match(reconciliation, /cloudbase-function-env\.mjs verify-one/);
  assert.match(reconciliation, /fn deploy "\$\{function_name\}" --force --json/);
  assert.match(reconciliation, /for attempt in \$\(seq 1 12\)/);
  assert.doesNotMatch(reconciliation, /PROFILE_MEDIA_PATH_SECRET_SOURCE|PII_ENCRYPTION_KEY_SOURCE/);
  assert.match(workflow, /if: always\(\).*should_deploy == 'true'/);
  assert.match(workflow, /cp "\$\{RUNNER_TEMP\}\/cloudbaserc\.repository\.json" cloudbaserc\.json/);
  assert.match(workflow, /rm -rf[\s\S]*cloudbase-function-details-before/);
  assert.doesNotMatch(workflow, /randomBytes|openssl\s+rand|uuid/i);
});
