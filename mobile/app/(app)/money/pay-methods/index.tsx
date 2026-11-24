import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import {
  ChevronRightIcon,
  LinkIcon,
  PlusIcon,
  QrCodeIcon,
  ShareIcon,
  ShieldCheckIcon,
  SmartphoneIcon,
  WalletIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { MAX_PAY_METHODS, payMethodName } from '@/src/api';
import { useMoneyPayMethods } from '@/src/hooks';
import { CardListSkeleton, EmptyState, ScreenHeader } from '@/components';
import { LoadFailed } from '@/components/LoadFailed';
import { PayQr } from '@/components/money/PayQr';
import { sendPayMethod } from '@/src/lib/pay-method-actions';

for (const Icon of [
  ChevronRightIcon,
  LinkIcon,
  PlusIcon,
  QrCodeIcon,
  ShareIcon,
  ShieldCheckIcon,
  SmartphoneIcon,
  WalletIcon,
]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/**
 * How clients pay you: the main way to pay first, large, with Show QR and
 * Send; the others under it, each a tap from full size. Where clients see
 * them is said here, and what keeps them safe: changing one asks for the
 * password, and you are emailed when they change.
 *
 * Virgo only shows them; the money goes straight to you.
 */
export default function PayMethodsScreen() {
  const { payMethods, isLoading, loadFailed, refetch } = useMoneyPayMethods();
  const insets = useSafeAreaInsets();
  const add = () => router.push('/money/pay-methods/edit');
  const show = (id: string) => router.push(`/money/pay-methods/show?id=${id}`);
  const [main, ...others] = payMethods;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <ScreenHeader title="How clients pay you" subtitle="Show your QR, or send it to a client" />
      {isLoading ? (
        <View className="px-5 mt-4">
          <CardListSkeleton count={2} />
        </View>
      ) : loadFailed && payMethods.length === 0 ? (
        <LoadFailed what="your payment details" onRetry={() => void refetch()} />
      ) : !main ? (
        <View className="flex-1 justify-center">
          <EmptyState
            icon={WalletIcon}
            title="No ways to pay yet"
            body="Add your GCash, Maya or bank details and their QR codes. Show a QR full size for a client to scan, send it to them, or let your statements show it."
            action={{ label: 'Add a way to pay', onPress: add }}
          />
        </View>
      ) : (
        <ScrollView
          contentContainerClassName="px-5 pt-4 gap-7"
          contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        >
          {/* The main way to pay: the one thing on the page that matters. */}
          <View className="bg-card rounded-[20px] border border-border/40 p-4 gap-4">
            <View className="flex-row gap-4 items-start">
              <Pressable
                onPress={() => router.push(`/money/pay-methods/edit?id=${main.id}`)}
                accessibilityRole="button"
                accessibilityLabel={`Edit ${payMethodName(main)}`}
                className="flex-1 min-w-0 active:opacity-70"
              >
                <View className="self-start rounded-full bg-action/10 px-2 py-0.5 mb-1.5">
                  <Text className="text-action text-[11px] font-bold uppercase tracking-[1px]">Main</Text>
                </View>
                <Text className="text-foreground text-[17px] font-bold">{payMethodName(main)}</Text>
                {main.accountName ? (
                  <Text className="text-muted-foreground text-[14px]" numberOfLines={1}>
                    {main.accountName}
                  </Text>
                ) : null}
                {main.accountNumber ? (
                  <Text
                    className="text-foreground text-[17px] font-bold mt-0.5"
                    style={{ fontVariant: ['tabular-nums'], letterSpacing: 0.4 }}
                  >
                    {main.accountNumber}
                  </Text>
                ) : null}
                <Text className="text-action text-[13px] font-semibold mt-1.5">Edit</Text>
              </Pressable>
              <Pressable onPress={() => show(main.id)} accessibilityRole="button" accessibilityLabel="Show QR">
                <PayQr method={main} size={112} radius={12} />
              </Pressable>
            </View>
            <View className="flex-row gap-2.5">
              <Pressable
                onPress={() => show(main.id)}
                accessibilityRole="button"
                className="flex-1 h-12 rounded-[14px] bg-foreground flex-row items-center justify-center gap-2 active:opacity-85"
              >
                <QrCodeIcon size={18} className="text-background" />
                <Text className="text-background text-[15px] font-semibold">Show QR</Text>
              </Pressable>
              <Pressable
                onPress={() => void sendPayMethod(main)}
                accessibilityRole="button"
                className="flex-1 h-12 rounded-[14px] bg-secondary flex-row items-center justify-center gap-2 active:opacity-70"
              >
                <ShareIcon size={18} className="text-foreground" />
                <Text className="text-foreground text-[15px] font-semibold">Send</Text>
              </Pressable>
            </View>
          </View>

          <View className="gap-2.5">
            <Text className="text-foreground text-[17px] font-bold">Other ways to pay</Text>
            <View className="bg-card rounded-[20px] border border-border/40 overflow-hidden">
              {others.map((m, i) => (
                <Pressable
                  key={m.id}
                  onPress={() => show(m.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Show ${payMethodName(m)}`}
                  className={`min-h-16 flex-row items-center gap-3 pl-2.5 pr-3.5 active:opacity-70 ${
                    i > 0 ? 'border-t border-border/40' : ''
                  }`}
                >
                  <PayQr method={m} size={44} radius={10} />
                  <View className="flex-1 min-w-0">
                    <Text className="text-foreground text-[15px] font-semibold">{payMethodName(m)}</Text>
                    <Text className="text-muted-foreground text-[13px]" numberOfLines={1}>
                      {[m.accountNumber, m.qr ? null : 'no QR'].filter(Boolean).join(' · ') || 'QR code'}
                    </Text>
                  </View>
                  <ChevronRightIcon size={16} className="text-muted-foreground" />
                </Pressable>
              ))}
              {payMethods.length < MAX_PAY_METHODS ? (
                <Pressable
                  onPress={add}
                  accessibilityRole="button"
                  className={`min-h-[52px] flex-row items-center gap-3 px-5 active:opacity-70 ${
                    others.length > 0 ? 'border-t border-border/40' : ''
                  }`}
                >
                  <PlusIcon size={17} className="text-action" />
                  <Text className="flex-1 text-action text-[15px] font-semibold">Add a way to pay</Text>
                  <Text className="text-muted-foreground text-[13px]">
                    {payMethods.length} of {MAX_PAY_METHODS}
                  </Text>
                </Pressable>
              ) : null}
            </View>
            <Text className="text-muted-foreground text-[13px] leading-[18px] px-1">
              {others.length > 0
                ? 'Tap one to show it. Make another your main from its edit screen.'
                : 'Add another, a bank or a second wallet, and it shows here.'}
            </Text>
          </View>

          <View className="gap-2.5">
            <Text className="text-foreground text-[17px] font-bold">Where clients see it</Text>
            <View className="bg-card rounded-[20px] border border-border/40 overflow-hidden">
              <WhereRow icon={SmartphoneIcon} text="On your phone, when you tap Show QR" />
              <WhereRow icon={ShareIcon} text="Wherever you send it: Messenger, Viber, a text" divided />
              <WhereRow icon={LinkIcon} text="On a package's statement link" divided />
            </View>
          </View>

          {/* What keeps it safe, said plainly. */}
          <View className="bg-secondary rounded-[20px] px-4 py-3.5 flex-row gap-3">
            <ShieldCheckIcon size={20} className="text-foreground mt-0.5" />
            <View className="flex-1">
              <Text className="text-foreground text-[15px] font-semibold">Locked to you</Text>
              <Text className="text-muted-foreground text-[13px] leading-[18px] mt-0.5">
                Adding or changing a way to pay asks for your password, and we email you when it changes.
                Virgo never holds a payment: clients pay you directly.
              </Text>
            </View>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function WhereRow({ icon: Icon, text, divided }: { icon: typeof LinkIcon; text: string; divided?: boolean }) {
  return (
    <View className={`min-h-[52px] flex-row items-center gap-3 px-4 py-3 ${divided ? 'border-t border-border/40' : ''}`}>
      <Icon size={19} className="text-muted-foreground" />
      <Text className="flex-1 text-foreground text-[15px] leading-5">{text}</Text>
    </View>
  );
}
