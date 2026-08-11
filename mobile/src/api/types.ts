/**
 * Row shapes returned by the API.
 *
 * Snake_case is deliberate: it mirrors the Postgres columns exactly, so screens
 * carried over from the previous backend keep referring to `accent_color`, `workspace_id`
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
  /**
   * False when you are attending somebody else's event.
   *
   * Optional because only the read paths return it — a freshly created event
   * comes back from the insert, which has nobody else's invitation to consider.
   */
  is_owner?: boolean;
}

export type AttendeeStatus = 'pending' | 'accepted' | 'declined';

/** Somebody invited to an event, and what they said. */
export interface EventAttendee {
  id: string;
  event_id: string;
  user_id: string;
  name: string;
  avatar_url: string | null;
  status: AttendeeStatus;
  responded_at: string | null;
  invited_by: string;
}

/** An invitation addressed to you, with enough of the event to decide. */
export interface EventInvitation {
  id: string;
  event_id: string;
  status: AttendeeStatus;
  title: string;
  description: string | null;
  event_date: string;
  event_time: string | null;
  event_type: EventType;
  inviter_name: string;
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
  /** False until the address is proven by following the emailed link. */
  emailVerified?: boolean;
  /** What they do on a shoot. Chosen at sign-up, editable later. */
  roles?: string[];
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
  /**
   * Postal address, collected at signup and editable on the profile.
   *
   * Private. This shape only ever describes the signed-in account — other
   * people arrive as PublicProfile or NearbyPerson, neither of which carries
   * an address. Null on accounts made before it was collected.
   */
  addressLine1: string | null;
  addressLine2: string | null;
  addressCity: string | null;
  addressProvince: string | null;
  addressPostal: string | null;
  /** Two letters, ISO 3166-1. */
  addressCountry: string | null;
  /** What they trade as, if that is not their own name. */
  studioName: string | null;
  /** A handle, a page or a URL — whatever they actually use. */
  socialHandle: string | null;
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
  /**
   * What they do on a shoot.
   *
   * Never null and never empty: the API requires at least one, because roles
   * are what Nearby filters on and an account with none cannot be found by
   * anyone looking to hire. Omit the key to leave them unchanged.
   */
  roles?: string[];

  /**
   * The address. Not nullable, for the same reason roles are not: signup
   * requires these four, so letting the edit screen clear them would be a way
   * around that. Omit the keys to leave the address alone — which is also how
   * an account that predates the address saves the rest of its profile.
   */
  addressLine1?: string;
  addressCity?: string;
  addressProvince?: string;
  addressCountry?: string;

  /** Genuinely optional, so `null` clears them. */
  addressLine2?: string | null;
  addressPostal?: string | null;
  studioName?: string | null;
  socialHandle?: string | null;
}

/**
 * What registering returns: an account, and no session.
 *
 * Deliberately not AuthResult. Registering does not sign anybody in — the
 * address has to be confirmed first — and a separate type is what stops a
 * caller reaching for tokens that are not there.
 */
export interface RegisterResult {
  user: AuthUser;
  verificationRequired: true;
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
