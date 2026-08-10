'use client';

import { Suspense, useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import {
  identify,
  resetAnalytics,
  startAnalytics,
  trackPageview,
} from '@/lib/analytics';

/**
 * Keeps analytics in step with the session and the router.
 *
 * A component rather than hooks in Providers, for the same reason
 * RealtimeBridge is one: it needs the session, which only exists inside
 * QueryClientProvider.
 */
function Bridge() {
  const pathname = usePathname();
  const search = useSearchParams();
  const { user, isAuthenticated } = useAuth();
  const identified = useRef<string | null>(null);

  useEffect(() => {
    startAnalytics();
  }, []);

  /*
   * A pageview per route change.
   *
   * The app router does not reload the document, so PostHog's automatic
   * pageview fires once on the first paint and never again — every route
   * after that would be invisible.
   *
   * The query string is included because it is part of where somebody is:
   * /jobs/mine and /jobs/mine?tab=applications are two different screens.
   */
  useEffect(() => {
    if (!pathname) return;
    const query = search?.toString();
    trackPageview(`${window.location.origin}${pathname}${query ? `?${query}` : ''}`);
  }, [pathname, search]);

  /*
   * Attach events to the account, and let go on sign-out.
   *
   * Guarded on the id rather than run on every render of `user`, so a
   * refetch that returns an equal object does not re-identify. Signing out
   * resets, so the next person to use this browser is not counted as them.
   */
  useEffect(() => {
    if (isAuthenticated && user?.id) {
      if (identified.current !== user.id) {
        identified.current = user.id;
        identify(user.id);
      }
    } else if (identified.current) {
      identified.current = null;
      resetAnalytics();
    }
  }, [isAuthenticated, user?.id]);

  return null;
}

/**
 * `useSearchParams` opts a route into dynamic rendering unless it sits behind
 * a Suspense boundary — and this one is mounted at the root, so without it
 * every static page in the app would become server-rendered on demand.
 */
export function AnalyticsBridge() {
  return (
    <Suspense fallback={null}>
      <Bridge />
    </Suspense>
  );
}
