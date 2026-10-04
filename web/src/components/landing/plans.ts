import { API_BASE_URL } from '@/api/config';
import type { PlanInfo } from '@/api';

/** How long a fetched price list stays good for, in seconds. */
export const PLANS_TTL = 3600;

/**
 * The plans as they are at launch: a copy of `PLAN_CATALOGUE` in
 * api/src/quota/quota.config.ts, as `/plans` serialises it (Infinity → null).
 *
 * It is what the page is built with. `docker build` runs before the stack the
 * container talks to is up, so the build cannot ask the API; it used to bake
 * in the "could not reach the API" fallback, which is why the page was made
 * dynamic. Building with the launch catalogue instead lets the page be
 * static and cached, and the first regeneration after deploy replaces it with
 * the live list.
 *
 * Keep it in step with the API's catalogue when prices or limits change.
 */
export const LAUNCH_PLANS: PlanInfo[] = [
  {
    name: 'free',
    label: 'Free',
    priceMinor: 0,
    currency: 'PHP',
    comingSoon: false,
    storageBytes: 15 * 1024 ** 3,
    workspaces: 3,
    albumsPerWorkspace: 10,
    features: ['15 GB cloud storage', '3 workspaces', '10 albums per workspace', 'Client share links'],
  },
  {
    name: 'freelance',
    label: 'Freelancer',
    priceMinor: 39_900,
    currency: 'PHP',
    comingSoon: true,
    storageBytes: 100 * 1024 ** 3,
    workspaces: 3,
    albumsPerWorkspace: 10,
    features: [
      '100 GB cloud storage',
      '3 workspaces',
      '10 albums per workspace',
      'Client share links',
      'Collaborators and chat',
    ],
  },
  {
    name: 'studio',
    label: 'Studio',
    priceMinor: 99_900,
    currency: 'PHP',
    comingSoon: true,
    storageBytes: 500 * 1024 ** 3,
    workspaces: 10,
    albumsPerWorkspace: null,
    features: [
      '500 GB cloud storage',
      '10 workspaces',
      'Unlimited albums within your storage',
      'Team roles and permissions',
    ],
  },
  {
    name: 'business',
    label: 'Business',
    priceMinor: 249_900,
    currency: 'PHP',
    comingSoon: true,
    storageBytes: 2 * 1024 ** 4,
    workspaces: null,
    albumsPerWorkspace: null,
    features: [
      '2 TB cloud storage',
      'Unlimited workspaces',
      'Unlimited albums within your storage',
      'Advanced permissions and activity history',
      'Priority support',
    ],
  },
];

/**
 * The plans, from the same endpoint the app and the quota service read.
 *
 * Fetched on the server so the numbers are in the HTML: a pricing table that
 * arrives after hydration is one that crawlers and slow connections never see.
 *
 * - **At build** (or in `next dev` without the API): the launch catalogue.
 * - **At runtime**, a failed request *throws*. The page is regenerated in the
 *   background, so a throw keeps the last good copy being served. Returning a
 *   fallback here would instead cache "see plans in the app" for an hour on
 *   every visit after one API blip.
 * - A successful but empty answer is passed on as it is; the pricing section
 *   already handles a list with no free plan.
 */
export async function fetchPlans(): Promise<PlanInfo[]> {
  const building = process.env.NEXT_PHASE === 'phase-production-build';
  const developing = process.env.NODE_ENV !== 'production';

  // Straight across the container network when it is available. It avoids a
  // round trip out through Cloudflare and back, and keeps the page working if
  // the public hostname is having a bad day.
  const base = process.env.API_INTERNAL_URL || API_BASE_URL;

  try {
    const res = await fetch(`${base}/plans`, {
      next: { revalidate: PLANS_TTL },
      // A build with no route to the API should fall back quickly, not hang.
      signal: AbortSignal.timeout(building ? 3_000 : 8_000),
    });
    if (!res.ok) throw new Error(`/plans answered ${res.status}`);
    const body = (await res.json()) as { data?: PlanInfo[] };
    return body.data ?? [];
  } catch (error) {
    if (building || developing) return LAUNCH_PLANS;
    throw error;
  }
}
