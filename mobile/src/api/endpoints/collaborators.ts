import { api } from '../client';
import type {
  Collaborator,
  CollaboratorRole,
  ListParams,
  ListResponse,
} from '../types';

export interface ListCollaboratorsParams extends ListParams {
  workspace_id?: string;
  role?: CollaboratorRole;
}

export interface CreateCollaboratorInput {
  id?: string;
  workspace_id: string;
  name: string;
  avatar_url?: string | null;
  role?: CollaboratorRole;
}

export type UpdateCollaboratorInput = Partial<
  Omit<CreateCollaboratorInput, 'id' | 'workspace_id'>
>;

export const collaboratorsApi = {
  list(
    params: ListCollaboratorsParams = {},
  ): Promise<ListResponse<Collaborator>> {
    return api.get<ListResponse<Collaborator>>('/collaborators', {
      query: params,
    });
  },

  get(id: string): Promise<Collaborator> {
    return api.get<Collaborator>(`/collaborators/${id}`);
  },

  create(input: CreateCollaboratorInput): Promise<Collaborator> {
    return api.post<Collaborator>('/collaborators', { body: input });
  },

  update(id: string, input: UpdateCollaboratorInput): Promise<Collaborator> {
    return api.patch<Collaborator>(`/collaborators/${id}`, { body: input });
  },

  remove(id: string): Promise<void> {
    return api.delete<void>(`/collaborators/${id}`);
  },
};
