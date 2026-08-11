import { api } from './client';

/** Mirrors ADMIN_ROLES in api/src/admin/rbac.ts. */
export type AdminRole = 'owner' | 'admin' | 'support' | 'viewer';

export interface AdminMe {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  roleLabel: string;
  permissions: string[];
  /** True while the account still holds the password the server generated. */
  mustChangePassword: boolean;
  roles: { name: AdminRole; label: string; description: string }[];
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
    reports: number;
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
  disabled_at: string | null;
  handle: string | null;
  public_profile: boolean;
  storage_bytes: string | number;
  albums: number;
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
  disabled_at: string | null;
  last_login_at: string | null;
  created_at: string;
  permissions: string[];
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

  users: (p: { q?: string; plan?: string; limit?: number; offset?: number }) =>
    api.get<Paged<AdminUserRow>>(`/admin/users${qs(p)}`),
  user: (id: string) => api.get<Record<string, unknown>>(`/admin/users/${id}`),
  setUserDisabled: (id: string, disabled: boolean, reason?: string) =>
    api.patch(`/admin/users/${id}/disabled`, { disabled, reason }),
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
  setJobHidden: (id: string, hidden: boolean) =>
    api.patch(`/admin/jobs/${id}/hidden`, { hidden }),

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

  audit: (p: { limit?: number; offset?: number; targetId?: string }) =>
    api.get<
      Paged<{
        id: string;
        admin_email: string;
        action: string;
        target_type: string | null;
        target_id: string | null;
        detail: Record<string, unknown>;
        created_at: string;
      }>
    >(`/admin/audit${qs(p)}`),
};
