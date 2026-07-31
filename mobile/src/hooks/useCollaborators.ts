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
