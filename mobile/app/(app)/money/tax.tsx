import { useState, type ReactNode } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import {
  CalendarClockIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleCheckIcon,
  CircleIcon,
  InfoIcon,
  LandmarkIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import {
  ApiError,
  dayLabel,
  formatMoney,
  TAX_FORM_LABELS,
  todayIso,
  type MoneyTax,
  type MoneyTaxOption,
} from '@/src/api';
import { useMark2307, useMoneyTax, useTheme } from '@/src/hooks';
import { CardListSkeleton, ScreenHeader } from '@/components';
import { LoadFailed } from '@/components/LoadFailed';
import { PALETTES } from '@/theme';

for (const Icon of [
  CalendarClockIcon, ChevronLeftIcon, ChevronRightIcon, CircleCheckIcon, CircleIcon, InfoIcon, LandmarkIcon,
]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

const FIRST_YEAR = 2000;

const OPTIONS: { key: 'eightPercent' | 'osd' | 'itemized'; title: string; note: string }[] = [
  {
    key: 'eightPercent',
    title: '8% of gross',
    note: 'Only if you have no salary from an employer. Chosen on your first quarterly return, for the whole year. Replaces the 3% percentage tax.',
  },
  {
    key: 'osd',
    title: 'Graduated + OSD',
    note: '40% of gross is deducted for you, and expenses need no receipts. Plus 3% percentage tax.',
  },
  {
    key: 'itemized',
    title: 'Graduated + itemized',
    note: 'Your recorded expenses are deducted — each needs a receipt. Plus 3% percentage tax.',
  },
];

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

/** A figure on an estimate; `minus` for what comes off. */
function Line({ label, minor, strong, minus }: { label: string; minor: number; strong?: boolean; minus?: boolean }) {
  return (
    <View className="flex-row justify-between gap-3">
      <Text className={`flex-1 text-[13px] ${strong ? 'text-foreground font-bold' : 'text-muted-foreground'}`}>
        {label}
      </Text>
      <Text
        numberOfLines={1}
        className={`text-[13px] text-foreground ${strong ? 'font-bold' : 'font-semibold'}`}
        style={{ fontVariant: ['tabular-nums'] }}
      >
        {minus ? '−' : ''}
        {formatMoney(minor)}
      </Text>
    </View>
  );
}

function OptionCard({
  title,
  note,
  option,
  withheldMinor,
  lowest,
}: {
  title: string;
  note: string;
  option: MoneyTaxOption;
  withheldMinor: number;
  lowest: boolean;
}) {
  return (
    <View className={`bg-card rounded-2xl p-4 ${lowest ? 'border border-primary' : 'border border-border/40'}`}>
      <View className="flex-row items-center justify-between gap-2">
        <Text className="text-foreground text-[15px] font-bold flex-1">{title}</Text>
        {lowest ? (
          <View className="rounded-full bg-primary/15 px-2.5 py-1">
            <Text className="text-primary text-[11px] font-bold">Lowest on these numbers</Text>
          </View>
        ) : null}
      </View>
      <Text
        className="text-foreground text-[24px] font-bold tracking-tight mt-2"
        style={{ fontVariant: ['tabular-nums'] }}
      >
        {formatMoney(option.totalMinor)}
      </Text>
      <View className="gap-1 mt-2">
        <Line label="Income tax" minor={option.incomeTaxMinor} />
        {option.percentageTaxMinor > 0 ? <Line label="Percentage tax (3%)" minor={option.percentageTaxMinor} /> : null}
        {withheldMinor > 0 && option.incomeTaxMinor > 0 ? (
          <Line label="Withheld by clients" minor={Math.min(withheldMinor, option.incomeTaxMinor)} minus />
        ) : null}
        <Line label="Still to pay" minor={option.stillToPayMinor} strong />
        {option.excessCreditMinor > 0 ? (
          <Text className="text-muted-foreground text-[12px] mt-1 leading-[17px]">
            {formatMoney(option.excessCreditMinor)} more was withheld than this income tax — a credit to ask your accountant about.
          </Text>
        ) : null}
      </View>
      <Text className="text-muted-foreground text-[12px] mt-3 leading-[17px]">{note}</Text>
    </View>
  );
}

/** Gross receipts against the ₱3M line where VAT begins. */
function Meter({ tax }: { tax: MoneyTax }) {
  const share = Math.min(1, tax.grossMinor / tax.threshold.limitMinor);
  const { status } = tax.threshold;
  return (
    <View className="bg-card rounded-3xl border border-border/40 p-5">
      <Text className="text-muted-foreground text-[13px] font-semibold">Gross receipts</Text>
      <Text
        className="text-foreground text-[28px] font-bold tracking-tight mt-1"
        style={{ fontVariant: ['tabular-nums'] }}
        numberOfLines={1}
      >
        {formatMoney(tax.grossMinor)}
      </Text>
      <Text className="text-muted-foreground text-[12px]">of the {formatMoney(tax.threshold.limitMinor)} line</Text>
      <View className="h-2.5 rounded-full bg-muted mt-3 overflow-hidden">
        <View
          className={`h-full rounded-full ${status === 'under' ? 'bg-success' : status === 'near' ? 'bg-warning' : 'bg-destructive'}`}
          style={{ width: `${Math.max(1, Math.round(share * 100))}%` }}
        />
      </View>
      <Text
        className={`text-[13px] mt-3 leading-[18px] ${status === 'under' ? 'text-muted-foreground' : status === 'near' ? 'text-warning font-semibold' : 'text-destructive font-semibold'}`}
      >
        {status === 'under'
          ? 'Under ₱3M, so the 8% rate is open to you.'
          : status === 'near'
            ? 'Close to ₱3M. Above it you would register for VAT, and the 8% rate is no longer an option — talk to your accountant.'
            : 'Over ₱3M. You would register for VAT, so the estimates below do not apply — talk to your accountant.'}
      </Text>
    </View>
  );
}

/**
 * Tax help: what a self-employed creative's returns are made from — gross
 * against the ₱3M line, three estimates side by side, the 2307s to collect,
 * and when each return is due. Estimates for planning, never advice, and the
 * screen says so before anything else.
 */
export default function MoneyTaxScreen() {
  const insets = useSafeAreaInsets();
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  const params = useLocalSearchParams<{ year?: string }>();
  const today = todayIso();
  const thisYear = Number(today.slice(0, 4));
  const [year, setYear] = useState(() => {
    const asked = Number(params.year);
    return Number.isInteger(asked) && asked >= FIRST_YEAR && asked <= thisYear ? asked : thisYear;
  });
  const [refreshing, setRefreshing] = useState(false);
  const { tax, isLoading, loadFailed, refetch } = useMoneyTax(year);
  const mark = useMark2307();

  const refresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const toggle2307 = (entryIds: string[], received: boolean) =>
    mark.mutate(
      { entryIds, received },
      {
        onError: (err) =>
          Alert.alert(
            "Couldn't save that",
            err instanceof ApiError && err.status !== 0 ? err.message : 'Check your connection and try again.',
          ),
      },
    );

  const upcoming = tax?.deadlines.filter((d) => d.dueOn >= today) ?? [];
  const next = upcoming[0]?.dueOn;
  const missing = tax?.form2307.filter((g) => !g.received).length ?? 0;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <ScreenHeader title="Tax help" subtitle="Estimates for planning — not tax advice" />
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={palette.primary} />}
      >
        {/* Said before any number. */}
        <View className="mt-1 flex-row gap-3 rounded-2xl bg-secondary p-4">
          <InfoIcon size={18} className="text-foreground mt-0.5" />
          <Text className="flex-1 text-foreground text-[13px] leading-[19px]">
            These are estimates from what you&apos;ve recorded, to plan with. They are not tax advice — have your
            accountant check them before you file. Virgo doesn&apos;t file returns.
          </Text>
        </View>

        <View className="mt-4 flex-row items-center gap-2">
          <Pressable
            onPress={() => setYear((y) => Math.max(FIRST_YEAR, y - 1))}
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
            onPress={() => setYear((y) => Math.min(thisYear, y + 1))}
            disabled={year >= thisYear}
            accessibilityRole="button"
            accessibilityLabel="Next year"
            className="w-10 h-10 rounded-xl bg-secondary items-center justify-center active:opacity-70"
            style={{ opacity: year >= thisYear ? 0.4 : 1 }}
          >
            <ChevronRightIcon size={18} className="text-foreground" />
          </Pressable>
        </View>

        {!tax ? (
          isLoading ? (
            <View className="-mx-5 mt-4">
              <CardListSkeleton count={3} />
            </View>
          ) : loadFailed ? (
            <View className="mt-10">
              <LoadFailed what="your tax summary" onRetry={() => void refetch()} compact />
            </View>
          ) : null
        ) : (
          <>
            <View className="mt-4">
              <Meter tax={tax} />
            </View>

            <Section title={year === thisYear ? `Estimates on ${year} so far` : `Estimates for ${year}`}>
              {tax.estimates ? (
                <View className="gap-3">
                  <Text className="text-muted-foreground text-[12px] px-1 leading-[17px]">
                    On {formatMoney(tax.grossMinor)} gross and {formatMoney(tax.expenseMinor)} of expenses
                    {year === thisYear ? ' recorded so far. If more comes in, these go up.' : ` in ${year}.`}
                  </Text>
                  {OPTIONS.map((o) => (
                    <OptionCard
                      key={o.key}
                      title={o.title}
                      note={o.note}
                      option={tax.estimates![o.key]}
                      withheldMinor={tax.withheldMinor}
                      lowest={tax.estimates!.lowest === o.key}
                    />
                  ))}
                </View>
              ) : (
                <Text className="text-muted-foreground text-[13px] px-1 leading-[19px]">
                  Above ₱3M none of these apply. Your accountant can work out VAT and income tax with you.
                </Text>
              )}
            </Section>

            <Section title="By quarter">
              <View className="bg-card rounded-2xl px-4 py-2">
                <View className="flex-row py-2 border-b border-border">
                  <Text className="w-10 text-muted-foreground text-[11px] font-bold"> </Text>
                  <Text className="flex-1 text-right text-muted-foreground text-[11px] font-bold">Gross</Text>
                  <Text className="flex-1 text-right text-muted-foreground text-[11px] font-bold">Expenses</Text>
                  <Text className="flex-1 text-right text-muted-foreground text-[11px] font-bold">Withheld</Text>
                </View>
                {tax.quarters.map((q) => (
                  <View key={q.quarter} className="flex-row py-2.5">
                    <Text className="w-10 text-foreground text-[13px] font-bold">Q{q.quarter}</Text>
                    {[q.grossMinor, q.expenseMinor, q.withheldMinor].map((v, i) => (
                      <Text
                        key={i}
                        numberOfLines={1}
                        className="flex-1 text-right text-foreground text-[13px]"
                        style={{ fontVariant: ['tabular-nums'] }}
                      >
                        {formatMoney(v)}
                      </Text>
                    ))}
                  </View>
                ))}
              </View>
            </Section>

            <Section title={missing > 0 ? `Forms 2307 · ${missing} to collect` : 'Forms 2307'}>
              <Text className="text-muted-foreground text-[12px] px-1 mb-2 leading-[17px]">
                A company client who keeps tax from your fee owes you a BIR Form 2307 for each quarter. It is how
                you claim that tax. Tick each one when you have it.
              </Text>
              {tax.form2307.length === 0 ? (
                <Text className="text-muted-foreground text-[13px] px-1 leading-[19px]">
                  No tax withheld in {year}. When a client keeps part of a fee, enter it as Tax withheld on the income.
                </Text>
              ) : (
                <View>
                  {tax.form2307.map((g, i) => {
                    const last = i === tax.form2307.length - 1;
                    const ids = g.entries.map((e) => e.id);
                    return (
                      <Pressable
                        key={`${g.client ?? ''}-${g.quarter}`}
                        onPress={() => toggle2307(ids, !g.received)}
                        disabled={mark.isPending}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: g.received }}
                        aria-checked={g.received}
                        accessibilityLabel={`${g.client ?? 'No client named'}, Q${g.quarter}: ${formatMoney(g.withheldMinor)} withheld`}
                        className={`bg-card flex-row items-center gap-3 px-4 py-3 min-h-[60px] active:opacity-70 ${
                          i === 0 ? 'rounded-t-2xl' : ''
                        } ${last ? 'rounded-b-2xl' : 'border-b border-border'}`}
                      >
                        {g.received ? (
                          <CircleCheckIcon size={22} className="text-success" />
                        ) : (
                          <CircleIcon size={22} className="text-muted-foreground" />
                        )}
                        <View className="flex-1 min-w-0">
                          <Text className="text-foreground text-[15px] font-semibold" numberOfLines={1}>
                            {g.client ?? 'No client named'} · Q{g.quarter}
                          </Text>
                          <Text className="text-muted-foreground text-[12px] mt-0.5" numberOfLines={1}>
                            {formatMoney(g.withheldMinor)} withheld on {formatMoney(g.grossMinor)}
                            {g.entries.length > 1 ? ` · ${g.entries.length} payments` : ''}
                          </Text>
                        </View>
                        <Text className={`text-[12px] font-bold ${g.received ? 'text-success' : 'text-warning'}`}>
                          {g.received ? 'Have it' : 'Missing'}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </Section>

            <Section title="When returns are due">
              <View>
                {tax.deadlines.map((d, i) => {
                  const past = d.dueOn < today;
                  const isNext = d.dueOn === next;
                  return (
                    <View
                      key={`${d.form}-${d.period}`}
                      className={`bg-card flex-row items-center gap-3 px-4 py-3 ${i === 0 ? 'rounded-t-2xl' : ''} ${
                        i === tax.deadlines.length - 1 ? 'rounded-b-2xl' : 'border-b border-border'
                      }`}
                      style={{ opacity: past ? 0.5 : 1 }}
                    >
                      {d.form === '1701A' ? (
                        <LandmarkIcon size={18} className={isNext ? 'text-primary' : 'text-muted-foreground'} />
                      ) : (
                        <CalendarClockIcon size={18} className={isNext ? 'text-primary' : 'text-muted-foreground'} />
                      )}
                      <View className="flex-1 min-w-0">
                        <Text className="text-foreground text-[14px] font-semibold" numberOfLines={1}>
                          {TAX_FORM_LABELS[d.form]} ({d.form}) · {d.period}
                        </Text>
                        <Text className="text-muted-foreground text-[12px] mt-0.5" numberOfLines={1}>
                          {d.who === 'graduated' ? 'Only on the graduated rates' : 'Everyone'}
                        </Text>
                      </View>
                      <View className="items-end">
                        {isNext ? <Text className="text-primary text-[11px] font-bold">Next</Text> : null}
                        <Text className={`text-[13px] ${isNext ? 'text-foreground font-bold' : 'text-muted-foreground'}`}>
                          {dayLabel(d.dueOn)}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
              <Text className="text-muted-foreground text-[12px] px-1 mt-2 leading-[17px]">
                A deadline on a weekend moves to the Monday. Holidays can move them too — check the BIR&apos;s
                announcements.
              </Text>
            </Section>
          </>
        )}

        <Pressable
          onPress={() => router.push(`/money/insights?year=${year}`)}
          accessibilityRole="button"
          className="mt-8 self-center min-h-10 justify-center active:opacity-60"
        >
          <Text className="text-primary text-[13px] font-bold">See {year} in Insights</Text>
        </Pressable>

        <Text className="mt-4 text-muted-foreground text-[12px] leading-[17px] text-center">
          A summary for you and your accountant, counted on the day each payment moved. Virgo doesn&apos;t file or
          certify returns, and this isn&apos;t a book of accounts.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
