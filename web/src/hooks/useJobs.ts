import {
  keepPreviousData,
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
 */
export function useJobs(params: ListJobsParams = {}) {
  const query = useQuery({
    queryKey: queryKeys.jobs.list(params),
    queryFn: () => jobsApi.list(params),
    placeholderData: keepPreviousData,
  });

  return {
    ...query,
    jobs: query.data?.data ?? ([] as JobPost[]),
    total: query.data?.total ?? 0,
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

  const jobs = query.data?.data ?? ([] as JobPost[]);
  return {
    ...query,
    /** Failed *or* paused — an offline device never reaches `isError`. */
    loadFailed: query.isError || query.isPaused,
    jobs,
    open: jobs.filter((job) => job.status === 'open'),
  };
}

/** Applicants on one post, for the poster. */
export function useApplicants(postId: string | undefined) {
  const query = useQuery({
    queryKey: queryKeys.jobs.applicants(postId ?? ''),
    queryFn: () => jobsApi.applicants(postId as string),
    enabled: !!postId,
  });

  const applications = query.data?.data ?? ([] as JobApplication[]);
  return {
    ...query,
    /** Failed *or* paused — an offline device never reaches `isError`. */
    loadFailed: query.isError || query.isPaused,
    applications,
    /** What the badge counts: applications nobody has answered yet. */
    unanswered: applications.filter((a) => a.status === 'new'),
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

export function useDeleteJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => jobsApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.jobs.all });
    },
  });
}

export function useApplyToJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ slug, message }: { slug: string; message: string }) =>
      jobsApi.apply(slug, message),
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
