import type { Metadata } from 'next';
import type { ReactNode } from 'react';

/**
 * What a shared link says about itself before it knows there is a post.
 *
 * The page's generateMetadata replaces all of this when the post is there.
 * When it is not, the page answers 404 and Next renders not-found.tsx with
 * the metadata of the layouts above it — which, without this one, was the
 * marketing site's: the home page's title, its canonical address, its own
 * preview card and "index, follow" beside Next's "noindex". A post that was
 * made private should leave nothing behind but this.
 */
export const metadata: Metadata = {
  title: { absolute: 'Post not available · Virgo' },
  description: 'This post isn’t available on Virgo.',
  robots: { index: false, follow: false },
  // Replaced whole (metadata merges shallowly), so the site's canonical, its
  // card image and its video are not inherited.
  alternates: {},
  openGraph: { siteName: 'Virgo', title: 'Post not available · Virgo' },
  twitter: { card: 'summary', title: 'Post not available · Virgo' },
};

export default function SharedShowcaseLayout({ children }: { children: ReactNode }) {
  return children;
}
