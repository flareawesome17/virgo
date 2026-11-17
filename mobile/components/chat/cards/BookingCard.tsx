import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { CheckIcon, ClipboardCheckIcon, XIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { formatMoney, planDayLabel, type BookingCardContext } from '@/src/api';
import { CardButton, CardFrame, CardGone, holdActions } from './CardFrame';
import type { CardProps } from './types';

for (const Icon of [CheckIcon, ClipboardCheckIcon, XIcon]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/**
 * A booking shared in the chat. Centred and full width, like the card that
 * marks a hire: it is an agreement between two people, not one person's
 * line. How it stands now — agreed, not yet, cancelled — the role, the day,
 * the place and the rate. Only the two on it can open it.
 */
export function BookingCard({ message, mine, meta, cardRef, onHold, pills, myId }: CardProps) {
  const booking = ((message.context ?? null) as BookingCardContext | null)?.booking;

  if (!booking) {
    const words = "This booking isn't available any more.";
    return (
      <CardFrame ref={cardRef} mine={mine} centred meta={meta} onHold={onHold} pills={pills}>
        <View accessible accessibilityLabel={`Booking. ${words} ${meta}`} {...holdActions(onHold)} className="gap-1.5">
          <StatusPill state="plain" />
          <CardGone words={words} />
        </View>
      </CardFrame>
    );
  }

  const state = booking.cancelled ? 'cancelled' : booking.confirmed ? 'agreed' : 'plain';
  const title = [booking.role, booking.postTitle].filter(Boolean).join(' · ');
  const when = [planDayLabel(booking.eventDate), booking.location].filter(Boolean).join(' · ');
  const rate = booking.rateMinor != null ? formatMoney(booking.rateMinor, booking.currency) : null;
  const onIt = !!myId && booking.parties.includes(myId);

  return (
    <CardFrame ref={cardRef} mine={mine} centred meta={meta} onHold={onHold} pills={pills}>
      <View
        accessible
        accessibilityLabel={[
          STATUS_WORDS[state],
          title,
          when || null,
          rate ? `Rate ${rate}` : 'No rate set',
          meta,
        ]
          .filter(Boolean)
          .join('. ')}
        {...holdActions(onHold)}
        className="gap-1.5"
      >
        <StatusPill state={state} />
        <Text className="text-foreground text-[16px] leading-[22px] font-bold" numberOfLines={2}>
          {title}
        </Text>
        {when ? (
          <Text className="text-secondary-foreground text-[13px] leading-[18px]" numberOfLines={2}>
            {when}
          </Text>
        ) : null}
        <View className="flex-row justify-between pt-1.5 mt-0.5 border-t border-border/40">
          <Text className="text-muted-foreground text-[14px]">Rate</Text>
          <Text className={`text-[14px] ${rate ? 'text-foreground font-bold' : 'text-muted-foreground'}`}>
            {rate ?? 'Not set'}
          </Text>
        </View>
      </View>
      {onIt ? (
        <CardButton label="Open booking" onPress={() => router.push(`/bookings/${booking.id}`)} onHold={onHold} />
      ) : null}
    </CardFrame>
  );
}

const STATUS_WORDS = {
  agreed: 'Booking agreed',
  plain: 'Booking',
  cancelled: 'Booking cancelled',
} as const;

function StatusPill({ state }: { state: keyof typeof STATUS_WORDS }) {
  if (state === 'agreed') {
    return (
      <View className="self-start flex-row items-center gap-1.5 rounded-full bg-success/15 px-2.5 py-[3px]">
        <CheckIcon size={13} strokeWidth={2.6} className="text-success" />
        <Text className="text-success text-[12px] font-bold">{STATUS_WORDS.agreed}</Text>
      </View>
    );
  }
  if (state === 'cancelled') {
    return (
      <View className="self-start flex-row items-center gap-1.5 rounded-full bg-destructive/10 px-2.5 py-[3px]">
        <XIcon size={13} strokeWidth={2.6} className="text-destructive" />
        <Text className="text-destructive text-[12px] font-bold">{STATUS_WORDS.cancelled}</Text>
      </View>
    );
  }
  return (
    <View className="flex-row items-center gap-1.5">
      <ClipboardCheckIcon size={14} className="text-muted-foreground" />
      <Text className="text-muted-foreground text-[12px] font-bold">{STATUS_WORDS.plain}</Text>
    </View>
  );
}
