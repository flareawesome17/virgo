/**
 * API configuration.
 *
 * Points at the NestJS backend in `api/`. Set NEXT_PUBLIC_API_URL in web/.env.local:
 *
 *   Local (container publishes on the host):  http://localhost:3001
 *   Deployed:                                 https://api.virgo.ph
 *
 * NEXT_PUBLIC_ because the browser makes these calls directly — the token
 * lives on the client, so routing them through a Next server would mean
 * holding the session server-side for no gain.
 *
 * The API must list this app's origin in CORS_ORIGINS, or every request fails
 * the browser's preflight before it reaches a route.
 */
const RAW_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

if (!RAW_BASE_URL && typeof window !== 'undefined') {
  console.warn('[api] NEXT_PUBLIC_API_URL is not set — every request will fail.');
}

/** Trailing slashes would produce `//workspaces` when joined with a path. */
export const API_BASE_URL = RAW_BASE_URL.replace(/\/+$/, '');

/** Aborts a request that hangs rather than leaving a spinner forever. */
export const REQUEST_TIMEOUT_MS = 20_000;
