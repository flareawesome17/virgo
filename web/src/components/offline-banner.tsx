'use client';

import { CloudOff } from 'lucide-react';
import { useOnline } from '@/hooks/useOnline';
import { useAuth } from '@/hooks/useAuth';

/**
 * Says why nothing is saving.
 *
 * The desktop app keeps its cache on disk, so losing the network no longer
 * empties the screen — the workspace, albums and schedule are all still there.
 * That is the point, and it is also the risk: an app that looks completely
 * normal while nothing it shows can be changed is worse than one that is
 * obviously broken, because the first way somebody finds out is a save that
 * quietly did not happen.
 *
 * Two signals, because one is not enough.
 *
 * `navigator.onLine` only knows whether an interface is up. Wifi connected to a
 * router with no internet behind it reads as online, and so does a captive
 * portal — which is exactly the case this banner exists for, and exactly the
 * case it misses. The first version of this used it alone and never appeared.
 *
 * The session query failing is the signal that actually means "the API did not
 * answer", whatever the adapter thinks. It is also already there: the app asks
 * who you are on every start and every focus, so a reachability check costs
 * nothing extra.
 *
 * Neither is right on its own — `navigator.onLine` is instant and wrong about
 * reachability, the query is authoritative and only knows after it has tried.
 * Together they cover both.
 */
export function OfflineBanner() {
  const online = useOnline();
  const { isSessionError, isAuthenticated } = useAuth();

  // Only meaningful for somebody who is signed in and looking at cached data.
  // Signed out, "can't reach the server" is the whole screen, not a strip
  // across the top of a working app.
  if (!isAuthenticated) return null;

  const unreachable = isSessionError;
  if (online && !unreachable) return null;

  return (
    <div className="flex items-center gap-3 border-b border-amber-500/20 bg-amber-500/10 px-4 py-2.5">
      <CloudOff
        className="size-4 shrink-0 text-amber-600 dark:text-amber-500"
        aria-hidden
      />
      <p className="min-w-0 flex-1 text-sm">
        <span className="font-medium">
          {online ? 'Can’t reach the server.' : 'You’re offline.'}
        </span>{' '}
        <span className="text-muted-foreground">
          This is what was here last time. Changes won’t save until you
          reconnect.
        </span>
      </p>
    </div>
  );
}
