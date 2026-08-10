'use client';

import { useEffect } from 'react';
import { RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { captureError } from '@/lib/analytics';

/**
 * What a screen shows when it breaks.
 *
 * There was no boundary at all, so a render error fell through to Next's own
 * page — a bare "Application error: a client-side exception has occurred",
 * which tells somebody nothing and offers them nothing. It also reached
 * nobody: React swallows render errors into the nearest boundary, so they
 * never touch `window.onerror` and the automatic capture never saw them.
 *
 * The error itself is not shown. A stack or an internal message on screen
 * helps nobody who is not us, and can carry things from inside the app that
 * do not belong in front of a user. The digest is enough to tie a report to a
 * log line.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    captureError(error, 'route');
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <h1 className="text-lg font-bold">Something went wrong on this screen</h1>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
        The rest of Virgo is fine — this page failed to load. Trying again
        usually works, and we have been told it happened.
      </p>

      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        <Button onClick={reset}>
          <RotateCw className="size-4" />
          Try again
        </Button>
        <Button variant="outline" onClick={() => (window.location.href = '/')}>
          Go home
        </Button>
      </div>

      {error.digest && (
        <p className="mt-6 text-[11px] text-muted-foreground">
          If you tell us about this, quote {error.digest}
        </p>
      )}
    </div>
  );
}
