import type { MetadataRoute } from 'next';
import { headers } from 'next/headers';

const SITE = process.env.NEXT_PUBLIC_SITE_ORIGIN ?? 'https://virgo.ph';

/**
 * The landing page, and nothing else.
 *
 * This used to list every published profile and open job post. Both now
 * require an account to read, so listing them would advertise addresses that
 * answer a crawler with a redirect to sign-in — worse than omitting them,
 * because it spends crawl budget teaching Google that the site is a wall.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const host = (await headers()).get('host')?.split(':')[0].toLowerCase() ?? '';
  // The app host has nothing to offer a crawler; its robots.txt already says so.
  if (host !== 'virgo.ph' && host !== 'www.virgo.ph') return [];

  return [{ url: SITE, changeFrequency: 'monthly', priority: 1 }];
}
