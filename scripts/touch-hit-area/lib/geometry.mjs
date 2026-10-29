// 触控热区门禁 · 共享几何与源码工具（纯 Node 内置，不依赖 npm 包）。
//
// 口径：
// - 微信 rpx：750rpx = 视口宽度 W px，故 1rpx = W/750 CSS px。
// - 有效命中尺寸 = 声明视觉盒高/宽 + 透明命中层固定 CSS px 扩张；命中层不绘制任何视觉。
// - 测试只读取专用 tree（worktree）源码；不安装依赖、不写回仓库以外的缓存目录。

import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// 正式门禁位于 scripts/touch-hit-area/lib/，仓库根为上溯三级；TOUCH_REPO_ROOT 供基线 RED 临时目录复用。
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = process.env.TOUCH_REPO_ROOT || resolve(SCRIPT_DIR, '..', '..', '..');
export const TOUCH_EVIDENCE_DIR =
  process.env.TOUCH_EVIDENCE_DIR || resolve(SCRIPT_DIR, '..', 'evidence');

/** 三宽度门禁视口（CSS px），与 phase3 三宽度走查保持一致。 */
export const VIEWPORT_WIDTHS = [340, 375, 430];
/** W3C / 微信触控命中下限：有效命中盒任一轴不得小于 44 CSS px。 */
export const HIT_MIN_PX = 44;

export function repoPath(relativePath) {
  return resolve(REPO_ROOT, relativePath);
}

export function readRepoText(relativePath) {
  return readFileSync(repoPath(relativePath), 'utf8');
}

export function existsRepo(relativePath) {
  return existsSync(repoPath(relativePath));
}

/** rpx → CSS px（按给定视口宽度）。 */
export function rpxToPx(rpx, viewportWidth) {
  return (rpx * viewportWidth) / 750;
}

/** 解析声明尺寸：支持 rpx / px / 与 var(--token)（token 仅在 app.wxss page 块解析）。 */
export function resolveLengthToPx(raw, viewportWidth, tokens = {}) {
  if (raw == null) return null;
  const text = String(raw).trim();
  const varMatch = text.match(/^var\(\s*(--[\w-]+)\s*\)$/);
  if (varMatch) {
    const tokenValue = tokens[varMatch[1]];
    if (tokenValue == null) return null;
    return resolveLengthToPx(tokenValue, viewportWidth, tokens);
  }
  const rpxMatch = text.match(/^(-?[\d.]+)rpx$/);
  if (rpxMatch) return rpxToPx(Number(rpxMatch[1]), viewportWidth);
  const pxMatch = text.match(/^(-?[\d.]+)px$/);
  if (pxMatch) return Number(pxMatch[1]);
  return null;
}

/** 剥离 CSS 注释后做粗粒度规则解析：返回 [{ selector, decls: Map, raw }]。 */
export function parseCssRules(cssText) {
  const withoutComments = cssText.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [];
  let index = 0;
  while (index < withoutComments.length) {
    const braceStart = withoutComments.indexOf('{', index);
    if (braceStart < 0) break;
    let selector = withoutComments.slice(index, braceStart).trim();
    let depth = 1;
    let cursor = braceStart + 1;
    while (cursor < withoutComments.length && depth > 0) {
      const ch = withoutComments[cursor];
      if (ch === '{') depth += 1;
      else if (ch === '}') depth -= 1;
      cursor += 1;
    }
    const body = withoutComments.slice(braceStart + 1, cursor - 1);
    if (selector.startsWith('@media')) {
      // 媒体查询内规则递归保留；selector 前缀记为 @media。
      const inner = parseCssRules(body);
      for (const rule of inner)
        rules.push({ selector: `${selector} ${rule.selector}`, decls: rule.decls, raw: rule.raw });
      index = cursor;
      continue;
    }
    const decls = new Map();
    for (const chunk of body.split(';')) {
      const colon = chunk.indexOf(':');
      if (colon <= 0) continue;
      const prop = chunk.slice(0, colon).trim();
      const value = chunk.slice(colon + 1).trim();
      if (prop) decls.set(prop, value);
    }
    rules.push({ selector, decls, raw: body });
    index = cursor;
  }
  return rules;
}

/** 提取 page{...} 自定义属性令牌（app.wxss 首块 page 选择器）。 */
export function resolvePageTokens(cssText) {
  const tokens = {};
  for (const rule of parseCssRules(cssText)) {
    if (rule.selector !== 'page') continue;
    for (const [prop, value] of rule.decls) {
      if (prop.startsWith('--')) tokens[prop] = value;
    }
  }
  // 二次展开令牌中的 var() 引用（仅一层别名链，够用）。
  for (const [key, value] of Object.entries(tokens)) {
    const varMatch = value.match(/^var\(\s*(--[\w-]+)\s*\)$/);
    if (varMatch && tokens[varMatch[1]] != null) tokens[key] = tokens[varMatch[1]];
  }
  return tokens;
}

/**
 * 提取专用命中层标记块（touch-hit-begin / touch-hit-end 标记之间）。
 * 支持 CSS 块注释与 HTML/SVG 注释两种标记语法。
 */
export function extractHitLayerBlock(cssText) {
  const beginRe = /\/\*\s*touch-hit-begin[\s\S]*?touch-hit-end\s*\*\//g;
  const blocks = [...cssText.matchAll(beginRe)].map((m) => m[0]);
  if (!blocks.length) return { present: false, rules: [] };
  return {
    present: true,
    text: blocks.join('\n'),
    rules: blocks.flatMap((block) => parseCssRules(block)),
  };
}

/** 剥离全部 touch-hit 标记块（CSS 注释 + HTML/SVG 注释），用于“块外零改动”比对。 */
export function stripHitBlocks(text) {
  return text
    .replace(/[ \t]*\n?\/\*\s*touch-hit-begin[\s\S]*?touch-hit-end\s*\*\/[ \t]*\n?/g, '')
    .replace(/[ \t]*\n?<!--\s*touch-hit-begin[\s\S]*?<!--\s*touch-hit-end\s*-->[ \t]*\n?/g, '');
}

/** 命中层允许出现的声明白名单：只能扩张命中几何，不得绘制视觉。 */
export const HIT_LAYER_ALLOWED_PROPS = new Set([
  'content',
  'position',
  'top',
  'right',
  'bottom',
  'left',
  'pointer-events',
  'z-index',
  'fill',
  'stroke',
  'stroke-width',
  'opacity',
  'display',
]);

/** 宿主真实节点承载（bearing）允许的声明：只允许承载几何与布局对齐，不得绘制颜色/字号/边框。 */
export const HOST_BEARING_ALLOWED_PROPS = new Set([
  'min-height',
  'min-width',
  'position',
  'display',
  'align-items',
  'justify-content',
  'box-sizing',
  'flex',
  'gap',
  // 触控组件尺度令牌自定义属性（仅承载几何，值固定 44px，不含颜色/字号）。
  '--touch-target-min',
  // 非命中字形/文字抑制规则（如原型 SVG glyph pointer-events:none）复用本集合；承载宿主规则不使用它绘制视觉。
  'pointer-events',
]);

/** 视觉敏感属性：命中层一律禁止声明（宿主 bearing 规则仅放行 min-height/min-width 两项）。 */
export const VISUAL_SENSITIVE_PROPS = new Set([
  'background',
  'background-color',
  'border',
  'border-top',
  'border-right',
  'border-bottom',
  'border-left',
  'color',
  'font-size',
  'line-height',
  'font-weight',
  'padding',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'min-height',
  'height',
  'min-width',
  'width',
  'box-shadow',
  'border-radius',
]);

/** 读取 Git 基线版本文件内容（HEAD）；失败返回 null（用于视觉零漂移核对）。 */
export function gitBaselineText(relativePath) {
  try {
    return execFileSync('git', ['-C', REPO_ROOT, 'show', `HEAD:${relativePath}`], {
      encoding: 'utf8',
    });
  } catch {
    return null;
  }
}

export function repoRelative(absPath) {
  return relative(REPO_ROOT, absPath);
}
