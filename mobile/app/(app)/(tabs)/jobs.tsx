import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { JobsTabs, TabScreen, useTabBottomInset } from '@/components';
import { useMarkJobsSeen, useUnseenJobs } from '@/src/hooks';

/**
 * The jobs board, as a screen of its own.
 *
 * It used to be half of the Home screen, behind a segmented control — which
 * meant the board had no address, and the bottom bar said nothing about where
 * the most active part of the app was. It is a tab route rather than a pushed
 * screen so the bottom bar stays put: leaving Jobs for Workspaces is one tap,
 * not a back gesture and then a tap.
 *
 * One of the five destinations in the bottom bar. Its name is in the top bar,
 * and posting a job is the + there — it used to have a title row of its own
 * with a Post button, under a bar that already said where you were.
 */
export default function JobsScreen() {
  const { count: unseenJobs } = useUnseenJobs();
  const markSeen = useMarkJobsSeen();
  const bottomInset = useTabBottomInset();

  // Opening the board is what "seen" means. This used to happen on the top
  // bar's Jobs tab; the tab moved to the bottom bar, and without this the
  // badge would have counted up for ever with nothing able to clear it.
  useFocusEffect(
    useCallback(() => {
      if (unseenJobs > 0) markSeen.mutate();
      // Deliberately not depending on the mutation: it is recreated each
      // render, and depending on it would re-run this on every one.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [unseenJobs]),
  );

  return (
    <TabScreen title="Jobs" create="job">
      {/* Clears the tab bar, which this screen keeps. */}
      <JobsTabs bottomPadding={bottomInset} />
    </TabScreen>
  );
}
