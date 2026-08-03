import type { Metadata } from 'next';
import type { ReactNode } from 'react';

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
  title: {
    absolute: 'Virgo — the workspace for photographers and videographers',
  },
  description:
    'Albums your clients open without an account, a crew you can message in real time, and a calendar everyone has said yes to. Built in the Philippines for Filipino creatives.',
  // Overrides the root layout's noindex. This page is the front door.
  robots: { index: true, follow: true },
  alternates: { canonical: 'https://virgo.ph' },
  openGraph: {
    type: 'website',
    url: 'https://virgo.ph',
    siteName: 'Virgo',
    title: 'Virgo — every shoot, every file, and everyone on it',
    description:
      'The workspace photographers and videographers actually run a business from. Free to start, 15 GB included.',
    images: [{ url: '/icon.png', width: 512, height: 512, alt: 'Virgo' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Virgo — every shoot, every file, and everyone on it',
    description:
      'Albums your clients open without an account, a crew you can message in real time, and a calendar everyone has said yes to.',
    images: ['/icon.png'],
  },
};

export default function MarketingLayout({ children }: { children: ReactNode }) {
  /**
   * `dark` is forced rather than inherited.
   *
   * The app follows the reader's system theme, but this page is a single
   * composed image — a warm bloom over near-black, with white type on it. Half
   * of it would need rebuilding to work on a light background, and a marketing
   * page that renders two ways is two pages to keep looking right.
   */
  return <div className="dark min-h-full bg-[#161311] text-white">{children}</div>;
}
