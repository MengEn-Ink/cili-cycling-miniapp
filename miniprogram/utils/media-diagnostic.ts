import { CLIENT_RELEASE_VERSION } from '../config/release';

export type MediaDiagnosticDetail = Record<string, boolean | number | string | undefined>;

/**
 * 图片诊断只记录页面、阶段和地址类型，不记录 URL、fileId 或用户信息。
 * 版本号与设置页最新日志共用同一常量，便于开发者工具和真机日志确认代码版本。
 */
export function reportMediaDiagnostic(
  scope: string,
  event: string,
  detail: MediaDiagnosticDetail = {},
) {
  console.info(`[此里媒体][${CLIENT_RELEASE_VERSION}]`, { scope, event, ...detail });
}

export function mediaSourceKind(url: string): 'local' | 'https' | 'cloud' | 'unknown' {
  if (/^(?:wxfile|http):\/\//i.test(url)) return 'local';
  if (/^https:\/\//i.test(url)) return 'https';
  if (/^cloud:\/\//i.test(url)) return 'cloud';
  return 'unknown';
}
