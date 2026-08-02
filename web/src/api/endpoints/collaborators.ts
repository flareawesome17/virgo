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
  /** The friend being added. Required: collaborators are real accounts. */
  collaborator_user_id: string;
  id?: string;
  workspace_id: string;
  name: string;
  avatar_url?: string | null;
  role?: CollaboratorRole;
  /**
   * Albums to share. Omitted shares every album in the workspace, including
   * ones created later — the server stores the inverse as exclusions.
   */
  album_ids?: string[];
}

export type UpdateCollaboratorInput = Partial<
  Omit<CreateCollaboratorInput, 'id' | 'workspace_id'>
>;

export interface CollaboratorInvitation extends Collaborator {
  workspace_name: string | null;
  inviter_name: string | null;
}

export const collaboratorsApi = {
  /** Invitations addressed to the caller and not yet answered. */
  invitations(): Promise<{ data: CollaboratorInvitation[]; total: number }> {
    return api.get('/collaborators/invitations');
  },

  /** The workspace's albums, flagged with this collaborator's current access. */
  albumsFor(id: string): Promise<{
    data: { id: string; name: string; item_count: number; shared: boolean }[];
    total: number;
  }> {
    return api.get('/collaborators/' + id + '/albums');
  },

  /**
   * Replaces which albums this collaborator can see.
   *
   * Stored as exclusions for everything not listed, so albums created later
   * are shared by default.
   */
  setAlbums(id: string, albumIds: string[]): Promise<{ shared: number; excluded: number }> {
    return api.post('/collaborators/' + id + '/albums', { body: { album_ids: albumIds } });
  },

  /** Only the invitee can respond; the server enforces that. */
  respondToInvitation(id: string, accept: boolean): Promise<Collaborator> {
    return api.post<Collaborator>(
      '/collaborators/invitations/' + id + (accept ? '/accept' : '/decline'),
    );
  },

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
