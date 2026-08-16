'use client';

import { CloudOff } from 'lucide-react';
import { useOnline } from '@/hooks/useOnline';

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
 * So the app says so, plainly, and stays out of the way otherwise.
 *
 * `navigator.onLine` only knows whether an interface is up — a captive portal
 * reads as online. That makes it wrong for "is the API reachable" and right for
 * this, which is a warning rather than a gate: requests are still attempted,
 * and a failed one reports itself.
 */
export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;

  return (
    <div className="flex items-center gap-3 border-b border-amber-500/20 bg-amber-500/10 px-4 py-2.5">
      <CloudOff className="size-4 shrink-0 text-amber-600 dark:text-amber-500" aria-hidden />
      <p className="min-w-0 flex-1 text-sm">
        <span className="font-medium">You&rsquo;re offline.</span>{' '}
        <span className="text-muted-foreground">
          This is what was here last time. Changes won&rsquo;t save until you
          reconnect.
        </span>
      </p>
    </div>
  );
}
