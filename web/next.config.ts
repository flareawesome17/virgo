import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /**
   * Stops the response announcing `x-powered-by: Next.js`.
   *
   * It tells an attacker which stack and therefore which CVEs to try, and
   * buys nothing in return.
   */
  poweredByHeader: false,

  /**
   * Security headers. There were none of any kind on either hostname.
   *
   * Deliberately excludes a full Content-Security-Policy: a real one needs
   * per-request nonces for Next's inline bootstrap, and a wrong CSP breaks
   * the site silently for whoever loads it first. `frame-ancestors` is the
   * one directive that governs no resource loading at all, so it is safe to
   * ship on its own and is the modern half of X-Frame-Options.
   */
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // Two years is the usual floor for preload eligibility, but
          // `preload` itself is intentionally absent — submitting to the
          // browser preload list is very hard to reverse, and that is a
          // decision to take on purpose rather than inherit from a config.
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Nothing embeds this app today and it holds authenticated
          // sessions, so framing is refused outright. If client galleries
          // ever need embedding, that becomes an explicit allowance here.
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
          // geolocation stays open to same-origin because Nearby depends on
          // it (useNearby.ts). Camera and microphone are used nowhere.
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(self)',
          },
        ],
      },
    ];
  },

  /**
   * Bundles the server and only the modules it actually reaches, so the Docker
   * image carries a fraction of node_modules. Required by the Dockerfile,
   * which copies `.next/standalone`.
   */
  output: 'standalone',

  /**
   * Where media is fetched from. Listed explicitly rather than with a
   * wildcard: `next/image` fetches and re-serves whatever is allowed here, so
   * an open list is an open proxy.
   *
   * The bucket is private, so URLs are presigned and point at the S3 endpoint
   * rather than at the CDN. `cdn.virgo.ph` stays listed because avatars and
   * any cover_url stored before the change still resolve through it.
   */
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'cdn.virgo.ph' },
      // Virtual-host style: the bucket is a subdomain of the endpoint, so the
      // host is `<bucket>.s3.<region>.backblazeb2.com`. One `*` matches exactly
      // that one label — not `**`, which would match any depth and let an
      // attacker-controlled subdomain through.
      { protocol: 'https', hostname: '*.s3.us-east-005.backblazeb2.com' },
      // Path-style, if B2_FORCE_PATH_STYLE is ever turned on.
      { protocol: 'https', hostname: 's3.us-east-005.backblazeb2.com' },
    ],
  },
};

export default nextConfig;
