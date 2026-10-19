import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { VisitBeacon } from '@/components/visit-beacon';
import { MEDIA } from '@/components/story/media.generated';
import { displaySerif, fontVariables } from '../fonts';
import '../globals.css';

/**
 * The public site.
 *
 * Its own root layout because it is the opposite of the rest of the app in
 * every way that matters: no auth guard, no app shell, no session, and —
 * unlike the app, which tells crawlers to stay out of a signed-in tool — it is
 * the one page that *wants* to be indexed.
 *
 * Being a root of its own is also what keeps the app's providers off it.
 * PostHog, React Query, the realtime connection and the session used to load
 * here through the shared root layout: about half the landing page's
 * JavaScript, for a page that uses none of them.
 */
export const metadata: Metadata = {
  // Resolves the relative image paths in the Open Graph tags (the generated
  // card). Without it Next falls back to localhost.
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_ORIGIN || 'https://virgo.ph',
  ),
  icons: {
    icon: [
      { url: '/favicon.png', sizes: '48x48', type: 'image/png' },
      { url: '/logo.png', sizes: 'any', type: 'image/png' },
    ],
    apple: '/icon.png',
  },
  // `absolute`, with no template: the pages under this layout set their own
  // titles in full, as they did when the app's "%s · Virgo" template sat above.
  // One wording, used everywhere below. The title and the og:title used to
  // disagree — "the creative community and workspace" against "where creatives
  // find each other, and get paid" — so a share and a search result advertised
  // two different products, and neither line contained a phrase anyone types
  // into a search box.
  title: {
    absolute: 'Virgo — Hire Photographers, Editors & HMUAs in the Philippines',
  },
  // Kept under ~155 characters. The old one ran to 240 and was cut mid-sentence,
  // losing the part that actually distinguishes the product.
  description:
    'Find and hire photographers, videographers, editors and HMUAs near you, then run the whole job in one place. Client links that open without an account.',
  // This site is the front door; the app is the part marked noindex.
  robots: { index: true, follow: true },
  alternates: { canonical: 'https://virgo.ph' },
  openGraph: {
    type: 'website',
    url: 'https://virgo.ph',
    siteName: 'Virgo',
    title: 'Virgo — Hire Photographers, Editors & HMUAs in the Philippines',
    description:
      'A network of photographers, videographers, editors and HMUAs — and the workspace they run the job from. Free to start, 15 GB included.',
    // `images` is deliberately absent: opengraph-image.jpg in this folder is
    // the 1200×630 card (with its alt in opengraph-image.alt.txt), and naming
    // a file here would override it with the 512×512 app icon all over again.
    // The video is the same card, moving: iMessage plays it, everything else
    // shows the image. MP4 only; the WebM stays out of the tags.
    videos: [
      {
        // Absolute: unlike images, Next does not resolve video URLs against metadataBase.
        url: new URL(MEDIA.ogVideoMp4.url, process.env.NEXT_PUBLIC_SITE_ORIGIN || 'https://virgo.ph').href,
        secureUrl: new URL(MEDIA.ogVideoMp4.url, process.env.NEXT_PUBLIC_SITE_ORIGIN || 'https://virgo.ph').href,
        type: 'video/mp4',
        width: 1200,
        height: 630,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Virgo — Hire Photographers, Editors & HMUAs in the Philippines',
    description:
      'Hire a second shooter near you, run the shoot together, and hand the client a link that cleans itself up when the job is done.',
  },
};

/** The page is always dark, so the browser's chrome and controls are too. */
export const viewport: Viewport = {
  themeColor: '#161311',
  colorScheme: 'dark',
};

export default function MarketingLayout({ children }: { children: ReactNode }) {
  /**
   * `landing-scroll` carries two rules the app must not inherit: smooth
   * scrolling, and a scroll-margin on sections so an anchor does not land
   * underneath the fixed header.
   *
   * It stays on the wrapper rather than <html>: scroll-margin applies to the
   * target element, so a descendant selector reaches it fine, and the rules
   * stay in one place.
   */
  /**
   * `dark` is forced rather than inherited.
   *
   * The app follows the reader's system theme, but this page is a single
   * composed image — a warm bloom over near-black, with white type on it. Half
   * of it would need rebuilding to work on a light background, and a marketing
   * page that renders two ways is two pages to keep looking right.
   */
  return (
    // suppressHydrationWarning: the story's pre-paint script writes data-motion,
    // data-paused and data-lite on <html> before React hydrates.
    <html lang="en" suppressHydrationWarning className={`${fontVariables} ${displaySerif.variable} dark h-full antialiased`}>
      <body className="h-full bg-[#161311]">
        <div className="landing-scroll dark min-h-full bg-[#161311] text-white">
          <VisitBeacon />
          {children}
        </div>
      </body>
    </html>
  );
}
