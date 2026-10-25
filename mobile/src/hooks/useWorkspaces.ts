import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import {
  queryKeys,
  workspacesApi,
  type Album,
  type CreateWorkspaceInput,
  type DeleteProof,
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

/** Marks this device's own deletes, so the live event each one causes is known for it. */
const deleteWorkspaceKey = ['delete-workspace'] as const;

/**
 * Moves a workspace to Recently deleted. Asks for the password or the emailed
 * code: see useDeleteProof.
 */
export function useDeleteWorkspace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: deleteWorkspaceKey,
    mutationFn: ({ id, proof }: { id: string; proof: DeleteProof }) =>
      workspacesApi.remove(id, proof),
    onSuccess: (_void, { id }) => {
      // Removed rather than reset: the screen that asked is on its way out,
      // and a reset would show it loading as it went.
      queryClient.removeQueries({ queryKey: queryKeys.workspaces.detail(id) });
      queryClient.removeQueries({ queryKey: queryKeys.workspaces.members(id) });
      queryClient.removeQueries({ queryKey: queryKeys.workspaces.activity(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.all });
      // Albums and collaborators are cascade-deleted server-side, so their
      // caches are stale the moment a workspace goes — and so is usage.
      queryClient.invalidateQueries({ queryKey: queryKeys.albums.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.collaborators.all });
      queryClient.invalidateQueries({ queryKey: usageQueryKey });
    },
  });
}

/**
 * A workspace was deleted somewhere else: by its owner on another device, or
 * by the owner of one this account is a member of. What both realtime hooks
 * do with the `workspace-deleted` event.
 *
 * The workspace's own queries are reset, and so are the albums that were in
 * it. Invalidated, they would refetch into a 404 and keep the data they had,
 * so a screen showing the workspace went on showing it; reset, the screen
 * loses it, asks again and says the workspace is not available. Every list
 * it was in is read again, since its albums and members went with it.
 *
 * Nothing while this device's own delete of it is in flight: the mutation
 * clears up when it lands, and a reset first would show the screen loading
 * on its way out.
 */
export function applyWorkspaceDeleted(queryClient: QueryClient, id: string): void {
  const deletingHere = queryClient.isMutating({
    mutationKey: deleteWorkspaceKey,
    predicate: (mutation) => (mutation.state.variables as { id?: string } | undefined)?.id === id,
  });
  if (deletingHere > 0) return;

  queryClient.resetQueries({ queryKey: queryKeys.workspaces.detail(id) });
  queryClient.resetQueries({ queryKey: queryKeys.workspaces.members(id) });
  queryClient.resetQueries({ queryKey: queryKeys.workspaces.activity(id) });
  queryClient.resetQueries({
    queryKey: queryKeys.albums.all,
    predicate: (query) =>
      (query.state.data as Partial<Album> | undefined)?.workspace_id === id,
  });

  queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.all });
  queryClient.invalidateQueries({ queryKey: queryKeys.albums.all });
  queryClient.invalidateQueries({ queryKey: queryKeys.collaborators.all });
  queryClient.invalidateQueries({ queryKey: usageQueryKey });
}

/** The owner's Recently deleted: what they deleted in the last 30 days. */
export function useDeletedWorkspaces(options: QueryOptions = {}) {
  const query = useQuery({
    queryKey: queryKeys.workspaces.deleted,
    queryFn: () => workspacesApi.deleted(),
    enabled: options.enabled ?? true,
  });
  return {
    ...query,
    /** Failed *or* paused — an offline device never reaches `isError`. */
    loadFailed: query.isError || query.isPaused,
    workspaces: query.data?.data ?? [],
  };
}

/** Brings a workspace back from Recently deleted, with everything in it. */
export function useRestoreWorkspace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => workspacesApi.restore(id),
    onSuccess: (_workspace, id) => applyWorkspaceRestored(queryClient, id),
  });
}

/**
 * A workspace came back: restored here, on another of the owner's devices, or
 * by the owner of one this account is a member of. Its albums, members and
 * place in every list return with it, and it counts toward the plan again.
 */
export function applyWorkspaceRestored(queryClient: QueryClient, id: string): void {
  // Anything cached from before it was deleted, or the "not available" a
  // screen got meanwhile, is out of date either way.
  queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.detail(id) });
  queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.all });
  queryClient.invalidateQueries({ queryKey: queryKeys.albums.all });
  queryClient.invalidateQueries({ queryKey: queryKeys.collaborators.all });
  queryClient.invalidateQueries({ queryKey: usageQueryKey });
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
