/**
 * Ch4's film length, shared by the chapter (which holds the scroll before the
 * scene loads), the lazy slot (islands/ch4.tsx) and the scene itself.
 * Server-safe: no hooks, no 'use client'.
 */

/** One continuous take, Friday night to Saturday 5:00 AM: svh of pinned scroll beyond the stage's own 100svh. */
export const CH4_SHOT = 160;

/** The whole film's height, svh. */
export const CH4_SVH = 100 + CH4_SHOT;
