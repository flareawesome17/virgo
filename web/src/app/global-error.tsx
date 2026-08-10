'use client';

import { useEffect } from 'react';
import { captureError, startAnalytics } from '@/lib/analytics';

/**
 * The last boundary: an error in the root layout itself.
 *
 * This one replaces the whole document, which is why it renders its own
 * `<html>` and `<body>` — the layout that would normally provide them is the
 * thing that failed.
 *
 * That also means none of the app's providers are mounted, so nothing has
 * started analytics yet. It starts it here before reporting: an error bad
 * enough to take out the root layout is the single most important one to hear
 * about, and it is the one most likely to go unreported.
 *
 * Deliberately plain — no imported components, no fonts, no theme. Everything
 * this file depends on is another thing that could be the reason it is being
 * shown.
 */
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    startAnalytics();
    captureError(error, 'root-layout');
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.75rem',
          padding: '2rem',
          textAlign: 'center',
          background: '#FAF5F1',
          color: '#1C1917',
          fontFamily:
            'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        }}
      >
        <h1 style={{ fontSize: '1.125rem', fontWeight: 700, margin: 0 }}>
          Virgo could not start
        </h1>
        <p
          style={{
            margin: 0,
            maxWidth: '26rem',
            fontSize: '0.875rem',
            lineHeight: 1.6,
            color: '#57534E',
          }}
        >
          Something failed before the app could load. Reloading usually fixes
          it, and we have been told it happened.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            marginTop: '0.5rem',
            padding: '0.6rem 1.1rem',
            border: 0,
            borderRadius: '0.75rem',
            background: '#B66A40',
            color: '#fff',
            fontSize: '0.875rem',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Reload
        </button>
        {error.digest && (
          <p style={{ margin: 0, fontSize: '0.6875rem', color: '#78716C' }}>
            If you tell us about this, quote {error.digest}
          </p>
        )}
      </body>
    </html>
  );
}
