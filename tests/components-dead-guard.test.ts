// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// 真死组件守卫：activity-card / blur-text 在五维审计下零渲染，删除后由本守卫守住不复活。
// 存活组件（含子组件）必须保持目录存在且注册可解析；资产文件不在本守卫范围。
const DEAD_COMPONENTS = ['activity-card', 'blur-text'] as const;
const ALIVE_COMPONENTS = [
  'state-view',
  'generated-activity-cover',
  'status-pill',
  'brand-logo',
  'cili-avatar',
] as const;

function walk(dir: string, extensions: string[]): string[] {
  const out: string[] = [];
  const visit = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      const next = `${current}/${entry.name}`;
      if (entry.isDirectory()) visit(next);
      else if (extensions.some((ext) => entry.name.endsWith(ext))) out.push(next);
    }
  };
  visit(dir);
  return out;
}

const productionJsons = walk('miniprogram', ['.json']);
const productionWxmls = walk('miniprogram', ['.wxml']);

describe('真死组件删除守卫', () => {
  it('activity-card 与 blur-text 生产目录与文件不再存在', () => {
    for (const name of DEAD_COMPONENTS) {
      expect(existsSync(`miniprogram/components/${name}`), name).toBe(false);
    }
  });

  it('全部生产 JSON 的 usingComponents 不再注册两个死组件', () => {
    for (const file of productionJsons) {
      const config = JSON.parse(readFileSync(file, 'utf8'));
      const entries = Object.values((config.usingComponents || {}) as Record<string, string>);
      for (const name of DEAD_COMPONENTS) {
        expect(
          entries.some((path) => String(path).includes(`components/${name}/`)),
          file,
        ).toBe(false);
      }
    }
  });

  it('全部生产 wxml 不再出现两个死组件标签', () => {
    for (const file of productionWxmls) {
      const source = readFileSync(file, 'utf8');
      for (const name of DEAD_COMPONENTS) {
        expect(new RegExp(`<${name}(?=[\\s>])`).test(source), file).toBe(false);
      }
    }
  });

  it('五个存活组件目录完整保留', () => {
    for (const name of ALIVE_COMPONENTS) {
      expect(existsSync(`miniprogram/components/${name}/index.json`), name).toBe(true);
      expect(existsSync(`miniprogram/components/${name}/index.wxml`), name).toBe(true);
    }
  });

  it('现存组件注册路径全部可解析到真实文件（删除不破坏存活依赖）', () => {
    for (const file of productionJsons) {
      const config = JSON.parse(readFileSync(file, 'utf8'));
      const entries = Object.entries((config.usingComponents || {}) as Record<string, string>);
      for (const [tag, target] of entries) {
        if (!String(target).startsWith('/components/')) continue;
        let localPath = `miniprogram${target}`;
        if (localPath.endsWith('/index')) localPath = `${localPath}.json`;
        else if (!localPath.endsWith('.json')) localPath = `${localPath}/index.json`;
        expect(existsSync(localPath), `${file} -> ${tag}=${target}`).toBe(true);
      }
    }
  });
});
