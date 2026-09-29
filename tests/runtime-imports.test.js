import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(target);
    return entry.isFile() && target.endsWith('.ts') ? [target] : [];
  });
}

describe('小程序运行时模块导入', () => {
  it('不依赖微信构建器不支持的目录入口解析', () => {
    const invalid = [];
    for (const file of walk(path.resolve('miniprogram'))) {
      const source = ts.createSourceFile(
        file,
        fs.readFileSync(file, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
      );
      source.forEachChild((node) => {
        const declaration =
          ts.isImportDeclaration(node) || ts.isExportDeclaration(node) ? node : undefined;
        if (!declaration?.moduleSpecifier || !ts.isStringLiteral(declaration.moduleSpecifier))
          return;
        if (declaration.isTypeOnly) return;
        if (ts.isImportDeclaration(declaration) && declaration.importClause?.isTypeOnly) return;
        const specifier = declaration.moduleSpecifier.text;
        if (!specifier.startsWith('.')) return;
        if (fs.existsSync(path.resolve(path.dirname(file), specifier, 'index.ts'))) {
          invalid.push(`${path.relative(process.cwd(), file)} -> ${specifier}`);
        }
      });
    }
    expect(invalid).toEqual([]);
  });
});
