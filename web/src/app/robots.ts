import type { MetadataRoute } from 'next';
import { headers } from 'next/headers';

const SITE = process.env.NEXT_PUBLIC_SITE_ORIGIN ?? 'https://virgo.ph';

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
 * Note there is deliberately no `Disallow: /p/`. It looks like the tidy thing
 * to do — `/p/:handle` is the internal path behind `/@:handle` — but Disallow
 * does not prevent a URL being indexed if it is discovered elsewhere; it only
 * stops the crawler *reading* the page, and therefore stops it seeing the
 * canonical tag that resolves the duplicate. The canonical is the mechanism.
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
