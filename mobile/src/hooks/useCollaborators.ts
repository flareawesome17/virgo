import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  collaboratorsApi,
  queryKeys,
  type Collaborator,
  type CreateCollaboratorInput,
  type ListCollaboratorsParams,
  type UpdateCollaboratorInput,
} from '@/src/api';

import type { QueryOptions } from './useWorkspaces';

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
      // collaborator_count lives on the workspace row.
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
  return { ...query, invitations: query.data?.data ?? [] };
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

/** Sets exactly which albums a collaborator can see. */
export function useSetCollaboratorAlbums() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, albumIds }: { id: string; albumIds: string[] }) =>
      collaboratorsApi.setAlbums(id, albumIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collaborators'] });
      queryClient.invalidateQueries({ queryKey: ['albums'] });
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
  return { ...query, albums: query.data?.data ?? [] };
}
