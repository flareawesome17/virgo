'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { API_BASE_URL } from '@/api';

/**
 * Reports a page view to Virgo's own counter.
 *
 * `sendBeacon` first: it hands the request to the browser to deliver
 * independently of the page, so a view still counts when someone clicks
 * straight through to sign-up. A plain fetch is cancelled by that navigation
 * and the visit is lost — which biases the numbers against exactly the
 * visitors who converted.
 *
 * The path is sent as-is and normalised on the server. Deliberately: a client
 * that strips its own share token is one refactor away from forgetting to, and
 * the token is the credential to somebody's private gallery. The server is the
 * only place that decision belongs.
 *
 * No identifiers are sent. The server derives a daily-salted visitor hash from
 * the connection itself, so there is no cookie here and nothing to consent to.
 */
export function VisitBeacon() {
  const pathname = usePathname();
  // Guards against React's development double-effect and against a re-render
  // that does not actually change the route.
  const last = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname || last.current === pathname) return;
    last.current = pathname;

    const body = JSON.stringify({
      path: pathname,
      host: window.location.host,
      // Only sent when it is another site. Same-origin navigation is not a
      // referral, and the server drops virgo.ph hosts anyway.
      referrer: document.referrer || undefined,
    });

    try {
      const blob = new Blob([body], { type: 'application/json' });
      if (navigator.sendBeacon?.(`${API_BASE_URL}/visits`, blob)) return;
    } catch {
      /* falls through to fetch */
    }

    // `keepalive` gives the fetch the same survive-the-navigation property,
    // and a failure here must never surface to the visitor.
    void fetch(`${API_BASE_URL}/visits`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {});
  }, [pathname]);

  return null;
}
