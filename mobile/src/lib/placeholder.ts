/**
 * Neutral placeholders for missing images.
 *
 * These replace `https://picsum.photos/seed/...` fallbacks, which pulled random
 * stock photographs from the internet whenever an avatar or cover was unset.
 * That made empty data look populated — a collaborator with no avatar appeared
 * to have a headshot, and an album with no cover appeared to have artwork.
 *
 * A flat tinted block reads as "nothing here yet", requires no network request,
 * and cannot be mistaken for real content. Prefer `<Avatar>` where an initial
 * letter is a better fit.
 */

/** 1x1 PNG, #EFE4DC — the muted surface tone. Stretches to any size. */
export const PLACEHOLDER_IMAGE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAABubagXAAAAEklEQVR4nGP8//8/AzbAhE0QAFdcAxAcHmMYAAAAAElFTkSuQmCC';

/** Slightly darker block for album/media covers so they read as a surface. */
export const PLACEHOLDER_COVER =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAABubagXAAAAEklEQVR4nGP89+HDfwYcgAmXBABvXwX4XSSCcQAAAABJRU5ErkJggg==';
