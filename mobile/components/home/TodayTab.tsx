import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { router, type Href } from 'expo-router';
import {
  ArrowUpRightIcon,
  BriefcaseIcon,
  CalendarIcon,
  CalendarPlusIcon,
  ChevronRightIcon,
  ClockIcon,
  FolderIcon,
  FolderPlusIcon,
  HandCoinsIcon,
  HardDriveIcon,
  MailIcon,
  MapPinIcon,
  ReceiptIcon,
  UsersIcon,
  type LucideIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { PressableScale } from '@/components/PressableScale';
import { RemoteImage } from '@/components/RemoteImage';
import { Skeleton } from '@/components/Skeleton';
import { LoadFailed } from '@/components/LoadFailed';
import {
  useAlbums,
  useAuth,
  useCollaboratorInvitations,
  useEventInvitations,
  useHireEnquiries,
  useMarkJobsSeen,
  useMoneyInsights,
  useMoneySuggestions,
  useMoneySummary,
  usePlanLimits,
  useScheduleEventRange,
  useStorageBreakdown,
  useTheme,
  useUnseenJobs,
  useUsage,
  useWorkspaces,
} from '@/src/hooks';
import {
  downloadsPaused,
  formatBytes,
  formatMoney,
  monthOf,
  monthRange,
  todayIso,
  type ScheduleEvent,
  type UsageSummary,
  type Workspace,
} from '@/src/api';
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
import { CHART_COLORS, PALETTES } from '@/theme';

for (const Icon of [
  ArrowUpRightIcon, BriefcaseIcon, CalendarIcon, CalendarPlusIcon, ChevronRightIcon,
  ClockIcon, FolderIcon, FolderPlusIcon, HandCoinsIcon, HardDriveIcon, MailIcon,
  MapPinIcon, ReceiptIcon, UsersIcon,
]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/** The one card on the Dashboard: white on the page, one radius, one hairline. */
const CARD = 'bg-card rounded-[20px] border border-border/40 overflow-hidden';

/** How many things waiting on you show before "Show more". */
const NEEDS_SHOWN = 3;

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

interface MoneyMonth {
  month: string;
  incomeMinor: number;
  expenseMinor: number;
}

/** The last `n` months up to this one, oldest first, as "2026-10" keys. */
function lastMonths(n: number, now = new Date()): string[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (n - 1 - i), 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
}

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

/** "SAT" over "14": the date as every row on this screen shows it. */
function dateParts(dateStr: string): { weekday: string; day: number } {
  const d = parseDateKey(dateStr.slice(0, 10));
  return {
    weekday: d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(),
    day: d.getDate(),
  };
}

/**
 * The Home tab of the Dashboard: your day.
 *
 * One thing first — what is next — on the only dark card of the screen, so
 * the eye lands there. Then what is waiting on you, then what follows, then
 * two small tiles for the month's money and your storage, and the work you
 * touched last. Every section has the same title, the same card and the same
 * space above it; only the first one is allowed to be loud.
 *
 * "Needs you" shows only when something is waiting, so a quiet day is a
 * short screen rather than a row of zeros.
 *
 * The plan, six months of money and the largest albums were three full cards
 * here. They are two tiles now, each opening the screen that has the rest.
 */
export function TodayTab() {
  const { user } = useAuth();
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
  } = useWorkspaces({ orderBy: 'updated_at', direction: 'desc', limit: 6 }, enabled);
  const { guardWorkspaceCreate } = usePlanLimits();

  const { usage } = useUsage(enabled);
  const { breakdown } = useStorageBreakdown(enabled);

  // The last six months, which reach back into last year until June: the
  // insights come a calendar year at a time, so then it takes two.
  const [lastSix] = useState(() => lastMonths(6));
  const thisYear = Number(lastSix[lastSix.length - 1].slice(0, 4));
  const spansYears = Number(lastSix[0].slice(0, 4)) !== thisYear;
  const { insights: thisYearMoney, loadFailed: moneyFailed, refetch: refetchMoney } =
    useMoneyInsights(thisYear, enabled);
  const { insights: lastYearMoney } = useMoneyInsights(thisYear - 1, {
    enabled: !!user?.id && spansYears,
  });
  const moneyMonths: MoneyMonth[] | null =
    thisYearMoney && (!spansYears || lastYearMoney)
      ? lastSix.map(
          (key) =>
            [...(lastYearMoney?.months ?? []), ...thisYearMoney.months].find((m) => m.month === key) ?? {
              month: key,
              incomeMinor: 0,
              expenseMinor: 0,
            },
        )
      : null;

  const upcoming = events.filter((e) => isEventUpcoming(e.event_date, e.event_time)).slice(0, 4);
  const nextEvent = upcoming[0] ?? null;
  const laterEvents = upcoming.slice(1);
  const workspaceNameById = Object.fromEntries(workspaces.map((w) => [w.id, w.name]));

  return (
    <View className="px-5 pt-5 gap-7">
      {/* ── Next up ── */}
      {eventsFailed && events.length === 0 ? (
        <View className={CARD}>
          <LoadFailed what="your schedule" onRetry={() => refetchEvents()} compact />
        </View>
      ) : nextEvent ? (
        <NextUp
          event={nextEvent}
          workspace={nextEvent.workspace_id ? workspaceNameById[nextEvent.workspace_id] : undefined}
        />
      ) : (
        <PressableScale
          onPress={() => router.push('/schedule/create')}
          accessibilityRole="button"
          scaleTo={0.98}
          className={`${CARD} p-4 flex-row items-center gap-3`}
        >
          <View className="w-11 h-11 rounded-[14px] bg-muted items-center justify-center">
            <CalendarIcon size={20} className="text-secondary-foreground" />
          </View>
          <View className="flex-1">
            <Text className="text-foreground text-[15px] font-semibold">Your schedule is clear</Text>
            <Text className="text-muted-foreground text-[13px] mt-0.5">Add a shoot, review, or deadline</Text>
          </View>
          <ChevronRightIcon size={16} className="text-muted-foreground" />
        </PressableScale>
      )}

      <NeedsYou />

      {/* ── Coming up ── */}
      {laterEvents.length > 0 && (
        <View>
          <SectionHeader
            title="Coming up"
            link={{ label: 'Schedule', onPress: () => goToTab('/(app)/(tabs)/schedule') }}
          />
          <View className={CARD}>
            {laterEvents.map((event, i) => {
              const date = dateParts(event.event_date);
              const workspace = event.workspace_id ? workspaceNameById[event.workspace_id] : '';
              return (
                <Pressable
                  key={event.id}
                  onPress={() => router.push(`/schedule/${event.id}`)}
                  accessibilityRole="button"
                  accessibilityLabel={`${event.title}, ${formatDate(event.event_date)}`}
                  className={`min-h-16 flex-row items-center gap-3 pl-2.5 pr-4 py-2.5 active:bg-muted/40 ${
                    i > 0 ? 'border-t border-border/30' : ''
                  }`}
                >
                  <View className="w-11 h-11 rounded-xl bg-muted items-center justify-center">
                    <Text
                      allowFontScaling={false}
                      className="text-muted-foreground text-[10px] leading-[12px] font-bold tracking-wider"
                    >
                      {date.weekday}
                    </Text>
                    <Text allowFontScaling={false} className="text-foreground text-[17px] leading-5 font-bold">
                      {date.day}
                    </Text>
                  </View>
                  <View className="flex-1 min-w-0">
                    <Text className="text-foreground text-[15px] leading-5 font-semibold" numberOfLines={1}>
                      {event.title}
                    </Text>
                    <View className="flex-row items-center gap-1.5 mt-0.5">
                      <View
                        style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: eventColor(event.event_type) }}
                      />
                      <Text className="flex-1 text-muted-foreground text-[13px] leading-[18px]" numberOfLines={1}>
                        {[eventTypeLabel(event), workspace].filter(Boolean).join(' · ')}
                      </Text>
                    </View>
                  </View>
                  {event.event_time ? (
                    <Text className="text-secondary-foreground text-[13px] font-semibold">
                      {formatTime(event.event_time)}
                    </Text>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      {/* ── Overview ── */}
      <View>
        <SectionHeader title="Overview" />
        <View className="flex-row gap-3">
          {moneyMonths ? (
            <MoneyTile months={moneyMonths} />
          ) : moneyFailed ? (
            <Pressable
              onPress={() => refetchMoney()}
              accessibilityRole="button"
              accessibilityLabel="Could not load your money. Try again"
              className={`${CARD} flex-1 min-h-[156px] p-4 justify-center active:opacity-80`}
            >
              <Text className="text-foreground text-[14px] font-semibold">Could not load your money</Text>
              <Text className="text-primary text-[13px] font-semibold mt-1">Try again</Text>
            </Pressable>
          ) : (
            <Skeleton className="flex-1 rounded-[20px]" style={{ height: 156 }} />
          )}
          {/* A skeleton until the figures arrive: "0 B of 15 GB" before they
              do would be a claim about the account, not a placeholder. */}
          {usage ? (
            <StorageTile usage={usage} byKind={breakdown.byType} />
          ) : (
            <Skeleton className="flex-1 rounded-[20px]" style={{ height: 156 }} />
          )}
        </View>
      </View>

      {/* ── Recent work ── */}
      <View>
        <SectionHeader
          title="Recent work"
          link={{ label: 'All work', onPress: () => goToTab('/(app)/(tabs)/workspaces') }}
        />

        {wsLoading ? (
          <View className="flex-row gap-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="rounded-2xl" style={{ width: RECENT_WIDTH, height: 150 }} />
            ))}
          </View>
        ) : wsFailed && workspaces.length === 0 ? (
          <View className={CARD}>
            <LoadFailed what="your workspaces" onRetry={() => refetchWorkspaces()} compact />
          </View>
        ) : workspaces.length === 0 ? (
          <View className={`${CARD} p-6 items-center gap-3`}>
            <View className="w-12 h-12 rounded-full bg-muted items-center justify-center">
              <FolderPlusIcon size={22} className="text-muted-foreground" />
            </View>
            <Text className="text-muted-foreground text-sm font-medium">No workspaces yet</Text>
            <Pressable
              onPress={guardWorkspaceCreate(() => router.push('/workspaces/create'))}
              accessibilityRole="button"
              className="min-h-11 bg-action rounded-[14px] px-4 py-2 items-center justify-center active:opacity-90"
            >
              <Text className="text-action-foreground text-sm font-semibold">Create your first workspace</Text>
            </Pressable>
          </View>
        ) : (
          // Out to the screen's edges, so the row runs off the side and says
          // there is more of it.
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="-mx-5"
            contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}
          >
            {workspaces.map((ws) => (
              <RecentWork key={ws.id} workspace={ws} />
            ))}
          </ScrollView>
        )}
      </View>
    </View>
  );
}

/** A section's title, with what is waiting in it and where the rest is. */
function SectionHeader({
  title,
  count,
  link,
}: {
  title: string;
  count?: number;
  link?: { label: string; onPress: () => void };
}) {
  return (
    <View className="flex-row items-center justify-between mb-2.5">
      <View className="flex-row items-center gap-2">
        <Text accessibilityRole="header" className="text-foreground text-[17px] leading-6 font-bold tracking-tight">
          {title}
        </Text>
        {count ? (
          <View className="min-w-[20px] h-5 px-1.5 rounded-full bg-primary items-center justify-center">
            <Text allowFontScaling={false} className="text-primary-foreground text-[12px] font-bold">
              {count}
            </Text>
          </View>
        ) : null}
      </View>
      {link ? (
        <Pressable
          onPress={link.onPress}
          accessibilityRole="button"
          hitSlop={12}
          className="active:opacity-60"
        >
          <Text className="text-primary text-[14px] font-semibold">{link.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * What is next, on the screen's one inverted card: dark on the light theme,
 * light on the dark one. Its colours are the other theme's, so they are set
 * by hand here rather than by class.
 */
function NextUp({ event, workspace }: { event: ScheduleEvent; workspace?: string }) {
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  // What sits on the card: the opposite theme's text and accents.
  const on = isDark ? PALETTES.light : PALETTES.dark;
  const quiet = on.secondaryForeground;
  const countdown = startsIn(event);
  const date = dateParts(event.event_date);
  const time = formatTime(event.event_time);
  const location = event.location?.trim();

  return (
    <PressableScale
      onPress={() => router.push(`/schedule/${event.id}`)}
      accessibilityRole="button"
      accessibilityLabel={`Next up, ${event.title}, ${formatDate(event.event_date)}${time ? ` at ${time}` : ''}`}
      scaleTo={0.98}
      className="bg-foreground rounded-3xl p-5"
    >
      <View className="flex-row items-center justify-between">
        <Text style={{ color: quiet }} className="text-[13px] leading-[18px] font-semibold">
          Next up
        </Text>
        <View style={{ backgroundColor: on.primary }} className="rounded-full px-2.5 py-1">
          <Text style={{ color: on.primaryForeground }} className="text-[12px] leading-4 font-bold">
            {countdown ? `Starts ${countdown}` : formatDate(event.event_date)}
          </Text>
        </View>
      </View>

      <View className="flex-row items-start gap-4 mt-4">
        <View className="w-14 rounded-[14px] bg-background/10 items-center pt-2 pb-2.5">
          <Text
            allowFontScaling={false}
            style={{ color: on.warning }}
            className="text-[11px] leading-[14px] font-bold tracking-wider"
          >
            {date.weekday}
          </Text>
          <Text
            allowFontScaling={false}
            style={{ color: palette.background }}
            className="text-[24px] leading-7 font-bold tracking-tight"
          >
            {date.day}
          </Text>
        </View>
        <View className="flex-1 min-w-0 gap-1.5">
          <Text
            style={{ color: palette.background }}
            className="text-[20px] leading-[26px] font-bold tracking-tight"
            numberOfLines={2}
          >
            {event.title}
          </Text>
          {time ? (
            <View className="flex-row items-center gap-1.5">
              <ClockIcon size={15} color={quiet} />
              <Text style={{ color: quiet }} className="text-[14px] leading-5">
                {time}
              </Text>
            </View>
          ) : null}
          {location ? (
            <View className="flex-row items-center gap-1.5">
              <MapPinIcon size={15} color={quiet} />
              <Text style={{ color: quiet }} className="flex-1 text-[14px] leading-5" numberOfLines={1}>
                {location}
              </Text>
            </View>
          ) : null}
          {!time && !location ? (
            <Text style={{ color: quiet }} className="text-[14px] leading-5">
              {eventTypeLabel(event)}
            </Text>
          ) : null}
        </View>
      </View>

      <View className="flex-row items-center justify-between gap-3 border-t border-background/10 mt-4 pt-3">
        <View className="flex-1 min-w-0 flex-row items-center gap-1.5">
          <FolderIcon size={15} color={quiet} />
          <Text style={{ color: quiet }} className="flex-1 text-[13px] leading-[18px]" numberOfLines={1}>
            {workspace || eventTypeLabel(event)}
          </Text>
        </View>
        <View className="flex-row items-center gap-1">
          <Text style={{ color: palette.background }} className="text-[13px] leading-[18px] font-semibold">
            Open
          </Text>
          <ArrowUpRightIcon size={15} color={palette.background} />
        </View>
      </View>
    </PressableScale>
  );
}

interface Need {
  key: string;
  icon: LucideIcon;
  text: string;
  /** Where the row goes, in a word or two. */
  where: string;
  href: Href;
  tab?: boolean;
  onPress?: () => void;
  tone?: 'destructive';
}

/**
 * Everything waiting on you, one row each, and nothing at all on a quiet day.
 *
 * The bottom bar's badges count some of these already; a badge says
 * something is there, a row here says what, and the line under it says where
 * the tap goes. Three show; the rest are one tap away, so a busy day does
 * not push the week off the screen.
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
  const [showAll, setShowAll] = useState(false);

  const needs: Need[] = [];
  if (applications > 0) {
    needs.push({
      key: 'applicants',
      icon: UsersIcon,
      text: applications === 1 ? '1 applicant waiting on you' : `${applications} applicants waiting on you`,
      where: 'Jobs you posted',
      href: '/(app)/(tabs)/jobs?tab=posted',
      tab: true,
    });
  }
  if (enquiries.length > 0) {
    needs.push({
      key: 'enquiries',
      icon: MailIcon,
      text: enquiries.length === 1 ? '1 hire enquiry to answer' : `${enquiries.length} hire enquiries to answer`,
      where: 'People',
      href: '/friends/enquiries',
    });
  }
  if (money && money.owedToYouMinor > 0) {
    needs.push({
      key: 'owed',
      icon: HandCoinsIcon,
      text: `${formatMoney(money.owedToYouMinor)} still owed to you`,
      where: 'Money',
      href: '/money',
    });
  }
  if (eventInvites.length > 0) {
    needs.push({
      key: 'event-invites',
      icon: CalendarPlusIcon,
      text: eventInvites.length === 1 ? '1 invitation to a shoot' : `${eventInvites.length} invitations to shoots`,
      where: 'Schedule',
      href: '/(app)/(tabs)/schedule',
      tab: true,
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
      where: 'Work',
      href: '/(app)/(tabs)/workspaces',
      tab: true,
    });
  }
  // Only with a ceiling: an unlimited plan has nothing to fill.
  if (storageLimitBytes && storageFraction >= 0.9) {
    needs.push({
      key: 'storage',
      icon: HardDriveIcon,
      text: `Storage ${Math.round(storageFraction * 100)}% full`,
      where: 'Storage',
      href: SELLS_PLANS_HERE ? '/settings/storage/plans' : '/settings/storage',
      tone: 'destructive',
    });
  }
  if (newJobs > 0) {
    needs.push({
      key: 'jobs',
      icon: BriefcaseIcon,
      text: newJobs === 1 ? '1 new job posted' : `${newJobs} new jobs posted`,
      where: 'Jobs',
      href: '/(app)/(tabs)/jobs',
      tab: true,
      onPress: () => markSeen.mutate(),
    });
  }
  if (suggestions.length > 0) {
    needs.push({
      key: 'unrecorded',
      icon: ReceiptIcon,
      text: suggestions.length === 1 ? '1 booking to record in Money' : `${suggestions.length} bookings to record in Money`,
      where: 'Money',
      href: '/money',
    });
  }

  if (needs.length === 0) return null;

  // One over the limit shows as itself: "Show 1 more" would take the same row.
  const collapsed = !showAll && needs.length > NEEDS_SHOWN + 1;
  const shown = collapsed ? needs.slice(0, NEEDS_SHOWN) : needs;

  return (
    <View>
      <SectionHeader title="Needs you" count={needs.length} />
      <View className={CARD}>
        {shown.map((need, i) => {
          const Icon = need.icon;
          const urgent = need.tone === 'destructive';
          return (
            <Pressable
              key={need.key}
              onPress={() => {
                need.onPress?.();
                if (need.tab) goToTab(need.href);
                else router.push(need.href);
              }}
              accessibilityRole="button"
              accessibilityLabel={`${need.text}. Opens ${need.where}`}
              className={`min-h-[60px] flex-row items-center gap-3 px-4 py-2.5 active:bg-muted/40 ${
                i > 0 ? 'border-t border-border/30' : ''
              }`}
            >
              {/* Plain tiles: terracotta is for the things you can press to
                  make something, and for the one card above. */}
              <View
                className={`w-9 h-9 rounded-xl items-center justify-center ${urgent ? 'bg-destructive/10' : 'bg-muted'}`}
              >
                <Icon size={18} className={urgent ? 'text-destructive' : 'text-secondary-foreground'} />
              </View>
              <View className="flex-1 min-w-0">
                <Text className="text-foreground text-[15px] leading-5 font-semibold" numberOfLines={1}>
                  {need.text}
                </Text>
                <Text className="text-muted-foreground text-[13px] leading-[18px]" numberOfLines={1}>
                  {need.where}
                </Text>
              </View>
              <ChevronRightIcon size={16} className="text-muted-foreground" />
            </Pressable>
          );
        })}
        {collapsed && (
          <Pressable
            onPress={() => setShowAll(true)}
            accessibilityRole="button"
            className="min-h-11 items-center justify-center border-t border-border/30 active:bg-muted/40"
          >
            <Text className="text-primary text-[14px] font-semibold">
              Show {needs.length - NEEDS_SHOWN} more
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const BAR_HEIGHT = 36;

/**
 * This month's income, what was spent, and the six months it sits in.
 *
 * A glance, not the chart: the months have no labels because the tile opens
 * Money, which has them. This month's bar is the coloured one.
 */
function MoneyTile({ months }: { months: MoneyMonth[] }) {
  const current = months[months.length - 1];
  const peak = Math.max(...months.map((m) => m.incomeMinor), 1);
  const monthName = MONTHS[Number(current.month.slice(5, 7)) - 1] ?? 'this month';

  return (
    <PressableScale
      onPress={() => router.push('/money')}
      accessibilityRole="button"
      accessibilityLabel={`Money. Earned ${formatMoney(current.incomeMinor)} in ${monthName}, spent ${formatMoney(current.expenseMinor)}`}
      style={{ flex: 1 }}
      className={`${CARD} min-h-[156px] p-4`}
    >
      <Text className="text-muted-foreground text-[13px] leading-[18px] font-semibold" numberOfLines={1}>
        Earned in {monthName}
      </Text>
      <Text
        className="text-foreground text-[22px] leading-7 font-bold tracking-tight mt-1"
        style={{ fontVariant: ['tabular-nums'] }}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
      >
        {formatMoney(current.incomeMinor)}
      </Text>
      <Text className="text-muted-foreground text-[12px] leading-4" numberOfLines={1}>
        {formatMoney(current.expenseMinor)} spent
      </Text>
      <View className="flex-1" />
      <View className="flex-row items-end gap-1.5 mt-3" style={{ height: BAR_HEIGHT }}>
        {months.map((m, i) => (
          <View
            key={m.month}
            className={`flex-1 rounded ${i === months.length - 1 ? 'bg-primary' : 'bg-muted-foreground/25'}`}
            style={{ height: Math.max(3, Math.round((m.incomeMinor / peak) * BAR_HEIGHT)) }}
          />
        ))}
      </View>
    </PressableScale>
  );
}

const KIND_LABEL: Record<string, string> = {
  image: 'Photos',
  video: 'Videos',
  audio: 'Audio',
  other: 'Other',
};
const KIND_ORDER = ['image', 'video', 'audio', 'other'];

/**
 * Storage, split by what is filling it, and this month's client downloads.
 *
 * The downloads line turns red from 80% and says when they are paused: the
 * first sign of that allowance running out was once a client's screenshot.
 */
function StorageTile({ usage, byKind }: { usage: UsageSummary; byKind: { kind: string; bytes: number }[] }) {
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  const color: Record<string, string> = {
    image: palette.primary,
    video: CHART_COLORS.blue,
    audio: CHART_COLORS.green,
    other: palette.mutedForeground,
  };

  const { usedBytes, limitBytes } = usage.storage;
  const kinds = KIND_ORDER.map((kind) => ({
    kind,
    bytes: byKind.find((k) => k.kind === kind)?.bytes ?? 0,
  })).filter((k) => k.bytes > 0);
  // Against the limit when there is one; an unlimited plan's bar is the
  // split alone, full width.
  const scale = limitBytes ?? Math.max(usedBytes, 1);

  const downloads = usage.downloads ?? null;
  const dlLimit = downloads?.limitBytes ?? null;
  const dlFraction = downloads && dlLimit ? downloads.usedBytes / dlLimit : 0;
  const paused = !!downloads && downloadsPaused(downloads);
  // Short enough for half a screen: "12.0 GB of 45.0 GB" does not fit beside
  // the word, and the screen this opens has the figures.
  const downloadsLine = !downloads
    ? null
    : paused
      ? 'Downloads paused'
      : dlLimit != null
        ? `Downloads ${Math.round(dlFraction * 100)}% used`
        : `Downloads ${formatBytes(downloads.usedBytes)}`;

  return (
    <PressableScale
      onPress={() => router.push('/settings/storage')}
      accessibilityRole="button"
      accessibilityLabel={`Storage ${formatBytes(usedBytes)}${limitBytes != null ? ` of ${formatBytes(limitBytes)}` : ''}.${
        downloads
          ? ` Client downloads ${paused ? 'paused' : `${formatBytes(downloads.usedBytes)}${dlLimit != null ? ` of ${formatBytes(dlLimit)}` : ''}`} this month.`
          : ''
      }`}
      style={{ flex: 1 }}
      className={`${CARD} min-h-[156px] p-4`}
    >
      <Text className="text-muted-foreground text-[13px] leading-[18px] font-semibold">Storage</Text>
      <Text
        className="text-foreground text-[22px] leading-7 font-bold tracking-tight mt-1"
        style={{ fontVariant: ['tabular-nums'] }}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
      >
        {formatBytes(usedBytes)}
        {limitBytes != null && (
          <Text className="text-muted-foreground text-[13px] font-medium tracking-normal">
            {' '}of {formatBytes(limitBytes)}
          </Text>
        )}
      </Text>
      {downloadsLine ? (
        <Text
          className={`text-[12px] leading-4 ${
            paused || dlFraction >= 0.8 ? 'text-destructive font-semibold' : 'text-muted-foreground'
          }`}
          numberOfLines={1}
        >
          {downloadsLine}
        </Text>
      ) : null}
      <View className="flex-1" />
      <View className="h-2 rounded-full bg-muted overflow-hidden flex-row mt-3" style={{ gap: 2 }}>
        {kinds.length > 0 ? (
          kinds.map((k) => (
            <View
              key={k.kind}
              style={{ width: `${Math.max((k.bytes / scale) * 100, 1)}%`, backgroundColor: color[k.kind] ?? palette.primary }}
            />
          ))
        ) : (
          <View style={{ width: `${Math.min((usedBytes / scale) * 100, 100)}%`, backgroundColor: palette.primary }} />
        )}
      </View>
      {/* The two largest, named: the tile is too narrow for four. */}
      <View className="flex-row mt-2" style={{ columnGap: 12, minHeight: 14 }}>
        {[...kinds]
          .sort((a, b) => b.bytes - a.bytes)
          .slice(0, 2)
          .map((k) => (
            <View key={k.kind} className="flex-row items-center gap-1">
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color[k.kind] ?? palette.primary }} />
              <Text className="text-muted-foreground text-[11px] leading-[14px]">{KIND_LABEL[k.kind] ?? k.kind}</Text>
            </View>
          ))}
      </View>
    </PressableScale>
  );
}

const RECENT_WIDTH = 148;
const RECENT_COVER = 100;

/**
 * A workspace you touched lately, under a photograph from it.
 *
 * The cover is the workspace's chosen album's, or failing that the newest
 * album that has one. It asks for the workspace's albums to find it — the
 * same request the workspace makes when opened, so the tap after this lands
 * on a list already loaded. With no photograph yet it is the workspace's own
 * colour, which is still its colour everywhere else.
 */
function RecentWork({ workspace: ws }: { workspace: Workspace }) {
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  const { albums } = useAlbums(
    { workspace_id: ws.id, orderBy: 'created_at', direction: 'desc', limit: 100 },
    { enabled: ws.album_count > 0 },
  );
  const cover =
    albums.find((a) => a.id === ws.cover_album_id)?.cover_url ??
    albums.find((a) => a.cover_url)?.cover_url ??
    null;
  const accent = ws.accent_color || palette.primary;

  return (
    <PressableScale
      onPress={() => router.push(`/workspaces/${ws.id}`)}
      accessibilityRole="button"
      accessibilityLabel={`Open ${ws.name}`}
      scaleTo={0.97}
      style={{ width: RECENT_WIDTH }}
    >
      <View
        className="rounded-2xl overflow-hidden items-center justify-center"
        style={{ width: RECENT_WIDTH, height: RECENT_COVER, backgroundColor: `${accent}26` }}
      >
        {cover ? (
          <RemoteImage
            source={{ uri: cover }}
            style={{ width: RECENT_WIDTH, height: RECENT_COVER }}
            contentFit="cover"
          />
        ) : (
          <FolderIcon size={26} color={accent} />
        )}
      </View>
      <Text className="text-foreground text-[14px] leading-5 font-semibold mt-2" numberOfLines={1}>
        {ws.name}
      </Text>
      <Text className="text-muted-foreground text-[12px] leading-4" numberOfLines={1}>
        {/* Its size only for the owner: the API keeps a member's share of
            somebody else's storage to itself. */}
        {[
          ws.album_count > 0 ? plural(ws.album_count, 'album') : 'No albums yet',
          ws.storage_bytes ? formatBytes(ws.storage_bytes) : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </Text>
    </PressableScale>
  );
}
