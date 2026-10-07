import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { PlusIcon, QrCodeIcon, WalletIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { MAX_PAY_METHODS, payMethodName } from '@/src/api';
import { useMoneyPayMethods } from '@/src/hooks';
import { CardListSkeleton, EmptyState, ScreenHeader } from '@/components';
import { LoadFailed } from '@/components/LoadFailed';

for (const Icon of [PlusIcon, QrCodeIcon, WalletIcon]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/**
 * How clients pay you: the GCash, Maya and bank details your statements show.
 * Virgo only shows them; the money goes straight to you.
 */
export default function PayMethodsScreen() {
  const { payMethods, isLoading, loadFailed, refetch } = useMoneyPayMethods();
  const add = () => router.push('/money/pay-methods/edit');

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <ScreenHeader title="How clients pay you" subtitle="Shown on statements you share" />
      {isLoading ? (
        <View className="px-5 mt-4">
          <CardListSkeleton count={2} />
        </View>
      ) : loadFailed && payMethods.length === 0 ? (
        <LoadFailed what="your payment details" onRetry={() => void refetch()} />
      ) : payMethods.length === 0 ? (
        <View className="flex-1 justify-center">
          <EmptyState
            icon={WalletIcon}
            title="No ways to pay yet"
            body="Add your GCash, Maya or bank details — and the QR code, if you have one — and every statement you share shows the client how to pay you."
            action={{ label: 'Add a way to pay', onPress: add }}
          />
        </View>
      ) : (
        <ScrollView contentContainerClassName="px-5 pb-16 gap-3">
          {payMethods.map((m) => (
            <Pressable
              key={m.id}
              onPress={() => router.push(`/money/pay-methods/edit?id=${m.id}`)}
              accessibilityRole="button"
              accessibilityLabel={`Edit ${payMethodName(m)}`}
              className="bg-card rounded-2xl p-4 flex-row items-center gap-4 active:opacity-70"
            >
              <View className="flex-1 min-w-0">
                <Text className="text-foreground text-[16px] font-bold">{payMethodName(m)}</Text>
                {m.accountName ? (
                  <Text className="text-muted-foreground text-[14px] mt-0.5" numberOfLines={1}>{m.accountName}</Text>
                ) : null}
                {m.accountNumber ? (
                  <Text className="text-foreground text-[15px] font-semibold mt-1" style={{ fontVariant: ['tabular-nums'] }}>
                    {m.accountNumber}
                  </Text>
                ) : null}
              </View>
              {m.qr?.url ? (
                <Image source={{ uri: m.qr.url }} style={{ width: 64, height: 64, borderRadius: 10 }} contentFit="contain" />
              ) : (
                <View className="w-16 h-16 rounded-[10px] bg-muted items-center justify-center">
                  <QrCodeIcon size={20} className="text-muted-foreground" />
                </View>
              )}
            </Pressable>
          ))}
          {payMethods.length < MAX_PAY_METHODS ? (
            <Pressable
              onPress={add}
              accessibilityRole="button"
              className="min-h-14 flex-row items-center justify-center gap-2 rounded-2xl border border-dashed border-border active:opacity-70"
            >
              <PlusIcon size={17} className="text-primary" />
              <Text className="text-primary text-[15px] font-bold">Add a way to pay</Text>
            </Pressable>
          ) : null}
          <Text className="text-muted-foreground text-[12px] leading-[17px] text-center mt-4 px-4">
            Only people you send a statement to see these. Virgo never takes or holds a payment —
            clients pay you directly.
          </Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
