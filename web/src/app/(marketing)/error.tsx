'use client';

import Link from 'next/link';
import { useEffect } from 'react';

/**
 * What a page on the public site shows when it breaks.
 *
 * Its own, rather than the app's: the app's boundary is built from the app's
 * components, and the public site loads none of them. Same wording, same
 * reporting, drawn for the always-dark page. Analytics is imported only once
 * something has actually gone wrong, so it never costs a normal visit.
 */
export default function MarketingError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    void import('@/lib/analytics').then(({ captureError }) => captureError(error, 'route'));
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <h1 className="text-lg font-bold text-[#F2EDE8]">Something went wrong on this page</h1>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-[#BCADA3]">
        Trying again usually works, and we have been told it happened.
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={reset}
          className="min-h-11 rounded-xl bg-[#D18A5A] px-5 text-sm font-semibold text-[#161311] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#F2EDE8]"
        >
          Try again
        </button>
        <Link
          href="/"
          className="inline-flex min-h-11 items-center rounded-xl border border-white/15 px-5 text-sm font-semibold text-[#F2EDE8] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#F2EDE8]"
        >
          Go home
        </Link>
      </div>
      {error.digest && (
        <p className="mt-6 text-[11px] text-[#A08E84]">If you tell us about this, quote {error.digest}</p>
      )}
    </div>
  );
}
