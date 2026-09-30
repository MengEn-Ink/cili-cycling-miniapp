// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { readFileSync } from 'node:fs';
import { expect } from 'vitest';

export const read = (file: string) => readFileSync(file, 'utf8');

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

export function themeTokens(source: string, theme: 'dark' | 'light'): Record<string, string> {
  const selector = theme === 'dark' ? 'page,\\s*\\.theme-dark' : '\\.theme-light';
  const body =
    source.match(new RegExp(`(?:^|\\n)\\s*${selector}\\s*\\{([^}]*)\\}`, 's'))?.[1] || '';
  expect(body, `missing ${theme} theme token block`).not.toBe('');
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
