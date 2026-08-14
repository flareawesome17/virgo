import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

/**
 * A private IPv4 literal: loopback, the three RFC 1918 ranges, or link-local.
 *
 * Matched as four whole octets rather than by prefix. `/^192\.168\./` also
 * matches `192.168.1.5.evil.com`, which is a hostname anybody can register and
 * point wherever they like — an anchored prefix test on a string that is not
 * necessarily an IP address is the bug this function exists to avoid.
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

/**
 * Hostnames that only mean something on this machine or this network.
 *
 * A public domain is none of these, which is the whole basis for treating them
 * differently below.
 */
function isLocalHostname(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '::1' ||
    hostname === '[::1]' ||
    // mDNS. Only resolvable on the local link, and not a registrable TLD.
    hostname === 'local' ||
    hostname.endsWith('.local') ||
    isPrivateIPv4(hostname)
  );
}

/** `http://192.168.1.5:3005` -> true. Anything not parseable -> false. */
export function isLocalOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    // Plain HTTP only. An https origin on a private address means a
    // certificate somebody went out of their way to install, and that is not
    // the development case this exists for.
    if (url.protocol !== 'http:') return false;
    return isLocalHostname(url.hostname);
  } catch {
    return false;
  }
}

/**
 * What `enableCors` should be given.
 *
 * By default this is the named list and nothing else — `validateEnv` refuses
 * to boot a production process without one, so `allowed` is never empty there.
 *
 * With `allowLan`, any plain-HTTP origin on this machine or this LAN is also
 * accepted. That is for the development stack, where the same build is opened
 * at localhost from the desk and at a LAN address from a phone, the LAN
 * address comes from DHCP, and naming it in CORS_ORIGINS means every new lease
 * breaks every request at the preflight. Nothing on a private address is
 * reachable from the internet, so the set this widens to is one an attacker
 * cannot be standing in.
 *
 * Driven by its own flag rather than by NODE_ENV, which cannot answer this
 * question: the Dockerfile sets NODE_ENV=production for every image including
 * the one the dev stack runs, because it describes how Node was built, not
 * where it was deployed.
 */
export function corsOptions(
  allowed: readonly string[],
  allowLan: boolean,
): CorsOptions {
  const shared = {
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  };

  // Only reachable outside production, where validateEnv would have refused to
  // boot. Reflecting the origin is what makes localhost, a LAN IP and the Expo
  // tunnel all work at once.
  if (allowed.length === 0) return { ...shared, origin: true };

  if (!allowLan) return { ...shared, origin: [...allowed] };

  return {
    ...shared,
    origin(origin, callback) {
      // No Origin header at all: curl, a same-origin request, or another
      // server. CORS is not what governs those.
      if (!origin) return callback(null, true);
      callback(null, allowed.includes(origin) || isLocalOrigin(origin));
    },
  };
}
