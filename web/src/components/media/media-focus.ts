/*
 * A film and a recording, one at a time.
 *
 * They are held by two providers that do not know about each other, and now
 * that a recording keeps playing from page to page, a film opened on top of
 * it would talk over it. Each registers how to pause it while it exists;
 * the other calls that as it starts. Here rather than in either player, so
 * neither imports the other. The phone keeps the same file for the same
 * reason.
 */

let pauseAudio: (() => void) | null = null;
const filmPausers = new Set<() => void>();

/** The recordings player says how to pause it, or null as it goes away. */
export function registerAudioPause(pause: (() => void) | null): void {
  pauseAudio = pause;
}

/** Called by a film as it starts. */
export function pauseAlbumAudio(): void {
  pauseAudio?.();
}

/** A film says how to pause it; the function returned takes that back. */
export function registerFilmPause(pause: () => void): () => void {
  filmPausers.add(pause);
  return () => {
    filmPausers.delete(pause);
  };
}

/** Called by a recording as it starts. */
export function pauseFilms(): void {
  for (const pause of filmPausers) pause();
}
