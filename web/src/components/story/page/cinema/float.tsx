import type { CSSProperties, ReactNode } from 'react';

/**
 * The idle float (05-cinema.md §1.10): a card on screen is never still. It
 * bobs and tilts slightly in 3D, on its own rhythm, like a slab hanging in
 * the air. A wrapper of its own, so the CSS animation never fights the
 * camera's transforms on the element around it. Runs only while the story
 * moves, and stops under Pause (`autoplay`). Server-safe.
 */
export function Float({
  children,
  delay = 0,
  amp = 7,
  tilt = 1.6,
  duration = 6.4,
  className = '',
}: {
  children: ReactNode;
  /** Seconds into the cycle to start, so neighbouring cards drift apart. */
  delay?: number;
  /** Vertical travel each way, in px. */
  amp?: number;
  /** Peak tilt, in degrees. */
  tilt?: number;
  /** One full cycle, in seconds. */
  duration?: number;
  className?: string;
}) {
  const style = {
    '--float-amp': `${amp}px`,
    '--float-tilt': `${tilt}deg`,
    '--float-dur': `${duration}s`,
    '--float-delay': `${-delay}s`,
  } as CSSProperties;
  return (
    <div className={`story-float autoplay ${className}`} style={style}>
      {children}
    </div>
  );
}
