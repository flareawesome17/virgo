import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Trash2Icon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { ApiError, PAY_METHOD_KINDS, type PayMethodKind } from '@/src/api';
import {
  useCreateMoneyPayMethod,
  useDeleteMoneyPayMethod,
  useMoneyPayMethods,
  useUpdateMoneyPayMethod,
} from '@/src/hooks';
import { FormHeader } from '@/components/FormHeader';
import { InsetFrame } from '@/components/InsetFrame';
import { CARD_SHADOW, Choice, Label, FormSaveBar } from '@/components/money/FormBits';
import { ReceiptField, draftOf, receiptBusy, type ReceiptDraft } from '@/components/money/ReceiptField';
import { useDiscardGuard } from '@/src/lib/discard-guard';

cssInterop(Trash2Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

const NUMBER_HINT: Record<PayMethodKind, string> = {
  gcash: 'The GCash number, e.g. 0917 123 4567',
  maya: 'The Maya number, e.g. 0917 123 4567',
  bank: 'The account number',
  other: 'Where to send it',
};

/**
 * One way clients can pay you, new or an edit (?id=<id>): which wallet or
 * bank, the account name and number, and the QR code to scan.
 */
export default function PayMethodForm() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEdit = Boolean(id);
  const { payMethods } = useMoneyPayMethods();
  const existing = isEdit ? payMethods.find((m) => m.id === id) : undefined;

  const [kind, setKind] = useState<PayMethodKind>('gcash');
  const [label, setLabel] = useState('');
  const [accountName, setAccountName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [qr, setQr] = useState<ReceiptDraft | null>(null);
  const savedQrId = useRef<string | null>(null);

  const filled = useRef(false);
  useEffect(() => {
    if (!existing || filled.current) return;
    filled.current = true;
    setKind(existing.kind);
    setLabel(existing.label ?? '');
    setAccountName(existing.accountName ?? '');
    setAccountNumber(existing.accountNumber ?? '');
    setQr(draftOf(existing.qr));
    savedQrId.current = existing.qr?.id ?? null;
  }, [existing]);

  const { allowLeave } = useDiscardGuard(
    { kind, label, accountName, accountNumber, qr: qr?.name ?? null },
    !isEdit || filled.current,
  );

  const create = useCreateMoneyPayMethod();
  const update = useUpdateMoneyPayMethod();
  const remove = useDeleteMoneyPayMethod();
  const saving = create.isPending || update.isPending;
  const needsLabel = kind === 'bank' || kind === 'other';

  const leave = () => {
    allowLeave();
    router.back();
  };
  const failed = (err: unknown) =>
    Alert.alert(
      "Couldn't save it",
      err instanceof ApiError && err.status !== 0 ? err.message : 'Check your connection and try again.',
    );

  const save = () => {
    if (saving) return;
    if (receiptBusy(qr)) {
      Alert.alert('One moment', 'The QR code is still uploading.');
      return;
    }
    if (qr?.error) {
      Alert.alert("The QR code didn't upload", 'Remove it and add it again, or save without it.');
      return;
    }
    if (!accountNumber.trim() && !qr?.id) {
      Alert.alert('Add the number or a QR code', 'Something a client can pay to.');
      return;
    }
    const fields = {
      kind,
      label: needsLabel ? label.trim() || null : null,
      accountName: accountName.trim() || null,
      accountNumber: accountNumber.trim() || null,
    };
    const qrId = qr?.id ?? null;
    if (isEdit && id) {
      update.mutate(
        { id, ...fields, ...(qrId !== savedQrId.current ? { qrReceiptId: qrId } : {}) },
        { onSuccess: leave, onError: failed },
      );
      return;
    }
    create.mutate({ ...fields, ...(qrId ? { qrReceiptId: qrId } : {}) }, { onSuccess: leave, onError: failed });
  };

  const confirmDelete = () =>
    id &&
    Alert.alert('Remove this way to pay?', 'Statements stop showing it, including ones already shared.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => remove.mutate(id, { onSuccess: leave, onError: failed }),
      },
    ]);

  return (
    <InsetFrame>
      <FormHeader
        title={isEdit ? 'Edit way to pay' : 'Add a way to pay'}
        action={{ label: 'Save', onPress: save, busy: saving }}
      />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1">
        <ScrollView
          className="flex-1"
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 32 }}
        >
          <View className="px-5 mt-5">
            <Label>Pay with</Label>
            <View className="flex-row flex-wrap gap-2">
              {PAY_METHOD_KINDS.map((k) => (
                <Choice key={k.slug} label={k.label} on={kind === k.slug} onPress={() => setKind(k.slug)} />
              ))}
            </View>
          </View>

          {needsLabel ? (
            <View className="px-5 mt-5">
              <Label>{kind === 'bank' ? 'Bank' : 'What it is'}</Label>
              <TextInput
                value={label}
                onChangeText={setLabel}
                placeholder={kind === 'bank' ? 'e.g. BPI, BDO, UnionBank' : 'e.g. PayPal'}
                placeholderTextColor="#A89489"
                maxLength={60}
                className="bg-card rounded-2xl px-4 py-3.5 text-foreground text-base"
                style={CARD_SHADOW}
              />
            </View>
          ) : null}

          <View className="px-5 mt-5">
            <Label optional>Account name</Label>
            <TextInput
              value={accountName}
              onChangeText={setAccountName}
              placeholder="The name the client will see when they pay"
              placeholderTextColor="#A89489"
              maxLength={120}
              className="bg-card rounded-2xl px-4 py-3.5 text-foreground text-base"
              style={CARD_SHADOW}
            />
          </View>

          <View className="px-5 mt-5">
            <Label>{kind === 'bank' ? 'Account number' : 'Number'}</Label>
            <TextInput
              value={accountNumber}
              onChangeText={setAccountNumber}
              placeholder={NUMBER_HINT[kind]}
              placeholderTextColor="#A89489"
              keyboardType={kind === 'other' ? 'default' : 'number-pad'}
              maxLength={60}
              className="bg-card rounded-2xl px-4 py-3.5 text-foreground text-base"
              style={CARD_SHADOW}
            />
          </View>

          <View className="px-5 mt-5">
            <Label optional>QR code</Label>
            <ReceiptField
              value={qr}
              onChange={setQr}
              disabled={saving}
              label="Add QR code"
              hint="A screenshot of your GCash, Maya or bank QR"
              imagesOnly
            />
          </View>

          <Text className="text-muted-foreground text-[12px] leading-[17px] px-6 mt-5">
            Shown only on statements you share. Virgo never takes or holds a payment.
          </Text>

          {isEdit ? (
            <View className="px-5 mt-8">
              <Pressable
                onPress={confirmDelete}
                disabled={remove.isPending}
                accessibilityRole="button"
                className="min-h-12 flex-row items-center justify-center gap-2 rounded-2xl active:bg-destructive/10"
              >
                <Trash2Icon size={16} className="text-destructive" />
                <Text className="text-destructive text-[15px] font-semibold">Remove</Text>
              </Pressable>
            </View>
          ) : null}
        </ScrollView>

        <FormSaveBar
          label={saving ? 'Saving…' : 'Save'}
          onPress={save}
          busy={saving}
        />
      </KeyboardAvoidingView>
    </InsetFrame>
  );
}
