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
export function proxy(request: NextRequest): NextResponse {
  const host = request.headers.get('host')?.split(':')[0].toLowerCase() ?? '';
  if (!MARKETING_HOSTS.has(host)) return NextResponse.next();

  const { pathname, search } = request.nextUrl;

  if (pathname === '/') {
    return NextResponse.rewrite(new URL('/landing', request.url));
  }

  // /landing itself stays put — otherwise the rewrite above would bounce.
  if (pathname === '/landing') return NextResponse.next();

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
