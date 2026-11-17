import { useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import {
  ArrowLeftIcon,
  CheckIcon,
  CopyIcon,
  LinkIcon,
  MessageCircleIcon,
  ShareIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { ApiError, payMethodName, type MoneyPayMethod } from '@/src/api';
import { useConversations } from '@/src/hooks/useChat';
import { useSendPayCard } from '@/src/hooks/usePayCards';
import { BottomSheet } from '@/components/BottomSheet';
import { PayQr } from '@/components/money/PayQr';
import { copyPayDetails, payDetailsLine, sendPayMethod } from '@/src/lib/pay-method-actions';

for (const Icon of [ArrowLeftIcon, CheckIcon, CopyIcon, LinkIcon, MessageCircleIcon, ShareIcon]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/**
 * Send how to pay: what the client gets, then where it goes — the phone's
 * share sheet (Messenger, Viber, a text), a Virgo chat as a pay card, a
 * package's statement, or copied to paste anywhere.
 *
 * A Virgo chat is a second step in the same sheet: the recent chats, one tap
 * to send the card, and the chat opens with it. Leaving the sheet before the
 * share sheet or another screen opens is done once it has fully closed,
 * since iOS will not present one over a sheet still on its way down.
 */
export function PaySendSheet({
  visible,
  method,
  packageId,
  onClose,
}: {
  visible: boolean;
  method: MoneyPayMethod | null;
  /** From a package's Show QR: the card says what is left on it. */
  packageId?: string;
  onClose: () => void;
}) {
  const [step, setStep] = useState<'how' | 'chat'>('how');
  const [copied, setCopied] = useState(false);
  const after = useRef<(() => void) | null>(null);
  const { conversations, isLoading } = useConversations();
  const sendCard = useSendPayCard();

  const leave = (then: () => void) => {
    after.current = then;
    onClose();
  };

  const sendTo = (conversationId: string) => {
    if (!method || sendCard.isPending) return;
    sendCard.mutate(
      { conversationId, payMethodId: method.id, packageId },
      {
        onSuccess: () => leave(() => router.push(`/chat/${conversationId}`)),
        onError: (err) =>
          Alert.alert(
            "Couldn't send it",
            err instanceof ApiError && err.status !== 0 ? err.message : 'Check your connection and try again.',
          ),
      },
    );
  };

  return (
    <BottomSheet
      visible={visible && !!method}
      onClose={onClose}
      onClosed={() => {
        setStep('how');
        setCopied(false);
        const next = after.current;
        after.current = null;
        next?.();
      }}
    >
      {method && step === 'how' ? (
        <View>
          <Text className="text-foreground text-[18px] font-bold px-5" accessibilityRole="header">
            Send how to pay
          </Text>
          <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[1px] px-5 pt-3.5 pb-2">
            What they get
          </Text>
          <View className="mx-5 rounded-[20px] border border-border p-3 flex-row items-center gap-3">
            <PayQr method={method} size={84} radius={12} />
            <View className="flex-1 min-w-0">
              <Text className="text-foreground text-[14px] font-bold" numberOfLines={1}>
                {[payMethodName(method), method.accountName].filter(Boolean).join(' · ')}
              </Text>
              {method.accountNumber ? (
                <Text className="text-foreground text-[14px] font-semibold" style={{ fontVariant: ['tabular-nums'] }}>
                  {method.accountNumber}
                </Text>
              ) : null}
              <Text className="text-muted-foreground text-[13px] leading-[18px] mt-0.5">
                {method.qr ? 'Scan this, or save it and upload it in your app to pay.' : 'Send to this number.'}
              </Text>
            </View>
          </View>

          <View className="mx-5 mt-4 rounded-[20px] border border-border overflow-hidden">
            <SendRow
              icon={ShareIcon}
              title="Messenger, Viber, a text…"
              detail={method.qr ? 'The QR picture and the details' : 'The details'}
              onPress={() => leave(() => void sendPayMethod(method))}
            />
            <SendRow
              icon={MessageCircleIcon}
              title="A Virgo chat"
              detail="As a pay card they can open full size"
              onPress={() => setStep('chat')}
              divided
            />
            <SendRow
              icon={LinkIcon}
              title="A package statement"
              detail="A link with what's paid and what's left"
              onPress={() => leave(() => router.push('/money?tab=owed'))}
              divided
            />
            <SendRow
              icon={copied ? CheckIcon : CopyIcon}
              title={copied ? 'Copied' : 'Copy the details'}
              detail={payDetailsLine(method)}
              onPress={async () => {
                await copyPayDetails(method);
                setCopied(true);
              }}
              divided
            />
          </View>
        </View>
      ) : method ? (
        <View>
          <View className="flex-row items-center px-3">
            <Pressable
              onPress={() => setStep('how')}
              accessibilityRole="button"
              accessibilityLabel="Back"
              className="w-11 h-11 items-center justify-center active:opacity-60"
            >
              <ArrowLeftIcon size={20} className="text-foreground" />
            </Pressable>
            <Text className="text-foreground text-[18px] font-bold" accessibilityRole="header">
              Send to a chat
            </Text>
          </View>
          <Text className="text-muted-foreground text-[13px] px-5 pb-2">
            {payMethodName(method)} goes as a card. Tap a chat to send it.
          </Text>
          <ScrollView style={{ maxHeight: 420 }} contentContainerClassName="px-5 gap-1.5 pb-2">
            {isLoading ? (
              <ActivityIndicator className="py-6" />
            ) : conversations.length === 0 ? (
              <Text className="text-muted-foreground text-[14px] py-6 text-center">
                No chats yet. Send it on Messenger or Viber instead.
              </Text>
            ) : (
              conversations.slice(0, 30).map((c) => (
                <Pressable
                  key={c.id}
                  onPress={() => sendTo(c.id)}
                  disabled={sendCard.isPending}
                  accessibilityRole="button"
                  accessibilityLabel={`Send to ${c.title}`}
                  className="min-h-14 flex-row items-center gap-3 rounded-2xl px-2 active:bg-secondary"
                >
                  <View className="w-10 h-10 rounded-full bg-secondary items-center justify-center">
                    <Text className="text-foreground text-[15px] font-bold">
                      {(c.title.trim()[0] ?? '?').toUpperCase()}
                    </Text>
                  </View>
                  <Text className="flex-1 text-foreground text-[15px] font-semibold" numberOfLines={1}>
                    {c.title}
                  </Text>
                  {sendCard.isPending && sendCard.variables?.conversationId === c.id ? (
                    <ActivityIndicator size="small" />
                  ) : null}
                </Pressable>
              ))
            )}
          </ScrollView>
        </View>
      ) : null}
    </BottomSheet>
  );
}

function SendRow({
  icon: Icon,
  title,
  detail,
  onPress,
  divided,
}: {
  icon: typeof ShareIcon;
  title: string;
  detail: string;
  onPress: () => void;
  divided?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className={`min-h-[60px] flex-row items-center gap-3 pl-3 pr-3.5 active:opacity-70 ${
        divided ? 'border-t border-border/60' : ''
      }`}
    >
      <View className="w-10 h-10 rounded-xl bg-secondary items-center justify-center">
        <Icon size={19} className="text-foreground" />
      </View>
      <View className="flex-1 min-w-0">
        <Text className="text-foreground text-[15px] font-semibold">{title}</Text>
        <Text className="text-muted-foreground text-[13px]" numberOfLines={1}>
          {detail}
        </Text>
      </View>
    </Pressable>
  );
}
