import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const BINDER = fileURLToPath(new URL('./sync-ui-digests.mjs', import.meta.url));
const CHECK_UI_SYNC = fileURLToPath(new URL('../check-ui-sync.mjs', import.meta.url));
const PROTOTYPE_FILES = [
  'index.html',
  'styles.css',
  'app.js',
  'delivery-center.js',
  'schema.js',
  'templates.js',
];

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'cili-ui-binder-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  execFileSync('git', ['init', '-q'], { cwd: root });
  mkdirSync(join(root, 'docs'), { recursive: true });
  for (const file of PROTOTYPE_FILES) {
    writeFileSync(join(root, 'docs', file), `${file}\n`);
  }
  const manifest = {
    schemaVersion: 2,
    syncedThrough: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    syncedAt: '2026-10-29T13:27:27.287Z',
    source: { digest: 'sha256:source-unchanged-anchor' },
    prototype: { digest: 'sha256:prototype-before' },
  };
  writeFileSync(
    join(root, 'docs', 'ui-sync-manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  return root;
}

function runBinder(cwd, args) {
  return spawnSync(process.execPath, [BINDER, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env },
  });
}

function fixturePrototypeDigest(cwd) {
  const result = spawnSync(
    process.execPath,
    [
      '-e',
      `import(${JSON.stringify(CHECK_UI_SYNC)}).then((m) => console.log(m.currentPrototypeDigest()))`,
    ],
    { cwd, encoding: 'utf8' },
  );
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
}

test('prototype scope only refreshes Pages digest and preserves source anchor fields', (t) => {
  const root = fixture(t);
  const manifestPath = join(root, 'docs', 'ui-sync-manifest.json');
  const before = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const expectedPrototypeDigest = fixturePrototypeDigest(root);
  const result = runBinder(root, ['--write', '--scope=prototype']);

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /prototype/i);
  assert.match(result.stdout, /source.*保持|source.*preserv|source.*unchanged/i);

  const after = JSON.parse(readFileSync(manifestPath, 'utf8'));
  assert.equal(after.source.digest, before.source.digest);
  assert.equal(after.syncedThrough, before.syncedThrough);
  assert.equal(after.syncedAt, before.syncedAt);
  assert.notEqual(after.prototype.digest, before.prototype.digest);
  assert.equal(after.prototype.digest, expectedPrototypeDigest);
});

test('unknown binder scope rejects before writing manifest', (t) => {
  const root = fixture(t);
  const manifestPath = join(root, 'docs', 'ui-sync-manifest.json');
  const beforeBytes = readFileSync(manifestPath);
  const result = runBinder(root, ['--write', '--scope=native']);

  assert.notEqual(result.status, 0);
  assert.deepEqual(readFileSync(manifestPath), beforeBytes);
});

test('read-only binder invocation leaves manifest unchanged', (t) => {
  const root = fixture(t);
  const manifestPath = join(root, 'docs', 'ui-sync-manifest.json');
  const beforeBytes = readFileSync(manifestPath);
  const result = runBinder(root, []);

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.deepEqual(readFileSync(manifestPath), beforeBytes);
});
