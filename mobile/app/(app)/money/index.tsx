import { useCallback, useMemo, useState } from 'react';
import { Alert, Linking, Pressable, RefreshControl, SectionList, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import {
  ChartColumnIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  MinusIcon,
  PlusIcon,
  WalletIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import {
  ApiError,
  dayLabel,
  formatMoney,
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
  useMoneyPackages,
  useMoneyExport,
  useMoneySuggestions,
  useMoneySummary,
  useTheme,
  useUpdateMoneyEntry,
} from '@/src/hooks';
import { CardListSkeleton, EmptyState, FilterChip, PressableScale, ScreenHeader } from '@/components';
import { LoadFailed } from '@/components/LoadFailed';
import { MoneyRow, rowOf, rowOfQueued } from '@/components/money/MoneyRow';
import { SuggestionRow } from '@/components/money/SuggestionRow';
import { PackageRow } from '@/components/money/PackageRow';
import { discardQueuedMoneyEntry, useMoneyOutbox, type QueuedMoneyEntry } from '@/src/lib/money-outbox';
import { PALETTES } from '@/theme';

for (const Icon of [ChartColumnIcon, ChevronLeftIcon, ChevronRightIcon, DownloadIcon, MinusIcon, PlusIcon, WalletIcon]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

type Filter = 'all' | MoneyKind;

type Item =
  | { type: 'entry'; entry: MoneyEntry }
  | { type: 'queued'; queued: QueuedMoneyEntry }
  | { type: 'suggestion'; suggestion: MoneySuggestion }
  | { type: 'package'; pkg: MoneyPackage };

interface Section {
  key: string;
  title: string;
  tone?: 'warn';
  data: Item[];
}

/**
 * One of the month's figures, a row each: three peso amounts with centavos
 * do not fit side by side on a phone, and shrinking them to fit drew the
 * three at different sizes.
 */
function Figure({ label, minor, tone }: { label: string; minor: number; tone?: 'in' | 'total' }) {
  const total = tone === 'total';
  return (
    <View
      className={`flex-row items-baseline justify-between gap-3 ${total ? 'border-t border-border pt-2.5 mt-1' : ''}`}
    >
      <Text
        className={`text-[14px] ${total ? 'text-foreground font-bold' : 'text-muted-foreground font-semibold'}`}
      >
        {label}
      </Text>
      <Text
        numberOfLines={1}
        className={`font-bold tracking-tight ${total ? 'text-[22px]' : 'text-[18px]'} ${
          tone === 'in' ? 'text-success' : minor < 0 ? 'text-destructive' : 'text-foreground'
        }`}
        style={{ fontVariant: ['tabular-nums'] }}
      >
        {formatMoney(minor)}
      </Text>
    </View>
  );
}

/**
 * Money: one person's own ledger, a month at a time.
 *
 * What is still owed sits on top whatever the month, because a client who
 * owes from August still owes in October. Below it, the month's paid
 * entries by day, and anything written offline that hasn't reached the
 * server yet.
 */
export default function MoneyScreen() {
  const insets = useSafeAreaInsets();
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  const today = todayIso();
  const [month, setMonth] = useState(() => monthOf(today));
  const [filter, setFilter] = useState<Filter>('all');
  const [refreshing, setRefreshing] = useState(false);
  const range = monthRange(month);
  const kind = filter === 'all' ? undefined : filter;

  const summary = useMoneySummary(range.from, range.to);
  const list = useMoneyEntries({ from: range.from, to: range.to, kind, limit: 200 });
  const unpaid = useMoneyEntries({ unpaid: true, kind, limit: 100 });
  const queued = useMoneyOutbox();
  const offers = useMoneySuggestions();
  const owed = useMoneyPackages('open');
  const dismiss = useDismissMoneySuggestion();
  const update = useUpdateMoneyEntry();
  const exporter = useMoneyExport();

  const sections = useMemo<Section[]>(() => {
    const out: Section[] = [];
    // Agreed bookings not recorded yet: first, because each is a tap away
    // from being right, and the longest-lived thing on the screen otherwise.
    const offered = offers.suggestions.filter((s) => !kind || s.kind === kind);
    if (offered.length > 0) {
      out.push({
        key: 'suggestions',
        title: 'From your bookings',
        data: offered.map((suggestion) => ({ type: 'suggestion' as const, suggestion })),
      });
    }
    const waiting = queued.filter((q) => !kind || q.input.kind === kind);
    if (waiting.length > 0) {
      out.push({
        key: 'queued',
        title: 'Saved on this phone',
        data: waiting.map((q) => ({ type: 'queued' as const, queued: q })),
      });
    }
    // Packages with something still owed: what each client has left to pay.
    // Income only, so not under Expenses.
    if (kind !== 'expense' && owed.packages.length > 0) {
      out.push({
        key: 'packages',
        title: 'Who owes you',
        data: owed.packages.map((pkg) => ({ type: 'package' as const, pkg })),
      });
    }
    if (unpaid.entries.length > 0) {
      // Soonest due first; the list arrives newest first.
      const owed = [...unpaid.entries].sort((a, b) => a.occurredOn.localeCompare(b.occurredOn));
      out.push({
        key: 'unpaid',
        title: `Not paid yet · ${unpaid.total}`,
        tone: 'warn',
        data: owed.map((entry) => ({ type: 'entry' as const, entry })),
      });
    }
    // Unpaid entries are listed above, not again under their due day.
    const byDay = new Map<string, MoneyEntry[]>();
    for (const entry of list.entries) {
      if (entry.paidOn === null) continue;
      const day = entry.paidOn;
      const bucket = byDay.get(day);
      if (bucket) bucket.push(entry);
      else byDay.set(day, [entry]);
    }
    for (const [day, entries] of byDay) {
      out.push({
        key: day,
        title: dayLabel(day, today),
        data: entries.map((entry) => ({ type: 'entry' as const, entry })),
      });
    }
    return out;
  }, [offers.suggestions, owed.packages, queued, unpaid.entries, unpaid.total, list.entries, kind, today]);

  const markPaid = useCallback(
    (entry: MoneyEntry) =>
      update.mutate(
        { id: entry.id, paidOn: todayIso() },
        {
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
    await Promise.all([summary.refetch(), list.refetch(), unpaid.refetch(), offers.refetch(), owed.refetch()]);
    setRefreshing(false);
  };

  const add = (k: MoneyKind) => router.push(`/money/new?kind=${k}`);
  const isThisMonth = month === monthOf(today);
  const s = summary.summary;
  const inMinor = s?.incomeMinor ?? 0;
  const outMinor = s?.expenseMinor ?? 0;

  const header = (
    <View>
      {/* The month, and the way to the next and the last. */}
      <View className="px-5 mt-1 flex-row items-center gap-2">
        <Pressable
          onPress={() => setMonth((m) => shiftMonth(m, -1))}
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          className="w-10 h-10 rounded-xl bg-secondary items-center justify-center active:opacity-70"
        >
          <ChevronLeftIcon size={18} className="text-foreground" />
        </Pressable>
        <Text className="flex-1 text-center text-foreground text-[17px] font-bold" accessibilityRole="header">
          {monthLabel(month, today)}
        </Text>
        {!isThisMonth ? (
          <Pressable
            onPress={() => setMonth(monthOf(today))}
            accessibilityRole="button"
            className="min-h-10 px-2 justify-center active:opacity-60"
          >
            <Text className="text-primary text-[13px] font-bold">This month</Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={() => setMonth((m) => shiftMonth(m, 1))}
          accessibilityRole="button"
          accessibilityLabel="Next month"
          className="w-10 h-10 rounded-xl bg-secondary items-center justify-center active:opacity-70"
        >
          <ChevronRightIcon size={18} className="text-foreground" />
        </Pressable>
      </View>

      {/* What moved this month, by when it was paid. */}
      <View className="mx-5 mt-4 bg-card rounded-3xl border border-border/40 p-5">
        <View className="gap-2">
          <Figure label="In" minor={inMinor} tone="in" />
          <Figure label="Out" minor={outMinor} />
          <Figure label="Kept" minor={inMinor - outMinor} tone="total" />
        </View>
        {s && s.withheldMinor > 0 ? (
          <Text className="text-muted-foreground text-xs mt-3 leading-[17px]">
            {formatMoney(s.withheldMinor)} of the income was withheld by clients as tax. Keep their 2307s.
          </Text>
        ) : null}
        {s && s.owedToYouMinor > 0 ? (
          <Text className="text-foreground text-[13px] font-semibold mt-3">
            Owed to you: {formatMoney(s.owedToYouMinor)}
            <Text className="text-muted-foreground font-normal">
              {' '}· {s.owedToYouCount} {s.owedToYouCount === 1 ? 'entry' : 'entries'}
            </Text>
          </Text>
        ) : null}
      </View>

      {/* Adding is the point of the screen, so it sits right here. */}
      <View className="px-5 mt-3 flex-row gap-3">
        <PressableScale
          onPress={() => add('income')}
          accessibilityRole="button"
          scaleTo={0.97}
          style={{ flex: 1 }}
          className="min-h-12 flex-row items-center justify-center gap-2 rounded-2xl bg-success/15"
        >
          <PlusIcon size={17} className="text-success" />
          <Text className="text-success text-[15px] font-bold">Income</Text>
        </PressableScale>
        <PressableScale
          onPress={() => add('expense')}
          accessibilityRole="button"
          scaleTo={0.97}
          style={{ flex: 1 }}
          className="min-h-12 flex-row items-center justify-center gap-2 rounded-2xl bg-primary/10"
        >
          <MinusIcon size={17} className="text-primary" />
          <Text className="text-primary text-[15px] font-bold">Expense</Text>
        </PressableScale>
      </View>

      <View className="px-5 mt-2 flex-row items-center justify-between">
        <Pressable
          onPress={() => router.push('/money/packages/new')}
          accessibilityRole="button"
          className="min-h-10 justify-center active:opacity-60"
        >
          <Text className="text-primary text-[13px] font-bold">New package — total, deposit, balance</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push('/money/pay-methods')}
          accessibilityRole="button"
          className="min-h-10 justify-center active:opacity-60"
        >
          <Text className="text-muted-foreground text-[13px] font-semibold">How clients pay</Text>
        </Pressable>
      </View>

      <View className="px-5 mt-2 flex-row gap-2">
        <FilterChip label="All" on={filter === 'all'} onPress={() => setFilter('all')} />
        <FilterChip label="Income" on={filter === 'income'} onPress={() => setFilter('income')} />
        <FilterChip label="Expenses" on={filter === 'expense'} onPress={() => setFilter('expense')} />
      </View>
    </View>
  );

  const loading = list.isLoading && unpaid.isLoading;
  const failed = list.loadFailed && list.entries.length === 0 && unpaid.entries.length === 0;
  const empty = !loading && !failed && sections.length === 0;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <ScreenHeader
        title="Money"
        subtitle="Only you can see this"
        right={
          <View className="flex-row gap-2">
            <Pressable
              onPress={() => router.push(`/money/insights?year=${month.slice(0, 4)}&month=${month}`)}
              accessibilityRole="button"
              accessibilityLabel="Insights"
              className="w-11 h-11 rounded-xl bg-secondary items-center justify-center active:opacity-70"
            >
              <ChartColumnIcon size={18} className="text-foreground" />
            </Pressable>
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
          </View>
        }
      />
      <SectionList
        sections={sections}
        keyExtractor={(item) =>
          item.type === 'entry'
            ? item.entry.id
            : item.type === 'queued'
              ? `q-${item.queued.input.id}`
              : item.type === 'suggestion'
                ? `s-${item.suggestion.bookingId}`
                : `p-${item.pkg.id}`
        }
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={header}
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={palette.primary} />}
        renderSectionHeader={({ section }) => (
          <Text
            accessibilityRole="header"
            className={`px-6 text-[12px] font-bold uppercase tracking-[1.5px] mt-6 mb-2 ${
              section.tone === 'warn' ? 'text-warning' : 'text-muted-foreground'
            }`}
          >
            {section.title}
          </Text>
        )}
        renderItem={({ item, index, section }) => {
          const first = index === 0;
          const last = index === section.data.length - 1;
          if (item.type === 'package') {
            const pkg = item.pkg;
            return (
              <View className="px-5">
                <PackageRow
                  pkg={pkg}
                  first={first}
                  last={last}
                  onPress={() => router.push(`/money/packages/${pkg.id}`)}
                />
              </View>
            );
          }
          if (item.type === 'suggestion') {
            const offer = item.suggestion;
            return (
              <View className="px-5">
                <SuggestionRow
                  suggestion={offer}
                  first={first}
                  last={last}
                  onRecord={() => router.push(`/money/new?booking=${offer.bookingId}`)}
                  onDismiss={() => dismiss.mutate(offer.bookingId)}
                />
              </View>
            );
          }
          if (item.type === 'queued') {
            const q = item.queued;
            return (
              <View className="px-5">
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
                            {
                              text: 'Discard',
                              style: 'destructive',
                              onPress: () => discardQueuedMoneyEntry(q.input.id),
                            },
                          ])
                      : undefined
                  }
                />
              </View>
            );
          }
          const entry = item.entry;
          return (
            <View className="px-5">
              <MoneyRow
                row={rowOf(entry)}
                first={first}
                last={last}
                onPress={() => router.push(`/money/new?edit=${entry.id}`)}
                onMarkPaid={entry.paidOn === null ? () => markPaid(entry) : undefined}
              />
            </View>
          );
        }}
        ListEmptyComponent={
          loading ? (
            <View className="px-5 mt-6">
              <CardListSkeleton count={3} />
            </View>
          ) : failed ? (
            <View className="mt-6">
              <LoadFailed what="your money entries" onRetry={() => void refresh()} />
            </View>
          ) : empty ? (
            <View className="mt-6">
              <EmptyState
                icon={WalletIcon}
                title={`Nothing in ${monthLabel(month, today)} yet`}
                body="Log a job fee or an expense as it happens — the pamasahe, the meal, the second shooter. It takes a few seconds, and only you can see it."
              />
            </View>
          ) : null
        }
        ListFooterComponent={
          <Text className="px-6 mt-8 text-muted-foreground text-[12px] leading-[17px] text-center">
            Totals are what you’ve recorded, counted on the day each was paid. They are for planning
            — not tax advice, and not a BIR book of accounts.
          </Text>
        }
      />
    </SafeAreaView>
  );
}
