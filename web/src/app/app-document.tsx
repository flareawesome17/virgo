import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { fontVariables } from './fonts';
import { Providers } from './providers';
import './globals.css';

/**
 * The document the app renders into: web.virgo.ph's signed-in screens and its
 * signed-out ones (sign in, sign up, the legal page).
 *
 * This used to be `app/layout.tsx`, the single root layout. The public site at
 * virgo.ph now has a root layout of its own, so it no longer loads the app's
 * providers — PostHog, React Query, the realtime connection and the session —
 * which were about half of the landing page's JavaScript and none of its
 * content. The (app) and (auth) groups each render this as their root, so the
 * app itself gets exactly what it had before.
 *
 * Moving between the two roots is a full page load, which they already were:
 * they live on different hosts.
 */
export const appMetadata: Metadata = {
  // Resolves the relative image paths in Open Graph tags. Without it Next
  // falls back to localhost, and a shared link previews with an image nobody
  // but the developer can load.
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_ORIGIN || 'https://virgo.ph',
  ),
  title: {
    default: 'Virgo',
    template: '%s · Virgo',
  },
  description:
    'A private workspace for photographers — shoots, albums, client delivery, and the people you work with.',
  // The app is a signed-in tool; there is nothing here for a crawler.
  robots: { index: false, follow: false },
  icons: {
    icon: [
      { url: '/favicon.png', sizes: '48x48', type: 'image/png' },
      { url: '/logo.png', sizes: 'any', type: 'image/png' },
    ],
    apple: '/icon.png',
  },
};

export const appViewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FFF8F4' },
    { media: '(prefers-color-scheme: dark)', color: '#161311' },
  ],
};

export function AppDocument({ children }: { children: ReactNode }) {
  return (
    // suppressHydrationWarning is required by next-themes: it writes the theme
    // class onto <html> before React hydrates, which is exactly the mismatch
    // React would otherwise complain about.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${fontVariables} h-full antialiased`}
    >
      <body className="h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
