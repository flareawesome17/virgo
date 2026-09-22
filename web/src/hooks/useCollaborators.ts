import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  collaboratorsApi,
  queryKeys,
  type AlbumGrant,
  type Collaborator,
  type CreateCollaboratorInput,
  type ListCollaboratorsParams,
  type MediaAccess,
  type UpdateCollaboratorInput,
} from '@/api';

import type { QueryOptions } from '@/hooks/useWorkspaces';

export function useCollaborators(
  params: ListCollaboratorsParams = {},
  options: QueryOptions = {},
) {
  const query = useQuery({
    queryKey: queryKeys.collaborators.list(params),
    queryFn: () => collaboratorsApi.list(params),
    enabled: options.enabled ?? true,
  });

  return {
    ...query,
    /** Failed *or* paused — an offline device never reaches `isError`. */
    loadFailed: query.isError || query.isPaused,
    collaborators: query.data?.data ?? ([] as Collaborator[]),
    total: query.data?.total ?? 0,
  };
}

export function useCollaborator(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.collaborators.detail(id ?? ''),
    queryFn: () => collaboratorsApi.get(id as string),
    enabled: !!id,
  });
}

export function useCreateCollaborator() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCollaboratorInput) =>
      collaboratorsApi.create(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.collaborators.all });
      // The workspace list carries a derived collaborator_count.
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.all });
    },
  });
}

export function useUpdateCollaborator() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateCollaboratorInput & { id: string }) =>
      collaboratorsApi.update(id, input),
    onSuccess: (updated) => {
      queryClient.setQueryData(
        queryKeys.collaborators.detail(updated.id),
        updated,
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.collaborators.all });
      // A role shows on the members list and on every card that names them.
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.all });
    },
  });
}

/** Sends an unanswered invitation again. */
export function useResendInvitation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => collaboratorsApi.resend(id),
    onSuccess: () => {
      // "Invited Mon" becomes "Invited today".
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.all });
    },
  });
}

export function useDeleteCollaborator() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => collaboratorsApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.collaborators.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.all });
    },
  });
}

/**
 * Workspace invitations waiting on the current user.
 *
 * Before invitations existed, a collaborator row was owned by the inviter, so
 * the person added had nothing to read and nothing to accept.
 */
export function useCollaboratorInvitations() {
  const query = useQuery({
    queryKey: ['collaborators', 'invitations'],
    queryFn: () => collaboratorsApi.invitations(),
  });
  return {
    ...query,
    /** Failed *or* paused — an offline device never reaches `isError`. */
    loadFailed: query.isError || query.isPaused,
    invitations: query.data?.data ?? [],
  };
}

export function useRespondToInvitation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, accept }: { id: string; accept: boolean }) =>
      collaboratorsApi.respondToInvitation(id, accept),
    onSuccess: () => {
      // Accepting grants access, so the workspace and album lists change too.
      queryClient.invalidateQueries({ queryKey: ['collaborators'] });
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      queryClient.invalidateQueries({ queryKey: ['albums'] });
    },
  });
}

/**
 * Sets exactly which albums a collaborator can see, and — when given — what
 * albums added later give them.
 */
export function useSetCollaboratorAlbums() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      albums,
      newAlbumAccess,
    }: {
      id: string;
      albums: AlbumGrant[];
      newAlbumAccess?: MediaAccess | null;
    }) => collaboratorsApi.setAlbums(id, albums, newAlbumAccess),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collaborators'] });
      queryClient.invalidateQueries({ queryKey: ['albums'] });
      // The members list summarises access; the feed says it changed.
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
    },
  });
}

/**
 * The workspace's albums with this collaborator's current access.
 *
 * Only fetched when an id is supplied, so the edit sheet loads on demand
 * rather than for every row in the list.
 */
export function useCollaboratorAlbums(collaboratorId: string | null) {
  const query = useQuery({
    queryKey: ['collaborators', collaboratorId, 'albums'],
    queryFn: () => collaboratorsApi.albumsFor(collaboratorId!),
    enabled: !!collaboratorId,
  });
  return {
    ...query,
    /** Failed *or* paused — an offline device never reaches `isError`. */
    loadFailed: query.isError || query.isPaused,
    albums: query.data?.data ?? [],
  };
}
