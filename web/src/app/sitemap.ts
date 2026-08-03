import type { MetadataRoute } from 'next';
import { headers } from 'next/headers';
import { API_BASE_URL } from '@/api';

const SITE = process.env.NEXT_PUBLIC_SITE_ORIGIN ?? 'https://virgo.ph';

/** How long a published-handle list stays good for. */
const REVALIDATE = 3600;

interface SitemapProfile {
  handle: string;
  updatedAt: string;
}

/**
 * Published profiles, from the API.
 *
 * Server-side and over the container network, like every other read on this
 * host — `virgo.ph` is not in the API's CORS allow-list, and a sitemap is
 * generated on the server anyway.
 *
 * Returns an empty list on failure: a sitemap missing its profiles for an hour
 * costs some crawl freshness, where a throw would return a 500 to Googlebot.
 */
async function publishedProfiles(): Promise<SitemapProfile[]> {
  const base = process.env.API_INTERNAL_URL || API_BASE_URL;
  try {
    const res = await fetch(`${base}/profiles/sitemap`, {
      next: { revalidate: REVALIDATE },
    });
    if (!res.ok) return [];
    const body = (await res.json()) as { data?: SitemapProfile[] };
    return body.data ?? [];
  } catch {
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const host = (await headers()).get('host')?.split(':')[0].toLowerCase() ?? '';
  // The app host has nothing to offer a crawler; its robots.txt already says so.
  if (host !== 'virgo.ph' && host !== 'www.virgo.ph') return [];

  const profiles = await publishedProfiles();

  return [
    { url: SITE, changeFrequency: 'monthly', priority: 1 },
    ...profiles.map((profile) => ({
      url: `${SITE}/@${profile.handle}`,
      lastModified: new Date(profile.updatedAt),
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    })),
  ];
}
