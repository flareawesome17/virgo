import { Alert, Pressable, ScrollView, Share, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { CalendarPlusIcon, PencilIcon, PlusIcon, Share2Icon, Trash2Icon, WalletIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import {
  ApiError,
  dayLabel,
  formatMoney,
  payMethodName,
  todayIso,
} from '@/src/api';
import {
  useAuth,
  useDeleteMoneyPackage,
  useMoneyPackage,
  useMoneyPayMethods,
  useShareMoneyPackage,
  useUnshareMoneyPackage,
  useUpdateMoneyEntry,
} from '@/src/hooks';
import { DetailFallback } from '@/components/DetailFallback';
import { ScreenHeader } from '@/components/ScreenHeader';
import { PressableScale } from '@/components/PressableScale';
import { MoneyRow, rowOf } from '@/components/money/MoneyRow';
import { packageProgress } from '@/components/money/PackageRow';

for (const Icon of [CalendarPlusIcon, PencilIcon, PlusIcon, Share2Icon, Trash2Icon, WalletIcon]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

function message(err: unknown, fallback: string): string {
  return err instanceof ApiError && err.status !== 0 ? err.message : fallback;
}

/**
 * One package: what is in, what is left and when it is due, every payment
 * toward it, and the statement — shared with the client by a link, showing
 * how to pay you.
 */
export default function MoneyPackageScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { pkg, entries, error, loadFailed, refetch } = useMoneyPackage(id);
  const { payMethods } = useMoneyPayMethods();
  const { profile } = useAuth();
  const share = useShareMoneyPackage();
  const unshare = useUnshareMoneyPackage();
  const remove = useDeleteMoneyPackage();
  const update = useUpdateMoneyEntry();

  if (!pkg) {
    return (
      <DetailFallback
        title="Package"
        what="this package"
        gone="It was deleted."
        error={error}
        failed={loadFailed}
        onRetry={() => void refetch()}
      />
    );
  }

  const progress = packageProgress(pkg);
  const subtitle = [pkg.clientName, pkg.eventDate ? dayLabel(pkg.eventDate) : null].filter(Boolean).join(' · ');

  const sendStatement = () => {
    const go = () =>
      share.mutate(pkg.id, {
        onSuccess: ({ url }) => {
          const from = profile?.displayName?.trim();
          void Share.share({
            message: `${pkg.title} — statement${from ? ` from ${from}` : ''}: what's paid, what's left, and how to pay.\n${url}`,
          });
        },
        onError: (err) => Alert.alert("Couldn't share it", message(err, 'Check your connection and try again.')),
      });
    if (payMethods.length === 0 && !pkg.paidInFull) {
      Alert.alert(
        'Add how they can pay you?',
        'The statement can show your GCash, Maya or bank details and QR code, so the client can pay straight from it.',
        [
          { text: 'Add a way to pay', onPress: () => router.push('/money/pay-methods/edit') },
          { text: 'Share without', onPress: go },
          { text: 'Cancel', style: 'cancel' },
        ],
      );
      return;
    }
    go();
  };

  const stopSharing = () =>
    Alert.alert(
      'Stop sharing this statement?',
      'The link stops working for whoever has it. If you share again, it will be a new link.',
      [
        { text: 'Keep sharing', style: 'cancel' },
        {
          text: 'Stop sharing',
          style: 'destructive',
          onPress: () =>
            unshare.mutate(pkg.id, {
              onError: (err) => Alert.alert("Couldn't stop sharing", message(err, 'Please try again.')),
            }),
        },
      ],
    );

  const confirmDelete = () =>
    Alert.alert(
      'Delete this package?',
      'Payments still due are deleted with it. Payments you have received stay in your Money.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () =>
            remove.mutate(pkg.id, {
              onSuccess: () => router.back(),
              onError: (err) => Alert.alert("Couldn't delete it", message(err, 'Please try again.')),
            }),
        },
      ],
    );

  const markPaid = (entryId: string) =>
    update.mutate(
      { id: entryId, paidOn: todayIso() },
      { onError: (err) => Alert.alert("Couldn't mark it paid", message(err, 'Please try again.')) },
    );

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <ScreenHeader
        title={pkg.title}
        subtitle={subtitle || undefined}
        right={
          <Pressable
            onPress={() => router.push(`/money/packages/new?edit=${pkg.id}`)}
            accessibilityRole="button"
            accessibilityLabel="Edit package"
            className="w-11 h-11 rounded-xl bg-secondary items-center justify-center active:opacity-70"
          >
            <PencilIcon size={17} className="text-foreground" />
          </Pressable>
        }
      />
      <ScrollView contentContainerClassName="px-5 pb-16 gap-4">
        {/* Where it stands. */}
        <View className="bg-card rounded-3xl border border-border/40 p-5">
          {pkg.paidInFull ? (
            <Text className="text-success text-[24px] font-bold tracking-tight">Paid in full</Text>
          ) : (
            <Text
              className="text-foreground text-[28px] font-bold tracking-tight"
              style={{ fontVariant: ['tabular-nums'] }}
            >
              {formatMoney(pkg.balanceMinor)} <Text className="text-muted-foreground text-[16px] font-semibold">left</Text>
            </Text>
          )}
          <View className="h-2 rounded-full bg-muted mt-3 overflow-hidden">
            <View
              className={`h-full rounded-full ${pkg.paidInFull ? 'bg-success' : 'bg-primary'}`}
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </View>
          <Text className="text-muted-foreground text-[13px] mt-2" style={{ fontVariant: ['tabular-nums'] }}>
            {formatMoney(pkg.receivedMinor)} paid of {formatMoney(pkg.totalMinor)}
          </Text>
          {!pkg.paidInFull && pkg.nextDueOn ? (
            <Text className={`text-[14px] font-semibold mt-3 ${pkg.overdue ? 'text-destructive' : 'text-foreground'}`}>
              {pkg.overdue ? 'A payment is overdue — it was due' : 'Next payment due'} {dayLabel(pkg.nextDueOn)}
            </Text>
          ) : null}
        </View>

        <View className="flex-row gap-3">
          <PressableScale
            onPress={() => router.push(`/money/new?package=${pkg.id}`)}
            accessibilityRole="button"
            scaleTo={0.97}
            style={{ flex: 1 }}
            className="min-h-12 flex-row items-center justify-center gap-2 rounded-2xl bg-success/15"
          >
            <PlusIcon size={17} className="text-success" />
            <Text className="text-success text-[15px] font-bold">Record payment</Text>
          </PressableScale>
          <PressableScale
            onPress={sendStatement}
            disabled={share.isPending}
            accessibilityRole="button"
            scaleTo={0.97}
            style={{ flex: 1, opacity: share.isPending ? 0.6 : 1 }}
            className="min-h-12 flex-row items-center justify-center gap-2 rounded-2xl bg-primary/10"
          >
            <Share2Icon size={17} className="text-primary" />
            <Text className="text-primary text-[15px] font-bold">
              {pkg.shareUrl ? 'Send statement' : 'Share statement'}
            </Text>
          </PressableScale>
        </View>

        {pkg.shareUrl ? (
          <View className="flex-row items-center justify-between -mt-1 px-1">
            <Text className="text-muted-foreground text-[12px] flex-1">
              Shared — anyone with the link can see this statement.
            </Text>
            <Pressable onPress={stopSharing} accessibilityRole="button" className="min-h-9 justify-center pl-3 active:opacity-60">
              <Text className="text-destructive text-[12px] font-semibold">Stop sharing</Text>
            </Pressable>
          </View>
        ) : null}

        {/* Every payment toward it, in the order they fall. */}
        <View>
          <Text className="text-muted-foreground text-[12px] font-bold uppercase tracking-[1.5px] mb-2 ml-1">
            Payments
          </Text>
          {entries.length === 0 ? (
            <Text className="text-muted-foreground text-[13px] ml-1">No payments yet.</Text>
          ) : (
            <View>
              {entries.map((entry, i) => (
                <MoneyRow
                  key={entry.id}
                  row={rowOf(entry)}
                  first={i === 0}
                  last={i === entries.length - 1 && pkg.unscheduledMinor === 0}
                  onPress={() => router.push(`/money/new?edit=${entry.id}`)}
                  onMarkPaid={entry.paidOn === null ? () => markPaid(entry.id) : undefined}
                />
              ))}
            </View>
          )}
          {pkg.unscheduledMinor > 0 && !pkg.paidInFull ? (
            <Pressable
              onPress={() => router.push(`/money/new?package=${pkg.id}`)}
              accessibilityRole="button"
              className={`bg-card flex-row items-center gap-3 px-4 py-3 min-h-[56px] active:opacity-70 ${
                entries.length === 0 ? 'rounded-2xl' : 'rounded-b-2xl border-t border-border'
              }`}
            >
              <View className="w-9 h-9 rounded-xl items-center justify-center bg-muted">
                <CalendarPlusIcon size={16} className="text-muted-foreground" />
              </View>
              <View className="flex-1">
                <Text className="text-foreground text-[15px] font-semibold">
                  {formatMoney(pkg.unscheduledMinor)} not scheduled yet
                </Text>
                <Text className="text-muted-foreground text-[13px] mt-0.5">Add it as a payment, with when it is due</Text>
              </View>
            </Pressable>
          ) : null}
        </View>

        {/* What the statement offers the client to pay with. */}
        <Pressable
          onPress={() => router.push('/money/pay-methods')}
          accessibilityRole="button"
          className="bg-card rounded-2xl px-4 py-3.5 flex-row items-center gap-3 active:opacity-70"
        >
          <WalletIcon size={18} className="text-muted-foreground" />
          <View className="flex-1">
            <Text className="text-foreground text-[15px] font-semibold">How clients pay you</Text>
            <Text className="text-muted-foreground text-[13px] mt-0.5" numberOfLines={1}>
              {payMethods.length > 0
                ? payMethods.map(payMethodName).join(' · ')
                : 'Add GCash, Maya or bank details for your statements'}
            </Text>
          </View>
        </Pressable>

        {pkg.note ? (
          <Text className="text-muted-foreground text-[13px] leading-[19px] px-1">{pkg.note}</Text>
        ) : null}

        <Pressable
          onPress={confirmDelete}
          disabled={remove.isPending}
          accessibilityRole="button"
          className="min-h-12 flex-row items-center justify-center gap-2 rounded-2xl active:bg-destructive/10 mt-4"
        >
          <Trash2Icon size={16} className="text-destructive" />
          <Text className="text-destructive text-[15px] font-semibold">
            {remove.isPending ? 'Deleting…' : 'Delete package'}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
