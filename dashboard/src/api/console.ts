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

/** Somebody in the app reported an account. Mirrors AdminService.userReports. */
export interface UserReportRow {
  id: string;
  /** spam, scam, harassment, impersonation, inappropriate or other. */
  reason: string;
  note: string | null;
  /** Where in the app it was made: profile, chat, nearby, applicants, enquiries or job. */
  source: string | null;
  created_at: string;
  target_id: string;
  target_name: string;
  target_handle: string | null;
  target_email: string;
  target_suspended_at: string | null;
  /** Null once the reporter deletes their account; the report is kept. */
  reporter_id: string | null;
  reporter_email: string | null;
  /** Every report against this account, from anyone, not just this one. */
  target_report_count: number;
}

/** Somebody reported a post. Mirrors AdminService.showcaseReports. */
export interface ShowcaseReportRow {
  id: string;
  /** spam, scam, harassment, inappropriate, stolen_work, wrong_credit or other. */
  reason: string;
  note: string | null;
  created_at: string;
  showcase_id: string;
  title: string | null;
  caption: string | null;
  /** Set once the console has taken it down. */
  hidden_at: string | null;
  published_at: string | null;
  author_id: string;
  author_name: string;
  author_handle: string | null;
  author_email: string;
  author_suspended_at: string | null;
  /** Null once the reporter deletes their account; the report is kept. */
  reporter_id: string | null;
  reporter_email: string | null;
  /** Every report against this post, from anyone, not just this one. */
  showcase_report_count: number;
  /** The first piece's thumbnail key — a moderator needs to see the photograph. */
  thumb_key: string | null;
}

export interface Ticket {
  id: string;
  subject: string;
  status: 'open' | 'pending' | 'resolved' | 'closed';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  user_email: string;
  user_id: string | null;
  created_at: string;
  updated_at: string;
  assigned_name: string | null;
  messages: number;
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
  };
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
  jobReports: (p: { limit?: number; offset?: number }) =>
    api.get<Paged<Record<string, unknown>>>(`/admin/job-reports${qs(p)}`),
  userReports: (p: { limit?: number; offset?: number }) =>
    api.get<Paged<UserReportRow>>(`/admin/user-reports${qs(p)}`),
  setJobHidden: (id: string, hidden: boolean) =>
    api.patch(`/admin/jobs/${id}/hidden`, { hidden }),

  showcaseReports: (p: { limit?: number; offset?: number }) =>
    api.get<Paged<ShowcaseReportRow>>(`/admin/showcase-reports${qs(p)}`),

  setShowcaseHidden: (id: string, hidden: boolean) =>
    api.patch(`/admin/showcases/${id}/hidden`, { hidden }),

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

  tickets: (p: { status?: string; q?: string; limit?: number; offset?: number }) =>
    api.get<Paged<Ticket> & { counts: { status: string; count: number }[] }>(
      `/admin/support/tickets${qs(p)}`,
    ),
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
      }[];
    }>(`/admin/support/tickets/${id}`),
  replyTicket: (id: string, body: string, internal = false) =>
    api.post(`/admin/support/tickets/${id}/reply`, { body, internal }),
  updateTicket: (
    id: string,
    patch: { status?: string; priority?: string; assignedTo?: string | null },
  ) => api.patch(`/admin/support/tickets/${id}`, patch),

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

  presence: (targetType: 'user' | 'ticket', targetId: string, state: 'viewing' | 'replying') =>
    api.post<{ others: PresenceOther[] }>('/admin/presence', { targetType, targetId, state }),
  leavePresence: (targetType: 'user' | 'ticket', targetId: string) =>
    api.post('/admin/presence/leave', { targetType, targetId }),

  // ─── Customer 360 ───────────────────────────────────────────────────────
  timeline: (id: string, before?: string) =>
    api.get<{ data: TimelineEvent[]; nextBefore: string | null }>(
      `/admin/users/${id}/timeline${qs({ before, limit: 40 })}`,
    ),
  customerBilling: (id: string) => api.get<CustomerBilling>(`/admin/users/${id}/billing`),
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
