import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

import appRoutes from './app-routes.cjs';
import { assertUnifiedMediaUpload } from './media-upload-governance.mjs';

const read = (file) => readFileSync(file, 'utf8');
const requireText = (content, expected, source) => {
  if (!content.includes(expected)) throw new Error(`${source} 缺少当前口径：${expected}`);
};

const requiredFiles = [
  'AGENTS.md',
  'CONTRIBUTING.md',
  'LICENSE',
  'README.md',
  'SECURITY.md',
  'docs/github-governance.md',
  'docs/high-priority-issues.md',
  'docs/ui-sync-manifest.json',
  'docs/verification/pr-acceptance-report-template.md',
  'docs/verification/wechat-devtools-e2e.md',
  '.github/PULL_REQUEST_TEMPLATE.md',
  '.github/workflows/ci.yml',
  '.github/workflows/codeql.yml',
  '.github/workflows/deploy-cloudbase.yml',
  '.github/workflows/deploy-miniprogram.yml',
];
for (const file of requiredFiles) if (!existsSync(file)) throw new Error(`治理文件缺失：${file}`);

const appConfig = JSON.parse(read('miniprogram/app.json'));
const pageCount = appRoutes.expandAppRoutes(appConfig).length;
const manifest = JSON.parse(read('docs/ui-sync-manifest.json'));
if (manifest.routes?.length !== pageCount || manifest.evidence?.routes?.length !== pageCount) {
  throw new Error(
    `页面证据数量漂移：app=${pageCount}，routes=${manifest.routes?.length || 0}，evidence=${manifest.evidence?.routes?.length || 0}`,
  );
}

const readme = read('README.md');
requireText(readme, `以及 ${pageCount} 个核心页面原型`, 'README.md');
requireText(readme, `# ${pageCount} 路由双端截图与内容摘要`, 'README.md');
requireText(readme, '部署统一由 GitHub Actions 执行', 'README.md');
const verificationIndex = read('docs/verification/README.md');
requireText(verificationIndex, `${pageCount} 路由只读运行`, 'docs/verification/README.md');
requireText(read('AGENTS.md'), `${pageCount} 路由双端截图`, 'AGENTS.md');
requireText(
  read('docs/verification/wechat-devtools-e2e.md'),
  `${pageCount} 路由交互原型`,
  'docs/verification/wechat-devtools-e2e.md',
);
requireText(
  read('docs/high-priority-issues.md'),
  `${pageCount} 条运行路由`,
  'docs/high-priority-issues.md',
);

for (const match of readme.matchAll(/!?(?:\[[^\]]*\])\(([^)]+)\)/g)) {
  const target = match[1].split('#')[0].trim();
  if (!target || /^(?:https?:|mailto:)/.test(target)) continue;
  if (!existsSync(target)) throw new Error(`README.md 本地引用不存在：${target}`);
}

const tracked = spawnSync('git', ['ls-files', '-z'], { encoding: 'utf8' });
if (tracked.status !== 0) throw new Error(`无法读取 Git 跟踪文件：${tracked.stderr.trim()}`);
const forbidden = tracked.stdout
  .split('\0')
  .filter(Boolean)
  .filter(
    (file) =>
      /(^|\/)(node_modules|coverage|dist)(\/|$)/.test(file) ||
      (/(^|\/)\.env(?:\..+)?$/.test(file) && !file.endsWith('.example')) ||
      /(^|\/)project\.private\.config\.json$/.test(file) ||
      /\.(?:pem|p12|pfx|key)$/i.test(file),
  );
if (forbidden.length) throw new Error(`禁止跟踪的依赖、产物或敏感文件：${forbidden.join(', ')}`);

for (const workflow of [
  '.github/workflows/ci.yml',
  '.github/workflows/codeql.yml',
  '.github/workflows/deploy-cloudbase.yml',
  '.github/workflows/deploy-miniprogram.yml',
]) {
  const source = read(workflow);
  if (/\bpull_request_target\s*:/.test(source))
    throw new Error(`${workflow} 禁止使用 pull_request_target`);
  if (!/^permissions:/m.test(source)) throw new Error(`${workflow} 必须显式声明最小权限`);
}

const packageJson = JSON.parse(read('package.json'));
if (!packageJson.scripts?.validate?.includes('check:governance')) {
  throw new Error('npm run validate 必须执行 check:governance');
}
const ci = read('.github/workflows/ci.yml');
if (!ci.includes('run: npm run harness -- run validate')) {
  throw new Error('CI 必须通过 Harness 执行 validate');
}
if (!ci.includes('run: npm run check:pr-description'))
  throw new Error('PR CI 必须执行 npm run check:pr-description');
if (!/types:\s*\[[^\]]*\bedited\b[^\]]*\]/.test(ci)) {
  throw new Error('PR CI 必须监听 edited，确保标题或描述修改后重新执行提交规范门禁');
}

const prTemplate = read('.github/PULL_REQUEST_TEMPLATE.md');
for (const heading of [
  '需求上下文',
  '背景',
  '修改方案',
  '复现或验证路径',
  '改动',
  '影响面',
  '测试与端到端验收',
  '改动文件',
])
  requireText(prTemplate, `## ${heading}`, '.github/PULL_REQUEST_TEMPLATE.md');
requireText(
  prTemplate,
  'docs/verification/pr-acceptance-report-template.md',
  '.github/PULL_REQUEST_TEMPLATE.md',
);

assertUnifiedMediaUpload();

console.log(
  `项目治理校验通过：${pageCount} 个页面、README 引用、统一媒体上传、源码卫生与 Actions 安全基线一致`,
);
