/**
 * Row shapes returned by the API.
 *
 * Snake_case is deliberate: it mirrors the Postgres columns exactly, so screens
 * carried over from Supabase keep referring to `accent_color`, `workspace_id`
 * and friends without a rename pass.
 */

export interface ListResponse<T> {
  data: T[];
  total: number;
}

export interface Workspace {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  accent_color: string;
  media_count: number;
  collaborator_count: number;
  created_at: string;
  updated_at: string;
}

export type AlbumStatus = 'draft' | 'review' | 'delivered';

export interface Album {
  id: string;
  user_id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  cover_url: string | null;
  item_count: number;
  status: AlbumStatus;
  retention_days: number | null;
  created_at: string;
  updated_at: string;
}

export type EventType = 'shoot' | 'editing' | 'review' | 'delivery' | 'meeting';

export interface ScheduleEvent {
  id: string;
  user_id: string;
  workspace_id: string | null;
  title: string;
  description: string | null;
  event_date: string;
  event_time: string | null;
  event_type: EventType;
  created_at: string;
}

export type CollaboratorRole =
  | 'owner'
  | 'photographer'
  | 'editor'
  | 'reviewer'
  | 'client';

export interface Collaborator {
  id: string;
  user_id: string;
  /** The account this collaborator is. Null on rows predating real friendships. */
  collaborator_user_id: string | null;
  workspace_id: string;
  name: string;
  avatar_url: string | null;
  role: CollaboratorRole;
  /** Invitations start pending; only 'accepted' grants access. */
  status: 'pending' | 'accepted' | 'declined';
  responded_at: string | null;
  created_at: string;
}

export interface Reminder {
  id: string;
  user_id: string;
  schedule_event_id: string | null;
  title: string;
  description: string | null;
  reminder_time: string;
  is_alarm_enabled: boolean;
  has_push_notification: boolean;
  is_completed: boolean;
  created_at: string;
}

export type FriendStatus = 'pending' | 'accepted' | 'declined';
export type RequestedBy = 'me' | 'them';

export interface Friend {
  id: string;
  user_id: string;
  /**
   * The account this friendship points at.
   *
   * Null only on rows created before friendships referenced real users, when
   * a "friend" was free text the other person never saw.
   */
  friend_user_id: string | null;
  friend_name: string;
  friend_email: string | null;
  friend_avatar_url: string | null;
  status: FriendStatus;
  requested_by: RequestedBy;
  created_at: string;
  updated_at: string;
}

export interface AuthUser {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  title: string | null;
  phone: string | null;
  website: string | null;
  location: string | null;
  bio: string | null;
  /** Whether name search can surface this account. Email lookup is unaffected. */
  discoverable: boolean;
  createdAt: string;
}

/** Fields a user may edit on their own profile. `null` clears a field. */
export interface UpdateProfileInput {
  displayName?: string | null;
  avatarUrl?: string | null;
  title?: string | null;
  phone?: string | null;
  website?: string | null;
  location?: string | null;
  bio?: string | null;
  /** A setting rather than a field, so it is never cleared to null. */
  discoverable?: boolean;
}

export interface AuthResult {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

/** Shared list query parameters accepted by every collection endpoint. */
export interface ListParams {
  limit?: number;
  offset?: number;
  orderBy?: string;
  direction?: 'asc' | 'desc';
}
