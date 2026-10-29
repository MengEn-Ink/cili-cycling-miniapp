import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { chromium } from 'playwright';

const ROOT = process.cwd();
const BRAND_ROOT = path.join(ROOT, 'docs/brand/logo-materials');
const SOURCE_ROOT = path.join(BRAND_ROOT, 'source');
const GENERATED_ROOT = path.join(BRAND_ROOT, 'generated');

const COLORS = {
  background: '#211f1c',
  foreground: '#ffffff',
  accent: '#e13b2b',
  warm: '#f7f4f2',
  muted: '#b8b3ba',
};

const source = (relativePath) => path.join(SOURCE_ROOT, relativePath);
const generated = (relativePath) => path.join(GENERATED_ROOT, relativePath);
const relative = (absolutePath) => path.relative(ROOT, absolutePath).split(path.sep).join('/');

function svgDocument({ width, height, label, body, background = '' }) {
  const backgroundLine = background ? `  ${background}\n` : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${label}">
  <title>${label}</title>
${backgroundLine}
  ${body}
</svg>
`;
}

function routeMark({ x = 0, y = 0, size = 96, tile = COLORS.accent, route = COLORS.foreground }) {
  const scale = size / 96;
  return `<g transform="translate(${x} ${y}) scale(${scale})" aria-label="CILI 路线环标志">
    <rect width="96" height="96" rx="26" fill="${tile}"/>
    <path d="M68 25 C56 20 44 23 42 33 C40 42 47 46 56 49 C65 52 68 58 66 66 C63 75 54 79 44 78 C35 77 29 72 25 65" fill="none" stroke="${route}" stroke-width="10.5" stroke-linecap="round" stroke-linejoin="round"/>
  </g>`;
}

function wordmark({ x = 0, y = 0, scale = 1, color = COLORS.foreground }) {
  return `<g transform="translate(${x} ${y}) scale(${scale})" fill="${color}" fill-rule="evenodd" aria-label="CILI">
    <!-- CILI custom slab-mono wordmark; paths avoid platform font substitution. -->
    <path d="M40 0H12C5.373 0 0 5.373 0 12v32c0 6.627 5.373 12 12 12h28V44H14V12h26V0Z"/>
    <path d="M54 0h34v10H77v36h11v10H54V46h11V10H54V0Z"/>
    <path d="M102 0h12v44h32v12h-44V0Z"/>
    <path d="M160 0h34v10h-11v36h11v10h-34V46h11V10h-11V0Z"/>
  </g>`;
}

function horizontalLockup({
  x = 0,
  y = 0,
  markSize = 96,
  wordmarkColor = COLORS.foreground,
  markTile = COLORS.accent,
  markRoute = COLORS.foreground,
} = {}) {
  const wordmarkScale = (markSize / 96) * 0.62;
  const gap = markSize * 0.2;
  const wordmarkY = y + (markSize - 56 * wordmarkScale) / 2;
  return `${routeMark({ x, y, size: markSize, tile: markTile, route: markRoute })}
  ${wordmark({
    x: x + markSize + gap,
    y: wordmarkY,
    scale: wordmarkScale,
    color: wordmarkColor,
  })}`;
}

function horizontalLogo({
  background = COLORS.background,
  wordmarkColor = COLORS.foreground,
  markTile = COLORS.accent,
  markRoute = COLORS.foreground,
  transparent = false,
  label = 'CILI 横版标志',
} = {}) {
  return svgDocument({
    width: 320,
    height: 144,
    label,
    background: transparent ? '' : `<rect width="320" height="144" fill="${background}"/>`,
    body: horizontalLockup({
      x: 42,
      y: 24,
      markSize: 96,
      wordmarkColor,
      markTile,
      markRoute,
    }),
  });
}

function markSvg() {
  return svgDocument({
    width: 144,
    height: 144,
    label: 'CILI 路线环标志',
    body: routeMark({ x: 12, y: 12, size: 120 }),
  });
}

function squareSvg() {
  return svgDocument({
    width: 144,
    height: 144,
    label: 'CILI 方形平台标志',
    background: `<rect width="144" height="144" fill="${COLORS.background}"/>`,
    body: routeMark({ x: 24, y: 24, size: 96 }),
  });
}

function circleSvg() {
  return svgDocument({
    width: 144,
    height: 144,
    label: 'CILI 圆形头像标志',
    background: `<circle cx="72" cy="72" r="72" fill="${COLORS.background}"/>`,
    body: routeMark({ x: 27, y: 27, size: 90 }),
  });
}

function stackedSvg() {
  return svgDocument({
    width: 360,
    height: 420,
    label: 'CILI 竖版组合标志',
    background: `<rect width="360" height="420" fill="${COLORS.background}"/>`,
    body: `${routeMark({ x: 100, y: 52, size: 160 })}
  ${wordmark({ x: 79, y: 270, scale: 1.04 })}`,
  });
}

function wordmarkSvg({ color, label }) {
  return svgDocument({
    width: 224,
    height: 80,
    label,
    body: wordmark({ x: 15, y: 12, scale: 1, color }),
  });
}

function watermarkSvg() {
  return svgDocument({
    width: 360,
    height: 144,
    label: 'CILI 照片水印',
    body: `<rect x="1" y="1" width="358" height="142" rx="24" fill="${COLORS.background}" fill-opacity=".92" stroke="${COLORS.foreground}" stroke-opacity=".14"/>
  ${horizontalLockup({ x: 30, y: 28, markSize: 88 })}`,
  });
}

function shareSvg() {
  return svgDocument({
    width: 500,
    height: 400,
    label: 'CILI 微信分享图',
    background: `<rect width="500" height="400" fill="${COLORS.background}"/>`,
    body: `${horizontalLockup({ x: 62, y: 116, markSize: 132 })}
  <rect x="54" y="332" width="392" height="4" rx="2" fill="${COLORS.accent}"/>`,
  });
}

function loadingSvg(frame) {
  const angle = frame * 45;
  return svgDocument({
    width: 512,
    height: 512,
    label: `CILI 路线加载动画第 ${frame + 1} 帧`,
    background: `<rect width="512" height="512" fill="${COLORS.background}"/>`,
    body: `<g transform="rotate(${angle} 256 256)">
    <circle cx="256" cy="46" r="13" fill="${COLORS.accent}"/>
    <circle cx="256" cy="82" r="7" fill="${COLORS.foreground}" fill-opacity=".34"/>
  </g>
  ${routeMark({ x: 168, y: 144, size: 176 })}
  ${wordmark({ x: 142, y: 350, scale: 1.18 })}`,
  });
}

function socialCoverSvg() {
  return svgDocument({
    width: 1500,
    height: 500,
    label: 'CILI 社交媒体横幅',
    background: `<rect width="1500" height="500" fill="${COLORS.background}"/>`,
    body: `<path d="M-80 410 C250 250 430 460 690 280 S1120 40 1580 170" fill="none" stroke="${COLORS.foreground}" stroke-opacity=".08" stroke-width="36" stroke-linecap="round"/>
  ${horizontalLockup({ x: 120, y: 130, markSize: 240 })}
  <rect x="120" y="444" width="1260" height="6" rx="3" fill="${COLORS.accent}"/>`,
  });
}

function presentationCoverSvg() {
  return svgDocument({
    width: 1920,
    height: 1080,
    label: 'CILI 演示文稿封面',
    background: `<rect width="1920" height="1080" fill="${COLORS.background}"/>`,
    body: `<path d="M-120 930 C260 760 470 980 830 700 S1450 320 2040 500" fill="none" stroke="${COLORS.foreground}" stroke-opacity=".07" stroke-width="54" stroke-linecap="round"/>
  ${horizontalLockup({ x: 176, y: 256, markSize: 288 })}
  <text x="182" y="780" fill="${COLORS.muted}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="34" font-weight="700" letter-spacing="8">RIDE TOGETHER · 2026</text>
  <rect x="182" y="870" width="1556" height="8" rx="4" fill="${COLORS.accent}"/>`,
  });
}

function emailSignatureSvg() {
  return svgDocument({
    width: 1200,
    height: 360,
    label: 'CILI 邮件签名模板',
    background: `<rect width="1200" height="360" fill="${COLORS.warm}"/>`,
    body: `${horizontalLockup({ x: 64, y: 56, markSize: 216, wordmarkColor: COLORS.background })}
  <rect x="64" y="300" width="1072" height="4" rx="2" fill="${COLORS.accent}"/>
  <text x="646" y="188" fill="${COLORS.background}" font-family="-apple-system, BlinkMacSystemFont, PingFang SC, sans-serif" font-size="26" font-weight="700">骑有此里 · 一路同行</text>
  <text x="646" y="232" fill="${COLORS.background}" fill-opacity=".58" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="18" font-weight="700" letter-spacing="4">RIDE TOGETHER</text>`,
  });
}

function businessCardSvg() {
  return svgDocument({
    width: 1050,
    height: 600,
    label: 'CILI 名片模板',
    background: `<rect width="1050" height="600" fill="${COLORS.background}"/>`,
    body: `${horizontalLockup({ x: 92, y: 124, markSize: 220 })}
  <rect x="92" y="482" width="866" height="6" rx="3" fill="${COLORS.accent}"/>
  <text x="92" y="544" fill="${COLORS.muted}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="24" font-weight="700" letter-spacing="6">CILI · RIDE TOGETHER</text>`,
  });
}

function letterheadSvg() {
  return svgDocument({
    width: 1240,
    height: 1754,
    label: 'CILI A4 信纸模板',
    background: `<rect width="1240" height="1754" fill="${COLORS.warm}"/>`,
    body: `${horizontalLockup({ x: 92, y: 84, markSize: 104, wordmarkColor: COLORS.background })}
  <rect x="92" y="246" width="1056" height="4" fill="${COLORS.accent}"/>
  <rect x="92" y="1514" width="1056" height="2" fill="${COLORS.background}" fill-opacity=".16"/>
  <text x="92" y="1574" fill="${COLORS.background}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="23" font-weight="700" letter-spacing="4">CILI · RIDE TOGETHER</text>
  <text x="92" y="1620" fill="${COLORS.background}" fill-opacity=".56" font-family="-apple-system, BlinkMacSystemFont, PingFang SC, sans-serif" font-size="22">骑行活动与同行服务</text>
  ${routeMark({ x: 1076, y: 1548, size: 72 })}`,
  });
}

function brandBoardSvg() {
  return svgDocument({
    width: 1600,
    height: 1200,
    label: 'CILI Logo 全套物料总览',
    background: `<rect width="1600" height="1200" fill="#f0ebe4"/>`,
    body: `<text x="90" y="100" fill="${COLORS.background}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="24" font-weight="800" letter-spacing="5">CILI · LOGO SYSTEM V3</text>
  <text x="90" y="170" fill="${COLORS.background}" font-family="-apple-system, BlinkMacSystemFont, PingFang SC, sans-serif" font-size="52" font-weight="800">路线环标志与响应式字标</text>
  <rect x="90" y="230" width="1420" height="330" rx="36" fill="${COLORS.background}"/>
  ${horizontalLockup({ x: 152, y: 285, markSize: 220 })}
  <rect x="90" y="610" width="680" height="360" rx="36" fill="${COLORS.warm}"/>
  ${horizontalLockup({ x: 152, y: 696, markSize: 156, wordmarkColor: COLORS.background })}
  <rect x="830" y="610" width="680" height="360" rx="36" fill="${COLORS.background}"/>
  ${horizontalLockup({ x: 912, y: 696, markSize: 156, markTile: COLORS.foreground, markRoute: COLORS.background })}
  <circle cx="120" cy="1070" r="22" fill="${COLORS.background}"/><text x="160" y="1078" fill="${COLORS.background}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="22">#211F1C · CINEMA INK</text>
  <circle cx="570" cy="1070" r="22" fill="${COLORS.accent}"/><text x="610" y="1078" fill="${COLORS.background}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="22">#E13B2B · LOGO RED</text>
  <circle cx="1010" cy="1070" r="22" fill="${COLORS.foreground}" stroke="${COLORS.background}" stroke-opacity=".12"/><text x="1050" y="1078" fill="${COLORS.background}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="22">#FFFFFF · ROUTE WHITE</text>`,
  });
}

const sourceAssets = new Map([
  ['logo-mark.svg', markSvg()],
  ['logo-square.svg', squareSvg()],
  ['logo-circle.svg', circleSvg()],
  ['logo-horizontal-dark.svg', horizontalLogo()],
  [
    'logo-horizontal-light.svg',
    horizontalLogo({
      background: COLORS.warm,
      wordmarkColor: COLORS.background,
      label: 'CILI 浅色横版标志',
    }),
  ],
  [
    'logo-horizontal-transparent-dark.svg',
    horizontalLogo({
      transparent: true,
      wordmarkColor: COLORS.background,
      label: 'CILI 透明底深色横版标志',
    }),
  ],
  [
    'logo-horizontal-transparent-light.svg',
    horizontalLogo({
      transparent: true,
      wordmarkColor: COLORS.foreground,
      label: 'CILI 透明底反白横版标志',
    }),
  ],
  [
    'logo-monochrome-black.svg',
    horizontalLogo({
      transparent: true,
      wordmarkColor: COLORS.background,
      markTile: COLORS.background,
      markRoute: COLORS.foreground,
      label: 'CILI 黑色单色标志',
    }),
  ],
  [
    'logo-monochrome-white.svg',
    horizontalLogo({
      transparent: true,
      wordmarkColor: COLORS.foreground,
      markTile: COLORS.foreground,
      markRoute: COLORS.background,
      label: 'CILI 白色单色标志',
    }),
  ],
  ['logo-stacked-dark.svg', stackedSvg()],
  ['logo-wordmark-dark.svg', wordmarkSvg({ color: COLORS.background, label: 'CILI 深色字标' })],
  ['logo-wordmark-light.svg', wordmarkSvg({ color: COLORS.foreground, label: 'CILI 反白字标' })],
  ['logo-watermark.svg', watermarkSvg()],
  ['logo-share.svg', shareSvg()],
  ['applications/social-cover.svg', socialCoverSvg()],
  ['applications/presentation-cover.svg', presentationCoverSvg()],
  ['applications/email-signature.svg', emailSignatureSvg()],
  ['applications/business-card.svg', businessCardSvg()],
  ['applications/letterhead-a4.svg', letterheadSvg()],
  ['preview/brand-board.svg', brandBoardSvg()],
  ...Array.from({ length: 8 }, (_, frame) => [
    `loading-${String(frame).padStart(2, '0')}.svg`,
    loadingSvg(frame),
  ]),
]);

const pngJobs = [
  ['logo-square.svg', 'logo-wechat-144.png', 144, 144, '平台', '微信小程序平台头像'],
  ['logo-square.svg', 'logo-square-1024.png', 1024, 1024, '核心', '高清方形 Logo'],
  ['logo-circle.svg', 'logo-circle-144.png', 144, 144, '平台', '圆形头像与圆形裁切场景'],
  ['logo-watermark.svg', 'logo-photo-watermark-360x144.png', 360, 144, '传播', '照片角标与水印'],
  ['logo-share.svg', 'logo-share-500x400.png', 500, 400, '传播', '微信分享卡片'],
  [
    'logo-horizontal-dark.svg',
    'core/logo-horizontal-dark-1200x540.png',
    1200,
    540,
    '核心',
    '暗底横版主标',
  ],
  [
    'logo-horizontal-light.svg',
    'core/logo-horizontal-light-1200x540.png',
    1200,
    540,
    '核心',
    '浅底横版主标',
  ],
  [
    'logo-horizontal-transparent-dark.svg',
    'core/logo-horizontal-transparent-dark-1200x540.png',
    1200,
    540,
    '核心',
    '透明底深色横版主标',
    true,
  ],
  [
    'logo-horizontal-transparent-light.svg',
    'core/logo-horizontal-transparent-light-1200x540.png',
    1200,
    540,
    '核心',
    '透明底反白横版主标',
    true,
  ],
  [
    'logo-stacked-dark.svg',
    'core/logo-stacked-dark-1024x1195.png',
    1024,
    1195,
    '核心',
    '暗底竖版组合标志',
  ],
  [
    'logo-wordmark-dark.svg',
    'core/logo-wordmark-dark-1024x366.png',
    1024,
    366,
    '核心',
    '深色独立字标',
    true,
  ],
  [
    'logo-wordmark-light.svg',
    'core/logo-wordmark-light-1024x366.png',
    1024,
    366,
    '核心',
    '反白独立字标',
    true,
  ],
  [
    'logo-monochrome-black.svg',
    'core/logo-monochrome-black-1200x540.png',
    1200,
    540,
    '核心',
    '黑色单色标志',
    true,
  ],
  [
    'logo-monochrome-white.svg',
    'core/logo-monochrome-white-1200x540.png',
    1200,
    540,
    '核心',
    '白色单色标志',
    true,
  ],
  ['logo-square.svg', 'platform/logo-apple-touch-180.png', 180, 180, '平台', 'Apple Touch Icon'],
  ['logo-square.svg', 'platform/logo-android-192.png', 192, 192, '平台', 'Android 小图标'],
  ['logo-square.svg', 'platform/logo-android-512.png', 512, 512, '平台', 'Android 高清图标'],
  ['logo-square.svg', 'platform/logo-social-avatar-400.png', 400, 400, '平台', '社交媒体头像'],
  ['logo-square.svg', 'platform/favicon-16.png', 16, 16, '平台', '网站 Favicon 16'],
  ['logo-square.svg', 'platform/favicon-32.png', 32, 32, '平台', '网站 Favicon 32'],
  ['logo-square.svg', 'platform/favicon-48.png', 48, 48, '平台', '网站 Favicon 48'],
  ['logo-square.svg', 'platform/favicon-64.png', 64, 64, '平台', '网站 Favicon 64'],
  [
    'applications/social-cover.svg',
    'applications/logo-social-cover-1500x500.png',
    1500,
    500,
    '传播',
    '社交媒体横幅',
  ],
  [
    'applications/presentation-cover.svg',
    'applications/logo-presentation-cover-1920x1080.png',
    1920,
    1080,
    '办公',
    '演示文稿封面',
  ],
  [
    'applications/email-signature.svg',
    'applications/logo-email-signature-1200x360.png',
    1200,
    360,
    '办公',
    '邮件签名模板',
  ],
  [
    'applications/business-card.svg',
    'applications/logo-business-card-1050x600.png',
    1050,
    600,
    '办公',
    '名片模板',
  ],
  [
    'applications/letterhead-a4.svg',
    'applications/logo-letterhead-a4-1240x1754.png',
    1240,
    1754,
    '办公',
    'A4 信纸模板',
  ],
  [
    'preview/brand-board.svg',
    'preview/logo-brand-board-1600x1200.png',
    1600,
    1200,
    '总览',
    'Logo 系统总览板',
  ],
  ...Array.from({ length: 8 }, (_, frame) => [
    `loading-${String(frame).padStart(2, '0')}.svg`,
    `loading-frames/loading-${String(frame).padStart(2, '0')}.png`,
    512,
    512,
    '动效',
    `加载动画第 ${frame + 1} 帧`,
  ]),
];

const pdfJobs = [
  [
    'logo-horizontal-dark.svg',
    'print/logo-horizontal-dark.pdf',
    1200,
    540,
    '印刷',
    '暗底横版矢量 PDF',
  ],
  [
    'logo-horizontal-light.svg',
    'print/logo-horizontal-light.pdf',
    1200,
    540,
    '印刷',
    '浅底横版矢量 PDF',
  ],
  ['preview/brand-board.svg', 'print/logo-brand-board.pdf', 1600, 1200, '印刷', '品牌总览矢量 PDF'],
];

async function ensureDirectories() {
  const directories = [
    SOURCE_ROOT,
    source('applications'),
    source('preview'),
    GENERATED_ROOT,
    generated('core'),
    generated('platform'),
    generated('applications'),
    generated('loading-frames'),
    generated('preview'),
    generated('print'),
  ];
  await Promise.all(directories.map((directory) => mkdir(directory, { recursive: true })));
}

async function renderPng(browser, svg, outputPath, width, height, transparent = false) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  const encoded = Buffer.from(svg).toString('base64');
  await page.setContent(
    `<style>html,body{margin:0;width:${width}px;height:${height}px;overflow:hidden;background:transparent}img{display:block;width:${width}px;height:${height}px}</style><img id="asset" alt="" src="data:image/svg+xml;base64,${encoded}">`,
  );
  await page.locator('#asset').screenshot({ path: outputPath, omitBackground: transparent });
  await page.close();
}

async function renderPdf(browser, svg, outputPath, width, height) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  const encoded = Buffer.from(svg).toString('base64');
  await page.setContent(
    `<style>@page{size:${width}px ${height}px;margin:0}html,body{margin:0;width:${width}px;height:${height}px;overflow:hidden}img{display:block;width:${width}px;height:${height}px}</style><img alt="" src="data:image/svg+xml;base64,${encoded}">`,
  );
  await page.pdf({
    path: outputPath,
    width: `${width}px`,
    height: `${height}px`,
    printBackground: true,
    margin: { top: '0', right: '0', bottom: '0', left: '0' },
  });
  await page.close();
}

function runFfmpeg(args, description) {
  const result = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`${description}失败：${result.stderr || result.stdout}`);
  }
}

async function metadataFor({ outputPath, width, height, group, usage }) {
  const bytes = await readFile(outputPath);
  const file = await stat(outputPath);
  return {
    path: relative(outputPath),
    format: path.extname(outputPath).slice(1).toLowerCase(),
    width,
    height,
    bytes: file.size,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    group,
    usage,
  };
}

async function main() {
  await ensureDirectories();
  for (const [relativePath, svg] of sourceAssets) {
    await writeFile(source(relativePath), svg);
  }

  const browser = await chromium.launch({ headless: true });
  const manifestAssets = [];
  try {
    for (const [
      sourcePath,
      outputPath,
      width,
      height,
      group,
      usage,
      transparent = false,
    ] of pngJobs) {
      const svg = sourceAssets.get(sourcePath);
      if (!svg) throw new Error(`未知 SVG 源稿：${sourcePath}`);
      const target = generated(outputPath);
      await renderPng(browser, svg, target, width, height, transparent);
      manifestAssets.push(await metadataFor({ outputPath: target, width, height, group, usage }));
    }
    for (const [sourcePath, outputPath, width, height, group, usage] of pdfJobs) {
      const svg = sourceAssets.get(sourcePath);
      const target = generated(outputPath);
      await renderPdf(browser, svg, target, width, height);
      manifestAssets.push(await metadataFor({ outputPath: target, width, height, group, usage }));
    }
  } finally {
    await browser.close();
  }

  runFfmpeg(
    [
      '-framerate',
      '9.09',
      '-i',
      generated('loading-frames/loading-%02d.png'),
      '-filter_complex',
      '[0:v]split[s0][s1];[s0]palettegen=max_colors=64[p];[s1][p]paletteuse=dither=bayer',
      '-loop',
      '0',
      generated('logo-loading-512.gif'),
    ],
    '加载 GIF 导出',
  );
  manifestAssets.push(
    await metadataFor({
      outputPath: generated('logo-loading-512.gif'),
      width: 512,
      height: 512,
      group: '动效',
      usage: '8 帧循环加载动画，110ms/帧',
    }),
  );

  runFfmpeg(
    ['-i', generated('platform/favicon-64.png'), generated('platform/favicon.ico')],
    'Favicon ICO 导出',
  );
  manifestAssets.push(
    await metadataFor({
      outputPath: generated('platform/favicon.ico'),
      width: 64,
      height: 64,
      group: '平台',
      usage: '网站 ICO Favicon',
    }),
  );

  // Preserve the historical app-icon alias consumed by release documentation.
  const appIconAlias = generated('platform/logo-app-icon-1024.png');
  await copyFile(generated('logo-square-1024.png'), appIconAlias);
  manifestAssets.push(
    await metadataFor({
      outputPath: appIconAlias,
      width: 1024,
      height: 1024,
      group: '平台',
      usage: '应用商店与发布平台高清图标',
    }),
  );

  const manifest = {
    schemaVersion: 3,
    brand: 'CILI',
    version: 3,
    direction: '路线环图标 + CILI slab-mono 字标',
    colors: {
      background: '#211F1C',
      foreground: '#FFFFFF',
      accent: '#E13B2B',
      warm: '#F7F4F2',
      muted: '#B8B3BA',
    },
    responsiveRule: '横向空间小于完整字标最小宽度时，只展示路线环图标。',
    sources: [...sourceAssets.keys()].map((relativePath) => relative(source(relativePath))),
    assets: manifestAssets.sort((left, right) => left.path.localeCompare(right.path)),
  };
  await writeFile(path.join(BRAND_ROOT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(
    `Generated ${sourceAssets.size} SVG sources and ${manifestAssets.length} deliverables.`,
  );
}

await main();
