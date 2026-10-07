import { useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { RepeatIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import {
  ApiError,
  categoryLabel,
  dayLabel,
  dayOfMonthLabel,
  minorToPesos,
  pesosToMinor,
  type MoneyRecurring,
} from '@/src/api';
import { useMoneyRecurring, useStopMoneyRecurring, useTheme, useUpdateMoneyRecurring } from '@/src/hooks';
import { CardListSkeleton, EmptyState, ScreenHeader } from '@/components';
import { LoadFailed } from '@/components/LoadFailed';
import { KEYBOARD_DONE } from '@/components/KeyboardDoneBar';
import { categoryIcon } from '@/components/money/icons';
import { signedAmount } from '@/components/money/MoneyRow';
import { PALETTES } from '@/theme';

cssInterop(RepeatIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

function message(err: unknown, fallback: string): string {
  return err instanceof ApiError && err.status !== 0 ? err.message : fallback;
}

/** One repeating entry; tapped open to change its amount or stop it. */
function RecurringRow({
  item,
  first,
  last,
  open,
  onToggle,
}: {
  item: MoneyRecurring;
  first: boolean;
  last: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const update = useUpdateMoneyRecurring();
  const stop = useStopMoneyRecurring();
  const [amount, setAmount] = useState(() => minorToPesos(item.amountMinor));
  const Icon = categoryIcon(item.kind, item.category);
  const income = item.kind === 'income';
  const title = item.counterparty || categoryLabel(item.kind, item.category);
  const detail = item.stopped
    ? 'Stopped'
    : `Every month on ${dayOfMonthLabel(item.dayOfMonth)} · next ${dayLabel(item.nextOn)}`;

  const saveAmount = () => {
    const amountMinor = pesosToMinor(amount);
    if (!amountMinor) {
      Alert.alert('Enter an amount', 'Type it in pesos, like 1500 or 350.50.');
      return;
    }
    if (income && amountMinor < item.withheldMinor) {
      Alert.alert('Check the amount', "It can't be less than the tax the client withholds each month.");
      return;
    }
    update.mutate(
      { id: item.id, amountMinor },
      {
        onSuccess: onToggle,
        onError: (err) => Alert.alert("Couldn't save it", message(err, 'Please try again.')),
      },
    );
  };

  const confirmStop = () =>
    Alert.alert(
      'Stop repeating?',
      'No more entries are made from it. The ones already made stay in your Money.',
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Stop',
          style: 'destructive',
          onPress: () =>
            stop.mutate(item.id, {
              onError: (err) => Alert.alert("Couldn't stop it", message(err, 'Please try again.')),
            }),
        },
      ],
    );

  return (
    <View className={`bg-card ${first ? 'rounded-t-2xl' : ''} ${last ? 'rounded-b-2xl' : 'border-b border-border'}`}>
      <Pressable
        onPress={item.stopped ? undefined : onToggle}
        disabled={item.stopped}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${title}, ${signedAmount(item.kind, item.amountMinor)}, ${detail}`}
        className="flex-row items-center gap-3 pl-4 pr-3 py-3 min-h-[60px] active:opacity-70"
        style={{ opacity: item.stopped ? 0.55 : 1 }}
      >
        <View className={`w-9 h-9 rounded-xl items-center justify-center ${income ? 'bg-success/15' : 'bg-primary/10'}`}>
          <Icon size={16} className={income ? 'text-success' : 'text-primary'} />
        </View>
        <View className="flex-1 min-w-0">
          <Text className="text-foreground text-[15px] font-semibold" numberOfLines={1}>
            {title}
          </Text>
          <Text className="text-muted-foreground text-[13px] mt-0.5" numberOfLines={1}>
            {detail}
          </Text>
        </View>
        <Text
          className={`text-[15px] font-bold ${income ? 'text-success' : 'text-foreground'}`}
          style={{ fontVariant: ['tabular-nums'] }}
        >
          {signedAmount(item.kind, item.amountMinor)}
        </Text>
      </Pressable>
      {open ? (
        <View className="px-4 pb-4 gap-3">
          <View className="flex-row items-center gap-2">
            <View className="flex-1 min-w-0 bg-background rounded-xl px-3 flex-row items-center gap-1.5">
              <Text className="text-muted-foreground text-base font-semibold">₱</Text>
              <TextInput
                value={amount}
                onChangeText={setAmount}
                keyboardType="decimal-pad"
                inputAccessoryViewID={KEYBOARD_DONE}
                accessibilityLabel="Amount each month, in pesos"
                className="flex-1 min-w-0 text-foreground text-base py-2.5"
              />
            </View>
            <Pressable
              onPress={saveAmount}
              disabled={update.isPending}
              accessibilityRole="button"
              className="min-h-11 px-4 rounded-xl bg-action items-center justify-center active:opacity-80"
              style={{ opacity: update.isPending ? 0.6 : 1 }}
            >
              <Text className="text-white text-[14px] font-bold">{update.isPending ? 'Saving…' : 'Save'}</Text>
            </Pressable>
          </View>
          <Text className="text-muted-foreground text-[12px] leading-[17px]">
            A new amount applies from the next one. Entries already made stay as they are — edit those in Money.
          </Text>
          <Pressable
            onPress={confirmStop}
            disabled={stop.isPending}
            accessibilityRole="button"
            className="self-start min-h-10 justify-center active:opacity-60"
          >
            <Text className="text-destructive text-[14px] font-semibold">
              {stop.isPending ? 'Stopping…' : 'Stop repeating'}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

/**
 * What repeats every month: the subscription, the rent, a retainer. Each
 * makes an ordinary entry on its day — an expense as paid, income as due.
 * Started from an entry, with Repeat every month.
 */
export default function MoneyRecurringScreen() {
  const insets = useSafeAreaInsets();
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  const { recurring, isLoading, loadFailed, refetch } = useMoneyRecurring();
  const [open, setOpen] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const running = recurring.filter((r) => !r.stopped);
  const stopped = recurring.filter((r) => r.stopped);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <ScreenHeader title="Repeats every month" subtitle="Made on their day, once" />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={palette.primary} />}
      >
        {isLoading ? (
          <View className="-mx-5 mt-2">
            <CardListSkeleton count={3} />
          </View>
        ) : loadFailed && recurring.length === 0 ? (
          <View className="mt-10">
            <LoadFailed what="what repeats" onRetry={() => void refetch()} compact />
          </View>
        ) : recurring.length === 0 ? (
          <View className="mt-8">
            <EmptyState
              icon={RepeatIcon}
              title="Nothing repeats yet"
              body="Open an entry that comes every month — a subscription, your studio rent, a retainer — and turn on Repeat every month. Money adds it on its day."
            />
          </View>
        ) : (
          <>
            {running.length > 0 ? (
              <View className="mt-3">
                {running.map((item, i) => (
                  <RecurringRow
                    key={item.id}
                    item={item}
                    first={i === 0}
                    last={i === running.length - 1}
                    open={open === item.id}
                    onToggle={() => setOpen((current) => (current === item.id ? null : item.id))}
                  />
                ))}
              </View>
            ) : null}
            {stopped.length > 0 ? (
              <View className="mt-6">
                <Text className="px-1 text-muted-foreground text-[12px] font-bold uppercase tracking-[1.5px] mb-2">
                  Stopped
                </Text>
                {stopped.map((item, i) => (
                  <RecurringRow
                    key={item.id}
                    item={item}
                    first={i === 0}
                    last={i === stopped.length - 1}
                    open={false}
                    onToggle={() => undefined}
                  />
                ))}
              </View>
            ) : null}
            <Text className="mt-6 text-muted-foreground text-[12px] leading-[17px] px-1">
              Expenses are added as paid on their day; income is added as due, for you to mark received when it
              lands.
            </Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
