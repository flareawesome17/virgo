import { api } from './client';

/** A role's name: one of the four built in, or a custom role's slug. */
export type AdminRole = string;

export interface RoleSummary {
  name: AdminRole;
  label: string;
  description: string;
  system: boolean;
}

export interface AdminMe {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  roleLabel: string;
  permissions: string[];
  /** True while the account still holds a password somebody else chose. */
  mustChangePassword: boolean;
  twoFactorEnabled: boolean;
  /** Their role requires two-factor. */
  twoFactorRequired: boolean;
  /** Their role requires two-factor and they have not set it up. */
  mustSetUpTwoFactor: boolean;
  sessionId?: string;
  roles: RoleSummary[];
}

export interface SessionRow {
  id: string;
  admin_id: string;
  admin_name: string;
  admin_email: string;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
}

export type LoginOutcome = 'success' | 'bad_password' | 'bad_code' | 'locked' | 'disabled' | 'unknown';

export interface LoginEvent {
  id: string;
  admin_id: string | null;
  admin_name: string | null;
  email: string;
  outcome: LoginOutcome;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface MySecurity {
  twoFactorEnabled: boolean;
  recoveryCodesLeft: number;
  currentSessionId: string | null;
  sessions: SessionRow[];
  logins: LoginEvent[];
}

export interface PermissionGroup {
  key: string;
  label: string;
  permissions: { key: string; label: string; description: string }[];
}

export interface Role {
  name: AdminRole;
  label: string;
  description: string;
  system: boolean;
  requiresTwoFactor: boolean;
  members: number;
  /** As stored for a custom role, `area.*` wildcards included. Empty for built-in. */
  grants: string[];
  /** What the role actually allows, wildcards expanded. */
  permissions: string[];
}

export interface RoleInput {
  label?: string;
  description?: string;
  permissions?: string[];
  requiresTwoFactor?: boolean;
}

export interface AuditEntry {
  id: string;
  admin_id: string | null;
  admin_email: string;
  admin_name: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  /** The person behind a user id, when the target is one. */
  target_label: string | null;
  detail: Record<string, unknown>;
  created_at: string;
}

export type AuditQuery = {
  limit?: number;
  offset?: number;
  adminId?: string;
  action?: string;
  targetType?: string;
  targetId?: string;
  from?: string;
  to?: string;
  includeViews?: 'true';
};

export interface PresenceOther {
  adminId: string;
  name: string;
  state: 'viewing' | 'replying';
}

export interface Paged<T> {
  data: T[];
  total: number;
}

export interface Overview {
  days: number;
  totals: {
    users: number;
    newUsers: number;
    activeUsers: number;
    verifiedUsers: number;
    albums: number;
    workspaces: number;
    files: number;
    storageBytes: number;
    shareLinks: number;
    openJobs: number;
    applications: number;
    openTickets: number;
    /** Reported job posts. People have their own count, below. */
    reports: number;
    /**
     * Reported accounts. Optional because an API rolled back to before people
     * could be reported leaves it out, and the badge must still add up.
     */
    userReports?: number;
    /** Open showcase reports. Absent from an API older than moderation. */
    showcaseReports?: number;
    /** Everything waiting in the moderation queue, all three kinds. */
    openReports?: number;
  };
  signups: { day: string; count: number }[];
  uploads: { day: string; count: number; bytes: string | number }[];
  byPlan: { plan: string; count: number }[];
  visits: {
    views: number;
    visitors: number;
    daily: { day: string; views: number; visitors: number }[];
    topPaths: { host: string; path: string; views: number }[];
    referrers: { host: string; views: number }[];
  };
}

export interface AdminUserRow {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  plan: string;
  roles: string[];
  created_at: string;
  last_seen_at: string | null;
  email_verified_at: string | null;
  /**
   * Set by a console suspension and by a self-pause alike, and kept after a
   * pause ends, so it cannot say which. Read only when the API predates
   * `suspended_at`.
   */
  disabled_at: string | null;
  /**
   * A console suspension. Absent, not null, when the API predates it, which
   * is how the badge knows to fall back to `disabled_at`.
   */
  suspended_at?: string | null;
  /** The end of a pause the person chose themselves. */
  disabled_until?: string | null;
  handle: string | null;
  public_profile: boolean;
  /** What the account is currently holding. */
  storage_bytes: string | number;
  /**
   * What it is allowed to hold: the plan allowance plus any claimed promo.
   *
   * Not derivable from `plan` on this side — the allowances live in the API's
   * quota config, and a promo can raise the ceiling above what the plan name
   * implies.
   */
  storage_limit_bytes: number;
  /** How much of `storage_limit_bytes` came from promos rather than the plan. */
  storage_bonus_bytes: number;
  albums: number;
  two_factor?: boolean;
  /** Absent from an API older than tags. */
  tags?: Tag[];
}

/**
 * Who a set of filters means: the people list's filters, as segments,
 * broadcasts and promo grants use them. Mirrors api/src/admin/audience.ts.
 */
export interface AudienceFilters {
  q?: string;
  plan?: string;
  status?: string;
  seen?: string;
  tag?: string;
  platform?: string;
  twoFactor?: string;
  storageAbove?: number;
  joinedAfter?: string;
  joinedBefore?: string;
  referred?: string;
  versionBelow?: string;
}

export interface AudienceCount {
  /** The filters as the API understood them. */
  filters: AudienceFilters;
  count: number;
  /** Of those, how many have a phone a push can reach. */
  withPhone: number;
  preview: { id: string; name: string; email: string; last_seen_at: string | null }[];
}

export interface Segment {
  id: string;
  name: string;
  description: string | null;
  filters: AudienceFilters;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
  /** Counted when listed: who it reaches today. */
  count: number;
}

export interface Broadcast {
  id: string;
  title: string;
  body: string;
  url: string | null;
  segment_id: string | null;
  segment_name: string | null;
  filters: AudienceFilters;
  push: boolean;
  status: 'scheduled' | 'sending' | 'sent' | 'cancelled';
  send_at: string;
  per_minute: number;
  started_at: string | null;
  finished_at: string | null;
  /** Fixed when sending starts. */
  recipients: number | null;
  delivered: number;
  pushed: number;
  push_failed: number;
  opened: number;
  created_by_name: string | null;
  cancelled_by_name: string | null;
  created_at: string;
}

export interface AppUpdateRow {
  id: string;
  slug: string;
  platforms: string[];
  min_version: string | null;
  max_version: string | null;
  version: string | null;
  title: string;
  body: string;
  url: string | null;
  published_at: string;
  pushed: number | null;
  created_by_name: string | null;
  reads: number;
}

/** What a report can be about. */
export type CaseKind = 'user' | 'job' | 'showcase';
export type CaseAction = 'dismiss' | 'hide' | 'warn' | 'suspend';

/** One row of the moderation queue: everything reported about one thing. */
export interface ModerationCase {
  kind: CaseKind;
  target_id: string;
  /** The person: who was reported, or who posted it. Null once deleted. */
  subject_id: string | null;
  open: number;
  total: number;
  reporters: number;
  /** Absent from an API older than this field. */
  open_reporters?: number;
  open_reasons: string[] | null;
  reasons: string[];
  sources: string[] | null;
  waiting_since: string | null;
  last_reported_at: string;
  resolved_at: string | null;
  last_resolution: string | null;
  subject_name: string | null;
  subject_email: string | null;
  subject_handle: string | null;
  subject_suspended_at: string | null;
  /** A post's or job's title; null for a person. */
  title: string | null;
  hidden_at: string | null;
  thumb_url: string | null;
  blocked_by: number;
  strikes: number;
  /** A chat report about this person brought messages with it. */
  has_evidence: boolean;
}

/** A decision, against the person it concerned. */
export interface ModerationAction {
  id: string;
  action: CaseAction | 'remove_comment';
  target_type: CaseKind | 'comment';
  target_id: string;
  target_label: string | null;
  reports: number;
  /** What the person was told. */
  message: string | null;
  note: string | null;
  snapshot?: { body?: string; showcaseId?: string; writtenAt?: string } | null;
  ticket_id: string | null;
  admin_name: string | null;
  created_at: string;
}

export interface CaseReport {
  id: string;
  reason: string;
  note: string | null;
  source: string | null;
  created_at: string;
  status: 'open' | 'actioned' | 'dismissed';
  resolution: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
  reporter_id: string | null;
  reporter_name: string | null;
  reporter_email: string | null;
  resolved_by_name: string | null;
  /** How many messages a chat report brought. */
  evidence: number;
}

export interface ModerationCaseDetail {
  kind: CaseKind;
  targetId: string;
  subject: {
    id: string | null;
    name: string;
    email: string | null;
    handle?: string | null;
    plan?: string;
    created_at?: string;
    last_seen_at?: string | null;
    suspended_at?: string | null;
    avatar_url?: string | null;
  };
  /** The job or showcase; null for a person. */
  target: {
    id: string;
    title: string | null;
    slug?: string;
    description?: string;
    status?: string;
    caption?: string | null;
    hidden_at: string | null;
    published_at?: string | null;
    created_at: string;
    comment_count?: number;
    pieces?: string[];
    comments?: { id: string; body: string; created_at: string; author_id: string; author_name: string }[];
  } | null;
  reports: CaseReport[];
  history: ModerationAction[];
  signals: { blocked_by: number; strikes: number; other_open_cases: number; reports_ever: number } | null;
}

/** A message a chat report brought, copied when it was filed. */
export interface EvidenceMessage {
  message_id: string;
  sender_role: 'reporter' | 'reported';
  sender_name: string;
  body: string;
  kind: string;
  sent_at: string;
  captured_at: string;
}

export interface ModerationComment {
  id: string;
  body: string;
  created_at: string;
  showcase_id: string;
  showcase_title: string | null;
  showcase_hidden_at: string | null;
  author_id: string;
  author_name: string;
  author_email: string;
  author_suspended_at: string | null;
  author_strikes: number;
}

export type CaseQuery = {
  state?: 'open' | 'closed';
  kind?: CaseKind;
  q?: string;
  limit?: number;
  offset?: number;
};

export const SUPPORT_CATEGORIES = [
  'account',
  'billing',
  'uploads',
  'sharing',
  'bookings',
  'bug',
  'feedback',
  'safety',
  'other',
] as const;
export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number];

export interface Ticket {
  id: string;
  subject: string;
  status: 'open' | 'pending' | 'resolved' | 'closed';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  category?: SupportCategory | null;
  user_email: string;
  user_id: string | null;
  created_at: string;
  updated_at: string;
  first_replied_at?: string | null;
  /** When the first reply is owed. */
  due_at?: string | null;
  /** Unanswered past due_at. */
  overdue?: boolean;
  /** Open, and the customer's last message was at this time. */
  waiting_since?: string | null;
  assigned_to?: string | null;
  assigned_name: string | null;
  messages: number;
  /** The customer's 1–5, once resolved and rated. */
  rating?: number | null;
}

/** A file on a support message, signed for an hour. */
export interface TicketAttachment {
  id: string;
  name: string;
  content_type: string;
  size_bytes: number;
  url: string | null;
  download_url: string | null;
}

/** What the console may attach. Mirrors SUPPORT_FILE_TYPES in the API. */
export const SUPPORT_FILE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
export const MAX_SUPPORT_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_SUPPORT_FILES = 5;

export type TicketQuery = {
  queue?: 'mine' | 'unassigned' | 'overdue';
  status?: string;
  q?: string;
  category?: string;
  limit?: number;
  offset?: number;
};

export interface Agent {
  id: string;
  name: string;
  email: string;
  /** Open and pending tickets they hold. */
  open: number;
}

export interface Macro {
  id: string;
  title: string;
  body: string;
  set_status: 'pending' | 'resolved' | 'closed' | null;
  created_by_name: string | null;
  use_count: number;
  created_at: string;
  updated_at: string;
}

export interface SupportInsights {
  days: number;
  now: { open: number; pending: number; unassigned: number; overdue: number };
  speed: { first_reply_hours: number | null; resolution_hours: number | null; on_time: number | null };
  flow: { day: string; opened: number; resolved: number }[];
  agents: {
    id: string;
    name: string;
    open: number;
    resolved: number;
    replies: number;
    first_reply_hours: number | null;
    /** Ratings given on their tickets in the window, and the share at 4 or 5. */
    ratings?: number;
    satisfied?: number | null;
  }[];
  /** By when they were rated. Absent from an API older than ratings. */
  ratings?: { count: number; average: number | null; satisfied: number | null };
}

export interface StaffNotification {
  id: string;
  kind: 'ticket.new' | 'ticket.assigned' | 'ticket.reply' | 'ticket.rated';
  ticket_id: string | null;
  title: string;
  body: string | null;
  read_at: string | null;
  created_at: string;
}

export interface ConsoleAccount {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  role_label: string;
  disabled_at: string | null;
  last_login_at: string | null;
  created_at: string;
  must_change_password: boolean;
  two_factor: boolean;
  role_requires_two_factor: boolean;
  /** Set only while the lock is in force. */
  locked_until: string | null;
  failed_logins: number;
  sessions: number;
  permissions: string[];
}

/** What the people list can be ordered by. Mirrors USER_SORTS in admin.service.ts. */
export type UserSort = 'joined' | 'last_seen' | 'storage' | 'albums' | 'email';

// A type rather than an interface: qs() takes a string-keyed record, and only
// a type alias is assignable to one.
export type UsersQuery = {
  q?: string;
  plan?: string;
  limit?: number;
  offset?: number;
  sort?: UserSort;
  dir?: 'asc' | 'desc';
  /** active, suspended, paused or unverified. */
  status?: string;
  /** week (seen in the last 7 days) or quiet (not in 30). */
  seen?: string;
  /** A tag's id. */
  tag?: string;
  /** ios or android, with push on. */
  platform?: string;
  twoFactor?: 'on' | 'off';
  /** 'true': at 80% or more of their allowance. */
  full?: 'true';
};

/** One account in full. Mirrors AdminService.user. */
export interface CustomerDetail {
  user: {
    id: string;
    email: string;
    display_name: string | null;
    avatar_url: string | null;
    plan: string;
    plan_since: string | null;
    roles: string[];
    title: string | null;
    bio: string | null;
    location: string | null;
    website: string | null;
    phone: string | null;
    studio_name: string | null;
    social_handle: string | null;
    handle: string | null;
    public_profile: boolean;
    discoverable: boolean;
    available_for_bookings: boolean | null;
    address_line1: string | null;
    address_line2: string | null;
    address_city: string | null;
    address_province: string | null;
    address_postal: string | null;
    address_country: string | null;
    created_at: string;
    last_seen_at: string | null;
    email_verified_at: string | null;
    disabled_at: string | null;
    /** Absent, not null, from an API older than suspensions. See isSuspended. */
    suspended_at?: string | null;
    disabled_until?: string | null;
    two_factor?: boolean;
    referral_code: string | null;
    referred_at: string | null;
    referred_by_user_id: string | null;
    referred_by_name: string | null;
  };
  storage: { bytes: number; files: number; limitBytes: number | null; bonusBytes?: number };
  limits: { workspaces: number | null; albumsPerWorkspace: number | null };
  workspaces: { id: string; name: string; created_at: string; archived_at?: string | null }[];
  albums: {
    id: string;
    name: string;
    status: string;
    workspace_id?: string;
    item_count: number;
    bytes?: number | string;
    share_links: number;
    retention_days?: number | null;
    created_at: string;
  }[];
  /** The latest one, whatever its status. */
  subscription: {
    id: string;
    plan_name: string;
    status: string;
    amount_minor: number | string;
    currency: string;
    kind: 'subscription' | 'one_time';
    current_period_end: string | null;
    cancelled_at: string | null;
    created_at: string;
  } | null;
  tickets: {
    id: string;
    subject: string;
    status: string;
    priority: string;
    created_at: string;
    updated_at?: string;
  }[];
  tags?: Tag[];
  pinnedNotes?: { id: string; admin_name: string; body: string; created_at: string }[];
  referrals?: number;
  /** What the plan picker may offer. Absent from an API older than it. */
  plans?: { name: string; label: string }[];
}

export const TAG_COLORS = ['neutral', 'terracotta', 'green', 'amber', 'red', 'blue', 'violet'] as const;
export type TagColor = (typeof TAG_COLORS)[number];

export interface Tag {
  id: string;
  label: string;
  color: TagColor;
}

export interface TagWithCount extends Tag {
  customers: number;
  created_at: string;
}

export interface CustomerNote {
  id: string;
  admin_id: string | null;
  admin_name: string;
  body: string;
  pinned: boolean;
  created_at: string;
  updated_at: string;
}

export interface TimelineEvent {
  at: string;
  kind: string;
  title: string;
  detail: string | null;
  /** The staff member, for something done in the console. */
  actor: string | null;
  /** Somewhere in the console this links to. */
  link: string | null;
}

export interface CustomerBilling {
  subscriptions: {
    id: string;
    plan_name: string;
    status: string;
    amount_minor: number;
    currency: string;
    kind: string;
    current_period_end: string | null;
    cancelled_at: string | null;
    created_at: string;
  }[];
  promos: {
    id: string;
    name: string;
    kind: string;
    storage_bytes: string;
    extra_workspaces: number;
    extra_albums_per_workspace: number;
    claimed_at: string | null;
    expires_at: string | null;
    created_at: string;
    referred_name: string | null;
  }[];
}

/** This month's client downloads for one account, as the allowance counts them. */
export interface CustomerDownloads {
  /** What the account's client links delivered this month, each file once. */
  usedBytes: number;
  /** The plan's allowance plus this month's extra. null is unlimited. */
  limitBytes: number | null;
  /** Midnight UTC on the 1st of next month. */
  resetsAt: string;
  /** New client downloads are refused. */
  paused: boolean;
  /** What staff added for this month, inside limitBytes. 0 when nothing. */
  extraBytes: number;
}

export interface CustomerMarketplace {
  posts: {
    id: string;
    slug: string;
    title: string;
    status: string;
    hidden_at: string | null;
    event_date: string | null;
    created_at: string;
    applications: number;
  }[];
  applications: {
    id: string;
    status: string;
    role: string | null;
    created_at: string;
    title: string;
    poster_id: string;
    poster_name: string;
  }[];
  enquiries: {
    id: string;
    role_wanted: string | null;
    event_date: string | null;
    budget: string | null;
    status: string;
    created_at: string;
    direction: 'sent' | 'received';
    other_id: string;
    other_name: string;
  }[];
  bookings: {
    id: string;
    role: string;
    event_date: string | null;
    rate_minor: number;
    currency: string;
    created_at: string;
    cancelled_at: string | null;
    cancel_reason: string | null;
    locked_at: string | null;
    poster_confirmed_at: string | null;
    creative_confirmed_at: string | null;
    side: 'hired' | 'booked';
    other_id: string;
    other_name: string;
  }[];
  totals: { earnedMinor: number; spentMinor: number };
}

export interface CustomerSafety {
  against: {
    id: string;
    reason: string;
    note: string | null;
    source: string | null;
    created_at: string;
    reporter_id: string | null;
    reporter_name: string | null;
    /** Absent from an API older than moderation. */
    status?: 'open' | 'actioned' | 'dismissed';
    resolution?: string | null;
  }[];
  made: {
    id: string;
    reason: string;
    note: string | null;
    source: string | null;
    created_at: string;
    target_id: string;
    target_name: string;
  }[];
  counts: {
    blocked_by: number;
    blocking: number;
    post_reports: number;
    job_reports: number;
    hidden_posts: number;
    hidden_jobs: number;
    /** Decisions against them, dismissals aside. */
    strikes?: number;
  };
  /** What moderation decided about them. Absent from an API older than moderation. */
  actions?: ModerationAction[];
}

export interface CustomerDevices {
  sessions: {
    family_id: string;
    signed_in_at: string;
    last_active_at: string;
    user_agent: string | null;
  }[];
  push: {
    id: string;
    platform: string;
    app_version: string | null;
    created_at: string;
    updated_at: string;
    disabled_at: string | null;
  }[];
}

export interface SavedView {
  id: string;
  name: string;
  query: Partial<UsersQuery>;
  shared: boolean;
  admin_id: string;
  owner_name: string;
  mine: boolean;
}

/** Turns `{a: 1, b: undefined}` into `?a=1` — undefined must not become "undefined". */
function qs(params: Record<string, string | number | undefined>): string {
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== '',
  );
  return entries.length
    ? `?${new URLSearchParams(entries.map(([k, v]) => [k, String(v)]))}`
    : '';
}

/**
 * A reward the admin defined. Mirrors `Promo` in api/src/promos/promos.service.ts.
 *
 * A *targeted* promo is offered to accounts the admin picks. A *referral* one
 * pays whoever invited an account, when that account confirms its address.
 * They differ in how a grant comes to exist, not in what it gives.
 */
export interface Promo {
  id: string;
  name: string;
  description: string | null;
  kind: 'targeted' | 'referral';
  /** Bytes. The form works in GB and multiplies before sending. */
  storageBytes: number;
  extraWorkspaces: number;
  extraAlbumsPerWorkspace: number;
  /** How long a new grant stays claimable. Null never expires. */
  claimWindowDays: number | null;
  active: boolean;
  createdAt: string;
  granted: number;
  claimed: number;
}

export interface PromoGrant {
  id: string;
  userId: string;
  displayName: string | null;
  email: string;
  claimedAt: string | null;
  expiresAt: string | null;
  /** Who joining earned this, on a referral grant. */
  referredName: string | null;
  createdAt: string;
}

export interface PromoInput {
  name: string;
  description?: string;
  kind: 'targeted' | 'referral';
  storageBytes?: number;
  extraWorkspaces?: number;
  extraAlbumsPerWorkspace?: number;
  claimWindowDays?: number | null;
}

export const console_ = {
  me: () => api.get<AdminMe>('/admin/me'),
  overview: (days = 30) => api.get<Overview>(`/admin/overview?days=${days}`),

  users: (p: UsersQuery) =>
    api.get<Paged<AdminUserRow>>(`/admin/users${qs(p)}`),
  user: (id: string) => api.get<CustomerDetail>(`/admin/users/${id}`),
  setUserDisabled: (id: string, disabled: boolean, reason?: string, notify?: boolean) =>
    api.patch<{ emailed: boolean }>(`/admin/users/${id}/disabled`, { disabled, reason, notify }),
  setUserPlan: (id: string, plan: string) =>
    api.patch(`/admin/users/${id}/plan`, { plan }),

  albums: (p: { q?: string; limit?: number; offset?: number }) =>
    api.get<Paged<Record<string, unknown>>>(`/admin/albums${qs(p)}`),
  shareLinks: (p: { limit?: number; offset?: number }) =>
    api.get<Paged<Record<string, unknown>>>(`/admin/share-links${qs(p)}`),
  revokeShareLink: (id: string) =>
    api.post(`/admin/share-links/${id}/revoke`),
  setJobHidden: (id: string, hidden: boolean) =>
    api.patch(`/admin/jobs/${id}/hidden`, { hidden }),

  setShowcaseHidden: (id: string, hidden: boolean) =>
    api.patch(`/admin/showcases/${id}/hidden`, { hidden }),

  audience: (filters: AudienceFilters) =>
    api.post<AudienceCount>('/admin/outreach/audience', { filters }),
  segments: () => api.get<Segment[]>('/admin/outreach/segments'),
  saveSegment: (input: { name: string; description?: string | null; filters: AudienceFilters }, id?: string) =>
    id
      ? api.patch<Segment>(`/admin/outreach/segments/${id}`, input)
      : api.post<Segment>('/admin/outreach/segments', input),
  removeSegment: (id: string) => api.delete(`/admin/outreach/segments/${id}`),
  broadcasts: () => api.get<Broadcast[]>('/admin/outreach/broadcasts'),
  createBroadcast: (input: {
    title: string;
    body: string;
    url?: string | null;
    segmentId?: string | null;
    push?: boolean;
    sendAt?: string | null;
    perMinute?: number;
  }) => api.post<{ id: string; status: string; send_at: string }>('/admin/outreach/broadcasts', input),
  cancelBroadcast: (id: string) => api.post(`/admin/outreach/broadcasts/${id}/cancel`),
  sendBroadcastNow: (id: string) => api.post(`/admin/outreach/broadcasts/${id}/send-now`),
  appUpdates: () => api.get<AppUpdateRow[]>('/admin/outreach/app-updates'),
  announceUpdate: (input: {
    slug: string;
    platforms: string[];
    version?: string;
    minVersion?: string;
    maxVersion?: string;
    title: string;
    body: string;
    url?: string;
    push?: boolean;
  }) => api.post<{ id: string; created: boolean; pushed: number }>('/admin/outreach/app-updates', input),
  grantPromoToSegment: (id: string, segmentId: string) =>
    api.post<{ matched: number; granted: number; segment: string }>(`/admin/promos/${id}/grants/segment`, {
      segmentId,
    }),

  moderationCases: (p: CaseQuery) =>
    api.get<Paged<ModerationCase> & { counts: Partial<Record<CaseKind, number>> }>(
      `/admin/moderation/cases${qs(p)}`,
    ),
  moderationCase: (kind: CaseKind, id: string) =>
    api.get<ModerationCaseDetail>(`/admin/moderation/cases/${kind}/${id}`),
  /** Private messages: every call is written to the audit log. */
  reportEvidence: (reportId: string) =>
    api.get<{ reportId: string; targetId: string; messages: EvidenceMessage[] }>(
      `/admin/moderation/reports/${reportId}/evidence`,
    ),
  resolveCase: (
    kind: CaseKind,
    id: string,
    input: { action: CaseAction; message?: string; note?: string; notify?: boolean },
  ) =>
    api.post<{ action: CaseAction; closed: number; ticketId: string | null; emailed: boolean }>(
      `/admin/moderation/cases/${kind}/${id}/resolve`,
      input,
    ),
  moderationComments: (p: { q?: string; userId?: string; showcaseId?: string; limit?: number; offset?: number }) =>
    api.get<Paged<ModerationComment>>(`/admin/moderation/comments${qs(p)}`),
  removeComment: (id: string, input: { message?: string; note?: string }) =>
    api.post<{ removed: true; ticketId: string | null }>(`/admin/moderation/comments/${id}/remove`, input),

  subscriptions: (p: { status?: string; limit?: number; offset?: number }) =>
    api.get<
      Paged<Record<string, unknown>> & { mrrMinor: number; activeCount: number }
    >(`/admin/subscriptions${qs(p)}`),

  health: () =>
    api.get<{
      checkedInMs: number;
      services: Record<string, { ok: boolean; detail: string }>;
      storage: { files: number; bytes: number; imagesWithoutThumbnail: number };
      pushTokens: number;
      activeSessions: number;
    }>('/admin/system/health'),

  tickets: (p: TicketQuery) =>
    api.get<
      Paged<Ticket> & {
        counts: { status: string; count: number }[];
        queues?: { mine: number; unassigned: number; overdue: number };
      }
    >(`/admin/support/tickets${qs(p)}`),
  ticket: (id: string) =>
    api.get<{
      ticket: Record<string, unknown>;
      messages: {
        id: string;
        author_type: 'user' | 'admin';
        author_name: string;
        body: string;
        internal: boolean;
        created_at: string;
        attachments?: TicketAttachment[];
      }[];
    }>(`/admin/support/tickets/${id}`),
  replyTicket: (
    id: string,
    body: string,
    internal = false,
    options: { setStatus?: string; macroId?: string; attachments?: string[] } = {},
  ) => api.post(`/admin/support/tickets/${id}/reply`, { body, internal, ...options }),
  /** Signs one file for a reply or note; send the id back with it. */
  signSupportFile: (input: { contentType: string; contentLength: number; name: string }) =>
    api.post<{ id: string; uploadUrl: string; requiredHeaders: Record<string, string>; expiresAt: string }>(
      '/admin/support/attachments',
      input,
    ),
  updateTicket: (
    id: string,
    patch: { status?: string; priority?: string; assignedTo?: string | null; category?: string | null },
  ) => api.patch(`/admin/support/tickets/${id}`, patch),
  takeTicket: (id: string) => api.post(`/admin/support/tickets/${id}/take`),
  agents: () => api.get<Agent[]>('/admin/support/agents'),
  supportInsights: (days = 30) => api.get<SupportInsights>(`/admin/support/insights?days=${days}`),
  macros: () => api.get<Macro[]>('/admin/support/macros'),
  saveMacro: (input: { title: string; body: string; setStatus?: string | null }, id?: string) =>
    id
      ? api.patch(`/admin/support/macros/${id}`, input)
      : api.post('/admin/support/macros', input),
  removeMacro: (id: string) => api.delete(`/admin/support/macros/${id}`),
  supportSettings: () => api.get<{ autoAssign: boolean }>('/admin/support/settings'),
  setSupportSettings: (autoAssign: boolean) =>
    api.patch<{ autoAssign: boolean }>('/admin/support/settings', { autoAssign }),
  staffNotifications: () =>
    api.get<{ items: StaffNotification[]; unread: number }>('/admin/support/notifications'),
  markNotificationsRead: (ids?: string[]) => api.post('/admin/support/notifications/read', { ids }),

  accounts: () => api.get<ConsoleAccount[]>('/admin/accounts'),
  createAccount: (input: {
    email: string;
    name: string;
    password: string;
    role: AdminRole;
  }) => api.post('/admin/accounts', input),
  setAccountRole: (id: string, role: AdminRole) =>
    api.patch(`/admin/accounts/${id}/role`, { role }),
  setAccountDisabled: (id: string, disabled: boolean) =>
    api.patch(`/admin/accounts/${id}/disabled`, { disabled }),
  setAccountPassword: (id: string, password: string) =>
    api.patch(`/admin/accounts/${id}/password`, { password }),
  removeAccount: (id: string) => api.delete(`/admin/accounts/${id}`),

  promos: () => api.get<Promo[]>('/admin/promos'),
  promoGrants: (id: string) => api.get<PromoGrant[]>(`/admin/promos/${id}/grants`),
  createPromo: (input: PromoInput) => api.post<Promo>('/admin/promos', input),
  setPromoActive: (id: string, active: boolean) =>
    api.patch<Promo>(`/admin/promos/${id}/active`, { active }),
  grantPromo: (id: string, userIds: string[]) =>
    api.post<{ granted: number }>(`/admin/promos/${id}/grants`, { userIds }),

  audit: (p: AuditQuery) => api.get<Paged<AuditEntry>>(`/admin/audit${qs(p)}`),
  auditFacets: () =>
    api.get<{ actions: string[]; admins: { id: string; name: string; email: string }[] }>(
      '/admin/audit/facets',
    ),

  // ─── your own security ──────────────────────────────────────────────────
  mySecurity: () => api.get<MySecurity>('/admin/me/security'),
  changePassword: (currentPassword: string, newPassword: string) =>
    api.post<{ ok: true; reauthenticate: true }>('/admin/me/password', {
      currentPassword,
      newPassword,
    }),
  startTwoFactor: () => api.post<{ secret: string; uri: string }>('/admin/me/2fa/setup'),
  enableTwoFactor: (code: string) =>
    api.post<{ recoveryCodes: string[] }>('/admin/me/2fa/enable', { code }),
  disableTwoFactor: (password: string) => api.post('/admin/me/2fa/disable', { password }),
  regenerateRecoveryCodes: (code: string) =>
    api.post<{ recoveryCodes: string[] }>('/admin/me/2fa/recovery-codes', { code }),
  endMySession: (id: string) => api.delete(`/admin/me/sessions/${id}`),
  endMyOtherSessions: () => api.post<{ ended: number }>('/admin/me/sessions/end-others'),

  // ─── the team's security ────────────────────────────────────────────────
  logins: (p: { adminId?: string; outcome?: string; limit?: number; offset?: number }) =>
    api.get<Paged<LoginEvent>>(`/admin/security/logins${qs(p)}`),
  sessions: () => api.get<SessionRow[]>('/admin/security/sessions'),
  endSession: (id: string) => api.delete(`/admin/security/sessions/${id}`),
  unlockAccount: (id: string) => api.post(`/admin/accounts/${id}/unlock`),
  resetTwoFactor: (id: string) => api.post(`/admin/accounts/${id}/2fa/reset`),

  roles: () => api.get<{ roles: Role[]; catalog: PermissionGroup[] }>('/admin/roles'),
  createRole: (input: RoleInput) => api.post<{ name: string }>('/admin/roles', input),
  updateRole: (name: string, input: RoleInput) => api.patch(`/admin/roles/${name}`, input),
  removeRole: (name: string) => api.delete(`/admin/roles/${name}`),

  presence: (targetType: 'user' | 'ticket' | 'case', targetId: string, state: 'viewing' | 'replying') =>
    api.post<{ others: PresenceOther[] }>('/admin/presence', { targetType, targetId, state }),
  leavePresence: (targetType: 'user' | 'ticket' | 'case', targetId: string) =>
    api.post('/admin/presence/leave', { targetType, targetId }),

  // ─── Customer 360 ───────────────────────────────────────────────────────
  timeline: (id: string, before?: string) =>
    api.get<{ data: TimelineEvent[]; nextBefore: string | null }>(
      `/admin/users/${id}/timeline${qs({ before, limit: 40 })}`,
    ),
  customerBilling: (id: string) => api.get<CustomerBilling>(`/admin/users/${id}/billing`),
  customerDownloads: (id: string) => api.get<CustomerDownloads>(`/admin/users/${id}/downloads`),
  /** Replaces this month's extra with `gigabytes`; 0 removes it. */
  setDownloadExtra: (id: string, gigabytes: number) =>
    api.post<CustomerDownloads>(`/admin/users/${id}/downloads/extra`, { gigabytes }),
  customerMarketplace: (id: string) =>
    api.get<CustomerMarketplace>(`/admin/users/${id}/marketplace`),
  customerSafety: (id: string) => api.get<CustomerSafety>(`/admin/users/${id}/safety`),
  customerDevices: (id: string) => api.get<CustomerDevices>(`/admin/users/${id}/devices`),

  sendPasswordReset: (id: string) => api.post(`/admin/users/${id}/password-reset-email`),
  sendVerification: (id: string) => api.post(`/admin/users/${id}/verification-email`),
  markVerified: (id: string) => api.post(`/admin/users/${id}/verify`),
  resetCustomerTwoFactor: (id: string) => api.post(`/admin/users/${id}/2fa/reset`),
  signOutCustomer: (id: string) => api.post(`/admin/users/${id}/sign-out`),
  signOutCustomerDevice: (id: string, familyId: string) =>
    api.post(`/admin/users/${id}/devices/${familyId}/sign-out`),
  deleteCustomer: (id: string, confirmEmail: string) =>
    api.post<{ deleted: true; filesDeleted: number }>(`/admin/users/${id}/delete`, { confirmEmail }),

  notes: (id: string) => api.get<CustomerNote[]>(`/admin/users/${id}/notes`),
  addNote: (id: string, body: string, pinned?: boolean) =>
    api.post<CustomerNote>(`/admin/users/${id}/notes`, { body, pinned }),
  updateNote: (id: string, noteId: string, patch: { body?: string; pinned?: boolean }) =>
    api.patch<CustomerNote>(`/admin/users/${id}/notes/${noteId}`, patch),
  removeNote: (id: string, noteId: string) => api.delete(`/admin/users/${id}/notes/${noteId}`),

  tags: () => api.get<TagWithCount[]>('/admin/tags'),
  createTag: (label: string, color?: TagColor) => api.post<Tag>('/admin/tags', { label, color }),
  removeTag: (id: string) => api.delete(`/admin/tags/${id}`),
  setCustomerTags: (id: string, tagIds: string[]) =>
    api.put<Tag[]>(`/admin/users/${id}/tags`, { tagIds }),
  bulkTags: (userIds: string[], add: string[], remove: string[]) =>
    api.post<{ changed: number }>('/admin/users/bulk/tags', { userIds, add, remove }),

  views: () => api.get<SavedView[]>('/admin/views?scope=users'),
  saveView: (name: string, query: Partial<UsersQuery>, shared: boolean) =>
    api.post<SavedView>('/admin/views', { scope: 'users', name, query, shared }),
  removeView: (id: string) => api.delete(`/admin/views/${id}`),
};
