export interface MiniProgramAppConfig {
  pages?: string[];
  subpackages?: Array<{ root?: string; pages?: string[] }>;
  subPackages?: Array<{ root?: string; pages?: string[] }>;
}

const normalizeRoutePart = (value: unknown) =>
  String(value || '')
    .replace(/^\/+|\/+$/g, '')
    .replace(/\/{2,}/g, '/');

export function expandAppRoutes(appConfig: MiniProgramAppConfig): string[] {
  const mainPages = Array.isArray(appConfig.pages) ? appConfig.pages : [];
  const subpackages = Array.isArray(appConfig.subpackages)
    ? appConfig.subpackages
    : Array.isArray(appConfig.subPackages)
      ? appConfig.subPackages
      : [];
  return [
    ...mainPages.map(normalizeRoutePart),
    ...subpackages.flatMap((subpackage) =>
      (Array.isArray(subpackage.pages) ? subpackage.pages : []).map((page) =>
        [normalizeRoutePart(subpackage.root), normalizeRoutePart(page)].filter(Boolean).join('/'),
      ),
    ),
  ];
}
