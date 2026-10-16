import assert from 'node:assert/strict';
import test from 'node:test';
import {
  contrastRatio,
  validateDesignContract,
  validateSurfacePairs,
} from './check-design-contract.mjs';

const contract = {
  schemaVersion: 1,
  tokens: { '--color-action': '#c84320', '--color-on-action': '#ffffff' },
  contrast: [{ foreground: '--color-on-action', background: '--color-action', minimum: 4.5 }],
};
const css = ':root { --color-action: #c84320; --color-on-action: #ffffff; }';

test('WCAG 对比度使用真实亮度：亮橙白字失败、深橙通过', () => {
  assert.equal(contrastRatio('#ffffff', '#000000'), 21);
  assert.ok(contrastRatio('#ffffff', '#e85b32') < 4.5);
  assert.ok(contrastRatio('#ffffff', '#c84320') >= 4.5);
  assert.throws(() => contrastRatio('transparent', '#ffffff'), /颜色/);
});
test('双端与正式契约一致才能通过', () => {
  assert.equal(validateDesignContract(contract, { miniapp: css, pages: css }).length, 1);
  assert.throws(
    () =>
      validateDesignContract(contract, { miniapp: css.replace('#c84320', '#171717'), pages: css }),
    /miniapp.*color-action/,
  );
});
test('两端一起退化仍必须被对比度门禁阻断', () => {
  const bad = structuredClone(contract);
  bad.tokens['--color-action'] = '#e85b32';
  const weak = css.replace('#c84320', '#e85b32');
  assert.throws(() => validateDesignContract(bad, { miniapp: weak, pages: weak }), /对比度/);
});
test('缺少 token 以及无效门槛不能静默通过', () => {
  assert.throws(() => validateDesignContract(contract, { miniapp: '', pages: css }), /miniapp/);
  const bad = structuredClone(contract);
  bad.contrast[0].minimum = 0;
  assert.throws(() => validateDesignContract(bad, { miniapp: css, pages: css }), /门槛/);
});

test('局部页面覆写为亮橙白字也必须阻断，不能只检查 root', () => {
  const tokens = { ...contract.tokens, '--color-brand': '#e85b32' };
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
