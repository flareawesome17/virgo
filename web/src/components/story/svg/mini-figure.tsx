import { CHAPTER_STARS, STARS, starRadius } from '../data/constellation';
import { chartBox, figurePath, U } from './chart';

/**
 * B11: the desktop progress figure (storyboard §1.9). A small Virgo, aria-hidden,
 * that lights one star per chapter in Appendix B's order: η for Ch1 through
 * 109 Vir for Ch10, then Syrma (ι) for the Finale. Syrma is a hollow socket,
 * and its two segments are missing, until `lit` reaches the Finale.
 *
 * Static: Phase 4 changes `lit` (or flips each star's `data-lit` in place).
 */
export function MiniFigure({ lit, className = '' }: { /** How many chapter stars are lit, 0..11. */ lit: number; className?: string }) {
  const box = chartBox(5);
  const on = new Set(CHAPTER_STARS.slice(0, Math.max(0, Math.min(CHAPTER_STARS.length, lit))));
  const syrmaLit = on.has('iota');
  return (
    <svg aria-hidden="true" focusable="false" viewBox={box.attr} className={`block h-auto w-full ${className}`} data-part="mini-figure">
      <path d={figurePath(syrmaLit)} fill="none" stroke="#F0C88E" strokeOpacity={0.32} strokeWidth={0.7} strokeLinecap="round" />
      {STARS.map((s) => {
        const isLit = on.has(s.id);
        const r = starRadius(s.mag, 1.1, 2.2);
        const cx = +(s.x * U).toFixed(2);
        const cy = +(s.y * U).toFixed(2);
        if (s.id === 'iota' && !isLit) {
          return <circle key={s.id} data-star={s.id} cx={cx} cy={cy} r={1.6} fill="none" stroke="#F0C88E" strokeOpacity={0.55} strokeWidth={0.5} />;
        }
        return (
          <g key={s.id} data-star={s.id} data-lit={isLit ? '' : undefined}>
            {isLit && <circle cx={cx} cy={cy} r={r * 2.6} fill="#F0C88E" opacity={0.22} />}
            <circle cx={cx} cy={cy} r={r} fill={isLit ? '#FFF1DC' : '#BCADA3'} opacity={isLit ? 1 : 0.45} />
          </g>
        );
      })}
    </svg>
  );
}
