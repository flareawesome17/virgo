import { useSyncExternalStore } from 'react';

/**
 * Whether the browser thinks it has a connection.
 *
 * `navigator.onLine` only knows whether an interface is up, not whether the
 * API is reachable — a captive portal reads as online. It is still the right
 * signal for "your last action did not send", which is what the UI uses it for.
 *
 * `true` on the server and while hydrating rather than read from navigator:
 * the value differs between server and client, and a mismatch is a hydration
 * error. React re-renders with the real answer straight afterwards.
 */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, isOnline, assumeOnline);
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

function isOnline(): boolean {
  return navigator.onLine;
}

function assumeOnline(): boolean {
  return true;
}
