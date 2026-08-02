import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /**
   * Bundles the server and only the modules it actually reaches, so the Docker
   * image carries a fraction of node_modules. Required by the Dockerfile,
   * which copies `.next/standalone`.
   */
  output: 'standalone',

  /**
   * Media comes from the CDN in front of the B2 bucket. Listed explicitly
   * rather than with a wildcard: `next/image` fetches and re-serves whatever is
   * allowed here, so an open list is an open proxy.
   */
  images: {
    remotePatterns: [{ protocol: 'https', hostname: 'cdn.virgo.ph' }],
  },
};

export default nextConfig;
