import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  contrastRatio,
  validateDesignContract,
  validateSurfacePairs,
} from './check-design-contract.mjs';

const contract = {
  schemaVersion: 1,
  tokens: { '--color-action': '#c0321f', '--color-on-action': '#ffffff' },
  contrast: [{ foreground: '--color-on-action', background: '--color-action', minimum: 4.5 }],
};
const css = ':root { --color-action: #c0321f; --color-on-action: #ffffff; }';

test('WCAG 对比度使用真实亮度：品牌红白字失败、深行动红白字通过', () => {
  assert.equal(contrastRatio('#ffffff', '#000000'), 21);
  assert.ok(contrastRatio('#ffffff', '#e13b2b') < 4.5);
  assert.ok(contrastRatio('#ffffff', '#c0321f') >= 4.5);
  assert.throws(() => contrastRatio('transparent', '#ffffff'), /颜色/);
});
test('双端与正式契约一致才能通过', () => {
  assert.equal(validateDesignContract(contract, { miniapp: css, pages: css }).length, 1);
  assert.throws(
    () =>
      validateDesignContract(contract, { miniapp: css.replace('#c0321f', '#211f1c'), pages: css }),
    /miniapp.*color-action/,
  );
});
test('两端一起退化为品牌红仍必须被对比度门禁阻断', () => {
  const bad = structuredClone(contract);
  bad.tokens['--color-action'] = '#e13b2b';
  const weak = css.replace('#c0321f', '#e13b2b');
  assert.throws(() => validateDesignContract(bad, { miniapp: weak, pages: weak }), /对比度/);
});
test('缺少 token 以及无效门槛不能静默通过', () => {
  assert.throws(() => validateDesignContract(contract, { miniapp: '', pages: css }), /miniapp/);
  const bad = structuredClone(contract);
  bad.contrast[0].minimum = 0;
  assert.throws(() => validateDesignContract(bad, { miniapp: css, pages: css }), /门槛/);
});

test('局部页面覆写为品牌红白字也必须阻断，不能只检查 root', () => {
  const tokens = { ...contract.tokens, '--color-brand': '#e13b2b' };
  assert.throws(
    () =>
      validateSurfacePairs(
        '.chip { background: var(--color-brand) !important; color: var(--color-on-action); }',
        tokens,
        'page.wxss',
      ),
    /page.wxss.*chip/,
  );
  assert.doesNotThrow(() =>
    validateSurfacePairs(
      '.chip { background: var(--color-action); color: var(--color-on-action); }',
      tokens,
      'page.wxss',
    ),
  );
});

test('正式设计契约逐项继承沸点手稿交接令牌', () => {
  const handoff = JSON.parse(
    readFileSync('docs/designs/2026-10-16-boiling-point/tokens.json', 'utf8'),
  );
  const runtime = JSON.parse(readFileSync('docs/design-contract.json', 'utf8'));

  assert.equal(runtime.schemaVersion, handoff.schemaVersion);
  assert.deepEqual(runtime.tokens, handoff.tokens);
  assert.deepEqual(runtime.contrast, handoff.contrast);
});
