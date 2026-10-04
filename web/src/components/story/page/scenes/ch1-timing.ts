/**
 * Ch1's film length, shared by the lazy slot (islands/ch1.tsx) and the film
 * (ch1-film.tsx), so the slot holds exactly the scroll the film takes
 * without importing it.
 */

/** One continuous shot: svh of pinned scroll beyond the stage's own 100svh. */
export const CH1_SHOT = 190;

/** The whole film's height, svh. */
export const CH1_FILM_SVH = 100 + CH1_SHOT;
