/**
 * How big deep space's two textures are (space.ts), in one small module the
 * main chunk can read without loading space.ts itself: the map layers
 * (map-layer.tsx) take these device pixels off their own budget, so the sky's
 * layer memory stays inside the budget the iPhone fix set rather than on top
 * of it.
 *
 * Zero-import, so it loads under plain Node for check-engine.mjs too.
 */

/** The sky-plane rectangle the glow panorama covers, in degrees: a is heading (right), b is elevation (up). */
export const PANORAMA = { a0: -150, a1: 190, b0: -185, b1: 135 } as const;

/** Panorama texels per sky-plane degree: soft content, scaled up on screen. */
export const PANORAMA_TEXELS = { desktop: 2, mobile: 1.5 } as const;

/** The far-star tile, CSS px square, drawn at the engine's DPR. */
export const TILE_CSS = 512;

/** The engine's DPR rule (engine.ts `resize`), for a viewport. Phones (under 768 px) at most 1.5; desktop at most 2 and 8 M device px. */
export function skyDpr(w: number, h: number, device: number): number {
  return w < 768 ? Math.min(device, 1.5) : Math.min(device, 2, Math.sqrt(8e6 / Math.max(1, w * h)));
}

/** The panorama's size in texels for a variant. */
export function panoramaSize(variant: 'desktop' | 'mobile'): { width: number; height: number; texels: number } {
  const texels = PANORAMA_TEXELS[variant];
  return {
    width: Math.round((PANORAMA.a1 - PANORAMA.a0) * texels),
    height: Math.round((PANORAMA.b1 - PANORAMA.b0) * texels),
    texels,
  };
}

/** The tile's side in device pixels at a DPR (never above 2). */
export function tileSize(dpr: number): number {
  return Math.round(TILE_CSS * Math.min(2, Math.max(1, dpr)));
}

/**
 * Device pixels deep space holds for a viewport: the panorama plus the tile.
 * Lite devices draw no deep space, so they hold none.
 */
export function spacePixels(w: number, h: number, device: number, lite = false): number {
  if (lite) return 0;
  const variant = w < 768 ? 'mobile' : 'desktop';
  const pan = panoramaSize(variant);
  const tile = tileSize(skyDpr(w, h, device));
  return pan.width * pan.height + tile * tile;
}
