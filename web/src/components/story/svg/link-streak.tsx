import { useId } from 'react';

/**
 * B6: the client link in flight (Ch6), still: a streak of light coming out
 * of depth toward the reader, thin and faint where it starts, widening to a
 * bright head. For reduced motion and demos; the moving version is the
 * page's own. aria-hidden and purely decorative.
 */
export function LinkStreak({ className = '' }: { className?: string }) {
  const id = useId().replace(/[^\w-]/g, '');
  const body = `streak-body-${id}`;
  const head = `streak-head-${id}`;
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 320 180" className={`block h-auto w-full ${className}`} data-part="link-streak">
      <defs>
        <linearGradient id={body} x1="36" y1="34" x2="252" y2="132" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#D18A5A" stopOpacity="0" />
          <stop offset="0.55" stopColor="#E8A86E" stopOpacity="0.35" />
          <stop offset="0.9" stopColor="#F7D9B0" stopOpacity="0.9" />
          <stop offset="1" stopColor="#FFF4E4" stopOpacity="1" />
        </linearGradient>
        <radialGradient id={head} cx="252" cy="132" r="46" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FFF4E4" stopOpacity="0.95" />
          <stop offset="0.18" stopColor="#F0C88E" stopOpacity="0.5" />
          <stop offset="0.55" stopColor="#D18A5A" stopOpacity="0.12" />
          <stop offset="1" stopColor="#D18A5A" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* Two faint trails behind it, converging on the same vanishing point. */}
      <path d="M36 34 244 118M36 34 236 140" stroke={`url(#${body})`} strokeWidth="0.75" strokeOpacity="0.45" fill="none" />
      {/* The body: a sliver at the far end, a head's width at the near one. */}
      <path d="M36 34 256 124.5Q262 132 248 139.5Z" fill={`url(#${body})`} />
      <circle cx="252" cy="132" r="46" fill={`url(#${head})`} />
      <circle cx="252" cy="132" r="5" fill="#FFF8EE" />
    </svg>
  );
}
