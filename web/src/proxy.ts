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

/**
 * Addresses that moved, on the app host, and where they went.
 *
 * Emails, bookmarks and notifications already sent carry the old ones, so
 * each keeps working. The phone's own addresses are here too: a link copied
 * out of the app on a phone and opened on a computer lands on the same
 * screen rather than a 404.
 */
const MOVED: Record<string, string> = {
  // Never existed, but the account-paused email linked to it until 2026-10.
  '/login': '/sign-in',
  // Jobs is one screen with the board, your posts, your applications and
  // your bookings as tabs; People takes in the enquiries and Nearby.
  '/jobs/mine': '/jobs',
  '/jobs/applications': '/jobs?tab=applied',
  '/bookings': '/jobs?tab=bookings',
  '/network': '/people',
  '/nearby': '/people?tab=nearby',
  '/profile': '/settings/profile',
  // The phone's.
  '/connect': '/people',
  '/discover/nearby': '/people?tab=nearby',
  '/friends': '/people',
  '/friends/requests': '/people',
  '/friends/accepted': '/people',
  '/friends/enquiries': '/people?tab=enquiries',
  '/workspaces/archived': '/workspaces?archived=1',
  '/workspaces/create': '/workspaces?new=1',
  '/schedule/create': '/schedule?new=1',
  '/schedule/calendar': '/schedule',
  '/schedule/agenda': '/schedule?tab=upcoming',
  '/schedule/reminders': '/schedule?tab=reminders',
  '/settings/public-profile': '/settings/profile',
  '/settings/password': '/settings/account',
  '/settings/email': '/settings/account',
  '/settings/storage/plans': '/settings/plans',
  '/settings/storage/unfiled': '/settings/storage',
  '/settings/theme': '/settings',
  '/settings/privacy': '/settings',
  '/settings/about': '/settings',
  '/settings/help': '/support',
};

/**
 * Where a moved address goes now, with its query kept.
 *
 * The new address's own query wins where both name the same key, so
 * `/nearby?tab=x` is still Nearby; anything else the old link carried, such as
 * `?tab=posted&post=…` on /jobs/mine, comes along.
 */
function movedTo(pathname: string, incoming: URLSearchParams): string | null {
  const path = pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname;
  let target = MOVED[path];
  // Connect has two views on the phone; Messages is Chat here.
  if (path === '/connect' && incoming.get('view') === 'messages') target = '/chat';
  // One notification, opened as the list's detail pane.
  const notification = /^\/notifications\/([^/]+)$/.exec(path);
  if (notification) target = `/notifications?id=${encodeURIComponent(notification[1])}`;
  if (!target) return null;

  const [targetPath, targetQuery = ''] = target.split('?');
  const query = new URLSearchParams(targetQuery);
  for (const [key, value] of incoming) {
    if (key === 'view' && path === '/connect') continue;
    if (!query.has(key)) query.append(key, value);
  }
  const qs = query.toString();
  return qs ? `${targetPath}?${qs}` : targetPath;
}

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

    const moved = movedTo(pathname, request.nextUrl.searchParams);
    if (moved) return NextResponse.redirect(new URL(moved, request.url), 308);

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
    // The desktop download page. Marketing, not product: it is for people who
    // do not have an account yet, and it is linked from the header of every
    // page on this host. Without this line the catch-all below would send it
    // to web.virgo.ph/download, which does not exist.
    pathname === '/download' ||
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
