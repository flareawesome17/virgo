import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { ChartColumnIcon, ChevronLeftIcon, ChevronRightIcon, RepeatIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import {
  categoryLabel,
  formatMoney,
  todayIso,
  type MoneyInsights,
  type MoneyKind,
} from '@/src/api';
import { useMoneyInsights, useMoneyRecurring, useTheme } from '@/src/hooks';
import { CardListSkeleton, EmptyState, ScreenHeader } from '@/components';
import { LoadFailed } from '@/components/LoadFailed';
import { categoryIcon } from '@/components/money/icons';
import { PALETTES } from '@/theme';

for (const Icon of [ChartColumnIcon, ChevronLeftIcon, ChevronRightIcon, RepeatIcon]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
/** The oldest year the ledger takes. */
const FIRST_YEAR = 2000;

/** "up 24%" / "down 8%" against last year, or null when there is nothing to compare. */
function change(now: number, before: number): { up: boolean; text: string } | null {
  if (before <= 0 || now === before) return null;
  const pct = Math.round((Math.abs(now - before) / before) * 100);
  if (pct === 0) return null;
  return { up: now > before, text: `${now > before ? 'up' : 'down'} ${pct}%` };
}

/** "Mar 8": how far into last year this year is compared. */
function shortDate(day: string): string {
  const month = Number(day.slice(5, 7));
  return `${MONTH_SHORT[month - 1]} ${Number(day.slice(8, 10))}`;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="mt-6">
      <Text
        accessibilityRole="header"
        className="px-1 text-muted-foreground text-[12px] font-bold uppercase tracking-[1.5px] mb-2"
      >
        {title}
      </Text>
      {children}
    </View>
  );
}

/** A row with a bar under it for its share of the largest. */
function ShareRow({
  label,
  detail,
  minor,
  share,
  tone,
  icon: Icon,
  first,
  last,
  onPress,
}: {
  label: string;
  detail?: string;
  minor: number;
  share: number;
  tone: 'in' | 'out';
  icon?: ReturnType<typeof categoryIcon>;
  first: boolean;
  last: boolean;
  onPress?: () => void;
}) {
  const income = tone === 'in';
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${label}, ${formatMoney(minor)}${detail ? `, ${detail}` : ''}`}
      className={`bg-card px-4 py-3 ${onPress ? 'active:opacity-70' : ''} ${first ? 'rounded-t-2xl' : ''} ${
        last ? 'rounded-b-2xl' : 'border-b border-border'
      }`}
    >
      <View className="flex-row items-center gap-3">
        {Icon ? (
          <View
            className={`w-8 h-8 rounded-xl items-center justify-center ${income ? 'bg-success/15' : 'bg-primary/10'}`}
          >
            <Icon size={15} className={income ? 'text-success' : 'text-primary'} />
          </View>
        ) : null}
        <View className="flex-1 min-w-0">
          <Text className="text-foreground text-[15px] font-semibold" numberOfLines={1}>
            {label}
          </Text>
          {detail ? (
            <Text className="text-muted-foreground text-[12px] mt-0.5" numberOfLines={1}>
              {detail}
            </Text>
          ) : null}
        </View>
        <Text
          className={`text-[15px] font-bold ${minor < 0 ? 'text-destructive' : income ? 'text-success' : 'text-foreground'}`}
          style={{ fontVariant: ['tabular-nums'] }}
        >
          {formatMoney(minor)}
        </Text>
      </View>
      <View className="h-1.5 rounded-full bg-muted mt-2 overflow-hidden">
        <View
          className={`h-full rounded-full ${income ? 'bg-success' : 'bg-primary'}`}
          style={{ width: `${Math.max(2, Math.round(share * 100))}%` }}
        />
      </View>
    </Pressable>
  );
}

/**
 * Twelve months as pairs of bars, drawn with plain views: in beside out,
 * against the year's biggest month. A month is tapped to read its figures.
 */
function MonthBars({
  months,
  selected,
  onSelect,
}: {
  months: MoneyInsights['months'];
  selected: number;
  onSelect: (index: number) => void;
}) {
  const top = Math.max(1, ...months.map((m) => Math.max(m.incomeMinor, m.expenseMinor)));
  const height = 120;
  return (
    <View className="flex-row items-end" style={{ height: height + 24 }}>
      {months.map((m, i) => {
        const on = i === selected;
        return (
          <Pressable
            key={m.month}
            onPress={() => onSelect(i)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${MONTH_LONG[i]}: ${formatMoney(m.incomeMinor)} in, ${formatMoney(m.expenseMinor)} out`}
            className="flex-1 items-center"
          >
            <View
              className={`flex-row items-end justify-center gap-[2px] w-full rounded-lg ${on ? 'bg-muted' : ''}`}
              style={{ height, paddingHorizontal: 2, paddingTop: 4 }}
            >
              <View
                className="bg-success rounded-t-[3px]"
                style={{ width: '40%', height: m.incomeMinor > 0 ? Math.max(2, (m.incomeMinor / top) * (height - 4)) : 0 }}
              />
              <View
                className="bg-primary/70 rounded-t-[3px]"
                style={{ width: '40%', height: m.expenseMinor > 0 ? Math.max(2, (m.expenseMinor / top) * (height - 4)) : 0 }}
              />
            </View>
            <Text
              className={`text-[10px] mt-1.5 ${on ? 'text-foreground font-bold' : 'text-muted-foreground'}`}
              numberOfLines={1}
            >
              {MONTH_SHORT[i]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Insights: a year of Money at a glance — what came in and went out each
 * month, where it went, who paid the most, and what each job earned.
 * Counted on the day money moved, like the rest of Money.
 */
export default function MoneyInsightsScreen() {
  const insets = useSafeAreaInsets();
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  const params = useLocalSearchParams<{ year?: string; month?: string }>();
  const today = todayIso();
  const thisYear = Number(today.slice(0, 4));
  const [year, setYear] = useState(() => {
    const asked = Number(params.year);
    return Number.isInteger(asked) && asked >= FIRST_YEAR && asked <= thisYear ? asked : thisYear;
  });
  const [picked, setPicked] = useState<number | null>(() => {
    const asked = Number(params.month?.slice(5, 7));
    return Number.isInteger(asked) && asked >= 1 && asked <= 12 ? asked - 1 : null;
  });
  const [refreshing, setRefreshing] = useState(false);
  const { insights, isLoading, loadFailed, refetch } = useMoneyInsights(year);
  const { recurring } = useMoneyRecurring();
  const running = recurring.filter((r) => !r.stopped).length;

  // This year opens on this month; a past year on its busiest.
  const selected = useMemo(() => {
    if (picked !== null) return picked;
    if (!insights) return 0;
    if (year === thisYear) return Number(today.slice(5, 7)) - 1;
    let best = 0;
    insights.months.forEach((m, i) => {
      const b = insights.months[best];
      if (m.incomeMinor + m.expenseMinor > b.incomeMinor + b.expenseMinor) best = i;
    });
    return best;
  }, [picked, insights, year, thisYear, today]);

  const switchYear = (next: number) => {
    setYear(next);
    setPicked(null);
  };

  const refresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const y = insights;
  const empty = y ? y.incomeMinor + y.expenseMinor === 0 && y.packages.length === 0 : false;
  const kept = y ? y.incomeMinor - y.expenseMinor : 0;
  const incomeChange = y ? change(y.incomeMinor, y.lastYear.incomeMinor) : null;
  const month = y?.months[selected];

  const byKind = (kind: MoneyKind) => (y ? y.byCategory.filter((c) => c.kind === kind).slice(0, 6) : []);
  const spending = byKind('expense');
  const earning = byKind('income');
  const topSpend = Math.max(1, ...spending.map((c) => c.totalMinor));
  const topEarn = Math.max(1, ...earning.map((c) => c.totalMinor));
  const topClient = Math.max(1, ...(y?.topClients.map((c) => c.totalMinor) ?? []));
  const topJob = Math.max(1, ...(y?.packages.map((p) => Math.max(p.profitMinor, 0)) ?? []));

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <ScreenHeader title="Insights" subtitle="Only you can see this" />
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={palette.primary} />}
      >
        <View className="mt-1 flex-row items-center gap-2">
          <Pressable
            onPress={() => switchYear(Math.max(FIRST_YEAR, year - 1))}
            disabled={year <= FIRST_YEAR}
            accessibilityRole="button"
            accessibilityLabel="Previous year"
            className="w-10 h-10 rounded-xl bg-secondary items-center justify-center active:opacity-70"
          >
            <ChevronLeftIcon size={18} className="text-foreground" />
          </Pressable>
          <Text className="flex-1 text-center text-foreground text-[17px] font-bold" accessibilityRole="header">
            {year}
          </Text>
          <Pressable
            onPress={() => switchYear(Math.min(thisYear, year + 1))}
            disabled={year >= thisYear}
            accessibilityRole="button"
            accessibilityLabel="Next year"
            className="w-10 h-10 rounded-xl bg-secondary items-center justify-center active:opacity-70"
            style={{ opacity: year >= thisYear ? 0.4 : 1 }}
          >
            <ChevronRightIcon size={18} className="text-foreground" />
          </Pressable>
        </View>

        {!y ? (
          isLoading ? (
            <View className="-mx-5 mt-4">
              <CardListSkeleton count={3} />
            </View>
          ) : loadFailed ? (
            <View className="mt-10">
              <LoadFailed what="your insights" onRetry={() => void refetch()} compact />
            </View>
          ) : null
        ) : empty ? (
          <View className="mt-8">
            <EmptyState
              icon={ChartColumnIcon}
              title={`Nothing recorded in ${year}`}
              body="Once money comes in or goes out, this is where you see the year: your best months, where it went, and what each job earned."
            />
          </View>
        ) : (
          <>
            {/* The year so far. */}
            <View className="mt-4 bg-card rounded-3xl border border-border/40 p-5">
              <Text className="text-muted-foreground text-[13px] font-semibold">
                {year === thisYear ? `Kept so far in ${year}` : `Kept in ${year}`}
              </Text>
              <Text
                numberOfLines={1}
                className={`text-[30px] font-bold tracking-tight mt-1 ${kept < 0 ? 'text-destructive' : 'text-foreground'}`}
                style={{ fontVariant: ['tabular-nums'] }}
              >
                {formatMoney(kept)}
              </Text>
              <View className="mt-3 gap-1.5">
                <View className="flex-row justify-between">
                  <Text className="text-muted-foreground text-[14px] font-semibold">In</Text>
                  <Text className="text-success text-[15px] font-bold" style={{ fontVariant: ['tabular-nums'] }}>
                    {formatMoney(y.incomeMinor)}
                  </Text>
                </View>
                <View className="flex-row justify-between">
                  <Text className="text-muted-foreground text-[14px] font-semibold">Out</Text>
                  <Text className="text-foreground text-[15px] font-bold" style={{ fontVariant: ['tabular-nums'] }}>
                    {formatMoney(y.expenseMinor)}
                  </Text>
                </View>
              </View>
              {incomeChange ? (
                <Text className="text-[13px] mt-3 leading-[18px] text-muted-foreground">
                  Income is{' '}
                  <Text className={`font-bold ${incomeChange.up ? 'text-success' : 'text-foreground'}`}>
                    {incomeChange.text}
                  </Text>{' '}
                  on {year - 1}
                  {year === thisYear ? ` to ${shortDate(y.lastYear.through)}` : ''}.
                </Text>
              ) : null}
              {y.withheldMinor > 0 ? (
                <Text className="text-muted-foreground text-xs mt-2 leading-[17px]">
                  {formatMoney(y.withheldMinor)} was withheld by clients as tax. Keep their 2307s.
                </Text>
              ) : null}
            </View>

            {/* Month by month. */}
            <Section title="Month by month">
              <View className="bg-card rounded-2xl px-3 pt-3 pb-2">
                <MonthBars months={y.months} selected={selected} onSelect={setPicked} />
                {month ? (
                  <View className="flex-row items-center justify-between mt-2 px-1">
                    <Text className="text-foreground text-[14px] font-bold">{MONTH_LONG[selected]}</Text>
                    <Text className="text-[13px]" style={{ fontVariant: ['tabular-nums'] }}>
                      <Text className="text-success font-bold">{formatMoney(month.incomeMinor)}</Text>
                      <Text className="text-muted-foreground"> in · </Text>
                      <Text className="text-foreground font-bold">{formatMoney(month.expenseMinor)}</Text>
                      <Text className="text-muted-foreground"> out</Text>
                    </Text>
                  </View>
                ) : null}
                <View className="flex-row gap-4 mt-2 px-1">
                  <View className="flex-row items-center gap-1.5">
                    <View className="w-2.5 h-2.5 rounded-sm bg-success" />
                    <Text className="text-muted-foreground text-[11px]">In</Text>
                  </View>
                  <View className="flex-row items-center gap-1.5">
                    <View className="w-2.5 h-2.5 rounded-sm bg-primary/70" />
                    <Text className="text-muted-foreground text-[11px]">Out</Text>
                  </View>
                </View>
              </View>
            </Section>

            {y.packages.length > 0 ? (
              <Section title="What each job earned">
                {y.packages.map((p, i) => (
                  <ShareRow
                    key={p.id}
                    label={p.title}
                    detail={`${formatMoney(p.receivedMinor)} in${p.costsMinor > 0 ? ` · ${formatMoney(p.costsMinor)} costs` : ''}`}
                    minor={p.profitMinor}
                    share={Math.max(p.profitMinor, 0) / topJob}
                    tone="in"
                    first={i === 0}
                    last={i === y.packages.length - 1}
                    onPress={() => router.push(`/money/packages/${p.id}`)}
                  />
                ))}
              </Section>
            ) : null}

            {y.topClients.length > 0 ? (
              <Section title="Top clients">
                {y.topClients.map((c, i) => (
                  <ShareRow
                    key={c.name}
                    label={c.name}
                    detail={`${c.count} ${c.count === 1 ? 'payment' : 'payments'}`}
                    minor={c.totalMinor}
                    share={c.totalMinor / topClient}
                    tone="in"
                    first={i === 0}
                    last={i === y.topClients.length - 1}
                  />
                ))}
                {y.unnamedIncomeMinor > 0 ? (
                  <Text className="text-muted-foreground text-[12px] mt-2 px-1 leading-[17px]">
                    {formatMoney(y.unnamedIncomeMinor)} of income has no client named. Add one on the entry to see it here.
                  </Text>
                ) : null}
              </Section>
            ) : null}

            {spending.length > 0 ? (
              <Section title="Where it went">
                {spending.map((c, i) => (
                  <ShareRow
                    key={c.category}
                    label={categoryLabel('expense', c.category)}
                    detail={`${Math.round((c.totalMinor / Math.max(1, y.expenseMinor)) * 100)}% of spending`}
                    minor={c.totalMinor}
                    share={c.totalMinor / topSpend}
                    tone="out"
                    icon={categoryIcon('expense', c.category)}
                    first={i === 0}
                    last={i === spending.length - 1}
                  />
                ))}
              </Section>
            ) : null}

            {earning.length > 0 ? (
              <Section title="Where it came from">
                {earning.map((c, i) => (
                  <ShareRow
                    key={c.category}
                    label={categoryLabel('income', c.category)}
                    detail={`${c.count} ${c.count === 1 ? 'entry' : 'entries'}`}
                    minor={c.totalMinor}
                    share={c.totalMinor / topEarn}
                    tone="in"
                    icon={categoryIcon('income', c.category)}
                    first={i === 0}
                    last={i === earning.length - 1}
                  />
                ))}
              </Section>
            ) : null}
          </>
        )}

        {/* What repeats: reachable from here whatever the year shows. */}
        <Pressable
          onPress={() => router.push('/money/recurring')}
          accessibilityRole="button"
          className="mt-6 bg-card rounded-2xl px-4 py-3.5 flex-row items-center gap-3 active:opacity-70"
        >
          <RepeatIcon size={18} className="text-muted-foreground" />
          <View className="flex-1">
            <Text className="text-foreground text-[15px] font-semibold">Repeats every month</Text>
            <Text className="text-muted-foreground text-[13px] mt-0.5">
              {running > 0
                ? `${running} running — subscriptions, rent, retainers`
                : 'Subscriptions, rent, retainers — turn on Repeat on an entry'}
            </Text>
          </View>
          <ChevronRightIcon size={16} className="text-muted-foreground" />
        </Pressable>

        <Text className="mt-8 text-muted-foreground text-[12px] leading-[17px] text-center">
          Counted on the day each was paid, from what you’ve recorded. For planning — not tax advice.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
