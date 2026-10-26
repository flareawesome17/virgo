import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { ChevronRightIcon, WalletIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { formatMoney } from '@/src/api';
import { useTheme } from '@/src/hooks';
import { PALETTES } from '@/theme';

for (const Icon of [ChevronRightIcon, WalletIcon]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/** One month of money: `month` is "2026-10", amounts in centavos. */
export interface MoneyMonth {
  month: string;
  incomeMinor: number;
  expenseMinor: number;
}

const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthName = (key: string) => SHORT[Number(key.slice(5, 7)) - 1] ?? key;

/** Tall enough to tell a good month from a quiet one, short enough to stay a glance. */
const CHART_HEIGHT = 64;

/**
 * The last six months of money on the Dashboard: in and out side by side,
 * month by month, and what this month kept.
 *
 * It replaced a single line for the current month, which could say October was
 * good but not whether that was usual. Bars rather than a line: six months is
 * six things to compare, not a trend to read off a slope. Scaled to the
 * biggest figure in the six, so a quiet month looks quiet.
 *
 * Nothing recorded in any of them shows the invitation to start instead.
 */
export function MoneyTrendCard({ months }: { months: MoneyMonth[] }) {
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  const income = palette.success;
  // The muted ink at about a third: present beside income, never louder.
  const expense = `${palette.mutedForeground}59`;

  const peak = Math.max(1, ...months.flatMap((m) => [m.incomeMinor, m.expenseMinor]));
  const empty = months.every((m) => m.incomeMinor === 0 && m.expenseMinor === 0);
  const current = months[months.length - 1];
  const kept = current ? current.incomeMinor - current.expenseMinor : 0;

  if (empty || !current) {
    return (
      <Pressable
        onPress={() => router.push('/money')}
        accessibilityRole="button"
        accessibilityLabel="Money. Track what you earn and spend"
        className="bg-card rounded-2xl border border-border/40 px-4 py-3.5 flex-row items-center gap-3 active:opacity-90"
      >
        <View className="w-9 h-9 rounded-xl bg-success/15 items-center justify-center">
          <WalletIcon size={17} className="text-success" />
        </View>
        <View className="flex-1 min-w-0">
          <Text className="text-foreground text-sm font-semibold">Track your money</Text>
          <Text className="text-muted-foreground text-xs mt-0.5" numberOfLines={1}>
            What each shoot earned, what it cost, who still owes
          </Text>
        </View>
        <ChevronRightIcon size={16} className="text-muted-foreground" />
      </Pressable>
    );
  }

  const summary = months
    .map((m) => `${monthName(m.month)}: in ${formatMoney(m.incomeMinor)}, out ${formatMoney(m.expenseMinor)}`)
    .join('. ');

  return (
    <Pressable
      onPress={() => router.push('/money')}
      accessibilityRole="button"
      accessibilityLabel={`Money, last six months. ${summary}. ${formatMoney(kept)} kept in ${monthName(current.month)}.`}
      className="bg-card rounded-2xl border border-border/40 p-4 active:opacity-90"
    >
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-3">
          <View className="flex-row items-center gap-1.5">
            <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: income }} />
            <Text className="text-muted-foreground text-xs">In</Text>
          </View>
          <View className="flex-row items-center gap-1.5">
            <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: expense }} />
            <Text className="text-muted-foreground text-xs">Out</Text>
          </View>
        </View>
        <Text className={`text-sm font-bold ${kept < 0 ? 'text-destructive' : 'text-foreground'}`}>
          {formatMoney(kept)}
          <Text className="text-muted-foreground text-xs font-medium"> kept in {monthName(current.month)}</Text>
        </Text>
      </View>

      <View className="flex-row items-end mt-3" style={{ height: CHART_HEIGHT, gap: 8 }}>
        {months.map((m) => (
          <View key={m.month} className="flex-1 flex-row items-end h-full" style={{ gap: 2 }}>
            <View
              style={{
                flex: 1,
                height: m.incomeMinor > 0 ? Math.max((m.incomeMinor / peak) * CHART_HEIGHT, 2) : 0,
                backgroundColor: income,
                borderTopLeftRadius: 3,
                borderTopRightRadius: 3,
              }}
            />
            <View
              style={{
                flex: 1,
                height: m.expenseMinor > 0 ? Math.max((m.expenseMinor / peak) * CHART_HEIGHT, 2) : 0,
                backgroundColor: expense,
                borderTopLeftRadius: 3,
                borderTopRightRadius: 3,
              }}
            />
          </View>
        ))}
      </View>
      <View className="h-px bg-border/60" />
      <View className="flex-row mt-1.5" style={{ gap: 8 }}>
        {months.map((m) => (
          <Text key={m.month} className="flex-1 text-center text-muted-foreground text-[11px]">
            {monthName(m.month)}
          </Text>
        ))}
      </View>
    </Pressable>
  );
}
