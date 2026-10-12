import type { QrCode } from './qrcode';

export interface QrRenderPlan {
  /** Device-pixel canvas edge length. */
  readonly pixelSize: number;
  /** Edge length of a single module in device pixels (integer for crisp edges). */
  readonly modulePixels: number;
  /** Quiet-zone offset in device pixels on each side. */
  readonly offset: number;
}

/**
 * Compute a crisp render plan: integer module size plus a 4-module quiet zone,
 * fitted into the requested CSS size at the given pixel ratio. Pure function so
 * the sizing math is unit-testable without a canvas.
 */
export function planQrRender(code: QrCode, cssSize: number, pixelRatio: number): QrRenderPlan {
  const ratio = pixelRatio > 0 ? pixelRatio : 1;
  const target = Math.max(1, Math.floor(cssSize * ratio));
  const quietModules = 4;
  const totalModules = code.size + quietModules * 2;
  const modulePixels = Math.max(1, Math.floor(target / totalModules));
  const drawn = modulePixels * totalModules;
  const offset = modulePixels * quietModules + Math.floor((target - drawn) / 2);
  return { pixelSize: target, modulePixels, offset };
}

interface CanvasLikeContext {
  fillStyle: string;
  fillRect(x: number, y: number, w: number, h: number): void;
}

/** Draw a QR matrix onto a 2d canvas context using the given plan. */
export function drawQrCode(
  ctx: CanvasLikeContext,
  code: QrCode,
  plan: QrRenderPlan,
  colors: { dark: string; light: string } = { dark: '#10120f', light: '#ffffff' },
): void {
  ctx.fillStyle = colors.light;
  ctx.fillRect(0, 0, plan.pixelSize, plan.pixelSize);
  ctx.fillStyle = colors.dark;
  for (let row = 0; row < code.size; row += 1) {
    for (let col = 0; col < code.size; col += 1) {
      if (!code.modules[row][col]) continue;
      ctx.fillRect(
        plan.offset + col * plan.modulePixels,
        plan.offset + row * plan.modulePixels,
        plan.modulePixels,
        plan.modulePixels,
      );
    }
  }
}
