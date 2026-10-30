// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import path from 'node:path';
// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { tmpdir } from 'node:os';
import {
  declaration,
  effectiveBlock,
  readStyleSource,
  resolveStyleImport,
  uiTokens,
} from './theme-contract-helpers';

const tempRoots: string[] = [];

function makeTempRoot(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'wxss-import-'));
  tempRoots.push(root);
  return root;
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('受控 @import 解析协议', () => {
  it('拒绝外部 URL、协议相对、绝对路径与非仓库相对路径', () => {
    const root = makeTempRoot();
    writeFileSync(path.join(root, 'a.wxss'), '.a { color: red; }\n');

    expect(() => resolveStyleImport('https://example.com/a.wxss', 'a.wxss', root)).toThrow(/外部/);
    expect(() => resolveStyleImport('//cdn.example/a.wxss', 'a.wxss', root)).toThrow(/外部/);
    expect(() => resolveStyleImport('/styles/a.wxss', 'a.wxss', root)).toThrow(/绝对/);
    expect(() => resolveStyleImport('styles/a.wxss', 'a.wxss', root)).toThrow(/相对/);
    expect(() => resolveStyleImport('../outside.wxss', 'a.wxss', root)).toThrow(/越出/);
  });

  it('拒绝缺失文件与非 .wxss 目标，不静默 fallback', () => {
    const root = makeTempRoot();
    writeFileSync(path.join(root, 'a.wxss'), '.a { color: red; }\n');

    expect(() => resolveStyleImport('./missing.wxss', 'a.wxss', root)).toThrow(/缺失/);
    expect(() => resolveStyleImport('./a.json', 'a.wxss', root)).toThrow(/\.wxss/);
  });

  it('检测相互循环引用并失败，不展开成空规则', () => {
    const root = makeTempRoot();
    writeFileSync(path.join(root, 'a.wxss'), "@import './b.wxss';\n.a { color: red; }\n");
    writeFileSync(path.join(root, 'b.wxss'), "@import './a.wxss';\n.b { color: blue; }\n");

    expect(() => readStyleSource('a.wxss', { root })).toThrow(/循环/);
  });

  it('嵌套合法相对 import 可解析到仓库根内，规则进入 effectiveBlock 且不改颜色/圆角语义', () => {
    const root = makeTempRoot();
    mkdirSync(path.join(root, 'sub'), { recursive: true });
    writeFileSync(
      path.join(root, 'shared.wxss'),
      '.detailrows {\n  display: flex;\n  flex-direction: column;\n  border-radius: 20rpx;\n  background: var(--color-surface);\n}\n',
    );
    writeFileSync(
      path.join(root, 'sub', 'page.wxss'),
      "@import '../shared.wxss';\n.page { padding: 0; }\n",
    );

    const target = resolveStyleImport('../shared.wxss', 'sub/page.wxss', root);
    expect(target.startsWith(root)).toBe(true);
    const resolved = readStyleSource('sub/page.wxss', { root });
    const rows = effectiveBlock(resolved, '.detailrows');
    expect(declaration(rows, 'display')).toBe('flex');
    expect(declaration(rows, 'flex-direction')).toBe('column');
    expect(declaration(rows, 'border-radius')).toBe('20rpx');
    expect(declaration(rows, 'background')).toBe('var(--color-surface)');
  });

  it('按源码顺序展开 import，前后规则位置不被重排', () => {
    const root = makeTempRoot();
    writeFileSync(path.join(root, 'part.wxss'), '.part { display: flex; }\n');
    writeFileSync(
      path.join(root, 'main.wxss'),
      ".before { color: #fff; }\n@import './part.wxss';\n.after { color: #000; }\n",
    );

    const resolved = readStyleSource('main.wxss', { root });
    expect(resolved.indexOf('.before')).toBeLessThan(resolved.indexOf('.part'));
    expect(resolved.indexOf('.part')).toBeLessThan(resolved.indexOf('.after'));
    expect(declaration(effectiveBlock(resolved, '.part'), 'display')).toBe('flex');
  });

  it('展开后主题字体令牌与 44px 触控下限保持正向断言，不替换为字面像素', () => {
    const app = readStyleSource('miniprogram/app.wxss');
    const tokens = uiTokens(app);
    for (const token of ['--font-family-body', '--font-family-editorial', '--font-family-mono']) {
      expect(tokens[token], token).toBeTruthy();
    }
    const allPageBlocks = effectiveBlock(app, 'page');
    expect(declaration(allPageBlocks, '--touch-target-min')).toBe('44px');
  });
});
