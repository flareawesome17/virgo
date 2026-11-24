import { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CheckIcon, CopyIcon, DownloadIcon, ShieldCheckIcon, XIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { payMethodName, type MoneyPayMethod } from '@/src/api';
import { PayQr } from '@/components/money/PayQr';
import { CAN_HANDLE_FILES, copyPayNumber, savePayQr, useScreenAwake } from '@/src/lib/pay-method-actions';

for (const Icon of [CheckIcon, CopyIcon, DownloadIcon, ShieldCheckIcon, XIcon]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/**
 * Somebody else's way to pay, full size: opened from a pay card in a chat or
 * from a booking. The QR on white, the name and number, and Copy and Save —
 * saved, it can be uploaded in GCash, Maya or a bank app on this same phone.
 */
export function PayQrModal({
  visible,
  method,
  title,
  onClose,
}: {
  visible: boolean;
  method: MoneyPayMethod | null;
  /** "How to pay Mika". */
  title: string;
  onClose: () => void;
}) {
  const { width } = useWindowDimensions();
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  useScreenAwake(visible);
  if (!method) return null;

  const copy = async () => {
    await copyPayNumber(method);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };
  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      if (await savePayQr(method)) {
        Alert.alert('Saved', 'The QR code is in your photos. Upload it in your GCash, Maya or bank app to pay.');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
        <View className="flex-row items-center px-2 pt-1">
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
            className="w-11 h-11 items-center justify-center active:opacity-60"
          >
            <XIcon size={22} className="text-foreground" />
          </Pressable>
          <Text className="flex-1 text-center text-muted-foreground text-[15px] font-semibold" numberOfLines={1}>
            {title}
          </Text>
          <View className="w-11" />
        </View>

        <ScrollView className="flex-1" contentContainerClassName="items-center px-6 pt-4 pb-4">
          <PayQr
            method={method}
            size={method.qr?.url ? Math.min(width - 64, 320) : 160}
            radius={method.qr?.url ? 26 : 20}
            label="No QR saved"
          />
          <Text className="text-muted-foreground text-[14px] font-bold mt-4">{payMethodName(method)}</Text>
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
                Before you send, check that your app shows the name {method.accountName}.
              </Text>
            </View>
          ) : null}
          {method.qr?.url ? (
            <Text className="text-muted-foreground text-[13px] leading-[18px] text-center mt-3 px-4">
              Paying from this phone? Save the QR, then in GCash, Maya or your bank app tap Scan and choose it.
            </Text>
          ) : null}
        </ScrollView>

        <View className="flex-row justify-center gap-3 px-5 pt-2 pb-3">
          <ModalButton
            icon={copied ? CheckIcon : CopyIcon}
            label={copied ? 'Copied' : 'Copy number'}
            onPress={() => void copy()}
          />
          {CAN_HANDLE_FILES && method.qr?.url ? (
            <ModalButton icon={DownloadIcon} label={saving ? 'Saving…' : 'Save to Photos'} onPress={() => void save()} />
          ) : null}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function ModalButton({ icon: Icon, label, onPress }: { icon: typeof CopyIcon; label: string; onPress: () => void }) {
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
