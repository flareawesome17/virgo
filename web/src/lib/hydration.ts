import { useSyncExternalStore } from 'react';

/**
 * Whether this render may use what only the browser knows.
 *
 * False on the server and for the render that hydrates the server's HTML, so
 * anything drawn from the theme, the user agent or the desktop bridge matches
 * what the server sent; true for every render after that. React re-renders on
 * its own as soon as hydration is done.
 *
 * Replaces a `mounted` flag set from an effect, which cost an extra render on
 * every mount and showed the placeholder for a frame even where nothing was
 * being hydrated — a component mounted by a client-side navigation has no
 * server HTML to match, and here it is true from its first render.
 *
 * Lives in lib rather than hooks: `src/hooks` is compared file-for-file
 * against the mobile app, which has no server render to agree with.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, isClient, isServer);
}

/** Nothing to listen to: the answer changes once, and React handles that. */
function subscribe(): () => void {
  return () => {};
}

function isClient(): boolean {
  return true;
}

function isServer(): boolean {
  return false;
}
