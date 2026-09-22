import { api } from '../client';
import type {
  CollaboratorRole,
  ListParams,
  ListResponse,
  Workspace,
} from '../types';
import type { MediaAccess } from './collaborators';

export interface CreateWorkspaceInput {
  id?: string;
  name: string;
  description?: string | null;
  accent_color?: string;
  media_count?: number;
  collaborator_count?: number;
}

export type UpdateWorkspaceInput = Partial<Omit<CreateWorkspaceInput, 'id'>> & {
  /** Archives it, or brings it back. */
  archived?: boolean;
  /** The album whose cover stands for it; null goes back to the newest. */
  cover_album_id?: string | null;
};

/** Left out by default; `only` is the archive. */
export type ArchivedFilter = 'exclude' | 'only' | 'include';

export interface WorkspaceListParams extends ListParams {
  archived?: ArchivedFilter;
}

export interface WorkspaceListResponse extends ListResponse<Workspace> {
  /** How many are archived, for the way in to them. */
  archived: number;
}

/** One person on a workspace's members list. */
export interface WorkspaceMember {
  /** Their invitation; null for the owner, who has none. */
  id: string | null;
  user_id: string | null;
  name: string;
  avatar_url: string | null;
  role: CollaboratorRole;
  status: 'owner' | 'accepted' | 'pending' | 'declined';
  is_you: boolean;
  invited_at: string;
  responded_at: string | null;
  /** What they were given. The owner's eyes only; absent for a member. */
  access?: {
    albums: number;
    /** The most they can do in any album they have. */
    top: MediaAccess | null;
    /** Whether that is the same in every album. */
    uniform: boolean;
    /** The album's name when they have exactly one. */
    only_album: string | null;
    /** What albums added later give them; null for nothing. */
    new_albums: MediaAccess | null;
  };
}

/** Mirrors WorkspaceActivityKind in api/src/workspaces/workspace-activity.service.ts. */
export type WorkspaceActivityKind =
  | 'album-created'
  | 'album-moved'
  | 'upload'
  | 'sections'
  | 'picks'
  | 'invited'
  | 'joined'
  | 'declined'
  | 'left'
  | 'removed'
  | 'shared';

export interface ActivityPerson {
  id: string | null;
  name: string;
  avatar_url: string | null;
  role: CollaboratorRole | null;
  is_you: boolean;
}

/** One line of what has been happening in a workspace. */
export interface WorkspaceActivityItem {
  id: string;
  kind: WorkspaceActivityKind;
  /** Files, sections or picks; 1 for everything else. */
  count: number;
  data: {
    name?: string;
    role?: CollaboratorRole;
    /** For `shared`: albums newly given, by name (up to three). */
    added?: string[];
    added_count?: number;
    removed_count?: number;
    changed_count?: number;
    access?: MediaAccess | null;
  };
  created_at: string;
  /** Who did it. Null for a client's picks. */
  actor: ActivityPerson | null;
  /** Who it was done to: the person invited, removed, or given albums. */
  subject: ActivityPerson | null;
  album: { id: string; name: string } | null;
}

export const workspacesApi = {
  list(params: WorkspaceListParams = {}): Promise<WorkspaceListResponse> {
    return api.get<WorkspaceListResponse>('/workspaces', { query: params });
  },

  get(id: string): Promise<Workspace> {
    return api.get<Workspace>(`/workspaces/${id}`);
  },

  /** Everyone on it. The owner also gets invitations and what each was given. */
  members(id: string): Promise<{ data: WorkspaceMember[]; total: number }> {
    return api.get(`/workspaces/${id}/members`);
  },

  /** What has been happening in it, newest first. */
  activity(id: string, limit = 30): Promise<{ data: WorkspaceActivityItem[]; total: number }> {
    return api.get(`/workspaces/${id}/activity`, { query: { limit } });
  },

  /** Leaves a workspace someone else owns. */
  leave(id: string): Promise<void> {
    return api.post<void>(`/workspaces/${id}/leave`);
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
