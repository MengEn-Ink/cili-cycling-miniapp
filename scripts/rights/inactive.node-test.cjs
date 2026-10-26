'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, readdirSync, existsSync } = require('node:fs');
const { resolve, dirname, extname, relative, join, sep } = require('node:path');
const ts = require('typescript');

const root = resolve(__dirname, '../..');
const rightsRoot = resolve(root, 'scripts/rights');
const read = (file) => readFileSync(file, 'utf8');
const codeExtensions = new Set(['.js', '.cjs', '.mjs', '.ts']);

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (['node_modules', 'dist', 'coverage', 'miniprogram_npm'].includes(entry.name)) return [];
    const file = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(file);
    return entry.isFile() && codeExtensions.has(extname(file)) ? [file] : [];
  });
}

function imports(file, text) {
  const ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const paths = [];
  function visit(node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    )
      paths.push(node.moduleSpecifier.text);
    if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require') ||
        (ts.isPropertyAccessExpression(node.expression) &&
          node.expression.expression.getText(ast) === 'require' &&
          node.expression.name.text === 'resolve')) &&
      node.arguments[0] &&
      ts.isStringLiteralLike(node.arguments[0])
    )
      paths.push(node.arguments[0].text);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return paths;
}

function localModule(file, specifier) {
  if (!specifier.startsWith('.') && !specifier.startsWith('/')) return undefined;
  const base = resolve(dirname(file), specifier);
  const candidates = [
    base,
    ...['.ts', '.js', '.cjs', '.mjs'].map((extension) => base + extension),
    ...['index.ts', 'index.js', 'index.cjs', 'index.mjs'].map((name) => join(base, name)),
  ];
  return candidates.find(
    (candidate) => codeExtensions.has(extname(candidate)) && existsSync(candidate),
  );
}

test('runtime import graph cannot reach dormant rights directly or transitively', () => {
  const pending = ['cloudfunctions', 'miniprogram'].flatMap((name) =>
    sourceFiles(join(root, name)),
  );
  assert.ok(pending.length > 0);
  const visited = new Set();
  while (pending.length) {
    const file = pending.pop();
    if (visited.has(file)) continue;
    visited.add(file);
    assert.ok(!file.startsWith(rightsRoot + sep), `runtime reached ${relative(root, file)}`);
    const text = read(file);
    assert.doesNotMatch(
      text,
      /scripts[\\/]rights|privacy-contract\.cjs|ledger\.cjs/,
      relative(root, file),
    );
    for (const specifier of imports(file, text)) {
      const next = localModule(file, specifier);
      if (next) pending.push(next);
    }
  }
});

test('graph parser recognizes CommonJS ESM reexports and escaped dynamic paths', () => {
  assert.deepEqual(
    imports(
      'sample.ts',
      `
    import p from '../../scripts/rights/privacy.cjs';
    export * from '../../scripts/rights/ledger.cjs';
    require('../../scripts/rights/privacy.cjs');
    require.resolve('../../scripts/rights/ledger.cjs');
    import('../../scripts/\\u0072ights/privacy.cjs');
  `,
    ),
    [
      '../../scripts/rights/privacy.cjs',
      '../../scripts/rights/ledger.cjs',
      '../../scripts/rights/privacy.cjs',
      '../../scripts/rights/ledger.cjs',
      '../../scripts/rights/privacy.cjs',
    ],
  );
});

test('prepare never copies dormant contracts into cloud deployment packages', () => {
  const prepare = resolve(root, 'scripts/prepare-cloudfunctions.mjs');
  assert.doesNotMatch(read(prepare), /rights|privacy\.cjs|ledger\.cjs|privacy-contract/);
  for (const specifier of imports(prepare, read(prepare)))
    assert.equal(
      localModule(prepare, specifier),
      undefined,
      'new local prepare dependency needs review',
    );
  assert.equal(existsSync(resolve(root, 'cloudfunctions/shared/privacy.js')), false);
  assert.equal(existsSync(resolve(root, 'cloudfunctions/privacy-maintenance')), false);
});

test('deployment and profile entrypoint expose no rights function Timer or endpoint', () => {
  const config = JSON.parse(read(resolve(root, 'cloudbaserc.json')));
  for (const fn of config.functions) {
    assert.doesNotMatch(fn.name, /privacy|rights/);
    for (const trigger of fn.triggers || []) assert.doesNotMatch(trigger.name, /privacy|rights/);
  }
  for (const route of config.gateway.routes) {
    assert.doesNotMatch(route.path, /privacy|rights/);
    assert.doesNotMatch(route.target, /privacy|rights/);
  }
  assert.doesNotMatch(
    read(resolve(root, 'cloudfunctions/profile/index.js')),
    /requestProfileDeletion|requestDeletion|deletionStatus|setPublicConsent|recreateProfile/,
  );
});

test('root validation registers the focused dormant contract suite without preparing cloud code', () => {
  const { scripts } = JSON.parse(read(resolve(root, 'package.json')));
  assert.equal(
    scripts['test:rights-contract'],
    'node --test scripts/rights/privacy.node-test.cjs scripts/rights/ledger.node-test.cjs scripts/rights/inactive.node-test.cjs',
  );
  assert.equal(
    scripts.validate.split(' && ').filter((command) => command === 'npm run test:rights-contract')
      .length,
    1,
  );
  assert.doesNotMatch(scripts['test:rights-contract'], /prepare|cloudfunctions|miniprogram/);
});
