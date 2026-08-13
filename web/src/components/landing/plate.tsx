import { cn } from '@/lib/utils';

/**
 * The page's stand-in for a photograph.
 *
 * There is no photography on this site on purpose: product screenshots go
 * stale the first time the UI moves, and real client work cannot be published.
 * What stood in for it was a flat two-stop gradient rectangle, which does not
 * read as a decision — it reads as an image that failed to load, on a page
 * selling to photographers.
 *
 * A plate is the same abstraction committed to instead of apologised for:
 * brand-toned, grained, vignetted, indexed like a print. The variance is
 * deterministic from `seed` rather than random, because a server render and a
 * client render that disagree is a hydration error.
 */
const TONES = [
  ['#c17745', '#5b7b9a'],
  ['#b66a40', '#6b8e4e'],
  ['#8b5e3c', '#c17745'],
  ['#5b7b9a', '#b66a40'],
  ['#6b8e4e', '#8b5e3c'],
] as const;

export function Plate({
  seed = 0,
  label,
  index,
  className,
  children,
  'aria-hidden': ariaHidden,
}: {
  /** Picks the tone pair and the bloom position. Same seed, same plate. */
  seed?: number;
  /** A mono caption, bottom-left. Omit for a bare plate. */
  label?: string;
  /** A mono index, top-right, e.g. "04". */
  index?: string;
  className?: string;
  children?: React.ReactNode;
  /** For a plate used purely as a backdrop behind other content. */
  'aria-hidden'?: boolean;
}) {
  const [a, b] = TONES[seed % TONES.length];
  // Spread across the plate rather than clustered, so a grid does not end up
  // with every bloom in the same corner.
  const x = 18 + ((seed * 37) % 60);
  const y = 12 + ((seed * 53) % 55);
  const angle = 105 + ((seed * 29) % 110);

  return (
    <div
      aria-hidden={ariaHidden}
      className={cn('plate plate-ring', className)}
      style={
        {
          '--plate-a': a,
          '--plate-b': b,
          '--plate-x': `${x}%`,
          '--plate-y': `${y}%`,
          '--plate-angle': `${angle}deg`,
        } as React.CSSProperties
      }
    >
      {index && (
        <span className="figure absolute right-2.5 top-2 z-10 text-[10px] font-semibold text-white/45">
          {index}
        </span>
      )}
      {label && (
        <span className="figure absolute bottom-2 left-2.5 z-10 text-[10px] font-semibold uppercase text-white/55">
          {label}
        </span>
      )}
      {children}
    </div>
  );
}
