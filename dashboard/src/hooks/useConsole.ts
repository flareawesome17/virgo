'use client';

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import { toast } from 'sonner';
import { useEffect } from 'react';
import {
  console_,
  type AdminRole,
  type AuditQuery,
  type PromoInput,
  type RoleInput,
  type UsersQuery,
} from '@/api/console';

export const keys = {
  me: ['me'] as QueryKey,
  overview: (days: number) => ['overview', days] as QueryKey,
  users: (p: unknown) => ['users', p] as QueryKey,
  user: (id: string) => ['user', id] as QueryKey,
  albums: (p: unknown) => ['albums', p] as QueryKey,
  shareLinks: (p: unknown) => ['shareLinks', p] as QueryKey,
  jobReports: (p: unknown) => ['jobReports', p] as QueryKey,
  userReports: (p: unknown) => ['userReports', p] as QueryKey,
  showcaseReports: (p: unknown) => ['showcaseReports', p] as QueryKey,
  subscriptions: (p: unknown) => ['subscriptions', p] as QueryKey,
  health: ['health'] as QueryKey,
  tickets: (p: unknown) => ['tickets', p] as QueryKey,
  ticket: (id: string) => ['ticket', id] as QueryKey,
  accounts: ['accounts'] as QueryKey,
  audit: (p: unknown) => ['audit', p] as QueryKey,
  promos: ['promos'] as QueryKey,
  promoGrants: (id: string) => ['promoGrants', id] as QueryKey,
  auditFacets: ['auditFacets'] as QueryKey,
  mySecurity: ['mySecurity'] as QueryKey,
  logins: (p: unknown) => ['logins', p] as QueryKey,
  sessions: ['sessions'] as QueryKey,
  roles: ['roles'] as QueryKey,
};

export function useMe() {
  const q = useQuery({ queryKey: keys.me, queryFn: console_.me, staleTime: 300_000 });
  return {
    ...q,
    me: q.data,
    /** Gate a control on the same permission the server will check. */
    can: (permission: string) => q.data?.permissions.includes(permission) ?? false,
  };
}

export function useOverview(days = 30, enabled = true) {
  return useQuery({
    queryKey: keys.overview(days),
    queryFn: () => console_.overview(days),
    // The sidebar reads this for its badge counts and must not fire it for a
    // role that cannot see the overview — it would 403 on every page load.
    enabled,
  });
}

export function useUsers(p: UsersQuery, enabled = true) {
  return useQuery({
    queryKey: keys.users(p),
    queryFn: () => console_.users(p),
    enabled,
    // The next page keeps the current one on screen while it loads, rather
    // than collapsing the table to skeletons on every click of Next.
    placeholderData: keepPreviousData,
  });
}

export function useUser(id: string) {
  return useQuery({ queryKey: keys.user(id), queryFn: () => console_.user(id), enabled: !!id });
}

export function useAlbums(p: { q?: string; limit?: number; offset?: number }) {
  return useQuery({
    queryKey: keys.albums(p),
    queryFn: () => console_.albums(p),
    placeholderData: keepPreviousData,
  });
}

export function useShareLinks(p: { limit?: number; offset?: number }) {
  return useQuery({
    queryKey: keys.shareLinks(p),
    queryFn: () => console_.shareLinks(p),
    placeholderData: keepPreviousData,
  });
}

export function useJobReports(p: { limit?: number; offset?: number }) {
  return useQuery({ queryKey: keys.jobReports(p), queryFn: () => console_.jobReports(p) });
}

export function useUserReports(p: { limit?: number; offset?: number }) {
  return useQuery({ queryKey: keys.userReports(p), queryFn: () => console_.userReports(p) });
}

export function useShowcaseReports(p: { limit?: number; offset?: number }) {
  return useQuery({
    queryKey: keys.showcaseReports(p),
    queryFn: () => console_.showcaseReports(p),
  });
}

export function useSetShowcaseHidden() {
  return useConsoleMutation(
    ({ id, hidden }: { id: string; hidden: boolean }) =>
      console_.setShowcaseHidden(id, hidden),
    { success: 'Post updated', invalidate: [['showcaseReports']] },
  );
}

export function useSubscriptions(p: { status?: string; limit?: number; offset?: number }) {
  return useQuery({ queryKey: keys.subscriptions(p), queryFn: () => console_.subscriptions(p) });
}

export function useHealth() {
  return useQuery({
    queryKey: keys.health,
    queryFn: console_.health,
    // The point of this screen is to notice an outage, which a five-minute-old
    // answer cannot do.
    refetchInterval: 30_000,
    staleTime: 0,
  });
}

export function useTickets(
  p: { status?: string; q?: string; limit?: number; offset?: number },
  enabled = true,
) {
  return useQuery({
    queryKey: keys.tickets(p),
    queryFn: () => console_.tickets(p),
    enabled,
    placeholderData: keepPreviousData,
  });
}

export function useTicket(id: string) {
  return useQuery({ queryKey: keys.ticket(id), queryFn: () => console_.ticket(id), enabled: !!id });
}

export function useAccounts() {
  return useQuery({ queryKey: keys.accounts, queryFn: console_.accounts });
}

export function useAudit(p: AuditQuery) {
  return useQuery({
    queryKey: keys.audit(p),
    queryFn: () => console_.audit(p),
    placeholderData: keepPreviousData,
  });
}

/**
 * One place for "do the thing, say what happened, refresh what it changed".
 *
 * Every console write is destructive to somebody's account, so silence is not
 * an acceptable outcome — a disable that quietly failed looks exactly like one
 * that worked until the page is reloaded.
 */
function useConsoleMutation<TArgs, TResult>(
  fn: (args: TArgs) => Promise<TResult>,
  options: { success: string; invalidate: QueryKey[] },
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      toast.success(options.success);
      for (const key of options.invalidate) {
        void qc.invalidateQueries({ queryKey: key });
      }
      // The audit list grows on every write, whichever one it was.
      void qc.invalidateQueries({ queryKey: ['audit'] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'That did not work');
    },
  });
}

export function useSetUserDisabled(userId: string) {
  return useConsoleMutation(
    ({ disabled, reason }: { disabled: boolean; reason?: string }) =>
      console_.setUserDisabled(userId, disabled, reason),
    {
      success: 'Account updated',
      // The people reports carry the target's suspension, and a moderator
      // who suspends from a report goes straight back to that list.
      invalidate: [keys.user(userId), ['users'], ['userReports']],
    },
  );
}

export function useSetUserPlan(userId: string) {
  return useConsoleMutation(
    (plan: string) => console_.setUserPlan(userId, plan),
    { success: 'Plan changed', invalidate: [keys.user(userId), ['users']] },
  );
}

export function useRevokeShareLink() {
  return useConsoleMutation((id: string) => console_.revokeShareLink(id), {
    success: 'Link revoked',
    invalidate: [['shareLinks']],
  });
}

export function useSetJobHidden() {
  return useConsoleMutation(
    ({ id, hidden }: { id: string; hidden: boolean }) =>
      console_.setJobHidden(id, hidden),
    { success: 'Post updated', invalidate: [['jobReports']] },
  );
}

export function useReplyTicket(id: string) {
  return useConsoleMutation(
    ({ body, internal }: { body: string; internal: boolean }) =>
      console_.replyTicket(id, body, internal),
    { success: 'Sent', invalidate: [keys.ticket(id), ['tickets']] },
  );
}

export function useUpdateTicket(id: string) {
  return useConsoleMutation(
    (patch: { status?: string; priority?: string; assignedTo?: string | null }) =>
      console_.updateTicket(id, patch),
    { success: 'Ticket updated', invalidate: [keys.ticket(id), ['tickets']] },
  );
}

export function useCreateAccount() {
  return useConsoleMutation(
    (input: { email: string; name: string; password: string; role: AdminRole }) =>
      console_.createAccount(input),
    { success: 'Console account created', invalidate: [keys.accounts] },
  );
}

export function useSetAccountRole() {
  return useConsoleMutation(
    ({ id, role }: { id: string; role: AdminRole }) =>
      console_.setAccountRole(id, role),
    { success: 'Role changed', invalidate: [keys.accounts] },
  );
}

export function useSetAccountDisabled() {
  return useConsoleMutation(
    ({ id, disabled }: { id: string; disabled: boolean }) =>
      console_.setAccountDisabled(id, disabled),
    { success: 'Account updated', invalidate: [keys.accounts] },
  );
}

export function useRemoveAccount() {
  return useConsoleMutation((id: string) => console_.removeAccount(id), {
    success: 'Console account removed',
    invalidate: [keys.accounts],
  });
}

// ─── promos ────────────────────────────────────────────────────────────────

export function usePromos(enabled = true) {
  return useQuery({ queryKey: keys.promos, queryFn: console_.promos, enabled });
}

/** Who holds a promo, and who took it. Only fetched when a row is expanded. */
export function usePromoGrants(id: string | null) {
  return useQuery({
    queryKey: keys.promoGrants(id ?? ''),
    queryFn: () => console_.promoGrants(id!),
    enabled: !!id,
  });
}

export function useCreatePromo() {
  return useConsoleMutation((input: PromoInput) => console_.createPromo(input), {
    success: 'Promo created',
    invalidate: [keys.promos],
  });
}

export function useSetPromoActive() {
  return useConsoleMutation(
    ({ id, active }: { id: string; active: boolean }) =>
      console_.setPromoActive(id, active),
    { success: 'Promo updated', invalidate: [keys.promos] },
  );
}

/**
 * Offers a promo to the selected accounts.
 *
 * Reports both numbers rather than just the total: re-running a selection that
 * mostly overlaps grants very little, and "12 of 30 — the rest already had it"
 * is the difference between that reading as a bug and reading as correct.
 */
export function useGrantPromo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, userIds }: { id: string; userIds: string[] }) =>
      console_.grantPromo(id, userIds).then((r) => ({ ...r, selected: userIds.length })),
    onSuccess: (result) => {
      const { granted, selected } = result;
      if (granted === 0) {
        toast.info('Nothing to send', {
          description: 'Everyone selected already had this promo.',
        });
      } else {
        toast.success(`Offered to ${granted} ${granted === 1 ? 'person' : 'people'}`, {
          description:
            granted < selected
              ? `${selected - granted} of the ${selected} selected already had it.`
              : undefined,
        });
      }
      void qc.invalidateQueries({ queryKey: keys.promos });
      void qc.invalidateQueries({ queryKey: ['promoGrants'] });
      void qc.invalidateQueries({ queryKey: ['audit'] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'That did not work');
    },
  });
}

// ─── staff security ────────────────────────────────────────────────────────

export function useAuditFacets(enabled = true) {
  return useQuery({ queryKey: keys.auditFacets, queryFn: console_.auditFacets, enabled });
}

export function useMySecurity() {
  return useQuery({ queryKey: keys.mySecurity, queryFn: console_.mySecurity });
}

export function useLogins(
  p: { adminId?: string; outcome?: string; limit?: number; offset?: number },
  enabled = true,
) {
  return useQuery({
    queryKey: keys.logins(p),
    queryFn: () => console_.logins(p),
    enabled,
    placeholderData: keepPreviousData,
  });
}

export function useSessions(enabled = true) {
  return useQuery({ queryKey: keys.sessions, queryFn: console_.sessions, enabled });
}

export function useRoles(enabled = true) {
  return useQuery({ queryKey: keys.roles, queryFn: console_.roles, enabled });
}

/** What changes when somebody's security does: their row, their sessions, you. */
const SECURITY_KEYS: QueryKey[] = [keys.me, keys.mySecurity, keys.accounts, keys.sessions, ['logins']];

/**
 * Two-factor setup returns secrets (the QR code, then recovery codes), so these
 * do not toast — the screen that called them shows the result instead.
 */
export function useStartTwoFactor() {
  return useMutation({ mutationFn: console_.startTwoFactor });
}

export function useEnableTwoFactor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => console_.enableTwoFactor(code),
    onSuccess: () => {
      // Not `me` yet: refetching it now would lift a forced setup screen
      // before the recovery codes on it have been read. The screen does it.
      void qc.invalidateQueries({ queryKey: keys.mySecurity });
      void qc.invalidateQueries({ queryKey: ['audit'] });
    },
  });
}

export function useRegenerateRecoveryCodes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => console_.regenerateRecoveryCodes(code),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.mySecurity });
      void qc.invalidateQueries({ queryKey: ['audit'] });
    },
  });
}

export function useDisableTwoFactor() {
  return useConsoleMutation((password: string) => console_.disableTwoFactor(password), {
    success: 'Two-factor turned off',
    invalidate: SECURITY_KEYS,
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: ({ current, next }: { current: string; next: string }) =>
      console_.changePassword(current, next),
  });
}

export function useEndMySession() {
  return useConsoleMutation((id: string) => console_.endMySession(id), {
    success: 'Signed out of that session',
    invalidate: SECURITY_KEYS,
  });
}

export function useEndMyOtherSessions() {
  return useConsoleMutation(() => console_.endMyOtherSessions(), {
    success: 'Signed out everywhere else',
    invalidate: SECURITY_KEYS,
  });
}

export function useEndSession() {
  return useConsoleMutation((id: string) => console_.endSession(id), {
    success: 'Session ended',
    invalidate: SECURITY_KEYS,
  });
}

export function useUnlockAccount() {
  return useConsoleMutation((id: string) => console_.unlockAccount(id), {
    success: 'Account unlocked',
    invalidate: SECURITY_KEYS,
  });
}

export function useResetTwoFactor() {
  return useConsoleMutation((id: string) => console_.resetTwoFactor(id), {
    success: 'Two-factor reset. They are signed out and enrol again at next sign-in.',
    invalidate: SECURITY_KEYS,
  });
}

/** Roles feed the role pickers (on `me`) and every account's permissions. */
const ROLE_KEYS: QueryKey[] = [keys.roles, keys.me, keys.accounts];

export function useCreateRole() {
  return useConsoleMutation((input: RoleInput) => console_.createRole(input), {
    success: 'Role created',
    invalidate: ROLE_KEYS,
  });
}

export function useUpdateRole() {
  return useConsoleMutation(
    ({ name, input }: { name: string; input: RoleInput }) => console_.updateRole(name, input),
    { success: 'Role saved', invalidate: ROLE_KEYS },
  );
}

export function useRemoveRole() {
  return useConsoleMutation((name: string) => console_.removeRole(name), {
    success: 'Role deleted',
    invalidate: ROLE_KEYS,
  });
}

/**
 * Who else has this record open, refreshed every 20 seconds.
 *
 * The heartbeat is the query: React Query already knows how to poll, pause in
 * a hidden tab and stop when the page goes. Leaving says so at once rather
 * than letting the entry age out over 45 seconds.
 */
export function usePresence(
  targetType: 'user' | 'ticket',
  targetId: string,
  state: 'viewing' | 'replying' = 'viewing',
) {
  const query = useQuery({
    queryKey: ['presence', targetType, targetId, state],
    queryFn: () => console_.presence(targetType, targetId, state),
    enabled: !!targetId,
    refetchInterval: 20_000,
    staleTime: 0,
    // Somebody else's presence is a nicety; a failed beat is not worth a retry.
    retry: false,
  });

  useEffect(() => {
    if (!targetId) return;
    return () => {
      void console_.leavePresence(targetType, targetId).catch(() => {});
    };
  }, [targetType, targetId]);

  return query.data?.others ?? [];
}
