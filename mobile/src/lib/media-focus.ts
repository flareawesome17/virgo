/**
 * Album audio and album films, one at a time.
 *
 * They live in two providers that do not know about each other, and they
 * talked over each other: starting a recording left a docked film playing.
 * Each registers how to pause it while it exists; starting the other calls
 * that. Here rather than in either provider, so neither imports the other.
 */
let pauseAudio: (() => void) | null = null;

export function registerAudioPause(pause: (() => void) | null): void {
  pauseAudio = pause;
}

export function pauseAlbumAudio(): void {
  try {
    pauseAudio?.();
  } catch {
    // Already released.
  }
}
