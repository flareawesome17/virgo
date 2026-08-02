import { useEffect, useState } from 'react';

/**
 * Whether the browser thinks it has a connection.
 *
 * `navigator.onLine` only knows whether an interface is up, not whether the
 * API is reachable — a captive portal reads as online. It is still the right
 * signal for "your last action did not send", which is what the UI uses it for.
 *
 * Starts `true` rather than reading navigator during render: the value differs
 * between server and client, and a mismatch is a hydration error.
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setOnline(navigator.onLine);
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return online;
}
