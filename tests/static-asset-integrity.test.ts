// @ts-expect-error 仓库按运行时能力使用 Node 内置模块，未额外引入 @types/node。
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
// @ts-expect-error 同上。
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve('.');
const IMAGE_EXTENSIONS = '(?:png|jpe?g|gif|svg|webp)';
const TEXT_EXTENSIONS = new Set(['.css', '.html', '.js', '.json', '.md', '.ts', '.wxml', '.wxss']);

function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(
    (entry: { name: string; isDirectory(): boolean }) => {
      const fullPath = path.join(directory, entry.name);
      return entry.isDirectory() ? walk(fullPath) : [fullPath];
    },
  );
}

function localReference(reference: string): string | undefined {
  const normalized = reference
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .split(/[?#]/, 1)[0];
  if (!normalized || /^(?:https?:|cloud:|data:|wxfile:|#)/i.test(normalized)) return undefined;
  return normalized;
}

function markupImageReferences(content: string): string[] {
  const references: string[] = [];
  const patterns = [
    /!\[[^\]]*\]\(([^)\s]+)(?:\s+['"][^'"]*['"])?\)/g,
    /(?:src|poster)\s*=\s*['"]([^'"]+)['"]/g,
    /url\(\s*['"]?([^'")]+)['"]?\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) references.push(match[1]);
  }
  return references;
}

function markdownReferences(content: string): string[] {
  return [...content.matchAll(/!?\[[^\]]*\]\(([^)\s]+)(?:\s+['"][^'"]*['"])?\)/g)].map(
    (match) => match[1],
  );
}

function miniprogramAssetReferences(content: string): string[] {
  return [
    ...content.matchAll(
      new RegExp(
        `((?:/|(?:\\.\\./)+|\\./)?assets/[A-Za-z0-9_./@-]+\\.${IMAGE_EXTENSIONS.slice(3, -1)})`,
        'gi',
      ),
    ),
  ].map((match) => match[1]);
}

function resolveReference(source: string, reference: string, miniprogramSource = false): string {
  if (miniprogramSource && reference.startsWith('/')) {
    return path.join(ROOT, 'miniprogram', reference.slice(1));
  }
  return path.resolve(path.dirname(source), reference);
}

function brokenReferences(
  files: string[],
  extract: (content: string) => string[],
  options: { imageOnly?: boolean; miniprogramSource?: boolean } = {},
): string[] {
  const { imageOnly = true, miniprogramSource = false } = options;
  const broken: string[] = [];
  for (const source of files) {
    const content = readFileSync(source, 'utf8');
    for (const rawReference of extract(content)) {
      const reference = localReference(rawReference);
      if (!reference || (imageOnly && !new RegExp(`\\.${IMAGE_EXTENSIONS}$`, 'i').test(reference)))
        continue;
      const target = resolveReference(source, reference, miniprogramSource);
      if (!existsSync(target) || (imageOnly && !statSync(target).isFile())) {
        broken.push(`${path.relative(ROOT, source)} -> ${reference}`);
      }
    }
  }
  return [...new Set(broken)].sort();
}

describe('静态图片资源完整性', () => {
  it('小程序源码中的本地图片引用全部存在', () => {
    const sourceFiles = walk(path.join(ROOT, 'miniprogram')).filter((file) =>
      TEXT_EXTENSIONS.has(path.extname(file)),
    );
    expect(
      brokenReferences(sourceFiles, miniprogramAssetReferences, { miniprogramSource: true }),
    ).toEqual([]);
  });

  it('动态 TabBar 图片族由显式白名单覆盖，新增动态路径必须补校验', () => {
    const sourceFiles = walk(path.join(ROOT, 'miniprogram')).filter((file) =>
      TEXT_EXTENSIONS.has(path.extname(file)),
    );
    const dynamicLines = sourceFiles.flatMap((source) =>
      readFileSync(source, 'utf8')
        .split(/\r?\n/)
        .filter(
          (line: string) =>
            /assets\//.test(line) && (/\$\{/.test(line) || /['"`]\s*\+|\+\s*['"`]/.test(line)),
        )
        .map((line: string) => `${path.relative(ROOT, source)}: ${line.trim()}`),
    );
    expect(dynamicLines).toEqual([
      'miniprogram/services/theme-service.ts: iconPath: `assets/tabbar/${name}-light.png`,',
      'miniprogram/services/theme-service.ts: selectedIconPath: `assets/tabbar/${name}-active.png`,',
    ]);

    const tabs = ['activities', 'registrations', 'profile'];
    const variants = ['light', 'active'];
    const missing = tabs.flatMap((tab) =>
      variants
        .map((variant) => `miniprogram/assets/tabbar/${tab}-${variant}.png`)
        .filter((file) => !existsSync(path.join(ROOT, file))),
    );
    expect(missing).toEqual([]);
  });

  it('README 与 Pages 实际图片链接全部存在', () => {
    const docsFiles = walk(path.join(ROOT, 'docs')).filter((file) =>
      TEXT_EXTENSIONS.has(path.extname(file)),
    );
    const sourceFiles = [path.join(ROOT, 'README.md'), ...docsFiles];
    expect(brokenReferences(sourceFiles, markupImageReferences)).toEqual([]);
  });

  it('README 产品预览只引用当前 UI 同步清单登记的 Pages 截图', () => {
    const readme = readFileSync(path.join(ROOT, 'README.md'), 'utf8');
    const previewSection = readme.match(/## 产品预览([\s\S]*?)(?=\n## )/)?.[1] ?? '';
    const manifest = JSON.parse(
      readFileSync(path.join(ROOT, 'docs/ui-sync-manifest.json'), 'utf8'),
    ) as {
      evidence: { directory: string; routes: Array<{ pages: string }> };
    };
    const allowed = new Set(
      manifest.evidence.routes.map((route) =>
        path.posix.join(manifest.evidence.directory, route.pages),
      ),
    );
    const actual = markupImageReferences(previewSection)
      .map(localReference)
      .filter((reference): reference is string => Boolean(reference));

    expect(actual.length).toBeGreaterThan(0);
    expect(actual.filter((reference) => !allowed.has(reference))).toEqual([]);
  });

  it('README 与文档中的本地链接全部可达', () => {
    const markdownFiles = [
      path.join(ROOT, 'README.md'),
      ...walk(path.join(ROOT, 'docs')).filter((file) => path.extname(file) === '.md'),
    ];
    expect(
      brokenReferences(markdownFiles, markdownReferences, {
        imageOnly: false,
      }),
    ).toEqual([]);
  });

  it('README 配置表覆盖云函数环境变量示例', () => {
    const readme = readFileSync(path.join(ROOT, 'README.md'), 'utf8');
    const envKeys = readFileSync(path.join(ROOT, 'cloudfunctions/.env.example'), 'utf8')
      .split(/\r?\n/)
      .map((line: string) => line.trim())
      .filter((line: string) => line && !line.startsWith('#'))
      .map((line: string) => line.split('=', 1)[0]);
    expect(envKeys.filter((key: string) => !readme.includes(`\`${key}\``))).toEqual([]);
  });

  it('已退役的未引用占位资源不再进入小程序包', () => {
    const retiredPaths = [
      'miniprogram/components/mock-banner',
      'miniprogram/assets/profile/avatars/cili-black.png',
      'miniprogram/assets/profile/avatars/cili-ivory.png',
      'miniprogram/assets/profile/avatars/cili-orange.png',
      'miniprogram/assets/tabbar/activities.png',
      'miniprogram/assets/tabbar/profile.png',
      'miniprogram/assets/tabbar/registrations.png',
    ];
    expect(retiredPaths.filter((item) => existsSync(path.join(ROOT, item)))).toEqual([]);
  });
});
