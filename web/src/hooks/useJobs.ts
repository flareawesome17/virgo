import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  jobsApi,
  queryKeys,
  type CreateJobInput,
  type JobApplication,
  type JobPost,
  type ListJobsParams,
  type ReportReason,
} from '@/api';

/** The public board. Works signed out, so no `enabled` gate on a session. */
export function useJobs(params: ListJobsParams = {}) {
  const query = useQuery({
    queryKey: queryKeys.jobs.list(params),
    queryFn: () => jobsApi.list(params),
  });

  return {
    ...query,
    jobs: query.data?.data ?? ([] as JobPost[]),
    total: query.data?.total ?? 0,
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
