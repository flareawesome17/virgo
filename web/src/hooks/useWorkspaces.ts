import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  queryKeys,
  workspacesApi,
  type CreateWorkspaceInput,
  type ListParams,
  type UpdateWorkspaceInput,
  type Workspace,
} from '@/api';

/** `enabled` lets screens hold a query until auth has resolved. */
export interface QueryOptions {
  enabled?: boolean;
}

export function useWorkspaces(
  params: ListParams = {},
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
  };
}

export function useWorkspace(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.workspaces.detail(id ?? ''),
    queryFn: () => workspacesApi.get(id as string),
    enabled: !!id,
  });
}

export function useCreateWorkspace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateWorkspaceInput) => workspacesApi.create(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.all });
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
      // caches are stale the moment a workspace goes.
      queryClient.invalidateQueries({ queryKey: queryKeys.albums.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.collaborators.all });
    },
  });
}
