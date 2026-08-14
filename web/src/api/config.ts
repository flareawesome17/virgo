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

/**
 * Hostnames that only mean something on this machine or this network.
 *
 * Matched as four whole octets, not by prefix: `/^192\.168\./` also matches
 * `192.168.1.5.evil.com`, a name anybody can register. A public domain is
 * none of these, which is what keeps the rewrite below away from anything
 * deployed.
 */
function isPrivateIPv4(hostname: string): boolean {
  const parts = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
  if (!parts) return false;

  const octets = parts.slice(1).map(Number);
  if (octets.some((n) => n > 255)) return false;

  const [a, b] = octets;
  if (a === 127) return true; // loopback
  if (a === 10) return true; // RFC 1918
  if (a === 192 && b === 168) return true; // RFC 1918
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC 1918
  if (a === 169 && b === 254) return true; // link-local
  return false;
}

function isLocalHostname(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '::1' ||
    hostname === '[::1]' ||
    hostname === 'local' ||
    hostname.endsWith('.local') ||
    isPrivateIPv4(hostname)
  );
}

/**
 * Follows the browser's own hostname when the configured API is a local one.
 *
 * NEXT_PUBLIC_* is inlined at build time, so a development image carries
 * whatever LAN address the machine had when it was built. On a DHCP lease that
 * address changes, and every request then goes to a host that is no longer
 * there — the app looks broken, and the only fix is a rebuild.
 *
 * The port is the part that is actually configured; the host is just "wherever
 * this stack is", and the page already knows that. So a page served from
 * localhost talks to localhost, and the same build opened from a phone at
 * 192.168.1.5 talks to 192.168.1.5 — no rebuild, and it survives the next
 * lease.
 *
 * Only local hostnames are rewritten. https://api.virgo.ph is left exactly as
 * configured, so production is untouched by this.
 *
 * Server-side this is a no-op: there is no `window`, and the one server-side
 * caller (the landing page's price fetch) prefers API_INTERNAL_URL anyway,
 * which addresses the API across the container network.
 */
function resolveBaseUrl(raw: string): string {
  if (!raw || typeof window === 'undefined') return raw;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return raw;
  }

  if (!isLocalHostname(url.hostname)) return raw;
  if (url.hostname === window.location.hostname) return raw;

  url.hostname = window.location.hostname;
  return url.toString();
}

/** Trailing slashes would produce `//workspaces` when joined with a path. */
export const API_BASE_URL = resolveBaseUrl(RAW_BASE_URL).replace(/\/+$/, '');

/** Aborts a request that hangs rather than leaving a spinner forever. */
export const REQUEST_TIMEOUT_MS = 20_000;
