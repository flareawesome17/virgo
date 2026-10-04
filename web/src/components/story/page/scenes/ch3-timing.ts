/**
 * Ch3's film length, shared by the chapter (which holds the scroll before the
 * scene loads), the lazy slot (islands/ch3.tsx) and the scene itself.
 * Server-safe: no hooks, no 'use client'.
 */

/** One continuous take: svh of pinned scroll beyond the stage's own 100svh. */
export const CH3_SHOT = 180;

/** The whole film's height, svh. */
export const CH3_SVH = 100 + CH3_SHOT;
