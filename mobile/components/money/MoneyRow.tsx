import { memo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { CloudOffIcon, PaperclipIcon, RepeatIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import {
  categoryLabel,
  dayLabel,
  formatMoney,
  isOverdue,
  methodLabel,
  type MoneyEntry,
  type MoneyEntryInput,
} from '@/src/api';
import { categoryIcon } from '@/components/money/icons';

for (const Icon of [CloudOffIcon, PaperclipIcon, RepeatIcon]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/** "+₱15,000" in, "−₱350.50" out: the sign says the direction before the colour does. */
export function signedAmount(kind: MoneyEntry['kind'], minor: number): string {
  return `${kind === 'income' ? '+' : '−'}${formatMoney(minor)}`;
}

type Row = Pick<
  MoneyEntry,
  'id' | 'kind' | 'amountMinor' | 'withheldMinor' | 'category' | 'occurredOn' | 'paidOn' | 'method' | 'counterparty'
> & {
  hasReceipt?: boolean;
  /** Recorded from a booking that has been cancelled since. */
  bookingCancelled?: boolean;
  /** Made by, or started, an entry that repeats every month. */
  repeats?: boolean;
};

export function rowOf(entry: MoneyEntry): Row {
  return {
    ...entry,
    hasReceipt: !!entry.receipt,
    bookingCancelled: !!entry.booking?.cancelled,
    repeats: (entry.recurringId ?? null) !== null,
  };
}

export function rowOfQueued(input: MoneyEntryInput & { id: string }): Row {
  return {
    id: input.id,
    kind: input.kind,
    amountMinor: input.amountMinor,
    withheldMinor: input.withheldMinor ?? 0,
    category: input.category,
    occurredOn: input.occurredOn,
    paidOn: input.paidOn ?? null,
    method: input.method ?? null,
    counterparty: input.counterparty ?? null,
    hasReceipt: !!input.receiptId,
  };
}

/**
 * One entry in a list: what it was, the amount, and — when it is still owed —
 * when, with a way to mark it paid right there.
 */
export const MoneyRow = memo(function MoneyRow({
  row,
  first,
  last,
  onPress,
  onMarkPaid,
  waiting,
  refused,
}: {
  row: Row;
  first: boolean;
  last: boolean;
  onPress?: () => void;
  onMarkPaid?: () => void;
  /** In the offline queue, not on the server yet. */
  waiting?: boolean;
  /** The server turned the queued entry down; this says why. */
  refused?: string | null;
}) {
  const Icon = categoryIcon(row.kind, row.category);
  const income = row.kind === 'income';
  const unpaid = row.paidOn === null;
  const overdue = isOverdue(row);
  const label = categoryLabel(row.kind, row.category);
  const title = row.counterparty || label;

  const detail = refused
    ? refused
    : waiting
      ? 'Waiting for a connection'
      : row.bookingCancelled
        ? 'Booking cancelled'
        : unpaid
          ? `${overdue ? 'Overdue · was due' : 'Due'} ${dayLabel(row.occurredOn)}`
          : [row.counterparty ? label : null, methodLabel(row.method)].filter(Boolean).join(' · ');

  return (
    <View
      className={`bg-card flex-row items-center gap-3 pl-4 pr-3 ${first ? 'rounded-t-2xl' : ''} ${
        last ? 'rounded-b-2xl' : 'border-b border-border'
      }`}
    >
      <Pressable
        onPress={onPress}
        disabled={!onPress}
        accessibilityRole="button"
        accessibilityLabel={`${title}, ${signedAmount(row.kind, row.amountMinor)}${unpaid ? ', not paid yet' : ''}`}
        className="flex-1 flex-row items-center gap-3 py-3 min-h-[60px] active:opacity-70"
      >
        <View
          className={`w-9 h-9 rounded-xl items-center justify-center ${income ? 'bg-success/15' : 'bg-primary/10'}`}
        >
          {waiting ? (
            <CloudOffIcon size={16} className="text-muted-foreground" />
          ) : (
            <Icon size={16} className={income ? 'text-success' : 'text-primary'} />
          )}
        </View>
        <View className="flex-1 min-w-0">
          <View className="flex-row items-center gap-1.5">
            <Text className="text-foreground text-[15px] font-semibold flex-shrink" numberOfLines={1}>
              {title}
            </Text>
            {row.repeats ? <RepeatIcon size={12} className="text-muted-foreground" /> : null}
            {row.hasReceipt ? <PaperclipIcon size={12} className="text-muted-foreground" /> : null}
          </View>
          {detail ? (
            <Text
              numberOfLines={1}
              className={`text-[13px] mt-0.5 ${refused || overdue || row.bookingCancelled ? 'text-destructive' : 'text-muted-foreground'}`}
            >
              {detail}
            </Text>
          ) : null}
        </View>
        <Text
          className={`text-[15px] font-bold ${income ? 'text-success' : 'text-foreground'}`}
          style={{ fontVariant: ['tabular-nums'] }}
        >
          {signedAmount(row.kind, row.amountMinor)}
        </Text>
      </Pressable>
      {onMarkPaid ? (
        <Pressable
          onPress={onMarkPaid}
          accessibilityRole="button"
          accessibilityLabel={income ? `Mark ${title} as received` : `Mark ${title} as paid`}
          className="min-h-[36px] rounded-full bg-primary/10 px-3 justify-center active:opacity-70"
        >
          <Text className="text-primary text-[12px] font-bold">{income ? 'Got it' : 'Paid'}</Text>
        </Pressable>
      ) : null}
    </View>
  );
});
