import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { Providers } from './providers';
import './globals.css';

/**
 * The app's typefaces, as web/src/app/fonts.ts declares them.
 *
 * globals.css has pointed `font-sans` at `--font-geist-sans` from the start,
 * but nothing here defined it, so the whole console fell through to the
 * browser's default serif.
 */
const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

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
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable}`}
    >
      <body className="min-h-dvh bg-background font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
