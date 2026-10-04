'use client';

import { useSyncExternalStore } from 'react';

/**
 * What the frame shows about the scene in play (05-cinema.md §2): its time
 * card ("Thursday · 12:31 AM") and whether an app screen is on screen (the
 * "Illustrative" tag). Scenes publish here instead of drawing their own, so
 * both sit in one place on the frame for the whole film.
 */
type Hud = { slate: string; tone: 'night' | 'day'; illustrative: boolean };

const slates = new Map<string, { text: string; tone: 'night' | 'day'; at: number }>();
const marks = new Set<string>();
let snapshot: Hud = { slate: '', tone: 'night', illustrative: false };
const listeners = new Set<() => void>();
let tick = 0;

function emit() {
  // The most recently shown slate wins (a later beat replaces an earlier one).
  let best: { text: string; tone: 'night' | 'day'; at: number } | null = null;
  for (const s of slates.values()) if (!best || s.at > best.at) best = s;
  const next: Hud = { slate: best?.text ?? '', tone: best?.tone ?? 'night', illustrative: marks.size > 0 };
  if (next.slate === snapshot.slate && next.tone === snapshot.tone && next.illustrative === snapshot.illustrative) return;
  snapshot = next;
  for (const l of listeners) l();
}

export const hud = {
  showSlate(id: string, text: string, tone: 'night' | 'day') {
    if (slates.get(id)?.text === text) return;
    slates.set(id, { text, tone, at: ++tick });
    emit();
  },
  hideSlate(id: string) {
    if (slates.delete(id)) emit();
  },
  illustrative(id: string, on: boolean) {
    const had = marks.has(id);
    if (on && !had) marks.add(id);
    else if (!on && had) marks.delete(id);
    else return;
    emit();
  },
};

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const SERVER: Hud = { slate: '', tone: 'night', illustrative: false };

export function useHud(): Hud {
  return useSyncExternalStore(subscribe, () => snapshot, () => SERVER);
}
