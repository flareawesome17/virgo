import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { JobsTabs, TabScreen, useTabBottomInset } from '@/components';
import type { JobsTab } from '@/components/JobsTabs';
import { useMarkJobsSeen, useUnseenJobs } from '@/src/hooks';

/**
 * Accepts web's spelling as well as this screen's own: the tab is `applied`
 * here and `applications` on web, and a link built for one should not miss
 * on the other.
 */
const TAB_ALIASES: Record<string, JobsTab> = {
  browse: 'browse',
  posted: 'posted',
  applied: 'applied',
  applications: 'applied',
  bookings: 'bookings',
};

/**
 * The jobs board, as a screen of its own.
 *
 * One of the five destinations in the bottom bar. Which sub-tab shows is the
 * address (`?tab=`, and `?post=` for the post a new application is on), so a
 * notification lands on the right one here rather than on a second copy of
 * this screen pushed over it — that was /jobs/mine.
 */
export default function JobsScreen() {
  const params = useLocalSearchParams<{ tab?: string; post?: string }>();
  const tab: JobsTab = TAB_ALIASES[params.tab ?? ''] ?? 'browse';
  const { count: unseenJobs } = useUnseenJobs();
  const markSeen = useMarkJobsSeen();
  const bottomInset = useTabBottomInset();

  // Opening the board is what "seen" means for new postings. Applications
  // waiting on you stay counted until you answer them.
  useFocusEffect(
    useCallback(() => {
      if (unseenJobs > 0) markSeen.mutate();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [unseenJobs]),
  );

  return (
    <TabScreen title="Jobs" create="job">
      {/* Clears the tab bar, which this screen keeps. */}
      <JobsTabs
        tab={tab}
        onTabChange={(next) => router.setParams({ tab: next, post: undefined })}
        focusPostId={params.post}
        bottomPadding={bottomInset}
      />
    </TabScreen>
  );
}
