import type { MetadataRoute } from 'next';
import { headers } from 'next/headers';

const SITE = process.env.NEXT_PUBLIC_SITE_ORIGIN || 'https://virgo.ph';

/**
 * robots.txt, which differs by hostname.
 *
 * One deployment answers on both `virgo.ph` and `web.virgo.ph`, and they want
 * opposite things: the apex is a public marketing site and a profile directory,
 * the app is a signed-in tool with nothing in it for a crawler.
 *
 * Reading a header makes this a request-time route rather than a file baked at
 * build, which is the only way one build can serve both answers.
 *
 * Profiles and job posts are not listed either way: they now redirect to
 * sign-in, so there is nothing for a crawler to index and nothing to disallow.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const host = (await headers()).get('host')?.split(':')[0].toLowerCase() ?? '';
  const isMarketing = host === 'virgo.ph' || host === 'www.virgo.ph';

  if (!isMarketing) {
    return { rules: { userAgent: '*', disallow: '/' } };
  }

  return {
    rules: { userAgent: '*', allow: '/' },
    sitemap: `${SITE}/sitemap.xml`,
    host: 'virgo.ph',
  };
}
