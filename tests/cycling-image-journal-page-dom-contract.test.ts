// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

type ContainerSpec = {
  class: string;
  role: string;
  order: number;
  optional?: boolean;
  note?: string;
};

type InteractionSpec = {
  trigger: string;
  dataAttr?: string;
  openType?: string;
  note?: string;
};

type ForbidSpec = {
  class: string;
  reason: string;
};

type PageContract = {
  slug: string;
  pagePath: string;
  title: string;
  wxml: string;
  wxss: string;
  ts: string;
  containers: ContainerSpec[];
  interactions: InteractionSpec[];
  copy: string[];
  assets?: Array<{ class: string; note?: string }>;
  forbids?: ForbidSpec[];
};

const CONTRACTS_DIR = 'docs/designs/2026-10-22-cycling-image-journal/page-dom-contracts';

// Strict scope: all 16 骑行影像志 pages are deep-aligned to the implementation.
// Phase 1 covered the first 6 (骑友体验核心流程); Phase 2 covers the remaining 10
// (我的 / 俱乐部 / 管理工作台）.
const PHASE_1_SLUGS = new Set([
  'activities',
  'activity-detail',
  'route-analysis',
  'registration-form',
  'registrations',
  'credential',
]);
const PHASE_2_SLUGS = new Set([
  'profile',
  'profile-edit',
  'settings',
  'club-center',
  'admin-activity-list',
  'admin-activity-edit',
  'admin-reviews',
  'admin-review-detail',
  'admin-club-management',
  'admin-club-profile',
]);
const STRICT_SLUGS = new Set<string>([...Array.from(PHASE_1_SLUGS), ...Array.from(PHASE_2_SLUGS)]);

const read = (path: string) => readFileSync(path, 'utf8');

const loadContracts = (): PageContract[] => {
  const files = (readdirSync(CONTRACTS_DIR) as string[]).filter(
    (name: string) => name.endsWith('.json') && name !== 'README.md',
  );
  return files.map((file: string) => {
    const raw = read(`${CONTRACTS_DIR}/${file}`);
    return JSON.parse(raw) as PageContract;
  });
};

// Match any element whose class attribute contains ALL whitespace-separated tokens
// from `className`, in any order. This stays robust to extra conditional classes
// like `status-${item.status}` or `is-active` that the implementation may append.
const matchesContainer = (wxml: string, className: string) => {
  const tokens = className.split(/\s+/).filter(Boolean);
  // Build regex that requires each token to appear as a class attribute value.
  const classAttrRegex = /class="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = classAttrRegex.exec(wxml)) !== null) {
    const classes = m[1].split(/\s+/);
    const allMatch = tokens.every((t) => classes.includes(t));
    if (allMatch) return true;
  }
  return false;
};

const matchesForbid = (wxml: string, className: string) => {
  const tokens = className.split(/\s+/).filter(Boolean);
  const classAttrRegex = /class="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = classAttrRegex.exec(wxml)) !== null) {
    const classes = m[1].split(/\s+/);
    const allMatch = tokens.every((t) => classes.includes(t));
    if (allMatch) return true;
  }
  return false;
};

const findInteraction = (wxml: string, trigger: string, dataAttr?: string, openType?: string) => {
  // Look for bind:xxx="trigger", bindxxx="trigger", or catchxxx="trigger"
  // or open-type="share" for share-type triggers.
  if (openType) {
    return wxml.includes(`open-type="${openType}"`) || wxml.includes(`open-type='${openType}'`);
  }
  const triggerRegex = new RegExp(`(bind|bind:|catch|catch:)[a-zA-Z]+="${trigger}"`);
  if (!triggerRegex.test(wxml)) return false;
  if (dataAttr) {
    return wxml.includes(dataAttr);
  }
  return true;
};

describe('骑行影像志 · 16 页 DOM/交互契约', () => {
  const contracts = loadContracts();

  it('契约目录含 16 份页面契约', () => {
    const slugs = contracts.map((c) => c.slug).sort();
    expect(slugs).toHaveLength(16);
    // 保证六个 Phase-1 页面齐全
    for (const slug of PHASE_1_SLUGS) {
      expect(slugs).toContain(slug);
    }
    // Phase-2 补齐的十个页面同样必须存在
    for (const slug of PHASE_2_SLUGS) {
      expect(slugs).toContain(slug);
    }
  });

  describe.each(contracts.filter((c) => STRICT_SLUGS.has(c.slug)))(
    '深度对齐 · $slug',
    (contract) => {
      const wxml = read(contract.wxml);

      it('containers 中的必备分块均在 WXML 中出现', () => {
        const missing: string[] = [];
        for (const container of contract.containers) {
          if (container.optional) continue;
          if (!matchesContainer(wxml, container.class)) {
            missing.push(`${container.class} (role=${container.role})`);
          }
        }
        expect(missing, `${contract.slug} 缺少必备容器`).toEqual([]);
      });

      it('containers.order 严格单调递增且无重复', () => {
        const orders = contract.containers.map((c) => c.order);
        for (let i = 1; i < orders.length; i += 1) {
          expect(orders[i], `${contract.slug} order 必须递增`).toBeGreaterThan(orders[i - 1]);
        }
      });

      it('interactions 中的触发器在 WXML 中真实绑定', () => {
        const missing: string[] = [];
        for (const interaction of contract.interactions) {
          const ok = findInteraction(
            wxml,
            interaction.trigger,
            interaction.dataAttr,
            interaction.openType,
          );
          if (!ok) missing.push(interaction.trigger);
        }
        expect(missing, `${contract.slug} 缺失交互绑定`).toEqual([]);
      });

      it('copy 中列出的文案锚点必须在 WXML 中出现', () => {
        const missing: string[] = [];
        for (const anchor of contract.copy) {
          if (!wxml.includes(anchor)) missing.push(anchor);
        }
        expect(missing, `${contract.slug} 缺失文案锚点`).toEqual([]);
      });

      it('forbids 中的旧 class 不得出现', () => {
        const leaked: string[] = [];
        for (const f of contract.forbids ?? []) {
          if (matchesForbid(wxml, f.class)) {
            leaked.push(`${f.class} - ${f.reason}`);
          }
        }
        expect(leaked, `${contract.slug} 禁用 class 泄漏`).toEqual([]);
      });

      it('assets 中列出的媒体 class 必须在 WXML 中出现', () => {
        const missing: string[] = [];
        for (const asset of contract.assets ?? []) {
          if (!matchesContainer(wxml, asset.class)) missing.push(asset.class);
        }
        expect(missing, `${contract.slug} 缺失资源 class`).toEqual([]);
      });

      it('wxml / wxss / ts 文件均存在且非空', () => {
        expect(wxml.length).toBeGreaterThan(0);
        expect(read(contract.wxss).length).toBeGreaterThan(0);
        expect(read(contract.ts).length).toBeGreaterThan(0);
      });
    },
  );

  it('全部 16 份契约都被 STRICT_SLUGS 覆盖，不留宽松兜底', () => {
    const notStrict = contracts.filter((c) => !STRICT_SLUGS.has(c.slug));
    expect(
      notStrict.map((c) => c.slug),
      '所有契约都必须被深度断言覆盖',
    ).toEqual([]);
  });
});

describe('三宽度验收脚本可复现且失败会阻断', () => {
  const packageJson = JSON.parse(read('package.json')) as {
    scripts?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const walkthrough = read('scripts/phase3-three-width-walkthrough.mjs');
  const runner = read('scripts/run-phase3-three-width.mjs');
  const report = JSON.parse(read('docs/evidence/phase3-three-width/report.json')) as {
    results: Array<{
      slug: string;
      widths: Record<
        string,
        {
          error?: string;
          horizontalOverflow?: number;
          consoleErrors?: string[];
          fixedOcclusions?: unknown[];
          invalidSmallTouchTargets?: unknown[];
        }
      >;
    }>;
  };

  it('锁定 Playwright 依赖并提供统一 npm 入口', () => {
    expect(packageJson.devDependencies?.playwright).toBeTruthy();
    expect(packageJson.scripts?.['test:phase3-visual']).toBe(
      'playwright install chromium && node scripts/run-phase3-three-width.mjs',
    );
    expect(runner).toContain('createServer(async (request, response) =>');
    expect(runner).toContain('await runWalkthrough(base)');
    expect(runner).toContain('await closeServer()');
  });

  it('加载、溢出、console、遮挡和触控目标异常都会进入失败分支', () => {
    expect(walkthrough).toContain('m.error');
    expect(walkthrough).toContain('m.horizontalOverflow > 0');
    expect(walkthrough).toContain('m.consoleErrors && m.consoleErrors.length');
    expect(walkthrough).toContain('m.fixedOcclusions && m.fixedOcclusions.length');
    expect(walkthrough).toContain(
      'm.invalidSmallTouchTargets && m.invalidSmallTouchTargets.length',
    );
    expect(walkthrough).toContain('process.exitCode = 1');
  });

  it('已提交的 48 个度量样本全部无阻断问题', () => {
    expect(report.results).toHaveLength(16);
    for (const result of report.results) {
      expect(Object.keys(result.widths)).toHaveLength(3);
      for (const metrics of Object.values(result.widths)) {
        expect(metrics.error).toBeUndefined();
        expect(metrics.horizontalOverflow).toBe(0);
        expect(metrics.consoleErrors ?? []).toEqual([]);
        expect(metrics.fixedOcclusions ?? []).toEqual([]);
        expect(metrics.invalidSmallTouchTargets ?? []).toEqual([]);
      }
    }
  });
});
