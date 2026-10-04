import { fetchPlans } from '@/components/landing/plans';
import { StructuredData } from '@/components/landing/structured-data';
import { StoryPage } from '@/components/story/page/story-page';

/**
 * Static, regenerated in the background at most once an hour.
 *
 * fetchPlans builds with the launch catalogue and keeps the last good page if
 * the API fails at runtime, so the HTML is cached and served at once.
 *
 * Kept a literal: Next reads this export statically. It matches PLANS_TTL.
 */
export const revalidate = 3600;

export default async function LandingPage() {
  const plans = await fetchPlans();
  return (
    <>
      <StructuredData />
      <StoryPage plans={plans} />
    </>
  );
}
