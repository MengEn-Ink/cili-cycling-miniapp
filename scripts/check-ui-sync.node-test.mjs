import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  assessUiSyncState,
  shouldSkipUiSync,
  validateValuePreservationProvenance,
} from './check-ui-sync.mjs';
import { digestFiles } from './ui-sync-policy.mjs';

function png() {
  const buffer = Buffer.alloc(24);
  Buffer.from('89504e470d0a1a0a', 'hex').copy(buffer);
  buffer.writeUInt32BE(390, 16);
  buffer.writeUInt32BE(790, 20);
  return buffer;
}

function manifest() {
  return {
    schemaVersion: 1,
    syncedThrough: 'a'.repeat(40),
    syncedAt: '2026-10-13T00:00:00.000Z',
    policy: { maxUnsyncedUiCommits: 4, maxAgeDays: 7 },
    source: { digest: `sha256:${'b'.repeat(64)}` },
    prototype: { digest: `sha256:${'c'.repeat(64)}` },
    routes: [{ id: 'activities', pagePath: 'pages/activities/index' }],
    evidence: {
      directory: 'docs/evidence/ui-sync/baseline',
      routes: [
        {
          id: 'activities',
          devtools: 'activities-devtools.png',
          pages: 'activities-pages.png',
        },
      ],
    },
  };
}

const baseState = {
  appPages: ['pages/activities/index'],
  baselineUiDigest: `sha256:${'b'.repeat(64)}`,
  currentPrototypeDigest: `sha256:${'c'.repeat(64)}`,
  readEvidence: () => png(),
  now: new Date('2026-10-14T00:00:00.000Z'),
};

test('零漂移清单在普通和发布严格模式均通过', () => {
  assert.deepEqual(
    assessUiSyncState({
      ...baseState,
      manifest: manifest(),
      uiCommitShas: [],
      changedFiles: [],
      strict: true,
    }),
    {
      ok: true,
      uiCommits: 0,
      ageDays: 1,
      remaining: 4,
      immediateFiles: [],
      reason: '当前没有未同步 UI 提交',
    },
  );
});

test('普通模式允许四个页面 UI 提交并报告剩余额度', () => {
  assert.deepEqual(
    assessUiSyncState({
      ...baseState,
      manifest: manifest(),
      uiCommitShas: ['1', '2', '3', '4'],
      changedFiles: ['miniprogram/pages/profile/index.wxml'],
    }),
    {
      ok: true,
      uiCommits: 4,
      ageDays: 1,
      remaining: 0,
      immediateFiles: [],
      reason: 'UI 漂移仍在预算内',
    },
  );
});

test('摘要不匹配在漂移预算计算前失败', () => {
  assert.throws(
    () =>
      assessUiSyncState({
        ...baseState,
        manifest: manifest(),
        baselineUiDigest: `sha256:${'d'.repeat(64)}`,
        currentPrototypeDigest: `sha256:${'e'.repeat(64)}`,
        uiCommitShas: [],
        changedFiles: [],
      }),
    /UI 基线摘要不匹配/,
  );
  assert.throws(
    () =>
      assessUiSyncState({
        ...baseState,
        manifest: manifest(),
        currentPrototypeDigest: `sha256:${'e'.repeat(64)}`,
        uiCommitShas: [],
        changedFiles: [],
      }),
    /Pages 原型摘要不匹配/,
  );
});

test('即时文件变化和发布严格模式阻断未同步 UI', () => {
  const immediate = assessUiSyncState({
    ...baseState,
    manifest: manifest(),
    uiCommitShas: ['1'],
    changedFiles: ['miniprogram/app.wxss'],
  });
  assert.equal(immediate.ok, false);
  assert.deepEqual(immediate.immediateFiles, ['miniprogram/app.wxss']);

  const strict = assessUiSyncState({
    ...baseState,
    manifest: manifest(),
    uiCommitShas: ['1'],
    changedFiles: ['miniprogram/pages/profile/index.wxml'],
    strict: true,
  });
  assert.equal(strict.ok, false);
  assert.match(strict.reason, /零漂移/);
});

test('普通 CI 和体验版晋级分别执行预算与零漂移门禁', () => {
  const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
  const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
  const promotion = readFileSync('.github/workflows/promote-miniprogram-experience.yml', 'utf8');

  assert.equal(
    packageJson.scripts['test:ui-sync'],
    'node --test scripts/ui-sync-policy.node-test.mjs scripts/check-ui-sync.node-test.mjs',
  );
  assert.equal(packageJson.scripts['check:ui-sync'], 'node scripts/check-ui-sync.mjs');
  assert.match(packageJson.scripts.validate, /npm run test:ui-sync/);
  assert.match(packageJson.scripts.validate, /npm run check:ui-sync/);
  assert.match(ci, /npm run harness -- run validate/);
  assert.match(ci, /types: \[opened, synchronize, reopened, ready_for_review, edited, labeled\]/);
  assert.match(promotion, /npm run check:ui-sync -- --strict/);
});

test('受控标签只跳过普通模式，严格发布模式仍执行视觉同步门禁', () => {
  const env = { CILI_SKIP_UI_SYNC: '1' };
  const labeledEvent = {
    pull_request: { labels: [{ name: 'sandbox-skip-ui-sync' }] },
  };
  assert.equal(shouldSkipUiSync({ strict: false, env }), true);
  assert.equal(shouldSkipUiSync({ strict: true, env }), false);
  assert.equal(shouldSkipUiSync({ strict: false, env: {}, event: labeledEvent }), true);
  assert.equal(shouldSkipUiSync({ strict: true, env: {}, event: labeledEvent }), false);
  assert.equal(
    shouldSkipUiSync({
      strict: false,
      env: { GITHUB_EVENT_NAME: 'push', GITHUB_REF: 'refs/heads/main' },
    }),
    true,
  );
  assert.equal(
    shouldSkipUiSync({
      strict: true,
      env: { GITHUB_EVENT_NAME: 'push', GITHUB_REF: 'refs/heads/main' },
    }),
    false,
  );
  assert.equal(
    shouldSkipUiSync({ strict: false, env: {}, event: { pull_request: { labels: [] } } }),
    false,
  );
});

test('v2 按截图对应的内容摘要校验，提交重写不失效，内容变更必失败', () => {
  const current = manifest();
  current.schemaVersion = 2;
  current.evidence.viewport = { width: 390, height: 790 };
  Object.assign(current.evidence.routes[0], {
    state: 'loaded',
    data: 'sanitized-runtime',
    review: 'differences',
    note: '数据样本不同',
  });
  const state = {
    ...baseState,
    manifest: current,
    currentUiDigest: current.source.digest,
    baselineUiDigest: `sha256:${'f'.repeat(64)}`,
    uiCommitShas: ['rewritten'],
    changedFiles: ['miniprogram/app.wxss'],
    strict: true,
  };
  assert.equal(assessUiSyncState(state).ok, true);
  assert.throws(
    () => assessUiSyncState({ ...state, currentUiDigest: `sha256:${'e'.repeat(64)}` }),
    /截图.*摘要/,
  );
  assert.throws(() => assessUiSyncState({ ...state, currentUiDigest: undefined }), /截图.*摘要/);
});

function preservationFixture() {
  const current = manifest();
  current.schemaVersion = 2;
  current.evidence.viewport = { width: 390, height: 790 };
  Object.assign(current.evidence.routes[0], {
    state: 'loaded',
    data: 'sanitized-runtime',
    review: 'differences',
    note: '数据样本不同',
  });
  const base = 'c0bd3b56ebe8ea44e8d5b3c7203d765e52b8b826';
  const fromDigest = `sha256:${'b'.repeat(64)}`;
  const toDigest = `sha256:${'d'.repeat(64)}`;
  const routes = Array.from({ length: 16 }, (_, index) => `route-${index + 1}`);
  const widths = [340, 375, 430];
  const results = routes.flatMap((route) =>
    widths.map((width) => ({
      file: `${route}-${width}.png`,
      route,
      width,
      pixelWidth: width * 2,
      pixelHeight: 1560,
      beforePngSha256: 'a'.repeat(64),
      afterPngSha256: 'a'.repeat(64),
      dimensionMismatch: false,
      diffPixels: 0,
      maxChannelDelta: 0,
      meanAbsoluteChannelDelta: 0,
    })),
  );
  const totalPixels = results.reduce(
    (sum, result) => sum + result.pixelWidth * result.pixelHeight,
    0,
  );
  const pixelReportData = {
    schemaVersion: 1,
    kind: 'theme-token-migration-pixel-comparison',
    base: { gitSha: base, uiDigest: fromDigest, porcelain: '' },
    head: { gitSha: 'a'.repeat(40), uiDigest: toDigest, porcelain: '' },
    matrix: { routes, widths, files: 48 },
    summary: {
      exactPixelMatches: 48,
      dimensionMismatches: 0,
      totalPixels,
      differentPixels: 0,
      maxChannelDelta: 0,
      meanAbsoluteChannelDelta: 0,
      containerByteDifferences: 0,
      containerByteDifferenceReason: 'none; fresh captures are byte-identical',
    },
    results,
  };
  const pixelReport = Buffer.from(`${JSON.stringify(pixelReportData)}\n`);
  const pixelEvidence = {
    ref: 'docs/verification/2026-10-27-ui-revamp-pr-b-pixels.json',
    sha256: `sha256:${createHash('sha256').update(pixelReport).digest('hex')}`,
  };
  current.source.digest = fromDigest;
  current.source.valuePreservation = [
    {
      kind: 'theme-token-migration',
      base,
      fromDigest,
      toDigest,
      map: 'docs/designs/2026-10-27-ui-revamp-v1/pr-b-literal-token-map.md',
      pixelEvidence,
      sunset: 'PR C Task 0 replaces the digest and removes this provenance',
    },
  ];
  const themeMigration = {
    eligible: true,
    base,
    mappingPath: current.source.valuePreservation[0].map,
    migratedColorCount: 53,
    directCount: 49,
    fallbackCount: 4,
    fontCount: 1,
  };
  const readEvidence = (path) => (path === pixelEvidence.ref ? pixelReport : png());
  return {
    current,
    base,
    fromDigest,
    toDigest,
    pixelReportData,
    pixelReport,
    pixelEvidence,
    themeMigration,
    readEvidence,
  };
}

test('v2 单条主题保值谱系在 base diff 与像素证据均自证时通过 strict', () => {
  const fixture = preservationFixture();
  const state = {
    ...baseState,
    manifest: fixture.current,
    baselineUiDigest: fixture.fromDigest,
    preservationBaseDigest: fixture.fromDigest,
    currentUiDigest: fixture.toDigest,
    currentPrototypeDigest: fixture.current.prototype.digest,
    themeMigration: fixture.themeMigration,
    readEvidence: fixture.readEvidence,
    uiCommitShas: ['theme-migration'],
    changedFiles: ['miniprogram/app.wxss'],
    strict: true,
  };
  assert.equal(validateValuePreservationProvenance(state).eligible, true);
  const result = assessUiSyncState(state);
  assert.equal(result.ok, true);
  assert.equal(result.valuePreservation.kind, 'theme-token-migration');
});

test('v2 保值谱系拒绝 digest、map、像素证据与分类器篡改', () => {
  const fixture = preservationFixture();
  const baseStateWithPreservation = {
    manifest: fixture.current,
    currentUiDigest: fixture.toDigest,
    currentPrototypeDigest: fixture.current.prototype.digest,
    preservationBaseDigest: fixture.fromDigest,
    themeMigration: fixture.themeMigration,
    readEvidence: fixture.readEvidence,
  };
  const mutations = [
    (state) => {
      state.manifest.source.valuePreservation[0].fromDigest = `sha256:${'e'.repeat(64)}`;
    },
    (state) => {
      state.manifest.source.valuePreservation[0].toDigest = `sha256:${'e'.repeat(64)}`;
    },
    (state) => {
      state.manifest.source.valuePreservation[0].map = 'docs/designs/tampered.md';
    },
    (state) => {
      state.manifest.source.valuePreservation[0].pixelEvidence.sha256 = `sha256:${'e'.repeat(64)}`;
    },
    (state) => {
      state.themeMigration.eligible = false;
    },
    (state) => {
      state.themeMigration.migratedColorCount = 52;
    },
  ];
  for (const mutate of mutations) {
    const state = {
      ...baseStateWithPreservation,
      manifest: structuredClone(baseStateWithPreservation.manifest),
      themeMigration: structuredClone(baseStateWithPreservation.themeMigration),
      readEvidence: fixture.readEvidence,
    };
    mutate(state);
    assert.throws(() => validateValuePreservationProvenance(state), /保值谱系/);
  }
});

test('v2 保值谱系即使更新 hash 也拒绝声明存在像素差异的报告', () => {
  const fixture = preservationFixture();
  const report = structuredClone(fixture.pixelReportData);
  report.summary.exactPixelMatches = 47;
  report.summary.differentPixels = 1;
  report.summary.maxChannelDelta = 1;
  report.results[0].diffPixels = 1;
  report.results[0].maxChannelDelta = 1;
  const pixelReport = Buffer.from(`${JSON.stringify(report)}\n`);
  const current = structuredClone(fixture.current);
  current.source.valuePreservation[0].pixelEvidence.sha256 = `sha256:${createHash('sha256').update(pixelReport).digest('hex')}`;

  assert.throws(
    () =>
      validateValuePreservationProvenance({
        manifest: current,
        currentUiDigest: fixture.toDigest,
        preservationBaseDigest: fixture.fromDigest,
        themeMigration: fixture.themeMigration,
        readEvidence: (path) => (path === fixture.pixelEvidence.ref ? pixelReport : png()),
      }),
    /像素证据.*零差异/,
  );
});

test('v2 保值谱系单次自动失效且 prototype 漂移仍 fail-closed', () => {
  const fixture = preservationFixture();
  const valid = {
    ...baseState,
    manifest: fixture.current,
    currentUiDigest: fixture.toDigest,
    currentPrototypeDigest: fixture.current.prototype.digest,
    preservationBaseDigest: fixture.fromDigest,
    themeMigration: fixture.themeMigration,
    readEvidence: fixture.readEvidence,
    uiCommitShas: [],
    changedFiles: [],
    strict: true,
  };

  assert.throws(
    () =>
      assessUiSyncState({
        ...valid,
        currentUiDigest: `sha256:${'e'.repeat(64)}`,
      }),
    /保值谱系/,
  );

  const twoEntries = structuredClone(fixture.current);
  twoEntries.source.valuePreservation.push(structuredClone(twoEntries.source.valuePreservation[0]));
  assert.throws(() => assessUiSyncState({ ...valid, manifest: twoEntries }), /保值谱系/);

  assert.throws(
    () =>
      assessUiSyncState({
        ...valid,
        currentUiDigest: fixture.fromDigest,
      }),
    /保值谱系/,
  );

  assert.throws(
    () =>
      assessUiSyncState({
        ...valid,
        currentPrototypeDigest: `sha256:${'e'.repeat(64)}`,
      }),
    /Pages 原型摘要不匹配/,
  );
});

function gitFixture(t, { binary = false } = {}) {
  const cwd = mkdtempSync(join(tmpdir(), 'cili-ui-sync-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) =>
    execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const write = (file, value) => {
    mkdirSync(dirname(join(cwd, file)), { recursive: true });
    writeFileSync(join(cwd, file), value);
  };
  const ui = new Map([
    ['miniprogram/app.json', '{"pages":["pages/activities/index"]}\n'],
    ['miniprogram/app.wxss', 'page {\n  color: black;\n}\n'],
  ]);
  if (binary) ui.set('miniprogram/assets/test.png', png());
  const prototype = new Map(
    ['index.html', 'styles.css', 'app.js', 'delivery-center.js', 'schema.js', 'templates.js'].map(
      (name) => [`docs/${name}`, 'baseline\n'],
    ),
  );
  for (const [file, content] of [...ui, ...prototype]) write(file, content);
  git('init', '-q');
  git('config', 'user.email', 'fixture@example.invalid');
  git('config', 'user.name', 'Fixture');
  git('add', '.');
  git('commit', '-qm', 'fixture baseline');
  const current = manifest();
  current.schemaVersion = 2;
  current.syncedThrough = git('rev-parse', 'HEAD');
  current.source.digest = digestFiles(ui);
  current.prototype.digest = digestFiles(prototype);
  current.evidence.viewport = { width: 390, height: 790 };
  Object.assign(current.evidence.routes[0], {
    state: 'loaded',
    data: 'fixture',
    review: 'aligned',
    note: 'Synthetic Node test fixture',
  });
  write('docs/ui-sync-manifest.json', JSON.stringify(current));
  for (const name of ['activities-devtools.png', 'activities-pages.png']) {
    write(`docs/evidence/ui-sync/baseline/${name}`, png());
  }
  git('add', '.');
  git('commit', '-qm', 'fixture manifest');
  const run = () =>
    spawnSync(
      process.execPath,
      [fileURLToPath(new URL('./check-ui-sync.mjs', import.meta.url)), '--strict'],
      { cwd, encoding: 'utf8', env: { ...process.env, CILI_SKIP_UI_SYNC: '0' } },
    );
  const baseline = run();
  assert.equal(baseline.status, 0, `fixture baseline must pass: ${baseline.stderr}`);
  const runDigest = () =>
    spawnSync(
      process.execPath,
      [fileURLToPath(new URL('./pages-visual-acceptance/sync-ui-digests.mjs', import.meta.url))],
      { cwd, encoding: 'utf8' },
    );
  return { cwd, git, write, run, runDigest, expectedDigest: current.source.digest };
}

test('严格 CLI 检测已跟踪 UI 的未提交修改，提交后仍检测内容变化', (t) => {
  const fixture = gitFixture(t);
  fixture.write('miniprogram/app.wxss', 'page { color: red; }\n');
  assert.notEqual(fixture.run().status, 0, 'dirty UI must not use the HEAD blob');
  fixture.git('add', '.');
  fixture.git('commit', '-qm', 'changed UI');
  assert.notEqual(fixture.run().status, 0);
});

test('严格 CLI 检测已跟踪 Pages 的未提交修改', (t) => {
  const fixture = gitFixture(t);
  fixture.write('docs/styles.css', 'changed\n');
  const result = fixture.run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Pages 原型摘要不匹配/);
});

test('严格 CLI 对新增和删除 UI 计算实际文件集合', (t) => {
  const fixture = gitFixture(t);
  fixture.write('miniprogram/pages/activities/index.wxml', '<view>new</view>\n');
  assert.notEqual(fixture.run().status, 0);
  rmSync(join(fixture.cwd, 'miniprogram/pages/activities/index.wxml'));
  rmSync(join(fixture.cwd, 'miniprogram/app.wxss'));
  const result = fixture.run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /截图.*摘要/);
});

test('严格 CLI 规范 CRLF 文本并保持二进制资源字节', (t) => {
  const fixture = gitFixture(t, { binary: true });
  fixture.write('miniprogram/app.wxss', 'page {\r\n  color: black;\r\n}\r\n');
  fixture.write('docs/styles.css', 'baseline\r\n');
  assert.equal(fixture.run().status, 0);
});

test('ui:digest 与严格门禁共用工作树及二进制口径', (t) => {
  const fixture = gitFixture(t, { binary: true });
  assert.ok(fixture.runDigest().stdout.includes(fixture.expectedDigest));
  fixture.write('miniprogram/app.wxss', 'changed\n');
  assert.ok(!fixture.runDigest().stdout.includes(fixture.expectedDigest));
});

test('被 squash 替换且不可达的 topic 锚点在祖先门失败，不进入摘要判定', (t) => {
  const fixture = gitFixture(t);
  const branch = fixture.git('rev-parse', '--abbrev-ref', 'HEAD').trim();
  fixture.git('checkout', '-qb', 'tmp-replaced-topic');
  fixture.write('miniprogram/app.wxss', 'side topic\n');
  fixture.git('add', '.');
  fixture.git('commit', '-qm', 'replaced topic');
  const topicSha = fixture.git('rev-parse', 'HEAD').trim();
  fixture.git('checkout', '-q', branch);
  fixture.git('branch', '-D', 'tmp-replaced-topic');
  const manifestPath = join(fixture.cwd, 'docs/ui-sync-manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.syncedThrough = topicSha;
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const result = fixture.run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /同步基线不是当前分支祖先/);
});

test('可达真实祖先只解除祖先门，内容摘要不等仍由摘要门失败', (t) => {
  const fixture = gitFixture(t);
  fixture.write('miniprogram/app.wxss', 'changed after anchor\n');
  fixture.git('add', '.');
  fixture.git('commit', '-qm', 'content changed');
  const result = fixture.run();
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(result.stderr, /同步基线不是当前分支祖先/);
  assert.match(result.stderr, /截图对应的 UI 内容摘要不匹配|Pages 原型摘要不匹配/);
});
