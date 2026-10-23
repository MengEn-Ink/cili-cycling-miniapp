const FALLBACK_STATUS_BAR_HEIGHT_PX = 24;
const CUSTOM_NAVIGATION_ROW_HEIGHT_PX = 44;

export function customNavigationTopPx(): number {
  const platform = typeof wx === 'undefined' ? undefined : wx;
  const windowInfo = platform?.getWindowInfo?.();
  const legacyInfo = windowInfo ? undefined : platform?.getSystemInfoSync?.();
  const statusBarHeight = Number(windowInfo?.statusBarHeight ?? legacyInfo?.statusBarHeight);
  const safeStatusBarHeight =
    Number.isFinite(statusBarHeight) && statusBarHeight > 0
      ? statusBarHeight
      : FALLBACK_STATUS_BAR_HEIGHT_PX;
  return safeStatusBarHeight + CUSTOM_NAVIGATION_ROW_HEIGHT_PX;
}
