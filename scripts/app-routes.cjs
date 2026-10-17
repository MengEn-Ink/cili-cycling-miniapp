function normalizeRoutePart(value) {
  return String(value || '')
    .replace(/^\/+|\/+$/g, '')
    .replace(/\/{2,}/g, '/');
}

function expandAppRoutes(appConfig) {
  const mainPages = Array.isArray(appConfig?.pages) ? appConfig.pages : [];
  const subpackages = Array.isArray(appConfig?.subpackages)
    ? appConfig.subpackages
    : Array.isArray(appConfig?.subPackages)
      ? appConfig.subPackages
      : [];
  const subpackagePages = subpackages.flatMap((subpackage) => {
    const root = normalizeRoutePart(subpackage?.root);
    const pages = Array.isArray(subpackage?.pages) ? subpackage.pages : [];
    return pages.map((page) => [root, normalizeRoutePart(page)].filter(Boolean).join('/'));
  });
  return [...mainPages.map(normalizeRoutePart), ...subpackagePages];
}

module.exports = { expandAppRoutes };
