const UI_PATH =
  /^miniprogram\/(?:app\.(?:json|wxss)|(?:pages|components|assets)\/)/;
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
