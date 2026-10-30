// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { existsSync, readFileSync } from 'node:fs';
// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import path from 'node:path';
import { expect } from 'vitest';

export const read = (file: string) => readFileSync(file, 'utf8');

// 受控 @import：仅允许仓库内相对 .wxss；外部 URL、绝对路径、越界路径、缺失文件与循环引用均失败。
// 解析只负责把真实规则展开到 effectiveBlock 可见范围，不放宽颜色、字号、44px 或对比度算法。
const STYLE_IMPORT_RE = /@import\s+(?:url\(\s*)?['"]?([^'"\s);]+)['"]?\s*\)?\s*;/g;

export function resolveStyleImport(specifier: string, importerFile: string, root?: string): string {
  // @ts-expect-error Node global under Vitest runtime; repository omits Node typings.
  const resolvedRoot = root ?? process.cwd();
  const spec = specifier.trim();
  if (!spec) throw new Error('空 @import 路径');
  if (/^(?:https?:)?\/\//i.test(spec) || /^(?:https?|data):/i.test(spec)) {
    throw new Error(`禁止外部 @import：${spec}`);
  }
  if (path.isAbsolute(spec)) throw new Error(`禁止绝对路径 @import：${spec}`);
  if (!spec.startsWith('./') && !spec.startsWith('../')) {
    throw new Error(`仅授权仓库内相对 @import：${spec}`);
  }
  const rootDir = path.resolve(resolvedRoot);
  const importerDir = path.dirname(path.resolve(rootDir, importerFile));
  const target = path.normalize(path.join(importerDir, spec));
  const relative = path.relative(rootDir, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`@import 越出仓库根目录：${spec}`);
  }
  if (!target.endsWith('.wxss')) throw new Error(`@import 仅允许 .wxss 文件：${spec}`);
  if (!existsSync(target)) throw new Error(`@import 文件缺失：${spec}（来自 ${importerFile}）`);
  return target;
}

export function readStyleSource(
  file: string,
  options: { root?: string; visited?: Set<string>; stack?: string[] } = {},
): string {
  // @ts-expect-error Node global under Vitest runtime; repository omits Node typings.
  const fallbackRoot = process.cwd();
  const root = options.root ?? fallbackRoot;
  const visited = options.visited ?? new Set<string>();
  const stack = options.stack ?? [];
  const absolute = path.resolve(root, file);
  if (visited.has(absolute)) {
    throw new Error(`@import 循环引用：${[...stack, file].join(' -> ')}`);
  }
  const source = readFileSync(absolute, 'utf8');
  const nextVisited = new Set(visited);
  nextVisited.add(absolute);
  return source.replace(STYLE_IMPORT_RE, (_match: unknown, spec: string) => {
    const target = resolveStyleImport(spec, file, root);
    const relativeTarget = path.relative(root, target);
    return `/* @import ${spec}（受控展开） */\n${readStyleSource(relativeTarget, {
      root,
      visited: nextVisited,
      stack: [...stack, file],
    })}`;
  });
}

/** 按真实文件位置展开受控 @import 后再取 effectiveBlock，供去冗后的语义守卫使用。 */
export function effectiveStyle(file: string, selector: string): string {
  return effectiveBlock(readStyleSource(file), selector);
}

export function cssBlocks(source: string, selector: string): string[] {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [...source.matchAll(new RegExp(`(?:^|\\n)\\s*${escaped}\\s*\\{([^}]*)\\}`, 'g'))].map(
    (match) => match[1],
  );
}

export function cssBlock(source: string, selector: string): string {
  const blocks = cssBlocks(source, selector);
  expect(blocks, `missing CSS selector ${selector}`).not.toHaveLength(0);
  return blocks[blocks.length - 1] || '';
}

/** Collects declarations from every matching selector list in source order. */
export function effectiveBlock(source: string, selector: string): string {
  const declarations: string[] = [];
  for (const match of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectorList = match[1].replace(/\/\*[\s\S]*?\*\//g, '').trim();
    if (selectorList.split(',').some((item) => item.trim() === selector)) {
      declarations.push(match[2]);
    }
  }
  expect(declarations, `missing CSS selector ${selector}`).not.toHaveLength(0);
  return declarations.join('\n');
}

export function declaration(block: string, property: string): string {
  const matches = [...block.matchAll(new RegExp(`(?:^|\\n)\\s*${property}\\s*:\\s*([^;]+);`, 'g'))];
  const match = matches[matches.length - 1];
  expect(match, `missing CSS declaration ${property}`).toBeDefined();
  return match?.[1].trim() || '';
}

export function uiTokens(source: string): Record<string, string> {
  const body = cssBlocks(source, 'page')[0] || '';
  expect(body, 'missing unified UI token block').not.toBe('');
  return Object.fromEntries(
    [...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((match) => [match[1], match[2].trim()]),
  );
}

export function resolveValue(value: string, tokens: Record<string, string>): string {
  let result = value;
  for (let index = 0; index < 12 && /var\(--[\w-]+\)/.test(result); index += 1) {
    result = result.replace(/var\((--[\w-]+)\)/g, (reference, name) => tokens[name] || reference);
  }
  return result;
}

export function expectSemantic(value: string, token: string): void {
  expect(value.replace(/\s*!important\s*$/, ''), `expected semantic token ${token}`).toBe(
    `var(${token})`,
  );
}

export function hexColor(value: string): string {
  const match = value.match(/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/i);
  expect(match, `expected hex color in "${value}"`).not.toBeNull();
  return (match?.[0] || '').toLowerCase();
}

export function relativeLuminance(hex: string): number {
  const raw = hex.replace('#', '');
  const normalized = raw.length === 3 ? [...raw].map((value) => value + value).join('') : raw;
  const channels = normalized
    .match(/.{2}/g)!
    .map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

export function contrast(foreground: string, background: string): number {
  const first = relativeLuminance(foreground);
  const second = relativeLuminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

export function resolvedHex(value: string, tokens: Record<string, string>): string {
  return hexColor(resolveValue(value, tokens));
}

export function rpx(block: string, property: string): number {
  const value = declaration(block, property);
  const match = value.match(/^(\d+(?:\.\d+)?)rpx$/);
  expect(match, `${property} must use an rpx value`).not.toBeNull();
  return Number(match?.[1]);
}
