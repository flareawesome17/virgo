import { LandingNav } from '@/components/landing/nav';
import { LandingHero } from '@/components/landing/hero';
import { LandingPillars } from '@/components/landing/pillars';
import { LandingNearby } from '@/components/landing/nearby';
import { LandingCommunity } from '@/components/landing/community';
import { LandingDelivery } from '@/components/landing/delivery';
import { LandingFeatures } from '@/components/landing/features';
import { LandingHow } from '@/components/landing/how';
import { LandingPricing } from '@/components/landing/pricing';
import { LandingClosing, LandingFooter } from '@/components/landing/closing';
import { API_BASE_URL, type PlanInfo } from '@/api';

/** How long a fetched price list stays good for. */
const PLANS_TTL = 3600;

/**
 * Rendered per request, not at build.
 *
 * The prices come from the API, and during `docker build` there is no route to
 * it — the container is built before the stack it talks to is running. A
 * statically generated page therefore baked in the "could not reach the API"
 * fallback and served it forever, because the build is the only time it would
 * ever have run.
 *
 * Dynamic moves that fetch to the first real request, where the API is up. The
 * fetch itself is still cached for an hour, so this costs one call an hour
 * rather than one per visitor — and a price change appears within the hour
 * with no redeploy.
 */
export const dynamic = 'force-dynamic';

/**
 * The plans, from the same endpoint the app and the quota service read.
 *
 * Fetched on the server so the numbers are in the HTML — a pricing table that
 * arrives after hydration is one that crawlers and slow connections never see.
 *
 * Returns an empty list rather than throwing: an API hiccup should cost the
 * pricing section, which then says "see plans in the app", not the whole page.
 */
async function fetchPlans(): Promise<PlanInfo[]> {
  // Straight across the container network when it is available. It avoids a
  // round trip out through Cloudflare and back, and keeps the page working if
  // the public hostname is having a bad day.
  const base = process.env.API_INTERNAL_URL || API_BASE_URL;

  try {
    const res = await fetch(`${base}/plans`, {
      next: { revalidate: PLANS_TTL },
    });
    if (!res.ok) return [];
    const body = (await res.json()) as { data?: PlanInfo[] };
    return body.data ?? [];
  } catch {
    return [];
  }
}

export default async function LandingPage() {
  const plans = await fetchPlans();

  return (
    <>
      <LandingNav />
      {/* Ordered as the pitch reads: what it is, then the three things it is
          for, then each of those in turn — hire, connect, deliver — before the
          full feature list, the walkthrough and the price. */}
      <main>
        <LandingHero />
        <LandingPillars />
        <LandingNearby />
        <LandingCommunity />
        <LandingDelivery />
        <LandingFeatures />
        <LandingHow />
        <LandingPricing plans={plans} />
        <LandingClosing />
      </main>
      <LandingFooter />
    </>
  );
}
