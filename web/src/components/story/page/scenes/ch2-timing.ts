/**
 * Ch2's film length, shared by the lazy slot (islands/ch2.tsx) and the film
 * (ch2-film.tsx), so the slot holds exactly the scroll the film takes
 * without importing it.
 */

/** One continuous shot: svh of pinned scroll beyond the stage's own 100svh. */
export const CH2_SHOT = 240;

/** The whole film's height, svh. */
export const CH2_FILM_SVH = 100 + CH2_SHOT;
