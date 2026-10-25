import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router, type Href } from 'expo-router';
import {
  ArrowUpRightIcon,
  BriefcaseIcon,
  CalendarIcon,
  CalendarPlusIcon,
  ChevronRightIcon,
  FolderPlusIcon,
  HandCoinsIcon,
  HardDriveIcon,
  MailIcon,
  ReceiptIcon,
  UsersIcon,
  WalletIcon,
  type LucideIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { PressableScale } from '@/components/PressableScale';
import { Skeleton } from '@/components/Skeleton';
import { LoadFailed } from '@/components/LoadFailed';
import {
  useAuth,
  useCollaboratorInvitations,
  useEventInvitations,
  useHireEnquiries,
  useMarkJobsSeen,
  useMoneySuggestions,
  useMoneySummary,
  usePlanLimits,
  useScheduleEventRange,
  useTheme,
  useUnseenJobs,
  useUsage,
  useWorkspaces,
} from '@/src/hooks';
import { formatMoney, monthLabel, monthOf, monthRange, todayIso } from '@/src/api';
import type { ScheduleEvent } from '@/src/api';
import {
  combineDateAndTime,
  dateToKey,
  eventColor,
  eventTypeLabel,
  formatTime,
  isEventUpcoming,
  parseDateKey,
  todayKey,
} from '@/src/lib/calendar';
import { goToTab } from '@/src/lib/navigation';
import { SELLS_PLANS_HERE } from '@/src/lib/store-purchasing';
import { plural } from '@/src/lib/workspaces';
import { PALETTES } from '@/theme';

for (const Icon of [
  ArrowUpRightIcon, BriefcaseIcon, CalendarIcon, CalendarPlusIcon, ChevronRightIcon,
  FolderPlusIcon, HandCoinsIcon, HardDriveIcon, MailIcon, ReceiptIcon, UsersIcon, WalletIcon,
]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

const LABEL = 'text-muted-foreground text-[13px] font-semibold';

/**
 * "Today", "Tomorrow", a weekday this week, or a date.
 *
 * Counted in calendar days on the phone's clock. An event date is date-only,
 * and `new Date('2026-10-01')` is UTC midnight — 8 AM in Manila — so the old
 * sum of milliseconds, rounded up, called today's events "Tomorrow" until 8.
 */
function formatDate(dateStr: string): string {
  const d = parseDateKey(dateStr.slice(0, 10));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // Rounded, not truncated: a day across a daylight-saving change is 23 or 25
  // hours long.
  const days = Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days > 1 && days < 7) return d.toLocaleDateString('en-US', { weekday: 'long' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** "in 40 min", "in 14 h" — only inside the next day, and only with a time. */
function startsIn(event: ScheduleEvent, now = new Date()): string | null {
  if (!event.event_time) return null;
  const minutes = Math.round(
    (combineDateAndTime(event.event_date, event.event_time).getTime() - now.getTime()) / 60000,
  );
  if (minutes <= 0 || minutes >= 24 * 60) return null;
  if (minutes < 60) return `in ${minutes} min`;
  return `in ${Math.round(minutes / 60)} h`;
}

/**
 * The Home tab of the Dashboard: your day, under your profile.
 *
 * What is next, then what is waiting on you, then what follows, then the
 * month's money and the work you touched last. "Needs you" gathers what used
 * to be scattered — the job banner, the storage alert, money still owed — and
 * shows only when something is actually waiting, so a quiet day is a short
 * screen rather than a row of zeros.
 *
 * The account tiles that closed the old Dashboard moved: the counts are on
 * the profile above, storage is in Settings and in Needs you once it is
 * nearly full.
 */
export function TodayTab() {
  const { user } = useAuth();
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  const enabled = { enabled: !!user?.id };

  // The next 60 days, by date. It fetched the 50 earliest events once: for an
  // account with 50 behind it, nothing ahead was ever among them.
  const [soonWindow] = useState(() => {
    const end = new Date();
    end.setDate(end.getDate() + 60);
    return { from: todayKey(), to: dateToKey(end) };
  });
  const { events, loadFailed: eventsFailed, refetch: refetchEvents } = useScheduleEventRange(
    soonWindow.from,
    soonWindow.to,
  );

  const {
    workspaces,
    isLoading: wsLoading,
    loadFailed: wsFailed,
    refetch: refetchWorkspaces,
  } = useWorkspaces({ orderBy: 'updated_at', direction: 'desc', limit: 3 }, enabled);
  const { guardWorkspaceCreate } = usePlanLimits();

  const moneyMonth = monthOf(todayIso());
  const moneyRange = monthRange(moneyMonth);
  const { summary: money } = useMoneySummary(moneyRange.from, moneyRange.to, enabled);

  const upcoming = events.filter((e) => isEventUpcoming(e.event_date, e.event_time)).slice(0, 4);
  const nextEvent = upcoming[0] ?? null;
  const laterEvents = upcoming.slice(1);
  const workspaceNameById = Object.fromEntries(workspaces.map((w) => [w.id, w.name]));
  const countdown = nextEvent ? startsIn(nextEvent) : null;

  return (
    <View className="px-5 pt-4 gap-5">
      {/* ── Next up ── */}
      <View>
        <Text className={`${LABEL} mb-2`}>Next up</Text>
        {eventsFailed && events.length === 0 ? (
          <View className="bg-card rounded-2xl border border-border/40">
            <LoadFailed what="your schedule" onRetry={() => refetchEvents()} compact />
          </View>
        ) : nextEvent ? (
          <PressableScale
            onPress={() => router.push(`/schedule/${nextEvent.id}`)}
            accessibilityRole="button"
            accessibilityLabel={`Open ${nextEvent.title}`}
            scaleTo={0.98}
            className="bg-card rounded-3xl border border-border/40 p-5"
          >
            <View className="flex-row items-center justify-between">
              <View className="rounded-full bg-primary/10 px-3 py-1.5">
                <Text className="text-primary text-xs font-bold">
                  {formatDate(nextEvent.event_date)}
                  {countdown ? ` · ${countdown}` : ''}
                </Text>
              </View>
              <ArrowUpRightIcon size={18} className="text-muted-foreground" />
            </View>
            <Text
              className="text-foreground text-[20px] leading-[26px] font-bold tracking-tight mt-3"
              numberOfLines={2}
            >
              {nextEvent.title}
            </Text>
            <Text className="text-muted-foreground text-sm leading-[20px] mt-1.5" numberOfLines={2}>
              {[
                formatTime(nextEvent.event_time),
                nextEvent.location?.trim(),
                nextEvent.workspace_id ? workspaceNameById[nextEvent.workspace_id] : '',
              ]
                .filter(Boolean)
                .join(' · ') || eventTypeLabel(nextEvent)}
            </Text>
          </PressableScale>
        ) : (
          <PressableScale
            onPress={() => router.push('/schedule/create')}
            accessibilityRole="button"
            scaleTo={0.98}
            className="bg-card rounded-3xl border border-border/40 p-5 flex-row items-center gap-4"
          >
            <View className="w-11 h-11 rounded-2xl bg-primary/10 items-center justify-center">
              <CalendarIcon size={20} className="text-primary" />
            </View>
            <View className="flex-1">
              <Text className="text-foreground text-base font-semibold">Your schedule is clear</Text>
              <Text className="text-muted-foreground text-sm mt-0.5">Add a shoot, review, or deadline</Text>
            </View>
            <ChevronRightIcon size={18} className="text-muted-foreground" />
          </PressableScale>
        )}
      </View>

      <NeedsYou />

      {/* ── Coming up ── */}
      {laterEvents.length > 0 && (
        <View>
          <View className="flex-row items-center justify-between mb-1">
            <Text className={LABEL}>Coming up</Text>
            <Pressable
              onPress={() => goToTab('/(app)/(tabs)/schedule')}
              accessibilityRole="button"
              className="flex-row items-center gap-1 min-h-[44px] px-1 -mr-1 active:opacity-60"
            >
              <Text className="text-primary text-sm font-semibold">Schedule</Text>
              <ChevronRightIcon size={14} className="text-primary" />
            </Pressable>
          </View>
          <View className="bg-card rounded-2xl overflow-hidden border border-border/30">
            {laterEvents.map((event, i) => (
              <Pressable
                key={event.id}
                onPress={() => router.push(`/schedule/${event.id}`)}
                accessibilityRole="button"
                className="flex-row items-center gap-3 px-4 py-3.5 active:bg-muted/30"
                style={i < laterEvents.length - 1 ? { borderBottomWidth: 1, borderBottomColor: palette.border } : undefined}
              >
                <View style={{ width: 3, height: 36, borderRadius: 2, backgroundColor: eventColor(event.event_type) }} />
                <View className="flex-1 min-w-0">
                  <Text className="text-foreground text-sm font-semibold" numberOfLines={1}>{event.title}</Text>
                  {/* The workspace, not the type: the bar's colour already
                      says what kind of event it is. */}
                  <Text className="text-muted-foreground text-xs mt-0.5" numberOfLines={1}>
                    {(event.workspace_id && workspaceNameById[event.workspace_id]) || eventTypeLabel(event)}
                  </Text>
                </View>
                <View className="items-end">
                  <Text className="text-foreground text-xs font-bold">{formatDate(event.event_date)}</Text>
                  {event.event_time && (
                    <Text className="text-muted-foreground text-xs mt-0.5">{formatTime(event.event_time)}</Text>
                  )}
                </View>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {/* ── Money ── */}
      {/* One line: what the month kept. What clients still owe is in Needs
          you, where it can be acted on, not repeated here. */}
      <PressableScale
        onPress={() => router.push('/money')}
        accessibilityRole="button"
        accessibilityLabel={
          money && money.entries > 0
            ? `Money in ${monthLabel(moneyMonth)}: ${formatMoney(money.incomeMinor - money.expenseMinor)} kept`
            : 'Money. Track what you earn and spend'
        }
        scaleTo={0.98}
        className="bg-card rounded-2xl border border-border/40 px-4 py-3.5 flex-row items-center gap-3"
      >
        <View className="w-9 h-9 rounded-xl bg-success/15 items-center justify-center">
          <WalletIcon size={17} className="text-success" />
        </View>
        {money && money.entries > 0 ? (
          <>
            <View className="flex-1 min-w-0">
              <Text className="text-foreground text-sm font-semibold">Money · {monthLabel(moneyMonth)}</Text>
              <Text className="text-muted-foreground text-xs mt-0.5" numberOfLines={1}>
                In {formatMoney(money.incomeMinor)} · Out {formatMoney(money.expenseMinor)}
              </Text>
            </View>
            <View className="items-end">
              <Text
                className={`text-[16px] font-bold ${money.incomeMinor - money.expenseMinor < 0 ? 'text-destructive' : 'text-foreground'}`}
              >
                {formatMoney(money.incomeMinor - money.expenseMinor)}
              </Text>
              <Text className="text-muted-foreground text-xs">kept</Text>
            </View>
          </>
        ) : (
          <View className="flex-1 min-w-0">
            <Text className="text-foreground text-sm font-semibold">Track your money</Text>
            <Text className="text-muted-foreground text-xs mt-0.5" numberOfLines={1}>
              What each shoot earned, what it cost, who still owes
            </Text>
          </View>
        )}
        <ChevronRightIcon size={16} className="text-muted-foreground" />
      </PressableScale>

      {/* ── Recent work ── */}
      <View>
        <View className="flex-row items-center justify-between mb-1">
          <Text className={LABEL}>Recent work</Text>
          <Pressable
            onPress={() => goToTab('/(app)/(tabs)/workspaces')}
            accessibilityRole="button"
            className="flex-row items-center gap-1 min-h-[44px] px-1 -mr-1 active:opacity-60"
          >
            <Text className="text-primary text-sm font-semibold">All work</Text>
            <ChevronRightIcon size={14} className="text-primary" />
          </Pressable>
        </View>

        {wsLoading ? (
          <View className="flex-row gap-2.5">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="flex-1 rounded-2xl" style={{ height: 112 }} />
            ))}
          </View>
        ) : wsFailed && workspaces.length === 0 ? (
          <View className="bg-card rounded-2xl">
            <LoadFailed what="your workspaces" onRetry={() => refetchWorkspaces()} compact />
          </View>
        ) : workspaces.length === 0 ? (
          <View className="bg-card rounded-2xl p-6 items-center gap-3">
            <View className="w-12 h-12 rounded-full bg-muted items-center justify-center">
              <FolderPlusIcon size={22} className="text-muted-foreground" />
            </View>
            <Text className="text-muted-foreground text-sm font-medium">No workspaces yet</Text>
            <Pressable
              onPress={guardWorkspaceCreate(() => router.push('/workspaces/create'))}
              accessibilityRole="button"
              className="min-h-11 bg-action rounded-xl px-4 py-2 items-center justify-center active:opacity-90"
            >
              <Text className="text-action-foreground text-sm font-semibold">Create your first workspace</Text>
            </Pressable>
          </View>
        ) : (
          <View className="flex-row gap-2.5">
            {workspaces.slice(0, 3).map((ws) => (
              <PressableScale
                key={ws.id}
                onPress={() => router.push(`/workspaces/${ws.id}`)}
                accessibilityRole="button"
                accessibilityLabel={`Open ${ws.name}`}
                scaleTo={0.97}
                style={{ flex: 1, maxWidth: '33.33%' }}
                className="bg-card rounded-2xl border border-border/30 p-3"
              >
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 11,
                    backgroundColor: `${ws.accent_color || palette.primary}22`,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ fontSize: 16, fontWeight: '700', color: ws.accent_color || palette.primary }}>
                    {ws.name.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <Text className="text-foreground text-[13px] font-semibold leading-[17px] mt-2.5" numberOfLines={2}>
                  {ws.name}
                </Text>
                <Text className="text-muted-foreground text-[11px] mt-1" numberOfLines={1}>
                  {ws.album_count > 0 ? plural(ws.album_count, 'album') : 'No albums yet'}
                </Text>
              </PressableScale>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

interface Need {
  key: string;
  icon: LucideIcon;
  text: string;
  href: Href;
  tab?: boolean;
  onPress?: () => void;
  tone?: 'destructive';
}

/**
 * Everything waiting on you, one row each, and nothing at all on a quiet day.
 *
 * The bottom bar's badges count some of these already; a badge says
 * something is there, a row here says what. Each opens the place it is
 * answered.
 */
function NeedsYou() {
  const { user } = useAuth();
  const enabled = { enabled: !!user?.id };
  const { count: newJobs, applications } = useUnseenJobs();
  const markSeen = useMarkJobsSeen();
  const { pending: enquiries } = useHireEnquiries();
  const { invitations: workspaceInvites } = useCollaboratorInvitations();
  const { invitations: eventInvites } = useEventInvitations();
  const moneyRange = monthRange(monthOf(todayIso()));
  const { summary: money } = useMoneySummary(moneyRange.from, moneyRange.to, enabled);
  const { suggestions } = useMoneySuggestions(enabled);
  const { storageLimitBytes, storageFraction } = useUsage(enabled);

  const needs: Need[] = [];
  if (newJobs > 0) {
    needs.push({
      key: 'jobs',
      icon: BriefcaseIcon,
      text: newJobs === 1 ? '1 new job posted' : `${newJobs} new jobs posted`,
      href: '/(app)/(tabs)/jobs',
      tab: true,
      onPress: () => markSeen.mutate(),
    });
  }
  if (applications > 0) {
    needs.push({
      key: 'applicants',
      icon: UsersIcon,
      text: applications === 1 ? '1 applicant waiting on you' : `${applications} applicants waiting on you`,
      href: '/(app)/(tabs)/jobs?tab=posted',
      tab: true,
    });
  }
  if (enquiries.length > 0) {
    needs.push({
      key: 'enquiries',
      icon: MailIcon,
      text: enquiries.length === 1 ? '1 hire enquiry to answer' : `${enquiries.length} hire enquiries to answer`,
      href: '/friends/enquiries',
    });
  }
  if (workspaceInvites.length > 0) {
    needs.push({
      key: 'workspace-invites',
      icon: FolderPlusIcon,
      text:
        workspaceInvites.length === 1
          ? '1 invitation to a workspace'
          : `${workspaceInvites.length} invitations to workspaces`,
      href: '/(app)/(tabs)/workspaces',
      tab: true,
    });
  }
  if (eventInvites.length > 0) {
    needs.push({
      key: 'event-invites',
      icon: CalendarPlusIcon,
      text: eventInvites.length === 1 ? '1 invitation to a shoot' : `${eventInvites.length} invitations to shoots`,
      href: '/(app)/(tabs)/schedule',
      tab: true,
    });
  }
  if (money && money.owedToYouMinor > 0) {
    needs.push({
      key: 'owed',
      icon: HandCoinsIcon,
      text: `${formatMoney(money.owedToYouMinor)} still owed to you`,
      href: '/money',
    });
  }
  if (suggestions.length > 0) {
    needs.push({
      key: 'unrecorded',
      icon: ReceiptIcon,
      text: suggestions.length === 1 ? '1 booking to record in Money' : `${suggestions.length} bookings to record in Money`,
      href: '/money',
    });
  }
  // Only with a ceiling: an unlimited plan has nothing to fill.
  if (storageLimitBytes && storageFraction >= 0.9) {
    needs.push({
      key: 'storage',
      icon: HardDriveIcon,
      text: `Storage ${Math.round(storageFraction * 100)}% full`,
      href: SELLS_PLANS_HERE ? '/settings/storage/plans' : '/settings/storage',
      tone: 'destructive',
    });
  }

  if (needs.length === 0) return null;

  return (
    <View>
      <Text className={`${LABEL} mb-2`}>Needs you</Text>
      <View className="bg-card rounded-2xl overflow-hidden border border-border/40">
        {needs.map((need, i) => {
          const Icon = need.icon;
          return (
            <Pressable
              key={need.key}
              onPress={() => {
                need.onPress?.();
                if (need.tab) goToTab(need.href);
                else router.push(need.href);
              }}
              accessibilityRole="button"
              className={`min-h-12 flex-row items-center gap-3 px-4 py-3 active:bg-muted/30 ${i > 0 ? 'border-t border-border/40' : ''}`}
            >
              <View
                className={`w-8 h-8 rounded-[10px] items-center justify-center ${need.tone === 'destructive' ? 'bg-destructive/10' : 'bg-primary/10'}`}
              >
                <Icon size={16} className={need.tone === 'destructive' ? 'text-destructive' : 'text-primary'} />
              </View>
              <Text className="flex-1 text-foreground text-sm font-semibold" numberOfLines={1}>
                {need.text}
              </Text>
              <ChevronRightIcon size={16} className="text-muted-foreground" />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
