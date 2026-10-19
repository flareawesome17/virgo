import { Redirect, useLocalSearchParams } from 'expo-router';

/**
 * My jobs is the Jobs tab.
 *
 * This was a second copy of it, pushed over the first, with its own header —
 * where applying, posting and a new-application push all used to land, so
 * Back went from one Jobs screen to another. Kept as a route, so a link or a
 * notification already out there still lands, on the tab itself. Posted is
 * the default here, as it always was.
 */
export default function MyJobsRedirect() {
  const { tab, post } = useLocalSearchParams<{ tab?: string; post?: string }>();
  const query = new URLSearchParams({ tab: tab || 'posted', ...(post ? { post } : {}) });
  return <Redirect href={`/(app)/(tabs)/jobs?${query.toString()}`} />;
}
