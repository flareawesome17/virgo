import { LandingNav } from '@/components/landing/nav';
import { LandingHero } from '@/components/landing/hero';
import { LandingPillars } from '@/components/landing/pillars';
import { LandingShowcase } from '@/components/landing/showcase';
import { LandingNearby } from '@/components/landing/nearby';
import { LandingCommunity } from '@/components/landing/community';
import { LandingDelivery } from '@/components/landing/delivery';
import { LandingFeatures } from '@/components/landing/features';
import { LandingHow } from '@/components/landing/how';
import { LandingPricing } from '@/components/landing/pricing';
import { LandingClosing, LandingFooter } from '@/components/landing/closing';
import { LandingFaq } from '@/components/landing/faq';
import { StructuredData } from '@/components/landing/structured-data';
import { fetchPlans } from '@/components/landing/plans';

/**
 * Static, regenerated in the background at most once an hour.
 *
 * The page used to render on every request (force-dynamic), because a build
 * cannot reach the API for the prices. fetchPlans now builds with the launch
 * catalogue and keeps the last good page if the API fails at runtime, so the
 * HTML can be cached and served at once: the first thing any visitor waits on
 * is no longer a server render.
 *
 * Kept a literal: Next reads this export statically. It matches PLANS_TTL.
 */
export const revalidate = 3600;

export default async function LandingPage() {
  const plans = await fetchPlans();

  return (
    <>
      <StructuredData />
      <LandingNav />
      {/* Ordered as the pitch reads: what it is, then the three things it is
          for, then each of those in turn — hire, connect, deliver — before the
          full feature list, the walkthrough and the price. */}
      <main>
        <LandingHero />
        <LandingShowcase />
        <LandingPillars />
        <LandingNearby />
        <LandingCommunity />
        <LandingDelivery />
        <LandingFeatures />
        <LandingHow />
        <LandingPricing plans={plans} />
        {/* After the price: the last objections before the ask. */}
        <LandingFaq />
        <LandingClosing />
      </main>
      <LandingFooter />
    </>
  );
}
