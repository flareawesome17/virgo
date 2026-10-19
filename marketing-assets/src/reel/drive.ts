/**
 * Moving a mock in place, the way the page's Phase 4 islands will: a mock is
 * rendered once for its key frame (`state`), then the scene writes only
 * `transform`, `opacity` (and, for text being typed, a clip) onto its
 * `[data-part]` elements every frame. The mock's code and markup are never
 * changed, so what moves is exactly what the page will move.
 *
 * The writes happen in a layout effect after every render, so they land
 * before Remotion takes the frame, whatever order frames are rendered in.
 */
import { useLayoutEffect, type RefObject } from "react";

export type Parts = {
  /** The first element with this data-part, or null. */
  one: (part: string) => HTMLElement | null;
  /** Every element with this data-part. */
  all: (part: string) => HTMLElement[];
};

/** Writes inline styles; numbers are written as they are (opacity), strings as given. Null leaves the element alone. */
export function put(el: HTMLElement | null | undefined, style: Record<string, string | number | null>): void {
  if (!el) return;
  for (const [k, v] of Object.entries(style)) {
    if (v === null) el.style.removeProperty(k);
    else el.style.setProperty(k, String(v));
  }
}

export function useDrive(ref: RefObject<HTMLElement | null>, write: (p: Parts) => void): void {
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    write({
      one: (part) => root.querySelector<HTMLElement>(`[data-part="${part}"]`),
      all: (part) => [...root.querySelectorAll<HTMLElement>(`[data-part="${part}"]`)],
    });
  });
}

/** Reveal typed text: clip everything past `t` of its width (0 hidden, 1 all). */
export const typed = (t: number) => (t >= 1 ? "none" : `inset(-20% ${((1 - Math.max(0, t)) * 100).toFixed(2)}% -20% 0)`);
