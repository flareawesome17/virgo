import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { VisitBeacon } from '@/components/visit-beacon';

/**
 * The public site.
 *
 * Its own route group because it is the opposite of the rest of the app in
 * every way that matters: no auth guard, no app shell, and — unlike the root
 * layout, which tells crawlers to stay out of a signed-in tool — it is the one
 * page that *wants* to be indexed.
 */
export const metadata: Metadata = {
  // `absolute` escapes the root layout's "%s · Virgo" template, which would
  // otherwise render "… videographers · Virgo".
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
  // Overrides the root layout's noindex. This page is the front door.
  robots: { index: true, follow: true },
  alternates: { canonical: 'https://virgo.ph' },
  openGraph: {
    type: 'website',
    url: 'https://virgo.ph',
    siteName: 'Virgo',
    title: 'Virgo — Hire Photographers, Editors & HMUAs in the Philippines',
    description:
      'A network of photographers, videographers, editors and HMUAs — and the workspace they run the job from. Free to start, 15 GB included.',
    // `images` is deliberately absent: opengraph-image.tsx in this folder
    // generates a real 1200×630 card, and naming a file here would override it
    // with the 512×512 app icon all over again.
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Virgo — Hire Photographers, Editors & HMUAs in the Philippines',
    description:
      'Hire a second shooter near you, run the shoot together, and hand the client a link that cleans itself up when the job is done.',
  },
};

export default function MarketingLayout({ children }: { children: ReactNode }) {
  /**
   * `landing-scroll` carries two rules the app must not inherit: smooth
   * scrolling, and a scroll-margin on sections so an anchor does not land
   * underneath the fixed header.
   *
   * It sits on the wrapper rather than <html> because the root layout is
   * shared with the app, and scroll-margin applies to the target element, so
   * a descendant selector reaches it fine.
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
    <div className="landing-scroll dark min-h-full bg-[#161311] text-white">
      <VisitBeacon />
      {children}
    </div>
  );
}
