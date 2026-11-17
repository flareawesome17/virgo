import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { CheckIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { payCardAsMethod, payDetailsAreNew, payMethodName, type Booking } from '@/src/api';
import { PayQr } from '@/components/money/PayQr';
import { PayQrModal } from '@/components/money/PayQrModal';
import { copyPayNumber } from '@/src/lib/pay-method-actions';

cssInterop(CheckIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

/**
 * Pay the creative, on a booking: their main way to pay, shown to the poster
 * once the creative has confirmed. Nothing at all when the server sent no
 * `payTo` (another side, not confirmed, or an older API); a line saying so
 * when the creative has no way to pay yet.
 */
export function BookingPayCard({ booking }: { booking: Booking }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  if (booking.payTo === undefined) return null;
  const first = booking.otherParty.displayName.trim().split(/\s+/)[0] || booking.otherParty.displayName;

  if (booking.payTo === null) {
    return (
      <View className="gap-2.5">
        <Text className="text-foreground text-[17px] font-bold">Pay {first}</Text>
        <View className="bg-card rounded-2xl p-4">
          <Text className="text-muted-foreground text-[14px] leading-5">
            {first} hasn’t added a way to get paid yet. Ask them in the chat.
          </Text>
        </View>
      </View>
    );
  }

  const card = booking.payTo;
  const method = payCardAsMethod(card);
  return (
    <View className="gap-2.5">
      <Text className="text-foreground text-[17px] font-bold">Pay {first}</Text>
      <View className="bg-card rounded-2xl p-4 gap-3.5">
        <View className="flex-row items-center gap-3.5">
          <PayQr method={method} size={88} radius={12} />
          <View className="flex-1 min-w-0">
            <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[1px]">
              {first}’s main way to pay
            </Text>
            <Text className="text-foreground text-[16px] font-bold mt-0.5">{payMethodName(card)}</Text>
            {card.accountName ? (
              <Text className="text-muted-foreground text-[14px]" numberOfLines={1}>
                {card.accountName}
              </Text>
            ) : null}
            {card.accountNumber ? (
              <Text
                selectable
                className="text-foreground text-[16px] font-bold"
                style={{ fontVariant: ['tabular-nums'] }}
              >
                {card.accountNumber}
              </Text>
            ) : null}
          </View>
        </View>
        {payDetailsAreNew(card.detailsChangedAt) ? (
          <Text className="text-destructive text-[12px] leading-4">
            {first} changed these details today. If you have paid {first} before at another number, check with them
            first.
          </Text>
        ) : null}
        <View className="flex-row gap-2.5">
          <Pressable
            onPress={() => setOpen(true)}
            accessibilityRole="button"
            className="flex-1 h-11 rounded-[14px] bg-foreground items-center justify-center active:opacity-85"
          >
            <Text className="text-background text-[15px] font-semibold">Show QR</Text>
          </Pressable>
          <Pressable
            onPress={async () => {
              await copyPayNumber(method);
              setCopied(true);
              setTimeout(() => setCopied(false), 1600);
            }}
            accessibilityRole="button"
            className="flex-1 h-11 rounded-[14px] bg-secondary flex-row items-center justify-center gap-1.5 active:opacity-70"
          >
            {copied ? <CheckIcon size={16} className="text-foreground" /> : null}
            <Text className="text-foreground text-[15px] font-semibold">{copied ? 'Copied' : 'Copy number'}</Text>
          </Pressable>
        </View>
      </View>
      <Text className="text-muted-foreground text-[12px] leading-[17px] px-1">
        Only you see this, because {first} confirmed your booking. Pay {first} directly: Virgo never holds the money.
      </Text>
      <PayQrModal visible={open} method={method} title={`How to pay ${first}`} onClose={() => setOpen(false)} />
    </View>
  );
}
