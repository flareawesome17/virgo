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

interface SitemapJob {
  slug: string;
  updatedAt: string;
}

/** Open job posts, from the API. Same failure policy as the profiles. */
async function openJobs(): Promise<SitemapJob[]> {
  const base = process.env.API_INTERNAL_URL || API_BASE_URL;
  try {
    const res = await fetch(`${base}/jobs/sitemap`, {
      next: { revalidate: REVALIDATE },
    });
    if (!res.ok) return [];
    const body = (await res.json()) as { data?: SitemapJob[] };
    return body.data ?? [];
  } catch {
    return [];
  }
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

  const [profiles, jobs] = await Promise.all([publishedProfiles(), openJobs()]);

  return [
    { url: SITE, changeFrequency: 'monthly', priority: 1 },
    // The board itself changes whenever anything is posted, so it is worth
    // crawling far more often than a profile.
    { url: `${SITE}/jobs`, changeFrequency: 'daily' as const, priority: 0.9 },
    ...jobs.map((job) => ({
      url: `${SITE}/jobs/${job.slug}`,
      lastModified: new Date(job.updatedAt),
      changeFrequency: 'daily' as const,
      priority: 0.8,
    })),
    ...profiles.map((profile) => ({
      url: `${SITE}/@${profile.handle}`,
      lastModified: new Date(profile.updatedAt),
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    })),
  ];
}
