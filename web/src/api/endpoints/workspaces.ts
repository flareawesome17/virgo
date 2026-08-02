import { api } from '../client';
import type { ListParams, ListResponse, Workspace } from '../types';

export interface CreateWorkspaceInput {
  id?: string;
  name: string;
  description?: string | null;
  accent_color?: string;
  media_count?: number;
  collaborator_count?: number;
}

export type UpdateWorkspaceInput = Partial<Omit<CreateWorkspaceInput, 'id'>>;

export const workspacesApi = {
  list(params: ListParams = {}): Promise<ListResponse<Workspace>> {
    return api.get<ListResponse<Workspace>>('/workspaces', { query: params });
  },

  get(id: string): Promise<Workspace> {
    return api.get<Workspace>(`/workspaces/${id}`);
  },

  create(input: CreateWorkspaceInput): Promise<Workspace> {
    return api.post<Workspace>('/workspaces', { body: input });
  },

  update(id: string, input: UpdateWorkspaceInput): Promise<Workspace> {
    return api.patch<Workspace>(`/workspaces/${id}`, { body: input });
  },

  remove(id: string): Promise<void> {
    return api.delete<void>(`/workspaces/${id}`);
  },
};
