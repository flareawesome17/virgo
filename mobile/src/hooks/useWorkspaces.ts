import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  queryKeys,
  workspacesApi,
  type CreateWorkspaceInput,
  type UpdateWorkspaceInput,
  type Workspace,
  type WorkspaceListParams,
} from '@/src/api';
import { usageQueryKey } from '@/src/hooks/useUsage';

/** `enabled` lets screens hold a query until auth has resolved. */
export interface QueryOptions {
  enabled?: boolean;
}

export function useWorkspaces(
  params: WorkspaceListParams = {},
  options: QueryOptions = {},
) {
  const query = useQuery({
    queryKey: queryKeys.workspaces.list(params),
    queryFn: () => workspacesApi.list(params),
    enabled: options.enabled ?? true,
  });

  return {
    ...query,
    /** Failed *or* paused — an offline device never reaches `isError`. */
    loadFailed: query.isError || query.isPaused,
    // Screens iterate the rows directly; `data` on the raw query is the
    // { data, total } envelope, which is easy to misuse.
    workspaces: query.data?.data ?? ([] as Workspace[]),
    total: query.data?.total ?? 0,
    /** How many are archived, for the way in to them. */
    archivedCount: query.data?.archived ?? 0,
  };
}

export function useWorkspace(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.workspaces.detail(id ?? ''),
    queryFn: () => workspacesApi.get(id as string),
    enabled: !!id,
  });
}

/** Everyone on a workspace; the owner also gets invitations and access. */
export function useWorkspaceMembers(id: string | undefined) {
  const query = useQuery({
    queryKey: queryKeys.workspaces.members(id ?? ''),
    queryFn: () => workspacesApi.members(id as string),
    enabled: !!id,
  });
  return {
    ...query,
    /** Failed *or* paused — an offline device never reaches `isError`. */
    loadFailed: query.isError || query.isPaused,
    members: query.data?.data ?? [],
  };
}

/** What has been happening in a workspace, newest first. */
export function useWorkspaceActivity(id: string | undefined) {
  const query = useQuery({
    queryKey: queryKeys.workspaces.activity(id ?? ''),
    queryFn: () => workspacesApi.activity(id as string),
    enabled: !!id,
  });
  return {
    ...query,
    /** Failed *or* paused — an offline device never reaches `isError`. */
    loadFailed: query.isError || query.isPaused,
    activity: query.data?.data ?? [],
  };
}

export function useCreateWorkspace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateWorkspaceInput) => workspacesApi.create(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.all });
      // Workspaces used is on the usage summary, and a create screen that
      // read the old number would let the next one through to a refusal.
      queryClient.invalidateQueries({ queryKey: usageQueryKey });
    },
  });
}

export function useUpdateWorkspace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateWorkspaceInput & { id: string }) =>
      workspacesApi.update(id, input),
    onSuccess: (updated) => {
      queryClient.setQueryData(
        queryKeys.workspaces.detail(updated.id),
        updated,
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.all });
    },
  });
}

export function useDeleteWorkspace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => workspacesApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.all });
      // Albums and collaborators are cascade-deleted server-side, so their
      // caches are stale the moment a workspace goes — and so is usage.
      queryClient.invalidateQueries({ queryKey: queryKeys.albums.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.collaborators.all });
      queryClient.invalidateQueries({ queryKey: usageQueryKey });
    },
  });
}

/** Leaves a workspace someone else owns; its albums go with it. */
export function useLeaveWorkspace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => workspacesApi.leave(id),
    onSuccess: (_void, id) => {
      queryClient.removeQueries({ queryKey: queryKeys.workspaces.detail(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.albums.all });
    },
  });
}
