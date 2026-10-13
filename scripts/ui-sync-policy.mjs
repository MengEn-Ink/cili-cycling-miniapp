import { createHash } from 'node:crypto';

const UI_PATH = /^miniprogram\/(?:app\.(?:json|wxss)|(?:pages|components|assets)\/)/;
const IMMEDIATE_PATH =
  /^miniprogram\/(?:app\.(?:json|wxss)|assets\/brand\/|components\/brand-logo\/)/;

export function classifyUiPath(file) {
  return {
    ui: UI_PATH.test(file),
    immediate: IMMEDIATE_PATH.test(file),
  };
}

export function evaluateUiSyncPolicy({
  uiCommits,
  ageDays,
  immediateFiles = [],
  strict = false,
  maxUiCommits = 4,
  maxAgeDays = 7,
}) {
  const remaining = Math.max(0, maxUiCommits - uiCommits);

  if (uiCommits === 0) {
    return {
      ok: true,
      remaining: maxUiCommits,
      reason: '当前没有未同步 UI 提交',
    };
  }
  if (strict) {
    return {
      ok: false,
      remaining,
      reason: '发布严格模式要求 UI 零漂移',
    };
  }
  if (immediateFiles.length > 0) {
    return {
      ok: false,
      remaining,
      reason: `即时同步文件存在：${immediateFiles.join(', ')}`,
    };
  }
  if (uiCommits > maxUiCommits) {
    return {
      ok: false,
      remaining,
      reason: `已有 ${uiCommits} 个未同步 UI 提交，超过最多 ${maxUiCommits} 个的预算`,
    };
  }
  if (ageDays > maxAgeDays) {
    return {
      ok: false,
      remaining,
      reason: `距离上次同步已 ${ageDays} 天，超过 ${maxAgeDays} 天上限`,
    };
  }
  return {
    ok: true,
    remaining,
    reason: 'UI 漂移仍在预算内',
  };
}

export function routeIdFromPagePath(pagePath) {
  const route = pagePath.replace(/^pages\//, '').replace(/\/index$/, '');
  return route.startsWith('admin/') ? `admin-${route.slice('admin/'.length)}` : route;
}

export function digestFiles(files) {
  const hash = createHash('sha256');
  for (const [file, content] of [...files].sort(([left], [right]) => left.localeCompare(right))) {
    hash.update(`${file}\0`);
    hash.update(content);
    hash.update('\0');
  }
  return `sha256:${hash.digest('hex')}`;
}

export function validatePng(buffer, file) {
  if (buffer.length < 24 || buffer.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
    throw new Error(`无效 PNG：${file}`);
  }
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (!width || !height) throw new Error(`PNG 尺寸无效：${file}`);
  return { width, height };
}

export function validateManifest(manifest, { appPages, readEvidence }) {
  if (manifest.schemaVersion !== 1) throw new Error('同步清单 schemaVersion 必须为 1');
  if (!/^[0-9a-f]{40}$/.test(manifest.syncedThrough || '')) {
    throw new Error('同步清单 syncedThrough 必须是完整 Git SHA');
  }
  if (!Number.isFinite(Date.parse(manifest.syncedAt))) {
    throw new Error('同步清单 syncedAt 必须是有效 ISO 时间');
  }
  if (!/^sha256:[0-9a-f]{64}$/.test(manifest.source?.digest || '')) {
    throw new Error('同步清单 source.digest 无效');
  }
  if (!/^sha256:[0-9a-f]{64}$/.test(manifest.prototype?.digest || '')) {
    throw new Error('同步清单 prototype.digest 无效');
  }

  const routes = Array.isArray(manifest.routes) ? manifest.routes : [];
  const routePaths = routes.map((route) => route.pagePath);
  const routeIds = routes.map((route) => route.id);
  const expectedPaths = [...appPages].sort();
  const actualPaths = [...routePaths].sort();
  if (
    expectedPaths.length !== actualPaths.length ||
    expectedPaths.some((pagePath, index) => pagePath !== actualPaths[index])
  ) {
    throw new Error(
      `路由映射不完整：期望 ${expectedPaths.join(', ')}；实际 ${actualPaths.join(', ')}`,
    );
  }
  if (
    new Set(routePaths).size !== routePaths.length ||
    new Set(routeIds).size !== routeIds.length
  ) {
    throw new Error('同步清单存在重复路由');
  }
  for (const route of routes) {
    if (route.id !== routeIdFromPagePath(route.pagePath)) {
      throw new Error(`路由 id 与页面路径不匹配：${route.id} -> ${route.pagePath}`);
    }
  }

  const evidence = manifest.evidence;
  if (!evidence?.directory || !Array.isArray(evidence.routes) || evidence.routes.length === 0) {
    throw new Error('同步清单必须至少包含一组视觉证据');
  }
  const knownRouteIds = new Set(routeIds);
  const evidenceRouteIds = new Set();
  for (const route of evidence.routes) {
    if (!knownRouteIds.has(route.id)) throw new Error(`证据引用未知路由：${route.id}`);
    if (evidenceRouteIds.has(route.id)) throw new Error(`证据路由重复：${route.id}`);
    evidenceRouteIds.add(route.id);
    for (const side of ['devtools', 'pages']) {
      const file = route[side];
      if (!file || file.includes('/') || file.includes('\\')) {
        throw new Error(`证据文件名无效：${route.id}.${side}`);
      }
      const path = `${evidence.directory}/${file}`;
      let buffer;
      try {
        buffer = readEvidence(path);
      } catch {
        throw new Error(`证据文件缺失：${path}`);
      }
      validatePng(buffer, path);
    }
  }

  return { routes: routes.length, evidenceRoutes: evidence.routes.length };
}
