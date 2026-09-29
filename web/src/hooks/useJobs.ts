import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  jobsApi,
  queryKeys,
  type CreateJobInput,
  type JobApplication,
  type JobPost,
  type ListJobsParams,
  type ReportReason,
} from '@/api';

/**
 * The board, filtered.
 *
 * Every distinct filter is its own query key, so typing a location used to
 * mean a key with no cached data — which blanks the list to a spinner on each
 * debounce and makes a search that returns in 40ms feel broken.
 *
 * `keepPreviousData` holds the last result on screen while the next one loads,
 * so the list never empties and the only signal is `isPending` going true,
 * which the UI can show as a quiet inline hint rather than a full-screen
 * spinner. Going back to a term searched moments ago is instant, since that
 * key is still in cache.
 *
 * A page at a time. It asked for one page and the API's default is 30, so the
 * header said "42 open jobs" and the twelve after the thirtieth — the farthest,
 * since the board is nearest first — could never be reached. Offsets, because
 * that is what the board's ordering by distance supports; a post that shifts
 * the list between pages is shown once, not twice.
 */
const JOBS_PAGE = 30;

export function useJobs(params: ListJobsParams = {}) {
  const query = useInfiniteQuery({
    queryKey: queryKeys.jobs.list(params),
    queryFn: ({ pageParam }) => jobsApi.list({ ...params, limit: JOBS_PAGE, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((n, page) => n + page.data.length, 0);
      return last.data.length > 0 && loaded < last.total ? loaded : undefined;
    },
    placeholderData: keepPreviousData,
  });

  const seen = new Set<string>();
  // \`pages\` is checked, not assumed: a board saved to disk before this was
  // paged has none, and reads as empty until it refetches.
  const jobs = (query.data?.pages ?? []).flatMap((page) =>
    page.data.filter((job) => (seen.has(job.id) ? false : (seen.add(job.id), true))),
  );

  return {
    ...query,
    jobs: jobs as JobPost[],
    total: query.data?.pages?.[0]?.total ?? 0,
    /** True while a *different* filter is loading and older results are shown. */
    isRefiltering: query.isPlaceholderData,
    /**
     * Whether this list failed to arrive — `isError` alone is not enough.
     *
     * React Query pauses a retry instead of failing it whenever it believes
     * the tab is unfocused or the device is offline (`fetchStatus: 'paused'`,
     * status still `pending`, `error` still null). An offline phone therefore
     * parks every list in a state that is neither loading nor errored, and a
     * screen switching on `isError` falls through to "No open jobs right now"
     * — a confident claim about the world, made from a request that never
     * completed. `isPaused` is what catches it, and "check your connection" is
     * exactly the right thing to say about it.
     */
    loadFailed: query.isError || query.isPaused,
  };
}

export function useJob(slug: string | undefined) {
  return useQuery({
    queryKey: queryKeys.jobs.detail(slug ?? ''),
    queryFn: () => jobsApi.bySlug(slug as string),
    enabled: !!slug,
    retry: false,
  });
}

/** Posts the caller has made. */
export function useMyJobs() {
  const query = useQuery({
    queryKey: queryKeys.jobs.mine,
    queryFn: () => jobsApi.mine(),
  });

  return {
    ...query,
    /** Failed *or* paused — an offline device never reaches `isError`. */
    loadFailed: query.isError || query.isPaused,
    jobs: query.data?.data ?? ([] as JobPost[]),
  };
}

/** Applicants on one post, for the poster. */
export function useApplicants(postId: string | undefined) {
  const query = useQuery({
    queryKey: queryKeys.jobs.applicants(postId ?? ''),
    queryFn: () => jobsApi.applicants(postId as string),
    enabled: !!postId,
  });

  return {
    ...query,
    /** Failed *or* paused — an offline device never reaches `isError`. */
    loadFailed: query.isError || query.isPaused,
    applications: query.data?.data ?? ([] as JobApplication[]),
    // No `unanswered` here on purpose. The badge both clients show comes from
    // `newApplicantCount` on the post, which the server counts across every
    // application rather than the page of them this hook happens to hold.
  };
}

/** Everything the caller has applied to. */
export function useMyApplications() {
  const query = useQuery({
    queryKey: queryKeys.jobs.myApplications,
    queryFn: () => jobsApi.myApplications(),
  });

  return {
    ...query,
    /** Failed *or* paused — an offline device never reaches `isError`. */
    loadFailed: query.isError || query.isPaused,
    applications: query.data?.data ?? ([] as JobApplication[]),
  };
}

export function useCreateJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateJobInput) => jobsApi.create(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.jobs.all });
    },
  });
}

export function useSetJobStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'open' | 'filled' | 'closed' }) =>
      jobsApi.setStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.jobs.all });
    },
  });
}

/**
 * How many people ending this post would answer.
 *
 * Fetched lazily — a poster who never opens the confirmation should not pay
 * for the count on every render of the list.
 */
export function usePendingApplicants() {
  return useMutation({
    mutationFn: (postId: string) => jobsApi.pendingApplicants(postId),
  });
}

export function useUpdateJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...input
    }: { id: string } & Parameters<typeof jobsApi.update>[1]) =>
      jobsApi.update(id, input),
    onSuccess: () => {
      // The board, the poster's own list and the post page can all show a
      // stale title otherwise.
      void queryClient.invalidateQueries({ queryKey: queryKeys.jobs.all });
    },
  });
}

export function useDeleteJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => jobsApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.jobs.all });
      // Cancelled bookings made from its applications go with it.
      queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all });
    },
  });
}

export function useApplyToJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ slug, role }: { slug: string; role?: string | null }) =>
      jobsApi.apply(slug, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.jobs.all });
    },
  });
}

/**
 * Answering an application.
 *
 * Accepting also writes a friendship and opens a conversation, so those two
 * lists are stale the moment it succeeds — not just the applicant list.
 */
export function useRespondToApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      status,
    }: {
      id: string;
      status: 'shortlisted' | 'accepted' | 'declined';
    }) => jobsApi.respond(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.jobs.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.friends.all });
      queryClient.invalidateQueries({ queryKey: ['chat'] });
      // A new connection changes their Connect button and both counts.
      queryClient.invalidateQueries({ queryKey: queryKeys.publicProfiles.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.profile.page });
    },
  });
}

/**
 * The Jobs badge: postings you have not seen, plus applications waiting on you.
 *
 * `total` is what the nav shows. It has to include both, because an
 * application used to arrive as a socket frame and an email and nothing else
 * — if the app was shut when it landed, the only record of it was in your
 * inbox, and the device that posted the job showed no sign at all.
 *
 * They stay separate underneath: opening the board clears `count`, and
 * `applications` survives until you actually answer the person.
 *
 * Polled on a slow interval as well as pushed over the socket. The push is
 * what makes it feel instant; the poll is what makes it *right* — a socket
 * that dropped while the phone was asleep misses every frame sent in between,
 * and a badge that silently stops counting is worse than one that lags.
 */
export function useUnseenJobs() {
  const query = useQuery({
    queryKey: queryKeys.jobs.unseen,
    queryFn: () => jobsApi.unseen(),
    refetchInterval: 60_000,
    // The count is the point; a stale one defeats it.
    staleTime: 0,
  });
  return {
    ...query,
    /** Failed *or* paused — an offline device never reaches `isError`. */
    loadFailed: query.isError || query.isPaused,
    /** New postings by other people. */
    count: query.data?.count ?? 0,
    /** Applications on your posts that nobody has answered. */
    applications: query.data?.applications ?? 0,
    /** What the nav badge shows. */
    total: (query.data?.count ?? 0) + (query.data?.applications ?? 0),
  };
}

/**
 * Clears the board half of the badge, and the cached count with it so it does
 * not flash back.
 *
 * Deliberately leaves `applications` alone — glancing at the board is not
 * answering anybody, and zeroing it here would drop a real request on the
 * floor until the next poll disagreed.
 */
export function useMarkJobsSeen() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => jobsApi.markSeen(),
    onSuccess: () => {
      queryClient.setQueryData(
        queryKeys.jobs.unseen,
        (prev: { count: number; applications: number } | undefined) => ({
          count: 0,
          applications: prev?.applications ?? 0,
        }),
      );
    },
  });
}

export function useReportJob() {
  return useMutation({
    mutationFn: ({
      postId,
      reason,
      note,
    }: {
      postId: string;
      reason: ReportReason;
      note?: string;
    }) => jobsApi.report(postId, reason, note),
  });
}
