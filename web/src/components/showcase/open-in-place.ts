import type { MouseEvent } from 'react';

/**
 * A plain click on a tile opens the post over the page; a click meant for a
 * new tab or window (a modifier, the middle button) is left to the link, so
 * the post's own address still works the way a link does.
 */
export function opensInPlace(event: MouseEvent<HTMLAnchorElement>): boolean {
  if (event.defaultPrevented || event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  event.preventDefault();
  return true;
}
