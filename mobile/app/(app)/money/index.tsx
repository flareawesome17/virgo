import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking, Pressable, RefreshControl, ScrollView, SectionList, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockAlertIcon,
  DownloadIcon,
  PackagePlusIcon,
  PlusIcon,
  QrCodeIcon,
  WalletIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import {
  ApiError,
  categoryLabel,
  dayLabel,
  formatMoney,
  isOverdue,
  monthLabel,
  monthOf,
  monthRange,
  shiftMonth,
  todayIso,
  type MoneyEntry,
  type MoneyKind,
  type MoneyPackage,
  type MoneySuggestion,
} from '@/src/api';
import {
  useDismissMoneySuggestion,
  useMoneyEntries,
  useMoneyExport,
  useMoneyPackages,
  useMoneyPayMethods,
  useMoneySavings,
  useMoneySuggestions,
  useMoneySummary,
  useTheme,
  useUpdateMoneyEntry,
} from '@/src/hooks';
import { PayPickSheet } from '@/components/money/PayPickSheet';
import { CardListSkeleton, EmptyState, FilterChip, ScreenHeader } from '@/components';
import { DateTile } from '@/components/DateTile';
import { LoadFailed } from '@/components/LoadFailed';
import { PageTabs } from '@/components/PageTabs';
import { InsightsPage } from '@/components/money/InsightsPage';
import { MoneyRow, rowOf, rowOfQueued } from '@/components/money/MoneyRow';
import { PackageRow } from '@/components/money/PackageRow';
import { SetAsideSheet } from '@/components/money/SavingBits';
import { SavingsPage } from '@/components/money/SavingsPage';
import { SuggestionRow } from '@/components/money/SuggestionRow';
import { discardQueuedMoneyEntry, useMoneyOutbox, type QueuedMoneyEntry } from '@/src/lib/money-outbox';
import { setAsidePrompt, useSetAsideOffer } from '@/src/lib/set-aside-prompt';
import { PALETTES } from '@/theme';

for (const Icon of [
  ChevronLeftIcon, ChevronRightIcon, ClockAlertIcon, DownloadIcon, PackagePlusIcon, PlusIcon, QrCodeIcon, WalletIcon,
]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

type Tab = 'activity' | 'owed' | 'savings' | 'insights';
const TABS: Tab[] = ['activity', 'owed', 'savings', 'insights'];
type Filter = 'all' | MoneyKind;

type Item =
  | { type: 'entry'; entry: MoneyEntry }
  | { type: 'queued'; queued: QueuedMoneyEntry }
  | { type: 'suggestion'; suggestion: MoneySuggestion };

interface Section {
  key: string;
  title: string;
  /** Beside the title, in grey: "2 entries". */
  note?: string;
  data: Item[];
}

const MONTH_SHORT = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** Whole days from `from` to `to`, both YYYY-MM-DD; negative when `to` is earlier. */
function daysBetween(from: string, to: string): number {
  const [y1, m1, d1] = from.split('-').map(Number);
  const [y2, m2, d2] = to.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

/** "5 days late", "Due today", "Due in 6 days". */
function dueLine(day: string, today: string): { text: string; late: boolean } {
  const days = daysBetween(today, day);
  if (days < 0) return { text: `${-days} ${days === -1 ? 'day' : 'days'} late`, late: true };
  if (days === 0) return { text: 'Due today', late: false };
  return { text: `Due in ${days} ${days === 1 ? 'day' : 'days'}`, late: false };
}

/** What an unpaid entry is still worth to the person: the fee less what the client withholds. */
const netOf = (entry: MoneyEntry) => entry.amountMinor - (entry.withheldMinor ?? 0);
const nameOf = (entry: MoneyEntry) => entry.counterparty || categoryLabel(entry.kind, entry.category);

/** A section's title: 17 bold, with a quiet note or an action beside it. */
function SectionTitle({
  title,
  note,
  action,
}: {
  title: string;
  note?: string;
  action?: { label: string; onPress: () => void };
}) {
  return (
    <View className="flex-row items-center justify-between gap-3 mt-7 mb-2.5">
      <Text className="text-foreground text-[17px] leading-6 font-bold" accessibilityRole="header">
        {title}
      </Text>
      {action ? (
        <Pressable onPress={action.onPress} accessibilityRole="button" hitSlop={10} className="active:opacity-60">
          <Text className="text-primary text-[15px] font-semibold">{action.label}</Text>
        </Pressable>
      ) : note ? (
        <Text className="text-muted-foreground text-[13px] leading-[18px]">{note}</Text>
      ) : null}
    </View>
  );
}

/** One of the three figures under the month's lead. */
function Figure({ label, minor, tone }: { label: string; minor: number; tone?: 'in' }) {
  return (
    <View className="flex-1 min-w-0">
      <Text className="text-muted-foreground text-[12px] leading-4" numberOfLines={1}>
        {label}
      </Text>
      <Text
        className={`text-[15px] leading-5 font-semibold mt-0.5 ${tone === 'in' ? 'text-success' : 'text-foreground'}`}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.85}
        style={{ fontVariant: ['tabular-nums'] }}
      >
        {formatMoney(minor)}
      </Text>
    </View>
  );
}

/** A payment still waiting: its day on a tile, how late or how soon, and the way to say it came. */
function OwedRow({
  entry,
  today,
  first,
  last,
  onPress,
  onPaid,
}: {
  entry: MoneyEntry;
  today: string;
  first: boolean;
  last: boolean;
  onPress: () => void;
  onPaid: () => void;
}) {
  const due = dueLine(entry.occurredOn, today);
  const income = entry.kind === 'income';
  const name = nameOf(entry);
  return (
    <View
      className={`bg-card border-x border-b border-border/40 flex-row items-center gap-3 pl-4 pr-3 ${
        first ? 'rounded-t-[20px] border-t' : ''
      } ${last ? 'rounded-b-[20px]' : ''}`}
    >
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${name}, ${formatMoney(netOf(entry))}, ${due.text}`}
        className="flex-1 min-w-0 flex-row items-center gap-3 py-3 min-h-[68px] active:opacity-70"
      >
        <DateTile small={MONTH_SHORT[Number(entry.occurredOn.slice(5, 7)) - 1]} large={entry.occurredOn.slice(8, 10)} />
        <View className="flex-1 min-w-0">
          <Text className="text-foreground text-[15px] leading-5 font-semibold" numberOfLines={2}>
            {name}
          </Text>
          <Text
            className={`text-[13px] leading-[18px] mt-0.5 ${due.late ? 'text-destructive font-semibold' : 'text-muted-foreground'}`}
            numberOfLines={1}
          >
            {due.text}
          </Text>
        </View>
        <Text className="text-foreground text-[15px] font-semibold" style={{ fontVariant: ['tabular-nums'] }}>
          {formatMoney(netOf(entry))}
        </Text>
      </Pressable>
      <Pressable
        onPress={onPaid}
        accessibilityRole="button"
        accessibilityLabel={income ? `Mark ${name} as received` : `Mark ${name} as paid`}
        className="min-h-[36px] rounded-full bg-secondary px-3.5 justify-center active:opacity-70"
      >
        <Text className="text-foreground text-[13px] font-semibold">{income ? 'Got it' : 'Paid'}</Text>
      </Pressable>
    </View>
  );
}

/**
 * Money: one person's own ledger, in four pages.
 *
 * Activity is the month: what was kept, then what moved, by day. Owed is what
 * has not been paid yet, whatever the month, because a client who owes from
 * August still owes in October. Savings is what has been put aside. Insights
 * is the year. They used to be one long screen with a second screen behind an
 * icon; nothing on it said which number mattered.
 */
export default function MoneyScreen() {
  const insets = useSafeAreaInsets();
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  const params = useLocalSearchParams<{ tab?: string }>();
  const today = todayIso();
  const [tab, setTab] = useState<Tab>(() => (TABS.includes(params.tab as Tab) ? (params.tab as Tab) : 'activity'));
  const [month, setMonth] = useState(() => monthOf(today));
  const [filter, setFilter] = useState<Filter>('all');
  const [refreshing, setRefreshing] = useState(false);
  const range = monthRange(month);
  const kind = filter === 'all' ? undefined : filter;

  const summary = useMoneySummary(range.from, range.to);
  const list = useMoneyEntries({ from: range.from, to: range.to, kind, limit: 200 });
  const unpaid = useMoneyEntries({ unpaid: true, limit: 100 });
  const queued = useMoneyOutbox();
  const offers = useMoneySuggestions();
  const owed = useMoneyPackages('open');
  const saved = useMoneySavings(month);
  const dismiss = useDismissMoneySuggestion();
  const update = useUpdateMoneyEntry();
  const exporter = useMoneyExport();
  const { payMethods } = useMoneyPayMethods();
  const [picking, setPicking] = useState(false);
  // Where to go once the picker has fully closed: iOS will not present the
  // full-screen QR over a sheet that is still on its way down.
  const afterPick = useRef<string | null>(null);

  // Show QR: straight to the code with one saved, a choice with more, and
  // the form with none, since there is nothing yet to show.
  const showQr = () => {
    if (payMethods.length === 0) router.push('/money/pay-methods/edit');
    else if (payMethods.length === 1) router.push(`/money/pay-methods/show?id=${payMethods[0].id}`);
    else setPicking(true);
  };

  // Soonest due first; the list arrives newest first.
  const waiting = useMemo(
    () => [...unpaid.entries].sort((a, b) => a.occurredOn.localeCompare(b.occurredOn)),
    [unpaid.entries],
  );
  const owedToMe = useMemo(() => waiting.filter((entry) => entry.kind === 'income'), [waiting]);
  const iOwe = useMemo(() => waiting.filter((entry) => entry.kind === 'expense'), [waiting]);
  const late = useMemo(() => owedToMe.filter((entry) => isOverdue(entry, today)), [owedToMe, today]);
  const owedMinor = owedToMe.reduce((sum, entry) => sum + netOf(entry), 0);
  const lateMinor = late.reduce((sum, entry) => sum + netOf(entry), 0);

  const sections = useMemo<Section[]>(() => {
    const out: Section[] = [];
    // Agreed bookings not recorded yet: first, because each is a tap away
    // from being right, and the longest-lived thing on the page otherwise.
    const offered = offers.suggestions.filter((s) => !kind || s.kind === kind);
    if (offered.length > 0) {
      out.push({
        key: 'suggestions',
        title: 'From your bookings',
        data: offered.map((suggestion) => ({ type: 'suggestion' as const, suggestion })),
      });
    }
    const held = queued.filter((q) => !kind || q.input.kind === kind);
    if (held.length > 0) {
      out.push({
        key: 'queued',
        title: 'Saved on this phone',
        data: held.map((q) => ({ type: 'queued' as const, queued: q })),
      });
    }
    // What is not paid yet is on Owed, not under its due day here.
    const byDay = new Map<string, MoneyEntry[]>();
    for (const entry of list.entries) {
      if (entry.paidOn === null) continue;
      const bucket = byDay.get(entry.paidOn);
      if (bucket) bucket.push(entry);
      else byDay.set(entry.paidOn, [entry]);
    }
    for (const [day, entries] of byDay) {
      out.push({
        key: day,
        title: dayLabel(day, today),
        note: `${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}`,
        data: entries.map((entry) => ({ type: 'entry' as const, entry })),
      });
    }
    return out;
  }, [offers.suggestions, queued, list.entries, kind, today]);

  const markPaid = useCallback(
    (entry: MoneyEntry) =>
      update.mutate(
        { id: entry.id, paidOn: todayIso() },
        {
          onSuccess: () => {
            // Money that has just arrived is the moment to put some aside.
            if (entry.kind === 'income') {
              setAsidePrompt.offer({ amountMinor: netOf(entry), from: entry.counterparty ?? null });
            }
          },
          onError: (error) =>
            Alert.alert(
              "Couldn't mark it paid",
              error instanceof ApiError && error.status !== 0 ? error.message : 'Please try again.',
            ),
        },
      ),
    [update],
  );

  const exportRange = (from: string, to: string) =>
    exporter.mutate(
      { from, to },
      {
        onSuccess: (url) => void Linking.openURL(url),
        onError: (error) =>
          Alert.alert(
            "Couldn't export",
            error instanceof ApiError && error.status !== 0 ? error.message : 'Check your connection and try again.',
          ),
      },
    );

  const askExport = () => {
    const year = month.slice(0, 4);
    Alert.alert(
      'Export as a spreadsheet',
      'A CSV your accountant or bookkeeper can open in Excel or Google Sheets. It opens in your browser to save.',
      [
        { text: monthLabel(month, today), onPress: () => exportRange(range.from, range.to) },
        { text: `All of ${year}`, onPress: () => exportRange(`${year}-01-01`, `${year}-12-31`) },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  };

  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([
      summary.refetch(), list.refetch(), unpaid.refetch(), offers.refetch(), owed.refetch(), saved.refetch(),
    ]);
    setRefreshing(false);
  };
  const refreshControl = (
    <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={palette.primary} />
  );

  // "Set some of it aside?": asked here once a payment has been recorded,
  // when there is a saving to put it in and this screen is the one in front.
  const focused = useIsFocused();
  const offer = useSetAsideOffer();
  const asking = focused && offer !== null && saved.savings.length > 0 ? offer : null;
  useEffect(() => {
    // Nothing to put it in: the question is dropped, not kept for later.
    if (focused && offer !== null && !saved.isLoading && saved.savings.length === 0) setAsidePrompt.clear();
  }, [focused, offer, saved.isLoading, saved.savings.length]);

  const isThisMonth = month === monthOf(today);
  const s = summary.summary;
  const inMinor = s?.incomeMinor ?? 0;
  const outMinor = s?.expenseMinor ?? 0;
  const keptMinor = inMinor - outMinor;
  const moved = inMinor + outMinor;
  const worst = late[0];

  const activityHeader = (
    <View>
      {/* The month: what was kept leads, and the rest explains it. */}
      <View className="rounded-[20px] border border-border/40 bg-card p-5">
        <View className="flex-row items-center gap-2">
          <Text className="flex-1 text-muted-foreground text-[13px] leading-[18px] font-semibold" numberOfLines={1}>
            Kept in {monthLabel(month, today)}
          </Text>
          {!isThisMonth ? (
            <Pressable
              onPress={() => setMonth(monthOf(today))}
              accessibilityRole="button"
              hitSlop={8}
              className="px-1 active:opacity-60"
            >
              <Text className="text-primary text-[13px] font-semibold">This month</Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => setMonth((m) => shiftMonth(m, -1))}
            accessibilityRole="button"
            accessibilityLabel="Previous month"
            hitSlop={6}
            className="w-9 h-9 rounded-full bg-muted items-center justify-center active:opacity-70"
          >
            <ChevronLeftIcon size={18} className="text-foreground" />
          </Pressable>
          <Pressable
            onPress={() => setMonth((m) => shiftMonth(m, 1))}
            disabled={isThisMonth}
            accessibilityRole="button"
            accessibilityLabel="Next month"
            hitSlop={6}
            className="w-9 h-9 rounded-full bg-muted items-center justify-center active:opacity-70"
            style={{ opacity: isThisMonth ? 0.4 : 1 }}
          >
            <ChevronRightIcon size={18} className="text-foreground" />
          </Pressable>
        </View>
        <Text
          className={`text-[26px] leading-8 font-bold tracking-tight mt-1 ${keptMinor < 0 ? 'text-destructive' : 'text-foreground'}`}
          style={{ fontVariant: ['tabular-nums'] }}
          accessibilityRole="header"
        >
          {formatMoney(keptMinor)}
        </Text>
        {/* In against out, as one bar: how much of what came in is still here. */}
        <View className="h-2 rounded-full bg-muted overflow-hidden flex-row mt-4" accessibilityElementsHidden>
          {moved > 0 ? (
            <>
              <View className="h-full bg-success" style={{ flex: inMinor }} />
              <View className="h-full bg-muted-foreground/40" style={{ flex: outMinor }} />
            </>
          ) : null}
        </View>
        <View className="flex-row gap-3 mt-3.5">
          <Figure label="In" minor={inMinor} tone="in" />
          <Figure label="Out" minor={outMinor} />
          <Figure label="Set aside" minor={saved.monthMinor} />
        </View>
        {s && s.withheldMinor > 0 ? (
          <Text className="text-muted-foreground text-[12px] leading-[17px] mt-3.5">
            {formatMoney(s.withheldMinor)} of the income was withheld by clients as tax. Keep their 2307s.
          </Text>
        ) : null}
      </View>

      {/* The one thing that is late, said once, and the way to the rest. */}
      {worst ? (
        <Pressable
          onPress={() => setTab('owed')}
          accessibilityRole="button"
          accessibilityHint="Opens what is owed to you"
          className="mt-3 rounded-[20px] border border-border/40 bg-card pl-4 pr-3 min-h-[60px] flex-row items-center gap-3 active:opacity-70"
        >
          <ClockAlertIcon size={20} className="text-destructive" />
          <View className="flex-1 min-w-0 py-2.5">
            <Text className="text-foreground text-[15px] leading-5 font-semibold" numberOfLines={1}>
              {formatMoney(lateMinor)} is {dueLine(worst.occurredOn, today).text}.
            </Text>
            <Text className="text-muted-foreground text-[13px] leading-[18px] mt-0.5" numberOfLines={1}>
              {late.length === 1 ? nameOf(worst) : `${nameOf(worst)} and ${late.length - 1} more`}
            </Text>
          </View>
          <ChevronRightIcon size={16} className="text-muted-foreground" />
        </Pressable>
      ) : null}

      {/* Adding is the point of the page: one filled button. Show QR beside it,
          labelled and quiet, for a quick send: a client in front of you
          scans the account you pick. */}
      <View className="flex-row gap-2.5 mt-3">
        <Pressable
          onPress={() => router.push(`/money/new?kind=${filter === 'expense' ? 'expense' : 'income'}`)}
          accessibilityRole="button"
          className="flex-1 h-11 rounded-[14px] bg-action flex-row items-center justify-center gap-2 active:opacity-85"
        >
          <PlusIcon size={18} className="text-action-foreground" />
          <Text className="text-action-foreground text-[15px] font-semibold">Add entry</Text>
        </Pressable>
        <Pressable
          onPress={showQr}
          accessibilityRole="button"
          accessibilityLabel="Show QR: your GCash, Maya or bank code for a client to scan"
          className="flex-1 h-11 rounded-[14px] bg-secondary flex-row items-center justify-center gap-2 active:opacity-70"
        >
          <QrCodeIcon size={18} className="text-foreground" />
          <Text className="text-foreground text-[15px] font-semibold">Show QR</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push('/money/packages/new')}
          accessibilityRole="button"
          accessibilityLabel="New package: a total, a deposit and a balance"
          className="w-11 h-11 rounded-[14px] bg-secondary items-center justify-center active:opacity-70"
        >
          <PackagePlusIcon size={19} className="text-foreground" />
        </Pressable>
      </View>

      <View className="flex-row gap-2 mt-5">
        <FilterChip label="All" on={filter === 'all'} onPress={() => setFilter('all')} />
        <FilterChip label="Income" on={filter === 'income'} onPress={() => setFilter('income')} />
        <FilterChip label="Expenses" on={filter === 'expense'} onPress={() => setFilter('expense')} />
      </View>
    </View>
  );

  const loading = list.isLoading;
  const failed = list.loadFailed && list.entries.length === 0;
  const empty = !loading && !failed && sections.length === 0;

  const activity = (
    <SectionList
      sections={sections}
      keyExtractor={(item) =>
        item.type === 'entry'
          ? item.entry.id
          : item.type === 'queued'
            ? `q-${item.queued.input.id}`
            : `s-${item.suggestion.bookingId}`
      }
      stickySectionHeadersEnabled={false}
      ListHeaderComponent={activityHeader}
      contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: insets.bottom + 32 }}
      refreshControl={refreshControl}
      renderSectionHeader={({ section }) => <SectionTitle title={section.title} note={section.note} />}
      renderItem={({ item, index, section }) => {
        const first = index === 0;
        const last = index === section.data.length - 1;
        if (item.type === 'suggestion') {
          const booking = item.suggestion;
          return (
            <SuggestionRow
              suggestion={booking}
              first={first}
              last={last}
              onRecord={() => router.push(`/money/new?booking=${booking.bookingId}`)}
              onDismiss={() => dismiss.mutate(booking.bookingId)}
            />
          );
        }
        if (item.type === 'queued') {
          const q = item.queued;
          return (
            <MoneyRow
              row={rowOfQueued(q.input)}
              first={first}
              last={last}
              waiting={!q.error}
              refused={q.error}
              onPress={
                q.error
                  ? () =>
                      Alert.alert("This entry couldn't be saved", q.error ?? undefined, [
                        { text: 'Keep it', style: 'cancel' },
                        { text: 'Discard', style: 'destructive', onPress: () => discardQueuedMoneyEntry(q.input.id) },
                      ])
                  : undefined
              }
            />
          );
        }
        const entry = item.entry;
        return (
          <MoneyRow
            row={rowOf(entry)}
            first={first}
            last={last}
            onPress={() => router.push(`/money/new?edit=${entry.id}`)}
          />
        );
      }}
      ListEmptyComponent={
        loading ? (
          <View className="-mx-5 mt-6">
            <CardListSkeleton count={3} />
          </View>
        ) : failed ? (
          <View className="mt-8">
            <LoadFailed what="your money entries" onRetry={() => void refresh()} />
          </View>
        ) : empty ? (
          <View className="mt-8">
            <EmptyState
              icon={WalletIcon}
              title={`Nothing in ${monthLabel(month, today)} yet`}
              body="Log a job fee or an expense as it happens — the pamasahe, the meal, the second shooter. It takes a few seconds, and only you can see it."
            />
          </View>
        ) : null
      }
      ListFooterComponent={
        <Text className="mt-8 px-2 text-muted-foreground text-[12px] leading-[17px] text-center">
          Totals are what you’ve recorded, counted on the day each was paid. They are for planning — not tax
          advice, and not a BIR book of accounts.
        </Text>
      }
    />
  );

  const nothingOwed = owedToMe.length === 0 && iOwe.length === 0 && owed.packages.length === 0;
  const owedPage = (
    <ScrollView
      contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: insets.bottom + 32 }}
      refreshControl={refreshControl}
    >
      {/* The one dark card on the screen: the number a freelancer chases. */}
      <View className="rounded-[20px] bg-foreground p-5">
        <Text className="text-background/70 text-[13px] leading-[18px] font-semibold">Owed to you</Text>
        <Text
          className="text-background text-[26px] leading-8 font-bold tracking-tight mt-0.5"
          style={{ fontVariant: ['tabular-nums'] }}
          accessibilityRole="header"
        >
          {formatMoney(owedMinor)}
        </Text>
        <Text className="text-background/70 text-[13px] leading-[18px] mt-1.5">
          {owedToMe.length === 0
            ? 'Nobody owes you anything right now.'
            : lateMinor > 0
              ? `${formatMoney(lateMinor)} of it is past its due date`
              : 'None of it is late'}
        </Text>
      </View>

      {unpaid.isLoading && waiting.length === 0 ? (
        <View className="-mx-5 mt-6">
          <CardListSkeleton count={2} />
        </View>
      ) : unpaid.loadFailed && waiting.length === 0 ? (
        <View className="mt-8">
          <LoadFailed what="what is owed" onRetry={() => void refresh()} compact />
        </View>
      ) : null}

      {owedToMe.length > 0 ? (
        <>
          <SectionTitle title="Waiting for payment" />
          {owedToMe.map((entry, at) => (
            <OwedRow
              key={entry.id}
              entry={entry}
              today={today}
              first={at === 0}
              last={at === owedToMe.length - 1}
              onPress={() => router.push(`/money/new?edit=${entry.id}`)}
              onPaid={() => markPaid(entry)}
            />
          ))}
        </>
      ) : null}

      <SectionTitle title="Packages" action={{ label: 'New', onPress: () => router.push('/money/packages/new') }} />
      {owed.packages.length > 0 ? (
        owed.packages.map((pkg: MoneyPackage, at) => (
          <PackageRow
            key={pkg.id}
            pkg={pkg}
            first={at === 0}
            last={at === owed.packages.length - 1}
            onPress={() => router.push(`/money/packages/${pkg.id}`)}
          />
        ))
      ) : (
        <View className="rounded-[20px] border border-border/40 bg-card p-4">
          <Text className="text-muted-foreground text-[13px] leading-[19px]">
            A package is one job paid in parts: the total, the deposit and the balance. Virgo keeps track of what is
            left and when it is due.
          </Text>
        </View>
      )}

      {iOwe.length > 0 ? (
        <>
          <SectionTitle title="You still owe" />
          {iOwe.map((entry, at) => (
            <OwedRow
              key={entry.id}
              entry={entry}
              today={today}
              first={at === 0}
              last={at === iOwe.length - 1}
              onPress={() => router.push(`/money/new?edit=${entry.id}`)}
              onPaid={() => markPaid(entry)}
            />
          ))}
        </>
      ) : null}

      {nothingOwed && !unpaid.isLoading ? (
        <Text className="mt-6 px-2 text-muted-foreground text-[13px] leading-[19px] text-center">
          When you record income that has not been paid yet, it waits here until you mark it as received.
        </Text>
      ) : null}
    </ScrollView>
  );

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <ScreenHeader
        title="Money"
        subtitle="Only you can see this"
        right={
          <Pressable
            onPress={askExport}
            disabled={exporter.isPending}
            accessibilityRole="button"
            accessibilityLabel="Export as a spreadsheet"
            className="w-11 h-11 rounded-xl bg-secondary items-center justify-center active:opacity-70"
            style={{ opacity: exporter.isPending ? 0.5 : 1 }}
          >
            <DownloadIcon size={18} className="text-foreground" />
          </Pressable>
        }
      />
      <PageTabs<Tab>
        tabs={[
          { key: 'activity', label: 'Activity' },
          { key: 'owed', label: 'Owed', badge: owedToMe.length },
          { key: 'savings', label: 'Savings' },
          { key: 'insights', label: 'Insights' },
        ]}
        value={tab}
        onChange={setTab}
      />
      <View className="flex-1">
        {tab === 'activity' ? (
          activity
        ) : tab === 'owed' ? (
          owedPage
        ) : tab === 'savings' ? (
          <SavingsPage month={month} today={today} keptMinor={s ? keptMinor : null} />
        ) : (
          <InsightsPage year={month.slice(0, 4)} month={month} />
        )}
      </View>
      <SetAsideSheet offer={asking} savings={saved.savings} onClose={setAsidePrompt.clear} />
      <PayPickSheet
        visible={picking}
        payMethods={payMethods}
        onClose={() => setPicking(false)}
        onClosed={() => {
          const next = afterPick.current;
          afterPick.current = null;
          if (next) router.push(next);
        }}
        onPick={(m) => {
          afterPick.current = `/money/pay-methods/show?id=${m.id}`;
          setPicking(false);
        }}
        onEdit={() => {
          afterPick.current = '/money/pay-methods';
          setPicking(false);
        }}
      />
    </SafeAreaView>
  );
}
