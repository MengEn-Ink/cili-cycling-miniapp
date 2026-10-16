const FALLBACK_STATUS_BAR_HEIGHT_PX = 24;
const BRAND_ROW_OFFSET_PX = 16;

export function customNavigationTopPx(): number {
  const platform = typeof wx === 'undefined' ? undefined : wx;
  const windowInfo = platform?.getWindowInfo?.();
  const legacyInfo = windowInfo ? undefined : platform?.getSystemInfoSync?.();
  const statusBarHeight = Number(windowInfo?.statusBarHeight ?? legacyInfo?.statusBarHeight);
  const safeStatusBarHeight =
    Number.isFinite(statusBarHeight) && statusBarHeight > 0
      ? statusBarHeight
      : FALLBACK_STATUS_BAR_HEIGHT_PX;
  return safeStatusBarHeight + BRAND_ROW_OFFSET_PX;
}
