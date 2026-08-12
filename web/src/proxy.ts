import { NextResponse, type NextRequest } from 'next/server';

/**
 * Hosts that should see the marketing site rather than the app.
 *
 * The apex and www only. `web.virgo.ph` is the product and must keep serving
 * the dashboard at `/`.
 */
const MARKETING_HOSTS = new Set(['virgo.ph', 'www.virgo.ph']);

/** Where the app lives, for links out of the marketing site. */
const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_ORIGIN || 'https://web.virgo.ph';

/**
 * Serves one Next app on two hostnames.
 *
 * `proxy`, not `middleware` — Next 16 renamed the convention and warns on the
 * old name. Same contract; it just runs earlier in the request than the name
 * "middleware" implied, and may be deployed to the CDN, which is why nothing
 * here reaches for shared module state.
 *
 * virgo.ph is the landing page; web.virgo.ph is the product. Rather than a
 * second deployment for a single page, the apex rewrites `/` to `/landing` —
 * same container, same build, no duplicated dependency tree to keep patched.
 *
 * A rewrite, not a redirect: the visitor stays on virgo.ph, which is the
 * address on the business card and the one that should be in the URL bar.
 *
 * Anything else requested on the apex is redirected to the app, so there is
 * exactly one canonical host for signed-in pages and no chance of a session
 * being established against a hostname the rest of the product does not use.
 */
/** `/@mika`, one segment, nothing after it. */
const HANDLE_PATH = /^\/@([A-Za-z0-9_]{3,30})\/?$/;

/**
 * `/jobs/wedding-photographer-cebu-k3f9x2`.
 *
 * Deliberately excludes the app-only routes by shape: a slug always ends in a
 * hyphen and six alphanumerics, which `new`, `mine` and `applications` do not.
 */
const JOB_SLUG_PATH = /^\/jobs\/([a-z0-9]+(?:-[a-z0-9]+)*-[a-z0-9]{6})\/?$/;

export function proxy(request: NextRequest): NextResponse {
  const host = request.headers.get('host')?.split(':')[0].toLowerCase() ?? '';
  const { pathname, search } = request.nextUrl;

  if (!MARKETING_HOSTS.has(host)) {
    /**
     * A profile has one address, `/@handle`, and it works on both hosts.
     *
     * Here it renders natively inside the app shell rather than bouncing to
     * the apex. Same content, same URL — the difference is that a signed-in
     * reader stays in the product instead of being dropped onto a marketing
     * page. Facebook does this with public posts and it is the reason they
     * never feel like a separate website.
     *
     * The lowercase rewrite keeps one canonical form, as on the apex.
     */
    /**
     * The app used to serve auth under `/auth/…` and now serves it at the
     * root. Google still has the old addresses indexed from before this host
     * was noindexed — a brand search currently surfaces
     * `web.virgo.ph/auth/sign-in`, which answers 404.
     *
     * A permanent redirect rather than the 410 that would drop them faster:
     * these are real pages that merely moved, and somebody arriving from a
     * stale result should land on the sign-in form rather than an error.
     */
    const legacyAuth = /^\/auth\/([a-z-]+)\/?$/.exec(pathname);
    if (legacyAuth) {
      return NextResponse.redirect(
        new URL(`/${legacyAuth[1]}${search}`, request.url),
        308,
      );
    }

    const onAppHost = HANDLE_PATH.exec(pathname);
    if (onAppHost) {
      return NextResponse.rewrite(
        new URL(`/u/${onAppHost[1].toLowerCase()}${search}`, request.url),
      );
    }
    return NextResponse.next();
  }

  if (pathname === '/') {
    return NextResponse.rewrite(new URL('/landing', request.url));
  }

  /**
   * Profiles and job posts moved behind the sign-in wall.
   *
   * They used to render here for anybody. They are now readable only with an
   * account, so the apex has nothing to serve — it hands the address to the
   * app, whose AuthGuard sends a signed-out visitor through sign-in and back
   * to the page they asked for.
   *
   * The shared link therefore still works: `virgo.ph/@mika` in an Instagram
   * bio lands on Mika's profile, just with a signup in the middle. What it no
   * longer does is answer a crawler.
   */
  if (HANDLE_PATH.test(pathname) || JOB_SLUG_PATH.test(pathname) || pathname === '/jobs') {
    return NextResponse.redirect(`${APP_ORIGIN}${pathname}${search}`, 308);
  }

  /**
   * Served by the apex, not handed to the app.
   *
   * Terms and Privacy are the documents a payment processor, an app store
   * review and a cautious customer all look for, and they were redirecting to
   * a 404 on a subdomain that tells crawlers to stay out.
   *
   * The generated OG card has to be here too. It has no file extension, so the
   * matcher below does not skip it, and the catch-all redirect sent every
   * share preview to the app host — a 308 where Messenger expects a PNG, which
   * is the whole card broken.
   *
   * /landing stays put or the rewrite at the top would bounce in a loop.
   */
  if (
    pathname === '/terms' ||
    pathname === '/privacy' ||
    pathname === '/landing' ||
    pathname.startsWith('/opengraph-image') ||
    pathname.startsWith('/twitter-image')
  ) {
    return NextResponse.next();
  }

  return NextResponse.redirect(`${APP_ORIGIN}${pathname}${search}`, 308);
}

export const config = {
  /**
   * Skips Next's internals and anything with a file extension.
   *
   * Without this the middleware runs for every chunk and image on the page —
   * hundreds of invocations that can only ever return `next()`.
   */
  matcher: ['/((?!_next/|api/|favicon|icon|logo|.*\\.).*)'],
};
