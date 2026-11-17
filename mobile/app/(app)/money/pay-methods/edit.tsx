import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { StarIcon, Trash2Icon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { ApiError, PAY_METHOD_KINDS, type DeleteProof, type PayMethodKind } from '@/src/api';
import {
  useCreateMoneyPayMethod,
  useDeleteMoneyPayMethod,
  useMakeMainMoneyPayMethod,
  useMoneyPayMethods,
  useUpdateMoneyPayMethod,
} from '@/src/hooks';
import { DeleteConfirmSheet } from '@/components/DeleteConfirmSheet';
import { FormHeader } from '@/components/FormHeader';
import { InsetFrame } from '@/components/InsetFrame';
import { CARD_SHADOW, Choice, Label, FormSaveBar } from '@/components/money/FormBits';
import { ReceiptField, draftOf, receiptBusy, type ReceiptDraft } from '@/components/money/ReceiptField';
import { useDiscardGuard } from '@/src/lib/discard-guard';
import { useKeyboardAwareScroll } from '@/src/lib/keyboard';

for (const Icon of [StarIcon, Trash2Icon]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

const NUMBER_HINT: Record<PayMethodKind, string> = {
  gcash: 'The GCash number, e.g. 0917 123 4567',
  maya: 'The Maya number, e.g. 0917 123 4567',
  bank: 'The account number',
  other: 'Where to send it',
};

/**
 * One way clients can pay you, new or an edit (?id=<id>): which wallet or
 * bank, the account name and number, and the QR code to scan.
 *
 * Saving or removing asks for the password first, or with two-factor on the
 * emailed code: these details decide where a client's money goes, and a
 * stranger in the account swapping in their own QR code is the harm here.
 * Making one the main way to pay asks for nothing; it moves no money.
 */
export default function PayMethodForm() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEdit = Boolean(id);
  const keyboard = useKeyboardAwareScroll();
  const { payMethods } = useMoneyPayMethods();
  const existing = isEdit ? payMethods.find((m) => m.id === id) : undefined;
  const isMain = isEdit && payMethods[0]?.id === id;

  const [kind, setKind] = useState<PayMethodKind>('gcash');
  const [label, setLabel] = useState('');
  const [accountName, setAccountName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [qr, setQr] = useState<ReceiptDraft | null>(null);
  const [confirm, setConfirm] = useState<'save' | 'remove' | null>(null);
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
  const makeMain = useMakeMainMoneyPayMethod();
  const saving = create.isPending || update.isPending;
  const needsLabel = kind === 'bank' || kind === 'other';

  const leave = () => {
    allowLeave();
    router.back();
  };

  const fields = () => ({
    kind,
    label: needsLabel ? label.trim() || null : null,
    accountName: accountName.trim() || null,
    accountNumber: accountNumber.trim() || null,
  });

  /** An edit that changes nothing a client pays to needs no password: it just closes. */
  const unchanged = () => {
    if (!existing) return false;
    const f = fields();
    return (
      f.kind === existing.kind &&
      f.label === (needsLabel ? existing.label : null) &&
      f.accountName === existing.accountName &&
      f.accountNumber === existing.accountNumber &&
      (qr?.id ?? null) === savedQrId.current
    );
  };

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
    if (isEdit && unchanged()) {
      leave();
      return;
    }
    setConfirm('save');
  };

  /** The save itself, once the sheet has the password or the code. */
  const performSave = (proof: DeleteProof) => {
    const qrId = qr?.id ?? null;
    if (isEdit && id) {
      return update.mutateAsync({
        id,
        ...fields(),
        ...(qrId !== savedQrId.current ? { qrReceiptId: qrId } : {}),
        proof,
      });
    }
    return create.mutateAsync({ ...fields(), ...(qrId ? { qrReceiptId: qrId } : {}), proof });
  };

  const performRemove = (proof: DeleteProof) => remove.mutateAsync({ id: id as string, proof });

  const setAsMain = () =>
    id &&
    makeMain.mutate(id, {
      onError: (err) =>
        Alert.alert(
          "Couldn't change it",
          err instanceof ApiError && err.status !== 0 ? err.message : 'Check your connection and try again.',
        ),
    });

  return (
    <InsetFrame>
      <FormHeader
        title={isEdit ? 'Edit way to pay' : 'Add a way to pay'}
        action={{ label: 'Save', onPress: save, busy: saving }}
      />
      <View className="flex-1">
        <ScrollView
          className="flex-1"
          ref={keyboard.scrollRef}
          onScroll={keyboard.onScroll}
          scrollEventThrottle={keyboard.scrollEventThrottle}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 32 + keyboard.room }}
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
                onFocus={keyboard.onFocus}
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
              onFocus={keyboard.onFocus}
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
              onFocus={keyboard.onFocus}
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

          {isEdit ? (
            <View className="px-5 mt-5">
              {isMain ? (
                <View className="flex-row items-center gap-2 px-1">
                  <StarIcon size={15} className="text-action" />
                  <Text className="text-muted-foreground text-[13px]">
                    Your main way to pay: first on Show QR and on statements.
                  </Text>
                </View>
              ) : (
                <Pressable
                  onPress={setAsMain}
                  disabled={makeMain.isPending || makeMain.isSuccess}
                  accessibilityRole="button"
                  className="min-h-12 flex-row items-center gap-3 rounded-2xl bg-card px-4 active:opacity-70"
                  style={CARD_SHADOW}
                >
                  <StarIcon size={17} className="text-action" />
                  <Text className="flex-1 text-foreground text-[15px] font-semibold">
                    {makeMain.isSuccess ? 'This is now your main way to pay' : 'Make this my main way to pay'}
                  </Text>
                </Pressable>
              )}
            </View>
          ) : null}

          <Text className="text-muted-foreground text-[12px] leading-[17px] px-6 mt-5">
            Saving asks for your password, and we email you when these details change. Virgo never takes or
            holds a payment.
          </Text>

          {isEdit ? (
            <View className="px-5 mt-8">
              <Pressable
                onPress={() => setConfirm('remove')}
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
      </View>

      <DeleteConfirmSheet
        visible={confirm === 'save'}
        purpose="pay_details"
        tone="action"
        title="Confirm it's you"
        message="This decides where your clients' money goes, so changing it needs your password. We'll email you when it changes."
        confirmLabel="Confirm and save"
        onCancel={() => setConfirm(null)}
        onConfirm={performSave}
        onDone={() => {
          setConfirm(null);
          leave();
        }}
      />
      <DeleteConfirmSheet
        visible={confirm === 'remove'}
        purpose="pay_details"
        title="Remove this way to pay?"
        message="Statements stop showing it, including ones already shared. Enter your password to remove it."
        confirmLabel="Remove"
        onCancel={() => setConfirm(null)}
        onConfirm={performRemove}
        onDone={() => {
          setConfirm(null);
          leave();
        }}
      />
    </InsetFrame>
  );
}
