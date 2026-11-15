import { useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { MinusIcon, PlusIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import {
  ApiError,
  dayLabel,
  formatMoney,
  savingMonthlyPace,
  savingProgress,
  todayIso,
  type MoneySavingMove,
} from '@/src/api';
import { useDeleteMoneySavingMove, useMoneySaving, useTheme } from '@/src/hooks';
import { DateTile } from '@/components/DateTile';
import { DetailFallback } from '@/components/DetailFallback';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SavingBar, SavingMoveSheet, SavingTile } from '@/components/money/SavingBits';
import { PALETTES } from '@/theme';

for (const Icon of [MinusIcon, PlusIcon]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

const MONTH_SHORT = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

function problem(error: unknown): string {
  return error instanceof ApiError && error.status !== 0 ? error.message : 'Check your connection and try again.';
}

/**
 * One saving: what it holds against what it is for, what that asks of each
 * month, and everything that went in and out.
 *
 * Adding is the filled button, because that is what a saving is for; taking
 * out sits beside it, quieter. Money taken out was spent on something, so the
 * way to record that as an expense is offered straight after.
 */
export default function MoneySavingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  const { saving, moves, error, loadFailed, refetch } = useMoneySaving(id);
  const removeMove = useDeleteMoneySavingMove();
  const [direction, setDirection] = useState<'in' | 'out' | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const today = todayIso();

  if (!saving) {
    return (
      <DetailFallback
        title="Saving"
        what="this saving"
        gone="It was deleted."
        error={error}
        failed={loadFailed}
        onRetry={() => void refetch()}
      />
    );
  }

  const progress = savingProgress(saving);
  const left = saving.goalMinor ? Math.max(saving.goalMinor - saving.balanceMinor, 0) : null;
  const pace = savingMonthlyPace(saving, today);
  const met = left === 0;
  const about = [
    saving.keptIn ? `Kept in ${saving.keptIn}` : null,
    saving.targetDate ? `by ${dayLabel(saving.targetDate, today)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const refresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const askRemove = (move: MoneySavingMove) =>
    Alert.alert(
      'Remove this line?',
      `${move.amountMinor > 0 ? 'Added' : 'Taken out'} ${formatMoney(Math.abs(move.amountMinor))} on ${dayLabel(move.movedOn, today)}. Removing it changes what this saving holds.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () =>
            removeMove.mutate(
              { id: saving.id, moveId: move.id },
              { onError: (err) => Alert.alert("Couldn't remove it", problem(err)) },
            ),
        },
      ],
    );

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <ScreenHeader
        title="Saving"
        right={
          <Pressable
            onPress={() => router.push(`/money/savings/new?edit=${saving.id}`)}
            accessibilityRole="button"
            hitSlop={8}
            className="min-h-11 px-2 justify-center active:opacity-60"
          >
            <Text className="text-primary text-[15px] font-semibold">Edit</Text>
          </Pressable>
        }
      />
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: insets.bottom + 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={palette.primary} />}
      >
        <View className="flex-row items-center gap-3.5">
          <SavingTile saving={saving} size={52} />
          <View className="flex-1 min-w-0">
            <Text
              className="text-foreground text-[24px] leading-[30px] font-bold tracking-tight"
              numberOfLines={2}
              accessibilityRole="header"
            >
              {saving.name}
            </Text>
            {about ? (
              <Text className="text-muted-foreground text-[13px] leading-[18px] mt-0.5" numberOfLines={1}>
                {about}
              </Text>
            ) : null}
          </View>
        </View>

        <View className="rounded-[20px] border border-border/40 bg-card p-5 mt-5">
          <View className="flex-row items-baseline gap-2 flex-wrap">
            <Text
              className="text-foreground text-[26px] leading-8 font-bold tracking-tight"
              style={{ fontVariant: ['tabular-nums'] }}
            >
              {formatMoney(saving.balanceMinor)}
            </Text>
            {saving.goalMinor ? (
              <Text className="text-muted-foreground text-[15px] leading-5" style={{ fontVariant: ['tabular-nums'] }}>
                of {formatMoney(saving.goalMinor)}
              </Text>
            ) : null}
          </View>
          {progress !== null ? (
            <View className="mt-3.5">
              <SavingBar progress={progress} height={8} />
            </View>
          ) : null}
          {saving.goalMinor ? (
            <View className="flex-row gap-4 mt-4 pt-4 border-t border-border/40">
              <View className="flex-1 min-w-0">
                <Text className="text-muted-foreground text-[12px] leading-4">To go</Text>
                <Text
                  className={`text-[17px] leading-6 font-bold mt-0.5 ${met ? 'text-success' : 'text-foreground'}`}
                  style={{ fontVariant: ['tabular-nums'] }}
                >
                  {met ? 'Reached' : formatMoney(left ?? 0)}
                </Text>
              </View>
              {pace !== null ? (
                <View className="flex-1 min-w-0">
                  <Text className="text-muted-foreground text-[12px] leading-4" numberOfLines={1}>
                    Needed each month
                  </Text>
                  <Text
                    className="text-foreground text-[17px] leading-6 font-bold mt-0.5"
                    style={{ fontVariant: ['tabular-nums'] }}
                  >
                    {formatMoney(pace)}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : (
            <Text className="text-muted-foreground text-[13px] leading-[18px] mt-2">
              A running total. Add a goal in Edit to see how far there is to go.
            </Text>
          )}
        </View>

        <View className="flex-row gap-2.5 mt-3">
          <Pressable
            onPress={() => setDirection('in')}
            accessibilityRole="button"
            className="flex-1 h-11 rounded-[14px] bg-action flex-row items-center justify-center gap-2 active:opacity-85"
          >
            <PlusIcon size={18} className="text-action-foreground" />
            <Text className="text-action-foreground text-[15px] font-semibold">Add money</Text>
          </Pressable>
          <Pressable
            onPress={() => setDirection('out')}
            disabled={saving.balanceMinor <= 0}
            accessibilityRole="button"
            accessibilityState={{ disabled: saving.balanceMinor <= 0 }}
            className="h-11 rounded-[14px] bg-secondary flex-row items-center justify-center gap-2 px-5 active:opacity-70"
            style={{ opacity: saving.balanceMinor <= 0 ? 0.45 : 1 }}
          >
            <MinusIcon size={18} className="text-foreground" />
            <Text className="text-foreground text-[15px] font-semibold">Take out</Text>
          </Pressable>
        </View>

        <Text className="text-foreground text-[17px] leading-6 font-bold mt-7 mb-2.5" accessibilityRole="header">
          What went in and out
        </Text>
        {moves.length === 0 ? (
          <View className="rounded-[20px] border border-border/40 bg-card p-4">
            <Text className="text-muted-foreground text-[13px] leading-[19px]">
              Nothing yet. When you put money aside for this, add it here so the total stays true.
            </Text>
          </View>
        ) : (
          moves.map((move, at) => {
            const added = move.amountMinor > 0;
            return (
              <Pressable
                key={move.id}
                onLongPress={() => askRemove(move)}
                accessibilityRole="button"
                accessibilityLabel={`${move.note ?? (added ? 'Added' : 'Taken out')}, ${added ? 'added' : 'taken out'} ${formatMoney(Math.abs(move.amountMinor))}, ${dayLabel(move.movedOn, today)}`}
                accessibilityHint="Hold to remove this line"
                className={`bg-card border-x border-b border-border/40 flex-row items-center gap-3 px-4 py-3 min-h-[68px] active:opacity-70 ${
                  at === 0 ? 'rounded-t-[20px] border-t' : ''
                } ${at === moves.length - 1 ? 'rounded-b-[20px]' : ''}`}
              >
                <DateTile small={MONTH_SHORT[Number(move.movedOn.slice(5, 7)) - 1]} large={move.movedOn.slice(8, 10)} />
                <View className="flex-1 min-w-0">
                  <Text className="text-foreground text-[15px] leading-5 font-semibold" numberOfLines={1}>
                    {move.note ?? (added ? 'Added' : 'Taken out')}
                  </Text>
                  <Text className="text-muted-foreground text-[13px] leading-[18px] mt-0.5" numberOfLines={1}>
                    {added ? 'Added' : 'Taken out'}
                  </Text>
                </View>
                <Text
                  className={`text-[15px] font-semibold ${added ? 'text-success' : 'text-foreground'}`}
                  style={{ fontVariant: ['tabular-nums'] }}
                >
                  {added ? '+' : '−'}
                  {formatMoney(Math.abs(move.amountMinor))}
                </Text>
              </Pressable>
            );
          })
        )}
        {moves.length > 0 ? (
          <Text className="text-muted-foreground text-[12px] leading-[17px] text-center mt-4">
            Hold a line to remove it.
          </Text>
        ) : null}
      </ScrollView>

      <SavingMoveSheet
        saving={saving}
        direction={direction}
        onClose={() => setDirection(null)}
        onMoved={(moved, amountMinor) => {
          if (moved !== 'out') return;
          // Money that left a saving was spent on something, and an expense is
          // what keeps the month's totals true. Offered, never done for them.
          Alert.alert(
            'Record it as an expense too?',
            `${formatMoney(amountMinor)} came out of ${saving.name}. If you spent it on work, record the expense so your totals stay right.`,
            [
              { text: 'Not now', style: 'cancel' },
              { text: 'Record expense', onPress: () => router.push('/money/new?kind=expense') },
            ],
          );
        }}
      />
    </SafeAreaView>
  );
}
