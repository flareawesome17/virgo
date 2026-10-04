import type { CSSProperties, ReactNode } from 'react';

/**
 * The story's stand-in for a photograph (storyboard B7).
 *
 * Copied from `components/landing/plate.tsx` (left untouched) without `cn`,
 * plus what the story needs: fixed aspects, and a `lite` variant for grids.
 * A plate is abstract on purpose — two brand stops, an off-centre bloom,
 * grain and a vignette — because the page shows no client work and no
 * people. Everything varies with `seed` and nothing else, so the server and
 * any later render agree.
 *
 * - `full` is the landing page's plate: the `.plate` classes in globals.css,
 *   whose grain sits on an overlay blend. Use it for a few large plates.
 * - `lite` is one element with four background layers and no pseudo
 *   elements, no blend mode, no filter: the grain is a tiny SVG tile baked
 *   into a data URI (rasterised once, then tiled) carrying its own alpha, so
 *   it needs no blend. Use it wherever plates repeat — album grids, film
 *   frames, a client page — and wherever plates move.
 *
 * Parts: plate (data-seed), plate-label, plate-index.
 */

export const PLATE_TONES = [
  ['#c17745', '#5b7b9a'],
  ['#b66a40', '#6b8e4e'],
  ['#8b5e3c', '#c17745'],
  ['#5b7b9a', '#b66a40'],
  ['#6b8e4e', '#8b5e3c'],
] as const;

export type PlateAspect = '1:1' | '4:5' | '3:2' | '16:9' | 'fill';
export type PlateVariant = 'full' | 'lite';

const ASPECT: Record<PlateAspect, string> = {
  '1:1': 'aspect-square',
  '4:5': 'aspect-[4/5]',
  '3:2': 'aspect-[3/2]',
  '16:9': 'aspect-video',
  fill: 'size-full',
};

/** A plate's look for a seed: the same numbers the landing plate uses. */
export function plateLook(seed: number) {
  const s = Math.abs(Math.trunc(seed));
  const [a, b] = PLATE_TONES[s % PLATE_TONES.length];
  // Spread across the plate rather than clustered, so a grid does not end up
  // with every bloom in the same corner.
  return {
    a,
    b,
    x: 18 + ((s * 37) % 60),
    y: 12 + ((s * 53) % 55),
    angle: 105 + ((s * 29) % 110),
  };
}

/**
 * The grain tile: white specks where the noise is high, dark ones where it
 * is low, each with its alpha baked in. 128 px, tiled.
 */
const GRAIN_SIZE = 128;
const GRAIN = `url("data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='${GRAIN_SIZE}' height='${GRAIN_SIZE}'>` +
    `<filter id='w' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='0.86' numOctaves='2' seed='7' stitchTiles='stitch'/>` +
    `<feColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0.55 0 0 0 -0.3'/></filter>` +
    `<filter id='k' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='0.86' numOctaves='2' seed='31' stitchTiles='stitch'/>` +
    `<feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -0.7 0 0 0 0.33'/></filter>` +
    `<rect width='100%' height='100%' filter='url(#w)'/><rect width='100%' height='100%' filter='url(#k)'/></svg>`,
)}")`;

/** Hex alpha for 0–1, so the lite layers need no color-mix. */
const alpha = (a: number) =>
  Math.round(a * 255)
    .toString(16)
    .padStart(2, '0');

/** The lite plate's background, for anything that wants to paint one itself. */
export function litePlateStyle(seed: number): CSSProperties {
  const { a, b, x, y, angle } = plateLook(seed);
  const s = Math.abs(Math.trunc(seed));
  return {
    backgroundColor: '#17130f',
    backgroundImage: [
      GRAIN,
      'radial-gradient(120% 120% at 50% 40%, rgba(0,0,0,0) 45%, rgba(0,0,0,0.5))',
      `radial-gradient(115% 95% at ${x}% ${y}%, ${a}${alpha(0.62)}, ${a}00 72%)`,
      `linear-gradient(${angle}deg, ${a}${alpha(0.26)}, ${b}${alpha(0.2)})`,
    ].join(', '),
    backgroundSize: `${GRAIN_SIZE}px ${GRAIN_SIZE}px, auto, auto, auto`,
    backgroundPosition: `${(s * 37) % GRAIN_SIZE}px ${(s * 71) % GRAIN_SIZE}px, 0 0, 0 0, 0 0`,
    boxShadow: 'inset 0 0 0 1px rgb(255 255 255 / 0.07)',
  };
}

export function Plate({
  seed = 0,
  aspect = '1:1',
  variant = 'lite',
  label,
  index,
  className = '',
  children,
}: {
  /** Picks the tone pair and the bloom position. Same seed, same plate. */
  seed?: number;
  /** 'fill' takes the parent's box. */
  aspect?: PlateAspect;
  variant?: PlateVariant;
  /** A mono caption, bottom-left. Omit for a bare plate. */
  label?: string;
  /** A mono index, top-right, e.g. "04". */
  index?: string;
  /** Radius, width, placement. */
  className?: string;
  children?: ReactNode;
}) {
  const look = plateLook(seed);
  const full = variant === 'full';

  return (
    <div
      aria-hidden
      data-part="plate"
      data-seed={seed}
      className={`${full ? 'plate plate-ring' : 'relative overflow-hidden'} ${ASPECT[aspect]} ${className}`}
      style={
        full
          ? ({
              '--plate-a': look.a,
              '--plate-b': look.b,
              '--plate-x': `${look.x}%`,
              '--plate-y': `${look.y}%`,
              '--plate-angle': `${look.angle}deg`,
            } as CSSProperties)
          : litePlateStyle(seed)
      }
    >
      {index && (
        <span
          data-part="plate-index"
          className="figure absolute right-2.5 top-2 z-10 text-[11px] font-semibold text-white/50"
        >
          {index}
        </span>
      )}
      {label && (
        <span
          data-part="plate-label"
          className="figure absolute bottom-2 left-2.5 z-10 text-[11px] font-semibold uppercase text-white/60"
        >
          {label}
        </span>
      )}
      {children}
    </div>
  );
}
