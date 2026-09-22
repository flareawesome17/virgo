import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  ApiError,
  blocksApi,
  queryKeys,
  type BlockedPerson,
  type ListResponse,
  type PersonRef,
  type ReportSource,
  type UserReportReason,
} from '@/src/api';
import type { QueryOptions } from '@/src/hooks/useWorkspaces';

/** The people you have blocked, newest first. */
export function useBlocks(options: QueryOptions = {}) {
  const query = useQuery({
    queryKey: queryKeys.blocks.list,
    queryFn: () => blocksApi.list(),
    enabled: options.enabled ?? true,
  });

  return {
    ...query,
    /** Failed *or* paused — an offline device never reaches `isError`. */
    loadFailed: query.isError || query.isPaused,
    blocks: query.data?.data ?? ([] as BlockedPerson[]),
    total: query.data?.total ?? 0,
  };
}

/**
 * Everything a block or an unblock can change the answer to.
 *
 * Wide on purpose. A block removes the person from search, Nearby, the job
 * board and your requests, freezes your chat, declines what was waiting
 * between you and clears their notifications from your list — and every one
 * of those is cached under its own key. Refreshing only the blocked list would
 * leave the person you just blocked sitting on the screen you blocked them
 * from.
 *
 * What was waiting includes invitations to a workspace or a shoot, in either
 * direction, so collaborators, schedule events and workspaces are here too.
 * Without them the invitation badge and cards kept offering an Accept that
 * could only answer "Invitation not found", and your own invitation to them
 * still read "Waiting" in the members and attendee lists.
 *
 * Your own page too: a block ends the friendship, so your connection count on
 * it drops by one.
 */
const invalidateSafety = (queryClient: QueryClient) =>
  [
    queryKeys.blocks.all,
    queryKeys.friends.all,
    queryKeys.chat.all,
    queryKeys.discover.all,
    queryKeys.hire.all,
    queryKeys.jobs.all,
    queryKeys.publicProfiles.all,
    queryKeys.profile.page,
    queryKeys.notifications.all,
    queryKeys.collaborators.all,
    queryKeys.scheduleEvents.all,
    queryKeys.workspaces.all,
  ].forEach((queryKey) => queryClient.invalidateQueries({ queryKey }));

export function useBlockPerson() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ref: PersonRef) => blocksApi.block(ref),
    onSuccess: () => invalidateSafety(queryClient),
  });
}

/**
 * Takes the block's id, from the blocked list or a chat participant.
 *
 * A 404 is taken as done. The only way to send an id that no longer exists is
 * to unblock the same person twice — a second tap before the refetch lands,
 * or an unblock already made on another device — and telling someone who has
 * just unblocked a person that the person may have left Virgo is both wrong
 * and alarming.
 */
export function useUnblock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      blocksApi.unblock(id).catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 404) return;
        throw err;
      }),
    onSuccess: (_done, id) => {
      // Out of the list at once rather than when GET /blocks returns: the
      // mutation settles before the refetch does, and until then the row sat
      // there with its Unblock button enabled again.
      queryClient.setQueryData<ListResponse<BlockedPerson>>(queryKeys.blocks.list, (old) =>
        old && old.data.some((b) => b.id === id)
          ? { ...old, data: old.data.filter((b) => b.id !== id), total: Math.max(0, old.total - 1) }
          : old,
      );
      invalidateSafety(queryClient);
    },
  });
}

/** A report changes nothing you can see, so nothing is refreshed. */
export function useReportPerson() {
  return useMutation({
    mutationFn: (input: {
      ref: PersonRef;
      reason: UserReportReason;
      note?: string;
      from?: ReportSource;
    }) => blocksApi.report(input),
  });
}
