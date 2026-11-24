import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import {
  CheckIcon,
  CopyIcon,
  DownloadIcon,
  LandmarkIcon,
  PencilIcon,
  ShareIcon,
  ShieldCheckIcon,
  WalletIcon,
  XIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { ApiError, formatMoney, payMethodName, todayIso, type MoneyPayMethod } from '@/src/api';
import { useMoneyPackage, useMoneyPayMethods, useUpdateMoneyEntry } from '@/src/hooks';
import { EmptyState } from '@/components';
import { LoadFailed } from '@/components/LoadFailed';
import { PayQr } from '@/components/money/PayQr';
import { PaySendSheet } from '@/components/money/PaySendSheet';
import {
  CAN_HANDLE_FILES,
  copyPayNumber,
  savePayQr,
  useScreenAwake,
} from '@/src/lib/pay-method-actions';

for (const Icon of [
  CheckIcon,
  CopyIcon,
  DownloadIcon,
  LandmarkIcon,
  PencilIcon,
  ShareIcon,
  ShieldCheckIcon,
  WalletIcon,
  XIcon,
]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

function message(err: unknown, fallback: string): string {
  return err instanceof ApiError && err.status !== 0 ? err.message : fallback;
}

/**
 * Show QR: one way to pay, full size, for a client to scan in person
 * (?id=<method>, else the main one). Chips along the top switch to another
 * in one tap. Copy, save and send sit under it.
 *
 * From a package (?package=<id>) it leads with what is due, and once the
 * money is in, "They've paid" marks that payment received.
 */
export default function ShowPayMethodScreen() {
  const params = useLocalSearchParams<{ id?: string; package?: string }>();
  const { payMethods, isLoading, loadFailed, refetch } = useMoneyPayMethods();
  const { width } = useWindowDimensions();
  const [picked, setPicked] = useState<string | undefined>(params.id);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<'save' | null>(null);
  const [sending, setSending] = useState(false);
  useScreenAwake();

  const method: MoneyPayMethod | undefined = useMemo(
    () => payMethods.find((m) => m.id === picked) ?? payMethods[0],
    [payMethods, picked],
  );

  // From a package: the next payment due, and what it asks the client to send.
  const { pkg, entries } = useMoneyPackage(params.package);
  const update = useUpdateMoneyEntry();
  const nextDue = useMemo(
    () =>
      entries
        .filter((e) => e.kind === 'income' && e.paidOn === null)
        .sort((a, b) => a.occurredOn.localeCompare(b.occurredOn))[0],
    [entries],
  );
  const dueMinor = nextDue ? nextDue.amountMinor - nextDue.withheldMinor : pkg && !pkg.paidInFull ? pkg.balanceMinor : 0;
  const today = todayIso();
  const dueLabel = !nextDue
    ? 'Balance'
    : nextDue.occurredOn < today
      ? 'Overdue'
      : nextDue.occurredOn === today
        ? 'Due today'
        : 'Next payment';

  const close = () => (router.canGoBack() ? router.back() : router.replace('/money'));

  const copy = async () => {
    if (!method) return;
    await copyPayNumber(method);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };
  const save = async () => {
    if (!method || busy) return;
    setBusy('save');
    try {
      if (await savePayQr(method)) Alert.alert('Saved', 'The QR code is in your photos.');
    } finally {
      setBusy(null);
    }
  };
  const send = () => {
    if (method) setSending(true);
  };

  const markPaid = () => {
    if (!pkg) return;
    if (!nextDue) {
      router.replace(`/money/new?package=${pkg.id}`);
      return;
    }
    update.mutate(
      { id: nextDue.id, paidOn: today },
      {
        onSuccess: () => {
          Alert.alert('Recorded', `${formatMoney(dueMinor)} marked received.`);
          close();
        },
        onError: (err) => Alert.alert("Couldn't mark it paid", message(err, 'Please try again.')),
      },
    );
  };

  const qrSize = Math.min(width - 64, params.package ? 280 : 320);
  const fromPackage = !!params.package && !!pkg && dueMinor > 0;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <View className="flex-row items-center px-2 pt-1">
        <Pressable
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel="Close"
          className="w-11 h-11 items-center justify-center active:opacity-60"
        >
          <XIcon size={22} className="text-foreground" />
        </Pressable>
        <Text className="flex-1 text-center text-muted-foreground text-[15px] font-semibold" numberOfLines={1}>
          {params.package && pkg ? pkg.title : 'Show a QR'}
        </Text>
        {method ? (
          <Pressable
            onPress={() => router.push(`/money/pay-methods/edit?id=${method.id}`)}
            accessibilityRole="button"
            accessibilityLabel={`Edit ${payMethodName(method)}`}
            className="w-11 h-11 items-center justify-center active:opacity-60"
          >
            <PencilIcon size={19} className="text-foreground" />
          </Pressable>
        ) : (
          <View className="w-11" />
        )}
      </View>

      {isLoading ? null : loadFailed && payMethods.length === 0 ? (
        <LoadFailed what="your ways to pay" onRetry={() => void refetch()} />
      ) : !method ? (
        <View className="flex-1 justify-center">
          <EmptyState
            icon={WalletIcon}
            title="No ways to pay yet"
            body="Add your GCash, Maya or bank details and their QR codes, and show them here for a client to scan."
            action={{ label: 'Add a way to pay', onPress: () => router.replace('/money/pay-methods/edit') }}
          />
        </View>
      ) : (
        <>
          {payMethods.length > 1 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              className="grow-0"
              contentContainerClassName="px-5 gap-2 pt-2"
              contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}
            >
              {payMethods.map((m) => {
                const on = m.id === method.id;
                return (
                  <Pressable
                    key={m.id}
                    onPress={() => setPicked(m.id)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    className={`h-10 px-4 rounded-full items-center justify-center ${on ? 'bg-foreground' : 'bg-secondary'}`}
                  >
                    <Text className={`text-[14px] font-semibold ${on ? 'text-background' : 'text-foreground'}`}>
                      {payMethodName(m)}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : null}

          <ScrollView className="flex-1" contentContainerClassName="items-center px-6 pt-4 pb-4">
            {fromPackage ? (
              <View className="items-center mb-3">
                <Text className="text-muted-foreground text-[13px] font-semibold">{dueLabel}</Text>
                <Text className="text-foreground text-[34px] font-extrabold" style={{ fontVariant: ['tabular-nums'] }}>
                  {formatMoney(dueMinor)}
                </Text>
              </View>
            ) : null}

            {/* Without a QR the number is the point, so the tile steps back. */}
            <PayQr
              method={method}
              size={method.qr?.url ? qrSize : Math.min(qrSize, 160)}
              radius={method.qr?.url ? 26 : 20}
              label="No QR saved"
            />

            <View className="flex-row items-center gap-1.5 mt-4">
              {method.kind === 'bank' ? (
                <LandmarkIcon size={15} className="text-muted-foreground" />
              ) : (
                <WalletIcon size={15} className="text-muted-foreground" />
              )}
              <Text className="text-muted-foreground text-[14px] font-bold">{payMethodName(method)}</Text>
            </View>
            {method.accountName ? (
              <Text className="text-foreground text-[22px] font-bold mt-1 text-center">{method.accountName}</Text>
            ) : null}
            {method.accountNumber ? (
              <Text
                selectable
                className="text-foreground text-[20px] font-semibold mt-0.5 text-center"
                style={{ fontVariant: ['tabular-nums'], letterSpacing: 0.8 }}
              >
                {method.accountNumber}
              </Text>
            ) : null}
            {method.accountName ? (
              <View className="flex-row gap-2 mt-3 px-2">
                <ShieldCheckIcon size={15} className="text-muted-foreground mt-0.5" />
                <Text className="flex-1 text-muted-foreground text-[13px] leading-[18px]">
                  Before they send, ask them to check that their app shows the name {method.accountName}.
                </Text>
              </View>
            ) : null}
          </ScrollView>

          <View className="flex-row justify-center gap-3 px-5 pt-2 pb-3">
            <ActionButton
              icon={copied ? CheckIcon : CopyIcon}
              label={copied ? 'Copied' : method.accountNumber ? 'Copy number' : 'Copy details'}
              onPress={() => void copy()}
            />
            {CAN_HANDLE_FILES && method.qr?.url ? (
              <ActionButton
                icon={DownloadIcon}
                label={busy === 'save' ? 'Saving…' : 'Save to Photos'}
                onPress={() => void save()}
              />
            ) : null}
            <ActionButton icon={ShareIcon} label="Send" onPress={send} />
          </View>

          {fromPackage ? (
            <View className="px-5 pb-2 gap-2">
              <Pressable
                onPress={markPaid}
                disabled={update.isPending}
                accessibilityRole="button"
                className="h-[52px] rounded-[14px] bg-success flex-row items-center justify-center gap-2 active:opacity-85"
                style={{ opacity: update.isPending ? 0.6 : 1 }}
              >
                <CheckIcon size={18} className="text-white" />
                <Text className="text-white text-[16px] font-semibold">
                  {nextDue ? `They've paid: record ${formatMoney(dueMinor)}` : "They've paid: record it"}
                </Text>
              </Pressable>
              <Text className="text-muted-foreground text-[12px] text-center">
                Check it arrived in your {payMethodName(method)} first.
              </Text>
            </View>
          ) : (
            <View className="flex-row items-center justify-center gap-1 px-6 pb-1">
              <Text className="text-muted-foreground text-[12px]">The screen stays on while this is open ·</Text>
              <Pressable
                onPress={() => router.push('/money/pay-methods')}
                accessibilityRole="button"
                className="min-h-9 justify-center active:opacity-60"
              >
                <Text className="text-action text-[12px] font-semibold">All ways to pay</Text>
              </Pressable>
            </View>
          )}
        </>
      )}
      <PaySendSheet
        visible={sending}
        method={method ?? null}
        packageId={params.package}
        onClose={() => setSending(false)}
      />
    </SafeAreaView>
  );
}

function ActionButton({
  icon: Icon,
  label,
  onPress,
}: {
  icon: typeof CopyIcon;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="w-[104px] items-center gap-1.5 active:opacity-70"
    >
      <View className="w-14 h-14 rounded-[18px] bg-secondary items-center justify-center">
        <Icon size={22} className="text-foreground" />
      </View>
      <Text className="text-muted-foreground text-[12px] font-medium text-center">{label}</Text>
    </Pressable>
  );
}
