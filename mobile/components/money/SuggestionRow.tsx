import { memo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { BriefcaseIcon, UsersIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { bookingLabel, dayLabel, type MoneySuggestion } from '@/src/api';
import { signedAmount } from '@/components/money/MoneyRow';

for (const Icon of [BriefcaseIcon, UsersIcon]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/**
 * A booking Money offers to record: who, which job, the agreed amount, and
 * the two answers — record it, filled in, or "not this".
 */
export const SuggestionRow = memo(function SuggestionRow({
  suggestion,
  first,
  last,
  onRecord,
  onDismiss,
}: {
  suggestion: MoneySuggestion;
  first: boolean;
  last: boolean;
  onRecord: () => void;
  onDismiss: () => void;
}) {
  const income = suggestion.kind === 'income';
  const Icon = income ? BriefcaseIcon : UsersIcon;
  const when = suggestion.eventDate ? dayLabel(suggestion.eventDate) : 'No date set';

  return (
    <View
      className={`bg-card px-4 py-3 gap-2.5 ${first ? 'rounded-t-2xl' : ''} ${
        last ? 'rounded-b-2xl' : 'border-b border-border'
      }`}
    >
      <View className="flex-row items-center gap-3">
        <View className={`w-9 h-9 rounded-xl items-center justify-center ${income ? 'bg-success/15' : 'bg-primary/10'}`}>
          <Icon size={16} className={income ? 'text-success' : 'text-primary'} />
        </View>
        <View className="flex-1 min-w-0">
          <Text className="text-foreground text-[15px] font-semibold" numberOfLines={1}>
            {income ? `From ${suggestion.counterparty}` : `To ${suggestion.counterparty}`}
          </Text>
          <Text className="text-muted-foreground text-[13px] mt-0.5" numberOfLines={1}>
            {bookingLabel(suggestion)} · {when}
          </Text>
        </View>
        {suggestion.amountMinor !== null ? (
          <Text
            className={`text-[15px] font-bold ${income ? 'text-success' : 'text-foreground'}`}
            style={{ fontVariant: ['tabular-nums'] }}
          >
            {signedAmount(suggestion.kind, suggestion.amountMinor)}
          </Text>
        ) : null}
      </View>
      <View className="flex-row gap-2 pl-12">
        <Pressable
          onPress={onRecord}
          accessibilityRole="button"
          accessibilityLabel={`Record ${income ? 'income from' : 'expense to'} ${suggestion.counterparty}`}
          className="min-h-9 px-4 items-center justify-center rounded-full bg-primary/10 active:opacity-70"
        >
          <Text className="text-primary text-[13px] font-bold">Record</Text>
        </Pressable>
        <Pressable
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel={`Not this — don't offer ${suggestion.postTitle} again`}
          className="min-h-9 px-3 items-center justify-center rounded-full active:bg-muted"
        >
          <Text className="text-muted-foreground text-[13px] font-semibold">Not this</Text>
        </Pressable>
      </View>
    </View>
  );
});
