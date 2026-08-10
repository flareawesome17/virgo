import type { Metadata } from 'next';
import { Providers } from './providers';
import './globals.css';

/**
 * The management console.
 *
 * `noindex` and no sitemap: this is an internal tool that happens to be on the
 * public internet, and the one thing worse than an admin login being reachable
 * is it being findable.
 */
export const metadata: Metadata = {
  title: { default: 'Virgo Console', template: '%s · Virgo Console' },
  description: 'Management console for Virgo.',
  robots: { index: false, follow: false, nocache: true },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-dvh bg-background font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
