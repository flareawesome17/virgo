import { Alert, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { WalletIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { ApiError, formatMoney, todayIso } from '@/src/api';
import {
  useDismissMoneySuggestion,
  useMoneyForBooking,
  useUpdateMoneyEntry,
} from '@/src/hooks';
import { MoneyRow, rowOf } from '@/components/money/MoneyRow';

cssInterop(WalletIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

/**
 * A booking's money, on the booking's own screen: the entry Money offers to
 * record for it, or what has been recorded from it, with "Got it" for one
 * still owed. The "Got paid?" notification opens this screen, so this is
 * where that question is answered.
 *
 * Draws nothing when there is nothing to say — a booking not agreed yet, or
 * one turned down with "not this" and never recorded.
 */
export function BookingMoney({ bookingId, cancelled }: { bookingId: string; cancelled: boolean }) {
  const { suggestion, entries } = useMoneyForBooking(bookingId);
  const dismiss = useDismissMoneySuggestion();
  const update = useUpdateMoneyEntry();

  if (entries.length > 0) {
    return (
      <View className="gap-2">
        <Text className="text-muted-foreground text-[12px] font-bold uppercase tracking-[1.5px] ml-1">
          In your Money
        </Text>
        <View>
          {entries.map((entry, i) => (
            <MoneyRow
              key={entry.id}
              row={rowOf(entry)}
              first={i === 0}
              last={i === entries.length - 1}
              onPress={() => router.push(`/money/new?edit=${entry.id}`)}
              onMarkPaid={
                entry.paidOn === null
                  ? () =>
                      update.mutate(
                        { id: entry.id, paidOn: todayIso() },
                        {
                          onError: (error) =>
                            Alert.alert(
                              "Couldn't mark it paid",
                              error instanceof ApiError && error.status !== 0 ? error.message : 'Please try again.',
                            ),
                        },
                      )
                  : undefined
              }
            />
          ))}
        </View>
        {cancelled ? (
          <Text className="text-muted-foreground text-[12px] leading-5 ml-1">
            This booking was cancelled. Keep these only for money that actually moved — a
            reservation fee you kept, say.
          </Text>
        ) : null}
      </View>
    );
  }

  if (!suggestion) return null;
  const income = suggestion.kind === 'income';
  const amount = suggestion.amountMinor !== null ? formatMoney(suggestion.amountMinor) : null;

  return (
    <View className="bg-card rounded-2xl p-4 gap-3">
      <View className="flex-row items-start gap-3">
        <View className={`w-9 h-9 rounded-xl items-center justify-center ${income ? 'bg-success/15' : 'bg-primary/10'}`}>
          <WalletIcon size={17} className={income ? 'text-success' : 'text-primary'} />
        </View>
        <View className="flex-1">
          <Text className="text-foreground text-[15px] font-bold">
            {income ? 'Record this fee in Money' : 'Record this cost in Money'}
          </Text>
          <Text className="text-muted-foreground text-[13px] mt-0.5 leading-[18px]">
            {income
              ? `${amount ? `${amount} from ${suggestion.counterparty}` : `From ${suggestion.counterparty}`} — so you know what this shoot really earned.`
              : `${amount ? `${amount} to ${suggestion.counterparty}` : `What you pay ${suggestion.counterparty}`} — so you know what this shoot really cost.`}
          </Text>
        </View>
      </View>
      <View className="flex-row gap-2">
        <Pressable
          onPress={() => router.push(`/money/new?booking=${suggestion.bookingId}`)}
          accessibilityRole="button"
          className="flex-1 min-h-11 items-center justify-center rounded-xl bg-action active:opacity-85"
        >
          <Text className="text-action-foreground text-[14px] font-bold">Record</Text>
        </Pressable>
        <Pressable
          onPress={() => dismiss.mutate(suggestion.bookingId)}
          disabled={dismiss.isPending}
          accessibilityRole="button"
          accessibilityLabel="Not this — don't offer this booking again"
          className="min-h-11 px-4 items-center justify-center rounded-xl active:bg-muted"
        >
          <Text className="text-muted-foreground text-[14px] font-semibold">Not this</Text>
        </Pressable>
      </View>
    </View>
  );
}
