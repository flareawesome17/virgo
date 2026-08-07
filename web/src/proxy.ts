import { NextResponse, type NextRequest } from 'next/server';

/**
 * Hosts that should see the marketing site rather than the app.
 *
 * The apex and www only. `web.virgo.ph` is the product and must keep serving
 * the dashboard at `/`.
 */
const MARKETING_HOSTS = new Set(['virgo.ph', 'www.virgo.ph']);

/** Where the app lives, for links out of the marketing site. */
const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_ORIGIN ?? 'https://web.virgo.ph';

/** The public origin, and the only place a profile is canonically addressed. */
const SITE_ORIGIN = process.env.NEXT_PUBLIC_SITE_ORIGIN ?? 'https://virgo.ph';

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
   * Public profiles: virgo.ph/@mika.
   *
   * Rewritten to an internal `/p/[handle]` route rather than served from a
   * root-level `[handle]`, which would compete with /landing and every future
   * marketing page for the same segment.
   *
   * Note a folder named `@handle` would not have worked either — in the App
   * Router that is a parallel route *slot*, and the docs are explicit that
   * slots "do not affect the URL structure".
   */
  const profile = HANDLE_PATH.exec(pathname);
  if (profile) {
    const handle = profile[1].toLowerCase();

    // One canonical URL per profile. `/@MIKA` and `/@mika/` are the same page,
    // and serving all three would split their search ranking three ways.
    if (pathname !== `/@${handle}`) {
      return NextResponse.redirect(`${SITE_ORIGIN}/@${handle}${search}`, 308);
    }

    return NextResponse.rewrite(new URL(`/p/${handle}${search}`, request.url));
  }

  // /landing itself stays put — otherwise the rewrite above would bounce.
  if (pathname === '/landing') return NextResponse.next();

  /**
   * The job board is public and indexable, so it is served from the apex
   * rather than redirected to the app.
   *
   * Only the reading half. `/jobs/new`, `/jobs/mine` and `/jobs/applications`
   * need a session and live on the app host, so they fall through to the
   * redirect below — which is why this matches the board and a post slug
   * specifically rather than everything under /jobs.
   */
  if (pathname === '/jobs') return NextResponse.next();

  /**
   * A post is `/jobs/<slug>` on both hosts.
   *
   * The app owns that path in the router so signed-in readers get the native
   * screen; the public copy lives at `/j/<slug>`, and this rewrite is what
   * lets the apex serve it under the shared address. Without the indirection
   * the two would be the same route and Next would refuse to build.
   */
  const jobSlug = JOB_SLUG_PATH.exec(pathname);
  if (jobSlug) {
    return NextResponse.rewrite(
      new URL(`/j/${jobSlug[1]}${search}`, request.url),
    );
  }

  // Reachable directly too, so a redirect here would bounce the rewrite above
  // straight back out to the app.
  if (pathname.startsWith('/j/')) return NextResponse.next();

  // The internal path is reachable directly too, so a redirect here would
  // bounce the rewrite above straight back out to the app.
  if (pathname.startsWith('/p/')) return NextResponse.next();

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
