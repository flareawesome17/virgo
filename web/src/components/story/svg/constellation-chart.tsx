import { CAST_STARS, STARS, starRadius, type StarId } from '../data/constellation';
import { CAST } from '../data/story';
import { chartBox, figurePath, percentIn, U } from './chart';

type Side = 'above' | 'below' | 'left' | 'right' | 'below-right';

/**
 * Where each name sits against its star, so neighbours never collide, down
 * to a 320 px chart. Zaniah goes below and to the right, clear of Porrima.
 */
const NAME_SIDE: Record<StarId, Side> = {
  alpha: 'below',
  beta: 'right',
  gamma: 'below',
  delta: 'left',
  epsilon: 'above',
  zeta: 'below',
  eta: 'below-right',
  theta: 'right',
  iota: 'below',
  mu: 'above',
  nu: 'above',
  omicron: 'above',
  tau: 'above',
  '109': 'below',
};

/** The cast's longer labels ("Ernie · Porrima"): Porrima's goes right, so it never meets Heze's. */
const CAST_SIDE: Partial<Record<StarId, Side>> = { alpha: 'below', gamma: 'below-right', epsilon: 'above', zeta: 'below' };

const PLACE: Record<Side, string> = {
  above: '-translate-x-1/2 -translate-y-[calc(100%+0.55em)]',
  below: '-translate-x-1/2 translate-y-[0.55em]',
  left: '-translate-x-[calc(100%+0.7em)] -translate-y-1/2',
  right: 'translate-x-[0.7em] -translate-y-1/2',
  'below-right': 'translate-x-[0.45em] translate-y-[0.5em]',
};

const WHO = new Map<StarId, string>(
  (Object.entries(CAST_STARS) as [keyof typeof CAST, StarId][]).map(([who, id]) => [id, CAST[who].first]),
);

/**
 * B6: Virgo as a static chart, for reduced motion (Ch3's 13-star figure,
 * the Finale's full 14) and anywhere a still is wanted. The figure is one
 * path; Syrma is a hollow socket and its two segments are absent unless
 * `syrma` is lit. Labels are HTML laid over the SVG, so they keep their
 * pixel size (never under 11 px) at any width.
 *
 * - `labels="cast"`: "Mika · Spica", "Ernie · Porrima", "Kenn · Vindemiatrix", "Bea · Heze".
 * - `labels="names"`: every star's name or designation.
 *
 * aria-hidden: the figure's caption carries the cast-to-star mapping.
 */
export function ConstellationChart({
  syrma = false,
  labels = 'none',
  className = '',
}: {
  syrma?: boolean;
  labels?: 'none' | 'cast' | 'names';
  className?: string;
}) {
  const box = chartBox(8);
  const shown = STARS.filter((s) => (labels === 'cast' ? WHO.has(s.id) : labels === 'names'));
  return (
    <div
      aria-hidden="true"
      data-part="constellation-chart"
      className={`relative w-full ${className}`}
      style={{ aspectRatio: `${box.width} / ${box.height.toFixed(2)}` }}
    >
      <svg viewBox={box.attr} focusable="false" className="absolute inset-0 h-full w-full overflow-visible">
        <path
          d={figurePath(syrma)}
          fill="none"
          stroke="#F0C88E"
          strokeOpacity={0.6}
          strokeWidth={1.25}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        {STARS.map((s) => {
          const cx = +(s.x * U).toFixed(2);
          const cy = +(s.y * U).toFixed(2);
          const r = starRadius(s.mag, 0.75, 1.9);
          if (s.id === 'iota' && !syrma) {
            return (
              <circle
                key={s.id}
                data-star={s.id}
                cx={cx}
                cy={cy}
                r={1.5}
                fill="none"
                stroke="#F0C88E"
                strokeOpacity={0.6}
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
            );
          }
          const cast = WHO.has(s.id);
          return (
            <g key={s.id} data-star={s.id}>
              <circle cx={cx} cy={cy} r={r * (cast ? 3.4 : 2.6)} fill="#F0C88E" opacity={cast ? 0.2 : 0.1} />
              <circle cx={cx} cy={cy} r={r} fill={cast ? '#FFE9C9' : '#F7EFE6'} />
            </g>
          );
        })}
      </svg>
      {shown.map((s) => {
        const at = percentIn(box, s);
        // "names" labels every star by its own name; only "cast" puts a person beside a star.
        const who = labels === 'cast' ? WHO.get(s.id) : undefined;
        return (
          <span
            key={s.id}
            className={`absolute font-mono text-[11px] leading-none whitespace-nowrap tracking-[0.04em] sm:text-xs ${PLACE[(who && CAST_SIDE[s.id]) || NAME_SIDE[s.id]]} ${who ?'text-[#F2EDE8]' : 'text-[#BCADA3]'}`}
            style={at}
          >
            {who ? `${who} · ${s.label}` : s.label}
          </span>
        );
      })}
    </div>
  );
}
