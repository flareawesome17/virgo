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

/** What a collaborator may do with the media in one album. */
export type MediaAccess = 'view' | 'download' | 'upload' | 'manage';

/** One album being shared, and how much of it. */
export interface AlbumGrant {
  album_id: string;
  media_access?: MediaAccess;
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
   * Albums to share, with the access level for each.
   *
   * Omitted shares the workspace's albums as they stand today, at the role's
   * default level.
   */
  albums?: AlbumGrant[];
  /**
   * What albums added to the workspace later give them. Null or left out:
   * nothing until one is shared on purpose.
   */
  new_album_access?: MediaAccess | null;
}

export type UpdateCollaboratorInput = Partial<
  Omit<CreateCollaboratorInput, 'id' | 'workspace_id'>
>;

/** An invitation addressed to you, with what accepting it would give you. */
export interface CollaboratorInvitation extends Collaborator {
  workspace_name: string | null;
  workspace_color: string | null;
  inviter_name: string | null;
  inviter_avatar_url: string | null;
  /** The albums on offer, and what you could do in each. */
  albums: { id: string; name: string; media_access: MediaAccess }[];
}

/** What each role gets by default: what the invite screens promise, and the API applies. */
export const ROLE_DEFAULT_ACCESS: Record<CollaboratorRole, MediaAccess> = {
  owner: 'manage',
  photographer: 'upload',
  editor: 'manage',
  reviewer: 'download',
  client: 'view',
};

export const collaboratorsApi = {
  /** Invitations addressed to the caller and not yet answered. */
  invitations(): Promise<{ data: CollaboratorInvitation[]; total: number }> {
    return api.get('/collaborators/invitations');
  },

  /** The workspace's albums, flagged with this collaborator's current access. */
  albumsFor(id: string): Promise<{
    data: {
      id: string;
      name: string;
      item_count: number;
      shared: boolean;
      media_access: MediaAccess | null;
    }[];
    total: number;
  }> {
    return api.get('/collaborators/' + id + '/albums');
  },

  /**
   * Replaces which albums this collaborator can see, and how much of each.
   *
   * The whole selection is sent every time. Albums left out have their grant
   * removed, which is how revoking works — there is nothing else to delete.
   */
  setAlbums(
    id: string,
    albums: AlbumGrant[],
    /** What albums added later give them. Left out, unchanged; null, nothing. */
    newAlbumAccess?: MediaAccess | null,
  ): Promise<{ shared: number; excluded: number }> {
    return api.post('/collaborators/' + id + '/albums', {
      body: newAlbumAccess === undefined ? { albums } : { albums, new_album_access: newAlbumAccess },
    });
  },

  /** Sends an unanswered invitation again. Refused within ten minutes of the last. */
  resend(id: string): Promise<Collaborator> {
    return api.post<Collaborator>('/collaborators/' + id + '/resend');
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
