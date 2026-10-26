// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { readFileSync, readdirSync } from 'node:fs';
// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

interface DirentLike {
  name: string;
  isDirectory: () => boolean;
  isFile: () => boolean;
}

const listWxmlFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry: DirentLike) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return listWxmlFiles(path);
    return entry.isFile() && entry.name.endsWith('.wxml') ? [path] : [];
  });

describe('WXML 数据绑定语法（微信编译器前置校验）', () => {
  it('绑定表达式不允许方法调用与模板字面量，否则 miniprogram-ci 上传时才会报编译错误', () => {
    const offenders: string[] = [];
    for (const file of listWxmlFiles('miniprogram')) {
      const content = read(file);
      // 逐个提取 {{ ... }} 绑定并检查违禁模式；方法调用（如 slice/charAt）需在
      // 逻辑层计算后传入，模板字面量与箭头函数则完全不支持。
      const bindings = content.match(/\{\{[\s\S]*?\}\}/g) ?? [];
      for (const binding of bindings) {
        if (
          /[^A-Za-z0-9_$.](slice|charAt|substring|substr|toFixed|join|map|filter|replace|concat|split|indexOf|toUpperCase|toLowerCase|trim)\(/.test(
            binding,
          )
        ) {
          offenders.push(`${file}: 方法调用 ${binding}`);
        }
        if (/`/.test(binding)) offenders.push(`${file}: 模板字面量 ${binding}`);
        if (/(=>|function\s|new\s)/.test(binding)) offenders.push(`${file}: 非法表达式 ${binding}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('骑行卡占位字符由逻辑层计算并绑定简单字段', () => {
    const template = read('miniprogram/pages/activity-detail/index.wxml');
    expect(template).toContain('{{rider.avatarPlaceholder}}');
    const logic = read('miniprogram/pages/activity-detail/index.ts');
    expect(logic).toContain('avatarPlaceholder');
  });
});
