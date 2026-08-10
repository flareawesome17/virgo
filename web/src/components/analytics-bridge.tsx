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
 * Split in two, and the split is the point. `useSearchParams` has to sit
 * inside a Suspense boundary or it opts every static page in the app into
 * dynamic rendering — but a boundary that does not resolve takes everything
 * inside it with it, and the first version had starting PostHog inside one.
 * The result was a correctly configured, fully downloaded integration that
 * never ran: no init, no identify, no events, and no error either.
 *
 * So the parts that must always happen do not depend on the query string.
 */
export function AnalyticsBridge() {
  return (
    <>
      <Session />
      <Suspense fallback={null}>
        <Pageviews />
      </Suspense>
    </>
  );
}

/**
 * Starting up, and who is signed in.
 *
 * No Suspense, no `useSearchParams`, nothing that can defer it. `usePathname`
 * alone does not force dynamic rendering, so this costs nothing.
 */
function Session() {
  const pathname = usePathname();
  const { user, isAuthenticated } = useAuth();
  const identified = useRef<string | null>(null);

  useEffect(() => {
    startAnalytics();
  }, []);

  /*
   * Attach events to the account, and let go on sign-out.
   *
   * Guarded on the id rather than run on every render of `user`, so a refetch
   * returning an equal object does not re-identify. Signing out resets, so the
   * next person to use this browser is not counted as them.
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

  /*
   * A pageview per route change, read straight off `window.location`.
   *
   * This one does not need the hook: by the time an effect runs, the address
   * bar already holds the query string. `Pageviews` below exists only to
   * catch a change to the query *alone*, which leaves `pathname` untouched.
   */
  useEffect(() => {
    if (!pathname) return;
    trackPageview(window.location.href);
  }, [pathname]);

  return null;
}

/**
 * The case `Session` cannot see: `?tab=posted` becoming `?tab=applications`,
 * where the path never changes. Worth a boundary of its own — those are two
 * different screens and counting them as one visit hides half the jobs page.
 */
function Pageviews() {
  const search = useSearchParams();
  const first = useRef(true);

  useEffect(() => {
    // Session already sent the pageview for this path; this fires only on the
    // query changes that follow it.
    if (first.current) {
      first.current = false;
      return;
    }
    trackPageview(window.location.href);
  }, [search]);

  return null;
}
