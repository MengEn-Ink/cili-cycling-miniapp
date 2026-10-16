import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function contrastRatio(a, b) {
  const luminance = (hex) => {
    if (!/^#[\da-f]{6}$/i.test(hex)) throw new Error('颜色必须为六位十六进制');
    const [r, g, blue] = hex
      .slice(1)
      .match(/../g)
      .map((part) => {
        const channel = parseInt(part, 16) / 255;
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
      });
    return 0.2126 * r + 0.7152 * g + 0.0722 * blue;
  };
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

export function validateDesignContract(contract, styles) {
  if (contract.schemaVersion !== 1 || !Object.keys(contract.tokens || {}).length) {
    throw new Error('设计契约无效');
  }
  for (const [side, css] of Object.entries(styles)) {
    const root = css.match(/(?:page|:root)\s*\{([^}]+)\}/)?.[1] || '';
    const tokens = Object.fromEntries(
      [...root.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]),
    );
    for (const [name, expected] of Object.entries(contract.tokens)) {
      const value = typeof expected === 'string' ? expected : expected[side];
      if (!value || tokens[name] !== value) {
        throw new Error(`${side} ${name} 不符合设计契约：${tokens[name]} / ${value}`);
      }
    }
  }
  if (!Array.isArray(contract.contrast) || contract.contrast.length === 0) {
    throw new Error('缺少对比度门槛');
  }
  return contract.contrast.map(({ foreground, background, minimum }) => {
    if (!Number.isFinite(minimum) || minimum < 3) throw new Error('对比度门槛无效');
    const ratio = contrastRatio(contract.tokens[foreground], contract.tokens[background]);
    if (ratio < minimum)
      throw new Error(`${foreground} / ${background} 对比度 ${ratio.toFixed(2)} < ${minimum}`);
    return { foreground, background, ratio: Number(ratio.toFixed(2)), minimum };
  });
}

// 仅检查同一规则内显式声明的纯色配对；继承、照片与层叠仍由运行截图验收。
export function validateSurfacePairs(css, tokens, file) {
  for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const fg = [...body.matchAll(/(?:^|[;\n])\s*color:\s*var\((--[\w-]+)\)/g)].at(-1)?.[1];
    const bg = [...body.matchAll(/(?:^|[;\n])\s*background(?:-color)?:\s*var\((--[\w-]+)\)/g)].at(
      -1,
    )?.[1];
    if (
      /^#[\da-f]{6}$/i.test(tokens[fg]) &&
      /^#[\da-f]{6}$/i.test(tokens[bg]) &&
      contrastRatio(tokens[fg], tokens[bg]) < 4.5
    ) {
      throw new Error(`${file} ${selector.trim()} 显式文字/背景对比度不足`);
    }
  }
}

export function run() {
  const contract = JSON.parse(readFileSync('docs/design-contract.json', 'utf8'));
  const results = validateDesignContract(contract, {
    miniapp: readFileSync('miniprogram/app.wxss', 'utf8'),
    pages: readFileSync('docs/styles.css', 'utf8'),
  });
  const files = readdirSync('miniprogram', { recursive: true })
    .filter((file) => file.endsWith('.wxss'))
    .map((file) => `miniprogram/${file}`);
  for (const file of [...files, 'docs/styles.css']) {
    validateSurfacePairs(readFileSync(file, 'utf8'), contract.tokens, file);
  }
  console.log(
    `设计契约通过：${Object.keys(contract.tokens).length} 个双端变量，${results.length} 组对比度`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    run();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
