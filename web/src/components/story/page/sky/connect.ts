/**
 * Ch3's sky, over the shared choreography (`connect` in choreography.ts):
 * applications arrive as threads to Mika, she looks up, and from Earth the
 * cast line up as Virgo with Syrma held back.
 *
 * `p` is the chapter's own clock, 0..1 over its track. The choreography's
 * beats are timed to the storyboard's p-table, so this only clamps.
 */
import type { SkyFrame } from '@/components/story/sky/types';
import { connect, type Layout } from './choreography';

/** Where the beats fall on the chapter clock (storyboard Ch3 timeline); the island flips the phone in step. */
export const CONNECT_AT = {
  /** Threads land; the first Accept. */
  accept: 0.15,
  /** All three accepted. */
  filled: 0.3,
  /** Ernie's chat: the terms. */
  terms: 0.36,
  /** Confirm presses. */
  confirm: 0.46,
  /** Mika's side: Agreed. */
  agreed: 0.52,
  /** The crew's thread. */
  thread: 0.56,
  /** The panel steps aside: the figure forms (no card covers the sky). */
  clear: 0.68,
  /** "Every role is filled". */
  filledCard: 0.92,
} as const;

export function connectFrame(raw: number, l: Layout): SkyFrame {
  const p = raw < 0 ? 0 : raw > 1 ? 1 : raw;
  return connect(p, l);
}
