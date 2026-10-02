import type { ReactNode } from 'react';

/**
 * The depth every stage shares (storyboard §1.13).
 *
 * One perspective per stage, never per slab: everything inside a stage is
 * seen from the same eye, so two phones side by side converge on the same
 * vanishing point instead of each having its own. 900 px on phones, 1200 px
 * from `md` up — the wider the stage, the further back the eye has to sit
 * for the same tilt to read as the same tilt.
 *
 * CSS perspective reaches only direct children, so this is for scenes whose
 * pieces sit directly inside it (cards fanned back on z, a calendar lying
 * back like a desk). A lone `Slab` carries the same values itself and needs
 * no wrapper. The value is also exposed as `--story-p` (unitless).
 */
export const PERSPECTIVE = { mobile: 900, desktop: 1200 } as const;

/** The most a slab may turn, per §1.13. Phase 4 clamps its transforms to these. */
export const MAX_TILT = { mobile: 10, desktop: 18 } as const;

export function Perspective({
  children,
  className = '',
  origin = '50% 45%',
}: {
  children: ReactNode;
  /** Layout classes for the stage. */
  className?: string;
  /** Where the eye sits, as a CSS `perspective-origin`. */
  origin?: string;
}) {
  return (
    <div
      data-part="perspective"
      className={`[--story-p:900] [perspective:calc(var(--story-p)*1px)] md:[--story-p:1200] ${className}`}
      style={{ perspectiveOrigin: origin }}
    >
      {children}
    </div>
  );
}
