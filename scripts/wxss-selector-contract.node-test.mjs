import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import test from 'node:test';

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '));
}

function wildcardOffsets(selector) {
  const offsets = [];
  let quote = '';
  let bracketDepth = 0;
  let parenthesisDepth = 0;
  for (let index = 0; index < selector.length; index += 1) {
    const character = selector[index];
    if (quote) {
      if (character === '\\') index += 1;
      else if (character === quote) quote = '';
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === '[') bracketDepth += 1;
    else if (character === ']') bracketDepth = Math.max(0, bracketDepth - 1);
    else if (character === '(') parenthesisDepth += 1;
    else if (character === ')') parenthesisDepth = Math.max(0, parenthesisDepth - 1);
    else if (character === '*' && bracketDepth === 0 && parenthesisDepth === 0) offsets.push(index);
  }
  return offsets;
}

function findWildcardSelectors(source) {
  const clean = stripComments(source);
  const violations = [];
  const preludePattern = /([^{}]+)\{/g;
  for (const match of clean.matchAll(preludePattern)) {
    const prelude = match[1].trim();
    if (!prelude || prelude.startsWith('@')) continue;
    for (const offset of wildcardOffsets(prelude)) {
      const absoluteOffset = match.index + match[1].indexOf(prelude) + offset;
      const line = clean.slice(0, absoluteOffset).split('\n').length;
      violations.push({ line, selector: prelude.replace(/\s+/g, ' ') });
    }
  }
  return violations;
}

function collectWxss(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collectWxss(path);
    return entry.isFile() && path.endsWith('.wxss') ? [path] : [];
  });
}

test('detects universal selectors including pseudo-elements', () => {
  assert.deepEqual(
    findWildcardSelectors('[data-layout] *, *::before { transition: none; }').map(
      ({ selector }) => selector,
    ),
    ['[data-layout] *, *::before', '[data-layout] *, *::before'],
  );
});

test('ignores comments, multiplication-like values, and stars inside attribute values', () => {
  const source = `
    /* * and *::before are documentation only */
    [data-expression="2*3"], [data-pattern='*'] { width: calc(2rpx * 3); }
    view { --formula: 2 * 3; }
  `;
  assert.deepEqual(findWildcardSelectors(source), []);
});

test('business WXSS does not use unsupported universal selectors', () => {
  const root = join(process.cwd(), 'miniprogram');
  assert.equal(statSync(root).isDirectory(), true);
  const violations = collectWxss(root).flatMap((path) =>
    findWildcardSelectors(readFileSync(path, 'utf8')).map(
      ({ line, selector }) => `${relative(process.cwd(), path)}:${line} ${selector}`,
    ),
  );
  assert.deepEqual(violations, []);
});
