import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { PlusIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { formatMoney, monthLabel, savingProgress, type MoneySaving } from '@/src/api';
import { useMoneySavings, useTheme } from '@/src/hooks';
import { CardListSkeleton } from '@/components';
import { LoadFailed } from '@/components/LoadFailed';
import { PressableScale } from '@/components/PressableScale';
import { SavingBar, SavingTile } from '@/components/money/SavingBits';
import { PALETTES } from '@/theme';

cssInterop(PlusIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * What stands under a saving's amount: how far there is to go. `dated` adds
 * by when, for a screen reader; half a phone's width has no room for it, and
 * the saving's own screen says it.
 */
export function savingLine(saving: MoneySaving, today: string, dated = false): string {
  if (!saving.goalMinor) return 'No goal set';
  const left = saving.goalMinor - saving.balanceMinor;
  if (left <= 0) return 'Goal reached';
  const by =
    dated && saving.targetDate
      ? `, by ${MONTH_NAMES[Number(saving.targetDate.slice(5, 7)) - 1]}${
          saving.targetDate.slice(0, 4) === today.slice(0, 4) ? '' : ` ${saving.targetDate.slice(0, 4)}`
        }`
      : '';
  return `${formatMoney(left)} to go${by}`;
}

function SavingCard({ saving, today }: { saving: MoneySaving; today: string }) {
  const progress = savingProgress(saving);
  return (
    <PressableScale
      onPress={() => router.push(`/money/savings/${saving.id}`)}
      scaleTo={0.97}
      accessibilityRole="button"
      accessibilityLabel={`${saving.name}, ${formatMoney(saving.balanceMinor)}. ${savingLine(saving, today, true)}`}
      className="h-[172px] rounded-[20px] border border-border/40 bg-card p-4"
    >
      <SavingTile saving={saving} />
      <Text className="text-foreground text-[15px] leading-5 font-semibold mt-3" numberOfLines={1}>
        {saving.name}
      </Text>
      <Text
        className="text-foreground text-[20px] leading-[26px] font-bold tracking-tight mt-0.5"
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
        style={{ fontVariant: ['tabular-nums'] }}
      >
        {formatMoney(saving.balanceMinor)}
      </Text>
      <View className="flex-1" />
      {progress !== null ? (
        <View className="mt-2.5">
          <SavingBar progress={progress} />
        </View>
      ) : null}
      <Text className="text-muted-foreground text-[12px] leading-4 mt-2" numberOfLines={1}>
        {savingLine(saving, today)}
      </Text>
    </PressableScale>
  );
}

/**
 * Savings: everything being put aside, and what is left that is not.
 *
 * As many as the person wants, two across. The total leads; under it, what
 * went in this month and what of the month's money has no job yet. Virgo
 * holds none of it, which is said once, at the bottom, in plain words.
 */
export function SavingsPage({
  month,
  today,
  keptMinor,
}: {
  /** The month Money is on, YYYY-MM: what "this month" means here. */
  month: string;
  today: string;
  /** In less out for that month; null while it is not known. */
  keptMinor: number | null;
}) {
  const insets = useSafeAreaInsets();
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  const { savings, totalMinor, monthMinor, isLoading, loadFailed, refetch } = useMoneySavings(month);
  const [refreshing, setRefreshing] = useState(false);
  const refresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const add = () => router.push('/money/savings/new');
  const thisMonth = month === today.slice(0, 7);
  const free = keptMinor === null ? null : keptMinor - monthMinor;

  if (isLoading && savings.length === 0) {
    return (
      <View className="mt-4">
        <CardListSkeleton count={3} />
      </View>
    );
  }
  if (loadFailed && savings.length === 0) {
    return (
      <View className="mt-10">
        <LoadFailed what="your savings" onRetry={() => void refetch()} />
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: insets.bottom + 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={palette.primary} />}
    >
      {savings.length === 0 ? (
        // Nothing yet: what it is for, and the one thing to do about it.
        <View className="rounded-[20px] border border-border/40 bg-card p-5">
          <Text className="text-foreground text-[24px] leading-[30px] font-bold tracking-tight" accessibilityRole="header">
            Put some aside
          </Text>
          <Text className="text-muted-foreground text-[15px] leading-[22px] mt-2">
            For the next lens, the tax bill, the slow months. Make as many as you like, and move a share into them
            whenever a client pays.
          </Text>
          <Pressable
            onPress={add}
            accessibilityRole="button"
            className="h-11 rounded-[14px] bg-action flex-row items-center justify-center gap-2 mt-5 active:opacity-85"
          >
            <PlusIcon size={18} className="text-action-foreground" />
            <Text className="text-action-foreground text-[15px] font-semibold">New saving</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <View className="rounded-[20px] border border-border/40 bg-card p-5">
            <Text className="text-muted-foreground text-[13px] leading-[18px] font-semibold">Set aside</Text>
            <Text
              className="text-foreground text-[26px] leading-8 font-bold tracking-tight mt-0.5"
              style={{ fontVariant: ['tabular-nums'] }}
              accessibilityRole="header"
            >
              {formatMoney(totalMinor)}
            </Text>
            <View className="flex-row gap-4 mt-4 pt-4 border-t border-border/40">
              <View className="flex-1 min-w-0">
                <Text className="text-muted-foreground text-[12px] leading-4" numberOfLines={1}>
                  {thisMonth ? 'Added this month' : `Added in ${monthLabel(month, today)}`}
                </Text>
                <Text
                  className={`text-[17px] leading-6 font-bold mt-0.5 ${monthMinor > 0 ? 'text-success' : 'text-foreground'}`}
                  numberOfLines={1}
                  style={{ fontVariant: ['tabular-nums'] }}
                >
                  {monthMinor > 0 ? '+' : ''}
                  {formatMoney(monthMinor)}
                </Text>
              </View>
              {free !== null ? (
                <View className="flex-1 min-w-0">
                  <Text className="text-muted-foreground text-[12px] leading-4" numberOfLines={1}>
                    Kept, not set aside
                  </Text>
                  <Text
                    className="text-foreground text-[17px] leading-6 font-bold mt-0.5"
                    numberOfLines={1}
                    style={{ fontVariant: ['tabular-nums'] }}
                  >
                    {formatMoney(Math.max(free, 0))}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>

          <View className="flex-row flex-wrap mt-3" style={{ marginHorizontal: -6 }}>
            {savings.map((saving) => (
              <View key={saving.id} style={{ width: '50%', padding: 6 }}>
                <SavingCard saving={saving} today={today} />
              </View>
            ))}
            <View style={{ width: '50%', padding: 6 }}>
              <PressableScale
                onPress={add}
                scaleTo={0.97}
                accessibilityRole="button"
                accessibilityLabel="New saving"
                className="h-[172px] rounded-[20px] border border-dashed border-border items-center justify-center gap-2"
              >
                <View className="w-10 h-10 rounded-xl bg-muted items-center justify-center">
                  <PlusIcon size={18} className="text-foreground" />
                </View>
                <Text className="text-foreground text-[15px] font-semibold">New saving</Text>
              </PressableScale>
            </View>
          </View>
        </>
      )}

      <Text className="text-muted-foreground text-[12px] leading-[17px] text-center mt-6 px-2">
        Virgo doesn’t hold your money. These are your own notes of what you’ve put aside, wherever you keep it.
      </Text>
    </ScrollView>
  );
}
