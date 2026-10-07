import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { ChevronRightIcon, WalletIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { formatMoney, monthLabel, type MoneySummary } from '@/src/api';
import { PressableScale } from '@/components/PressableScale';

for (const Icon of [ChevronRightIcon, WalletIcon]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/**
 * The month's money on the Dashboard: in, out, and what clients still owe.
 * Opens the ledger. Before anything has been logged it says what it is for
 * instead of showing three zeros.
 */
export function MoneyCard({ month, summary }: { month: string; summary: MoneySummary | undefined }) {
  if (!summary || (summary.entries === 0 && summary.owedToYouCount === 0 && summary.youOweCount === 0)) {
    return (
      <PressableScale
        onPress={() => router.push('/money')}
        accessibilityRole="button"
        accessibilityLabel="Money. Track what you earn and spend"
        scaleTo={0.98}
        className="bg-card rounded-3xl border border-border/40 p-5 flex-row items-center gap-4"
      >
        <View className="w-11 h-11 rounded-2xl bg-success/15 items-center justify-center">
          <WalletIcon size={20} className="text-success" />
        </View>
        <View className="flex-1">
          <Text className="text-foreground text-base font-semibold">Track your money</Text>
          <Text className="text-muted-foreground text-sm mt-0.5">
            What each shoot earned, what it cost, who still owes
          </Text>
        </View>
        <ChevronRightIcon size={18} className="text-muted-foreground" />
      </PressableScale>
    );
  }

  const kept = summary.incomeMinor - summary.expenseMinor;
  return (
    <PressableScale
      onPress={() => router.push('/money')}
      accessibilityRole="button"
      accessibilityLabel={`Money in ${monthLabel(month)}: ${formatMoney(summary.incomeMinor)} in, ${formatMoney(summary.expenseMinor)} out`}
      scaleTo={0.98}
      className="bg-card rounded-3xl border border-border/40 p-5"
    >
      <View className="flex-row items-center justify-between">
        <Text className="text-muted-foreground text-[13px] font-semibold">Money · {monthLabel(month)}</Text>
        <ChevronRightIcon size={17} className="text-muted-foreground" />
      </View>
      <View className="flex-row gap-3 mt-2">
        {[
          { label: 'In', minor: summary.incomeMinor, className: 'text-success' },
          { label: 'Out', minor: summary.expenseMinor, className: 'text-foreground' },
          { label: 'Kept', minor: kept, className: kept < 0 ? 'text-destructive' : 'text-foreground' },
        ].map((f) => (
          <View key={f.label} className="flex-1 min-w-0">
            <Text className="text-muted-foreground text-xs">{f.label}</Text>
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              className={`text-[18px] font-bold tracking-tight ${f.className}`}
              style={{ fontVariant: ['tabular-nums'] }}
            >
              {formatMoney(f.minor)}
            </Text>
          </View>
        ))}
      </View>
      {summary.owedToYouMinor > 0 ? (
        <View className="mt-3 rounded-xl bg-warning/10 px-3 py-2">
          <Text className="text-foreground text-[13px] font-semibold">
            {formatMoney(summary.owedToYouMinor)} still owed to you
          </Text>
        </View>
      ) : null}
    </PressableScale>
  );
}
