'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from '@/hooks/useAuth';
import type { FeedItem } from '@/api';
import { CommentsDialog, type CommentsRequest } from './comments-dialog';
import { useKeepFlow } from './keep-flow';
import { ShowcaseReportDialog } from './report-dialog';

interface ShowcaseHostValue {
  /** The signed-in person, to tell their own posts from anybody else's. */
  userId: string | undefined;
  keep: (item: FeedItem) => void;
  report: (showcaseId: string) => void;
  openComments: (item: FeedItem, opts?: { write?: boolean }) => void;
}

const HostContext = createContext<ShowcaseHostValue | null>(null);

/**
 * The dialogs every card on a page shares: Keep, Report, and the comments.
 *
 * Rendered once per page rather than once per card, so a feed of fifty posts
 * holds three dialogs, not a hundred and fifty. A card opened inside another
 * dialog (a shelf's post, a profile's) still reaches these, because context
 * follows the React tree through a portal.
 */
export function ShowcaseHost({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id;
  const keepFlow = useKeepFlow(userId);
  const [reporting, setReporting] = useState<string | null>(null);
  const [comments, setComments] = useState<CommentsRequest | null>(null);
  const onKeep = keepFlow.onKeep;

  const value = useMemo<ShowcaseHostValue>(
    () => ({
      userId,
      keep: onKeep,
      report: setReporting,
      openComments: (item, opts) => setComments({ item, write: opts?.write ?? false }),
    }),
    [userId, onKeep],
  );

  return (
    <HostContext.Provider value={value}>
      {children}
      {keepFlow.element}
      <ShowcaseReportDialog showcaseId={reporting} onClose={() => setReporting(null)} />
      <CommentsDialog request={comments} userId={userId} onClose={() => setComments(null)} />
    </HostContext.Provider>
  );
}

export function useShowcaseHost(): ShowcaseHostValue {
  const value = useContext(HostContext);
  if (!value) throw new Error('A showcase card needs a <ShowcaseHost> above it.');
  return value;
}
