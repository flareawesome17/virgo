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
  // The same marks the app and the marketing site use. A console that looks
  // like a different product is one more thing to recognise in a tab strip.
  icons: {
    icon: [
      { url: '/favicon.png', sizes: '48x48', type: 'image/png' },
      { url: '/logo.png', sizes: 'any', type: 'image/png' },
    ],
    apple: '/icon.png',
  },
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
