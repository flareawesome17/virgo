/**
 * Ch2 — Thursday, 12:04 AM · #nearby: the page's own words, cut to the
 * cinema script (docs/redesign/05-cinema.md §3). The mocks' words live in
 * `ch2.ts`, proven against the app; this file holds only what the page says
 * around them, so check-story lints it.
 *
 * A zero-import data module (see `../story.ts`).
 */
import { WHEN } from '../story';
import { clock12 } from './ch1';

export const SOURCES: { text: string; file: string; mode: 'verbatim' }[] = [];

export const CH2 = {
  /** The scene slate (drawn uppercase). */
  slate: `Thursday · ${clock12(WHEN.nearby)}`,
  /** The subtitles, one at a time. `ask` is the chapter's H2. */
  ask: "Who's working near the shoot?",
  pick: 'Pick the roles. Pick the distance.',
  only: 'The only thing anyone learns is how far away you are.',
  erase: "Turn it off, and you're gone. Not hidden. Erased.",
} as const;
