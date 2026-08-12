import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { Providers } from './providers';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  // Resolves the relative image paths in the marketing page's Open Graph tags.
  // Without it Next falls back to localhost, and a shared link previews with an
  // image nobody but the developer can load.
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

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FFF8F4' },
    { media: '(prefers-color-scheme: dark)', color: '#161311' },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning is required by next-themes: it writes the theme
    // class onto <html> before React hydrates, which is exactly the mismatch
    // React would otherwise complain about.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
