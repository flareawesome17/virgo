'use client';

import {
  keepPreviousData,
  useInfiniteQuery,
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
  type TagColor,
  type AudienceFilters,
  type CaseAction,
  type CaseKind,
  type CaseQuery,
  type TicketQuery,
  type UsersQuery,
} from '@/api/console';

export const keys = {
  me: ['me'] as QueryKey,
  overview: (days: number) => ['overview', days] as QueryKey,
  users: (p: unknown) => ['users', p] as QueryKey,
  user: (id: string) => ['user', id] as QueryKey,
  albums: (p: unknown) => ['albums', p] as QueryKey,
  shareLinks: (p: unknown) => ['shareLinks', p] as QueryKey,
  moderationCases: (p: unknown) => ['moderation', 'cases', p] as QueryKey,
  moderationCase: (kind: string, id: string) => ['moderation', 'case', kind, id] as QueryKey,
  moderationComments: (p: unknown) => ['moderation', 'comments', p] as QueryKey,
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

// ─── Outreach ───────────────────────────────────────────────────────────────

/** Who these filters reach, recounted as they change (callers debounce). */
export function useAudience(filters: AudienceFilters, enabled = true) {
  return useQuery({
    queryKey: ['outreach', 'audience', filters],
    queryFn: () => console_.audience(filters),
    enabled,
    placeholderData: keepPreviousData,
  });
}

export function useSegments(enabled = true) {
  return useQuery({ queryKey: ['outreach', 'segments'], queryFn: console_.segments, enabled });
}

export function useSaveSegment() {
  return useConsoleMutation(
    ({ id, input }: { id?: string; input: { name: string; description?: string | null; filters: AudienceFilters } }) =>
      console_.saveSegment(input, id),
    { success: 'Segment saved', invalidate: [['outreach']] },
  );
}

export function useRemoveSegment() {
  return useConsoleMutation((id: string) => console_.removeSegment(id), {
    success: 'Segment deleted',
    invalidate: [['outreach']],
  });
}

/** Polled while anything is sending, so the counts move on their own. */
export function useBroadcasts() {
  return useQuery({
    queryKey: ['outreach', 'broadcasts'],
    queryFn: console_.broadcasts,
    refetchInterval: (q) =>
      q.state.data?.some((b) => b.status === 'sending' || b.status === 'scheduled') ? 15_000 : false,
  });
}

export function useCreateBroadcast() {
  return useConsoleMutation(
    (input: Parameters<typeof console_.createBroadcast>[0]) => console_.createBroadcast(input),
    { success: 'Broadcast scheduled', invalidate: [['outreach']] },
  );
}

export function useCancelBroadcast() {
  return useConsoleMutation((id: string) => console_.cancelBroadcast(id), {
    success: 'Broadcast cancelled',
    invalidate: [['outreach']],
  });
}

export function useSendBroadcastNow() {
  return useConsoleMutation((id: string) => console_.sendBroadcastNow(id), {
    success: 'Sending on the next minute',
    invalidate: [['outreach']],
  });
}

export function useAppUpdates() {
  return useQuery({ queryKey: ['outreach', 'appUpdates'], queryFn: console_.appUpdates });
}

export function useAnnounceUpdate() {
  return useConsoleMutation(
    (input: Parameters<typeof console_.announceUpdate>[0]) => console_.announceUpdate(input),
    { success: 'Update announced', invalidate: [['outreach']] },
  );
}

export function useGrantPromoToSegment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, segmentId }: { id: string; segmentId: string }) =>
      console_.grantPromoToSegment(id, segmentId),
    onSuccess: (r) => {
      if (r.granted === 0) {
        toast.info('Nothing to send', { description: `Everyone in “${r.segment}” already had this promo.` });
      } else {
        toast.success(`Offered to ${r.granted.toLocaleString()}`, {
          description:
            r.granted < r.matched
              ? `${(r.matched - r.granted).toLocaleString()} of “${r.segment}” already had it.`
              : `Everyone in “${r.segment}”.`,
        });
      }
      for (const key of [['promos'], ['promoGrants'], ['audit']]) void qc.invalidateQueries({ queryKey: key });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'That did not work'),
  });
}

// ─── Moderation ─────────────────────────────────────────────────────────────

export function useModerationCases(p: CaseQuery) {
  return useQuery({
    queryKey: keys.moderationCases(p),
    queryFn: () => console_.moderationCases(p),
    placeholderData: keepPreviousData,
  });
}

export function useModerationCase(kind: CaseKind, id: string) {
  return useQuery({
    queryKey: keys.moderationCase(kind, id),
    queryFn: () => console_.moderationCase(kind, id),
  });
}

/**
 * A chat report's messages. Fetched only when asked for, never on page load:
 * each fetch is a look at private messages, and the audit log records it.
 */
export function useReportEvidence(reportId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['moderation', 'evidence', reportId],
    queryFn: () => console_.reportEvidence(reportId),
    enabled,
    staleTime: Infinity,
  });
}

const DECIDED: Record<CaseAction, string> = {
  dismiss: 'Dismissed',
  hide: 'Hidden',
  warn: 'Warning sent',
  suspend: 'Account suspended',
};

export function useResolveCase(kind: CaseKind, id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { action: CaseAction; message?: string; note?: string; notify?: boolean }) =>
      console_.resolveCase(kind, id, input),
    onSuccess: (result) => {
      toast.success(DECIDED[result.action]);
      for (const key of [['moderation'], ['overview'], ['user'], ['users'], ['customerSafety'], ['tickets'], ['audit']]) {
        void qc.invalidateQueries({ queryKey: key });
      }
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'That did not work'),
  });
}

export function useModerationComments(p: { q?: string; userId?: string; showcaseId?: string; limit?: number; offset?: number }) {
  return useQuery({
    queryKey: keys.moderationComments(p),
    queryFn: () => console_.moderationComments(p),
    placeholderData: keepPreviousData,
  });
}

export function useRemoveComment() {
  return useConsoleMutation(
    ({ id, message, note }: { id: string; message?: string; note?: string }) =>
      console_.removeComment(id, { message, note }),
    { success: 'Comment removed', invalidate: [['moderation'], ['customerSafety'], ['tickets']] },
  );
}

export function useSetShowcaseHidden() {
  return useConsoleMutation(
    ({ id, hidden }: { id: string; hidden: boolean }) =>
      console_.setShowcaseHidden(id, hidden),
    { success: 'Post updated', invalidate: [['moderation']] },
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

export function useTickets(p: TicketQuery, enabled = true) {
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
    ({ disabled, reason, notify }: { disabled: boolean; reason?: string; notify?: boolean }) =>
      console_.setUserDisabled(userId, disabled, reason, notify),
    {
      success: 'Account updated',
      // The people reports carry the target's suspension, and a moderator
      // who suspends from a report goes straight back to that list.
      invalidate: [keys.user(userId), ['users'], ['moderation'], ['timeline', userId]],
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
    { success: 'Post updated', invalidate: [['moderation']] },
  );
}

/** What a ticket change can move: the thread, the queues, the desk numbers. */
const ticketKeys = (id: string): QueryKey[] => [keys.ticket(id), ['tickets'], ['supportInsights']];

export function useReplyTicket(id: string) {
  return useConsoleMutation(
    ({
      body,
      internal,
      setStatus,
      macroId,
      attachments,
    }: {
      body: string;
      internal: boolean;
      setStatus?: string;
      macroId?: string;
      attachments?: string[];
    }) => console_.replyTicket(id, body, internal, { setStatus, macroId, attachments }),
    { success: 'Sent', invalidate: [...ticketKeys(id), ['macros']] },
  );
}

export function useUpdateTicket(id: string) {
  return useConsoleMutation(
    (patch: { status?: string; priority?: string; assignedTo?: string | null; category?: string | null }) =>
      console_.updateTicket(id, patch),
    { success: 'Ticket updated', invalidate: ticketKeys(id) },
  );
}

export function useTakeTicket(id: string) {
  return useConsoleMutation(() => console_.takeTicket(id), {
    success: 'It is yours',
    invalidate: ticketKeys(id),
  });
}

export function useAgents(enabled = true) {
  return useQuery({ queryKey: ['agents'], queryFn: console_.agents, enabled, staleTime: 60_000 });
}

export function useSupportInsights(days = 30) {
  return useQuery({ queryKey: ['supportInsights', days], queryFn: () => console_.supportInsights(days) });
}

export function useMacros() {
  return useQuery({ queryKey: ['macros'], queryFn: console_.macros });
}

export function useSaveMacro() {
  return useConsoleMutation(
    ({ id, input }: { id?: string; input: { title: string; body: string; setStatus?: string | null } }) =>
      console_.saveMacro(input, id),
    { success: 'Saved', invalidate: [['macros']] },
  );
}

export function useRemoveMacro() {
  return useConsoleMutation((id: string) => console_.removeMacro(id), {
    success: 'Removed',
    invalidate: [['macros']],
  });
}

export function useSupportSettings() {
  return useQuery({ queryKey: ['supportSettings'], queryFn: console_.supportSettings });
}

export function useSetSupportSettings() {
  return useConsoleMutation((autoAssign: boolean) => console_.setSupportSettings(autoAssign), {
    success: 'Saved',
    invalidate: [['supportSettings']],
  });
}

/** The bell. Polled, because there is no console socket; 30s is near enough. */
export function useStaffNotifications() {
  return useQuery({
    queryKey: ['staffNotifications'],
    queryFn: console_.staffNotifications,
    refetchInterval: 30_000,
  });
}

export function useMarkNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids?: string[]) => console_.markNotificationsRead(ids),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['staffNotifications'] }),
  });
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
  targetType: 'user' | 'ticket' | 'case',
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

// ─── Customer 360 ──────────────────────────────────────────────────────────

/** What changes on an account page when staff act on it. */
const accountKeys = (id: string): QueryKey[] => [keys.user(id), ['timeline', id], ['users']];

/** The timeline, a page at a time, older pages fetched as you scroll to them. */
export function useTimeline(id: string) {
  return useInfiniteQuery({
    queryKey: ['timeline', id],
    queryFn: ({ pageParam }) => console_.timeline(id, pageParam ?? undefined),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextBefore,
    enabled: !!id,
  });
}

export function useCustomerBilling(id: string, enabled = true) {
  return useQuery({
    queryKey: ['customerBilling', id],
    queryFn: () => console_.customerBilling(id),
    enabled: !!id && enabled,
  });
}

export function useCustomerMarketplace(id: string) {
  return useQuery({
    queryKey: ['customerMarketplace', id],
    queryFn: () => console_.customerMarketplace(id),
    enabled: !!id,
  });
}

export function useCustomerSafety(id: string, enabled = true) {
  return useQuery({
    queryKey: ['customerSafety', id],
    queryFn: () => console_.customerSafety(id),
    enabled: !!id && enabled,
  });
}

export function useCustomerDevices(id: string) {
  return useQuery({
    queryKey: ['customerDevices', id],
    queryFn: () => console_.customerDevices(id),
    enabled: !!id,
  });
}

export function useSendPasswordReset(id: string) {
  return useConsoleMutation(() => console_.sendPasswordReset(id), {
    success: 'Password reset email sent',
    invalidate: accountKeys(id),
  });
}

export function useSendVerification(id: string) {
  return useConsoleMutation(() => console_.sendVerification(id), {
    success: 'Verification email sent',
    invalidate: accountKeys(id),
  });
}

export function useMarkVerified(id: string) {
  return useConsoleMutation(() => console_.markVerified(id), {
    success: 'Email marked as confirmed',
    invalidate: accountKeys(id),
  });
}

export function useResetCustomerTwoFactor(id: string) {
  return useConsoleMutation(() => console_.resetCustomerTwoFactor(id), {
    success: 'Two-factor removed and every device signed out',
    invalidate: [...accountKeys(id), ['customerDevices', id]],
  });
}

export function useSignOutCustomer(id: string) {
  return useConsoleMutation(() => console_.signOutCustomer(id), {
    success: 'Signed out everywhere',
    invalidate: [...accountKeys(id), ['customerDevices', id]],
  });
}

export function useSignOutCustomerDevice(id: string) {
  return useConsoleMutation((familyId: string) => console_.signOutCustomerDevice(id, familyId), {
    success: 'That device is signed out',
    invalidate: [['customerDevices', id], ['timeline', id]],
  });
}

export function useDeleteCustomer(id: string) {
  return useConsoleMutation((confirmEmail: string) => console_.deleteCustomer(id, confirmEmail), {
    success: 'Account deleted',
    invalidate: [['users']],
  });
}

export function useNotes(id: string) {
  return useQuery({ queryKey: ['notes', id], queryFn: () => console_.notes(id), enabled: !!id });
}

const noteKeys = (id: string): QueryKey[] => [['notes', id], keys.user(id), ['timeline', id]];

export function useAddNote(id: string) {
  return useConsoleMutation(
    ({ body, pinned }: { body: string; pinned?: boolean }) => console_.addNote(id, body, pinned),
    { success: 'Note saved', invalidate: noteKeys(id) },
  );
}

export function useUpdateNote(id: string) {
  return useConsoleMutation(
    ({ noteId, patch }: { noteId: string; patch: { body?: string; pinned?: boolean } }) =>
      console_.updateNote(id, noteId, patch),
    { success: 'Note updated', invalidate: noteKeys(id) },
  );
}

export function useRemoveNote(id: string) {
  return useConsoleMutation((noteId: string) => console_.removeNote(id, noteId), {
    success: 'Note deleted',
    invalidate: noteKeys(id),
  });
}

export function useTags(enabled = true) {
  return useQuery({ queryKey: ['tags'], queryFn: console_.tags, enabled, staleTime: 60_000 });
}

export function useCreateTag() {
  return useConsoleMutation(
    ({ label, color }: { label: string; color?: TagColor }) => console_.createTag(label, color),
    { success: 'Tag created', invalidate: [['tags']] },
  );
}

export function useRemoveTag() {
  return useConsoleMutation((tagId: string) => console_.removeTag(tagId), {
    success: 'Tag deleted from everyone',
    invalidate: [['tags'], ['users'], ['user']],
  });
}

export function useSetCustomerTags(id: string) {
  return useConsoleMutation((tagIds: string[]) => console_.setCustomerTags(id, tagIds), {
    success: 'Tags saved',
    invalidate: [...accountKeys(id), ['tags']],
  });
}

export function useBulkTags() {
  return useConsoleMutation(
    ({ userIds, add, remove }: { userIds: string[]; add: string[]; remove: string[] }) =>
      console_.bulkTags(userIds, add, remove),
    { success: 'Tags updated', invalidate: [['users'], ['tags'], ['user']] },
  );
}

export function useViews() {
  return useQuery({ queryKey: ['views'], queryFn: console_.views });
}

export function useSaveView() {
  return useConsoleMutation(
    ({ name, query, shared }: { name: string; query: Partial<UsersQuery>; shared: boolean }) =>
      console_.saveView(name, query, shared),
    { success: 'View saved', invalidate: [['views']] },
  );
}

export function useRemoveView() {
  return useConsoleMutation((viewId: string) => console_.removeView(viewId), {
    success: 'View removed',
    invalidate: [['views']],
  });
}
