import { useState, type ReactNode, type Ref } from 'react';
import { Pressable, Text, View } from 'react-native';
import { TriangleAlertIcon, WalletIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import {
  formatMoney,
  payCardAsMethod,
  payDetailsAreNew,
  payMethodName,
  type ConversationMessage,
  type PayCardContext,
} from '@/src/api';
import { PayQr } from '@/components/money/PayQr';
import { PayQrModal } from '@/components/money/PayQrModal';

for (const Icon of [TriangleAlertIcon, WalletIcon]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/** "Mika", from "Mika Dela Cruz". */
function firstName(name: string | null | undefined): string {
  return name?.trim().split(/\s+/)[0] || 'them';
}

/**
 * A way to pay, sent in a chat: on its sender's side like their own line,
 * with the QR, the name and number, what it was sent for, and a button that
 * opens it full size. The details are the sender's as they are now; a card
 * whose way to pay was removed says so. For a day after the details change,
 * the other side is told to check with the sender before paying.
 */
export function PayChatCard({
  ref,
  message,
  mine,
  time,
  onLongPress,
  pills,
}: {
  /** The card itself, which the thread measures to lift it in place when held. */
  ref?: Ref<View>;
  message: ConversationMessage;
  mine: boolean;
  time: string;
  /** Held: the thread measures the card and opens its reactions and menu. */
  onLongPress: () => void;
  /** Its reactions, drawn under the card like any message's. */
  pills?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const context = (message.context ?? null) as PayCardContext | null;
  const card = context?.method;
  const who = firstName(message.sender_name);
  const method = card ? payCardAsMethod(card) : null;
  const pkg = context?.package;
  const title = `How to pay ${who}`;

  return (
    <View className={mine ? 'items-end' : 'items-start'}>
      <Pressable
        ref={ref}
        onLongPress={onLongPress}
        delayLongPress={300}
        accessibilityActions={[{ name: 'longpress', label: 'Message actions' }]}
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === 'longpress') onLongPress();
        }}
        accessibilityLabel={`${title}${card ? `: ${payMethodName(card)}, ${card.accountName ?? ''} ${card.accountNumber ?? ''}` : ''}, ${time}`}
        className="bg-card border-[1.5px] border-action overflow-hidden active:opacity-90"
        style={{
          width: 272,
          borderRadius: 20,
          borderBottomRightRadius: mine ? 6 : 20,
          borderBottomLeftRadius: mine ? 20 : 6,
        }}
      >
        <View className="flex-row items-center gap-2 px-3.5 pt-3">
          <WalletIcon size={16} className="text-action" />
          <Text className="text-action text-[13px] font-bold">{title}</Text>
        </View>

        {method && card ? (
          <>
            <View className="flex-row items-center gap-3 px-3.5 pt-2.5">
              <PayQr method={method} size={88} radius={12} />
              <View className="flex-1 min-w-0">
                <Text className="text-foreground text-[14px] font-bold">{payMethodName(card)}</Text>
                {card.accountName ? (
                  <Text className="text-muted-foreground text-[14px]" numberOfLines={1}>
                    {card.accountName}
                  </Text>
                ) : null}
                {card.accountNumber ? (
                  <Text
                    selectable
                    className="text-foreground text-[14px] font-bold"
                    style={{ fontVariant: ['tabular-nums'] }}
                  >
                    {card.accountNumber}
                  </Text>
                ) : null}
              </View>
            </View>
            {pkg && pkg.balanceMinor > 0 ? (
              <View className="flex-row justify-between mx-3.5 mt-3 pt-2.5 border-t border-border/60">
                <Text className="flex-1 text-muted-foreground text-[14px]" numberOfLines={1}>
                  {pkg.title}, balance
                </Text>
                <Text className="text-foreground text-[14px] font-bold">{formatMoney(pkg.balanceMinor)}</Text>
              </View>
            ) : null}
            {!mine && payDetailsAreNew(card.detailsChangedAt) ? (
              <View className="flex-row gap-2 mx-3.5 mt-3 rounded-xl bg-destructive/10 px-2.5 py-2">
                <TriangleAlertIcon size={14} className="text-destructive mt-0.5" />
                <Text className="flex-1 text-destructive text-[12px] leading-4">
                  {who} changed these details today. If you have paid {who} before at another number, check with
                  them first.
                </Text>
              </View>
            ) : null}
            <View className="px-3.5 pt-2.5 pb-3.5">
              <Pressable
                onPress={() => setOpen(true)}
                onLongPress={onLongPress}
                delayLongPress={300}
                accessibilityRole="button"
                className="h-10 rounded-xl bg-secondary items-center justify-center active:opacity-70"
              >
                <Text className="text-foreground text-[14px] font-semibold">Show QR full size</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <Text className="text-muted-foreground text-[14px] px-3.5 pt-2 pb-3.5">
            {card === null
              ? `${who} removed this way to pay.`
              : message.body}
          </Text>
        )}
      </Pressable>
      {pills}
      <Text className="text-muted-foreground text-[11px] mt-1 mx-1">{time}</Text>
      <PayQrModal visible={open} method={method} title={title} onClose={() => setOpen(false)} />
    </View>
  );
}
