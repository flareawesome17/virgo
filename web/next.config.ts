import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
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
