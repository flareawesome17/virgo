/** Genie, bounce and fade keyframes. Pure, no imports. */
export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * A panel collapsing into an icon ('close') or growing out of it ('open').
 * The panel keeps its layout box; only transform, opacity and radius animate.
 */
export function genieKeyframes(
  panel: Rect,
  icon: Rect,
  direction: 'open' | 'close',
): { keyframes: Keyframe[]; transformOrigin: string } {
  const pw = Math.max(1, panel.width);
  const ph = Math.max(1, panel.height);
  const dx = icon.left + icon.width / 2 - (panel.left + pw / 2);
  const dy = icon.top + icon.height / 2 - (panel.top + ph / 2);
  const sx = icon.width / pw;
  const sy = icon.height / ph;
  const ox = clamp(icon.left + icon.width / 2 - panel.left, 0, pw);
  const oy = clamp(icon.top + icon.height / 2 - panel.top, 0, ph);
  const close: Keyframe[] = [
    { transform: 'none', opacity: 1, borderRadius: '12px', offset: 0 },
    {
      transform: `translate(${dx * 0.45}px, ${dy * 0.45}px) scale(0.72, 0.38)`,
      opacity: 0.9,
      offset: 0.55,
    },
    {
      transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`,
      opacity: 0,
      borderRadius: '50%',
      offset: 1,
    },
  ];
  const keyframes =
    direction === 'close'
      ? close
      : close
          .slice()
          .reverse()
          .map((frame) => ({ ...frame, offset: Math.round((1 - (frame.offset as number)) * 100) / 100 }));
  return { keyframes, transformOrigin: `${ox}px ${oy}px` };
}

export function bounceKeyframes(): Keyframe[] {
  return [
    { transform: 'scale(1)', offset: 0 },
    { transform: 'scale(0.9)', offset: 0.25 },
    { transform: 'scale(1.08)', offset: 0.55 },
    { transform: 'scale(0.98)', offset: 0.8 },
    { transform: 'scale(1)', offset: 1 },
  ];
}

/** Reduced-motion replacement: opacity only, never a transform. */
export function fadeKeyframes(direction: 'in' | 'out'): Keyframe[] {
  return direction === 'in' ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 1 }, { opacity: 0 }];
}
