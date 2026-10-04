/**
 * B2: the star sprites. Drawn once at runtime (no files): three sizes in two
 * tints, plus one soft glow, each a radial gradient on its own small
 * OffscreenCanvas. Every star on the page is a `drawImage` of one of these,
 * so nothing ever needs shadowBlur or a filter (storyboard §1.3).
 */

export type Surface = OffscreenCanvas | HTMLCanvasElement;
export type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export type SpriteSet = {
  /** [tint][size]: tint 0 warm white, 1 gold; size 0 small, 1 medium, 2 large. */
  readonly star: readonly (readonly Surface[])[];
  /** A wide, soft halo for the star in focus and the Ch8 clusters. */
  readonly glow: Surface;
  /** The device-pixel sizes the star sprites were drawn at. */
  readonly px: readonly number[];
};

/** Core colours: warm white and the page's gold. */
const TINTS = [
  [255, 243, 226],
  [244, 201, 140],
] as const;

/** A drawing surface off the page: an OffscreenCanvas where there is one, else a detached canvas. */
export function surface(w: number, h = w): Surface {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Its 2D context (narrowed per type, since the two getContext signatures do not unify). */
export function context(s: Surface): Ctx | null {
  return typeof OffscreenCanvas !== 'undefined' && s instanceof OffscreenCanvas ? s.getContext('2d') : (s as HTMLCanvasElement).getContext('2d');
}

function paint(size: number, stops: readonly (readonly [number, string])[]): Surface {
  const c = surface(size);
  const g = context(c);
  if (!g) return c;
  const r = size / 2;
  const grad = g.createRadialGradient(r, r, 0, r, r, r);
  for (const [at, colour] of stops) grad.addColorStop(at, colour);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return c;
}

/**
 * Sprites for a device pixel ratio. A star's bright core is about a quarter
 * of its sprite, white at the centre and tinted at its edge; the rest is
 * falloff, so stars overlap softly and read as points of light, not discs.
 */
export function makeSprites(dpr: number): SpriteSet {
  const scale = Math.min(2, Math.max(1, dpr));
  const px = [16, 32, 64].map((s) => Math.round(s * scale));
  const star = TINTS.map(([r, g, b]) =>
    px.map((size) =>
      paint(size, [
        [0, 'rgba(255,255,255,1)'],
        [0.12, `rgba(${r},${g},${b},0.94)`],
        [0.28, `rgba(${r},${g},${b},0.44)`],
        [0.55, `rgba(${r},${g},${b},0.1)`],
        [1, `rgba(${r},${g},${b},0)`],
      ]),
    ),
  );
  const glow = paint(Math.round(128 * scale), [
    [0, 'rgba(255,228,196,0.5)'],
    [0.2, 'rgba(244,201,140,0.24)'],
    [0.5, 'rgba(209,138,90,0.07)'],
    [1, 'rgba(209,138,90,0)'],
  ]);
  return { star, glow, px };
}

/** Which sprite size suits a star drawn `css` pixels wide. */
export function sizeIndex(css: number): 0 | 1 | 2 {
  return css <= 6 ? 0 : css <= 14 ? 1 : 2;
}
