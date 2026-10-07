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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { ToggleLeftIcon, ToggleRightIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import {
  ApiError,
  dateOfIso,
  formatMoney,
  isoDay,
  minorToPesos,
  pesosToMinor,
  todayIso,
} from '@/src/api';
import { useCreateMoneyPackage, useMoneyPackage, useUpdateMoneyPackage } from '@/src/hooks';
import { DateTimeField } from '@/components';
import { DetailFallback } from '@/components/DetailFallback';
import { FormHeader } from '@/components/FormHeader';
import { InsetFrame } from '@/components/InsetFrame';
import { KEYBOARD_DONE } from '@/components/KeyboardDoneBar';
import { CARD_SHADOW, Label } from '@/components/money/FormBits';
import { useDiscardGuard } from '@/src/lib/discard-guard';
import { newClientId } from '@/src/lib/outbox';

for (const Icon of [ToggleLeftIcon, ToggleRightIcon]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

function MoneyInput({
  value,
  onChangeText,
  label,
  large,
  autoFocus,
}: {
  value: string;
  onChangeText: (text: string) => void;
  label: string;
  large?: boolean;
  autoFocus?: boolean;
}) {
  return (
    <View className="bg-card rounded-2xl px-4 flex-row items-center gap-2" style={CARD_SHADOW}>
      <Text className={`font-bold text-muted-foreground ${large ? 'text-[24px]' : 'text-base'}`}>₱</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder="0"
        placeholderTextColor="#A89489"
        keyboardType="decimal-pad"
        inputAccessoryViewID={KEYBOARD_DONE}
        autoFocus={autoFocus}
        accessibilityLabel={label}
        className={`flex-1 min-w-0 text-foreground ${large ? 'text-[26px] font-bold py-3' : 'text-base py-3.5'}`}
      />
    </View>
  );
}

/**
 * A package — what a client agreed to pay for a job — new, or an edit
 * (?edit=<id>).
 *
 * New, it takes the plan as well: the down payment, received or due, and
 * when the balance is due. Those become payments in the ledger, made with
 * the package. An edit changes the package's own details; its payments are
 * changed one by one on its screen.
 */
export default function MoneyPackageForm() {
  const insets = useSafeAreaInsets();
  const { edit: editId } = useLocalSearchParams<{ edit?: string }>();
  const isEdit = Boolean(editId);
  const { pkg: existing, error, loadFailed, refetch } = useMoneyPackage(editId);

  const [id] = useState(() => editId ?? newClientId());
  const [title, setTitle] = useState('');
  const [client, setClient] = useState('');
  const [total, setTotal] = useState('');
  const [eventDate, setEventDate] = useState<Date | null>(null);
  const [note, setNote] = useState('');
  const [deposit, setDeposit] = useState('');
  const [depositReceived, setDepositReceived] = useState(true);
  const [depositDate, setDepositDate] = useState(() => dateOfIso(todayIso()));
  const [balanceDue, setBalanceDue] = useState<Date | null>(null);
  // Follows the event date until somebody picks one of their own.
  const balanceTouched = useRef(false);

  const filled = useRef(false);
  useEffect(() => {
    if (!existing || filled.current) return;
    filled.current = true;
    setTitle(existing.title);
    setClient(existing.clientName ?? '');
    setTotal(minorToPesos(existing.totalMinor));
    setEventDate(existing.eventDate ? dateOfIso(existing.eventDate) : null);
    setNote(existing.note ?? '');
  }, [existing]);

  const { allowLeave } = useDiscardGuard(
    {
      title, client, total, event: eventDate?.getTime() ?? null, note, deposit, depositReceived,
      depositDate: depositDate.getTime(), balanceDue: balanceDue?.getTime() ?? null,
    },
    !isEdit || filled.current,
  );

  const create = useCreateMoneyPackage();
  const update = useUpdateMoneyPackage();
  const saving = create.isPending || update.isPending;

  const totalMinor = pesosToMinor(total);
  const depositMinor = deposit.trim() ? pesosToMinor(deposit) : 0;
  const rest = totalMinor && depositMinor !== null ? totalMinor - depositMinor : null;

  const pickEvent = (next: Date | null) => {
    setEventDate(next);
    if (!balanceTouched.current) setBalanceDue(next);
  };

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
    if (!title.trim()) {
      Alert.alert('Name the package', 'The job it is for — "Garcia–Lim wedding", say.');
      return;
    }
    if (!totalMinor) {
      Alert.alert('Enter the total', 'What the client agreed to pay, in pesos.');
      return;
    }
    const fields = {
      title: title.trim(),
      clientName: client.trim() || null,
      totalMinor,
      eventDate: eventDate ? isoDay(eventDate) : null,
      note: note.trim() || null,
    };
    if (isEdit && editId) {
      update.mutate({ id: editId, ...fields }, { onSuccess: leave, onError: failed });
      return;
    }
    if (depositMinor === null) {
      Alert.alert('Check the down payment', 'Type it in pesos, or leave it empty.');
      return;
    }
    if (depositMinor > totalMinor) {
      Alert.alert('Check the down payment', "It can't be more than the total.");
      return;
    }
    const depositDay = isoDay(depositDate);
    if (depositMinor > 0 && depositReceived && depositDay > todayIso()) {
      Alert.alert('That day is still ahead', 'Turn off Received — it is a down payment still to come, due that day.');
      return;
    }
    create.mutate(
      {
        id,
        ...fields,
        deposit:
          depositMinor > 0
            ? depositReceived
              ? { amountMinor: depositMinor, paidOn: depositDay }
              : { amountMinor: depositMinor, paidOn: null, dueOn: depositDay }
            : null,
        balanceDueOn: balanceDue ? isoDay(balanceDue) : null,
      },
      {
        onSuccess: (made) => {
          allowLeave();
          router.replace(`/money/packages/${made.package.id}`);
        },
        onError: failed,
      },
    );
  };

  if (isEdit && !existing) {
    return (
      <DetailFallback
        title="Edit package"
        what="this package"
        gone="It was deleted."
        error={error}
        failed={loadFailed}
        onRetry={() => void refetch()}
      />
    );
  }

  return (
    <InsetFrame>
      <FormHeader
        title={isEdit ? 'Edit package' : 'New package'}
        action={{ label: 'Save', onPress: save, busy: saving }}
      />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1">
        <ScrollView
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 140 }}
        >
          <View className="px-5 mt-5">
            <Label>Job</Label>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. Garcia–Lim wedding"
              placeholderTextColor="#A89489"
              maxLength={120}
              autoFocus={!isEdit}
              className="bg-card rounded-2xl px-4 py-3.5 text-foreground text-base"
              style={CARD_SHADOW}
            />
          </View>

          <View className="px-5 mt-4">
            <Label optional>Client</Label>
            <TextInput
              value={client}
              onChangeText={setClient}
              placeholder="Who is paying"
              placeholderTextColor="#A89489"
              maxLength={120}
              className="bg-card rounded-2xl px-4 py-3.5 text-foreground text-base"
              style={CARD_SHADOW}
            />
          </View>

          <View className="px-5 mt-4">
            <Label>Total</Label>
            <MoneyInput value={total} onChangeText={setTotal} label="Total in pesos" large />
          </View>

          <View className="px-5 mt-4 flex-row gap-3">
            <DateTimeField
              label="Event date"
              mode="date"
              value={eventDate}
              onChange={pickEvent}
              emptyLabel="Not set"
              clearable
            />
          </View>

          {!isEdit ? (
            <>
              <View className="px-5 mt-7">
                <Text className="text-foreground text-[15px] font-bold">Payment plan</Text>
                <Text className="text-muted-foreground text-[13px] mt-0.5 leading-[18px]">
                  The down payment or reservation fee, and when the rest is due. You can add or
                  change payments later.
                </Text>
              </View>

              <View className="px-5 mt-4">
                <Label optional>Down payment</Label>
                <MoneyInput value={deposit} onChangeText={setDeposit} label="Down payment in pesos" />
              </View>

              {depositMinor ? (
                <>
                  <View className="px-5 mt-3">
                    <Pressable
                      onPress={() => setDepositReceived((v) => !v)}
                      accessibilityRole="switch"
                      accessibilityState={{ checked: depositReceived }}
                      className="bg-card rounded-2xl px-4 py-3.5 flex-row items-center gap-3 active:scale-[0.98]"
                      style={CARD_SHADOW}
                    >
                      <View className="flex-1">
                        <Text className="text-foreground text-sm font-semibold">Received</Text>
                        <Text className="text-muted-foreground text-xs mt-0.5">
                          {depositReceived ? 'The down payment is in' : 'Still to come — due on the date below'}
                        </Text>
                      </View>
                      {depositReceived ? (
                        <ToggleRightIcon size={26} className="text-primary" />
                      ) : (
                        <ToggleLeftIcon size={26} className="text-muted-foreground" />
                      )}
                    </Pressable>
                  </View>
                  <View className="px-5 mt-3 flex-row gap-3">
                    <DateTimeField
                      label={depositReceived ? 'Received on' : 'Due'}
                      mode="date"
                      value={depositDate}
                      onChange={(next) => next && setDepositDate(next)}
                    />
                  </View>
                </>
              ) : null}

              <View className="px-5 mt-4 flex-row gap-3">
                <DateTimeField
                  label={rest !== null && rest > 0 ? `Balance of ${formatMoney(rest)} due` : 'Balance due'}
                  mode="date"
                  value={balanceDue}
                  onChange={(next) => {
                    balanceTouched.current = true;
                    setBalanceDue(next);
                  }}
                  emptyLabel="Not decided yet"
                  clearable
                />
              </View>
            </>
          ) : null}

          <View className="px-5 mt-5">
            <Label optional>Note</Label>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="What the package covers…"
              placeholderTextColor="#A89489"
              multiline
              numberOfLines={3}
              maxLength={1000}
              textAlignVertical="top"
              className="bg-card rounded-2xl px-4 py-3.5 text-foreground text-base"
              style={{ ...CARD_SHADOW, minHeight: 72 }}
            />
          </View>
        </ScrollView>

        <View
          className="absolute bottom-0 left-0 right-0 px-5 pt-3 bg-background"
          style={{ paddingBottom: insets.bottom + 16 }}
        >
          <Pressable
            onPress={save}
            disabled={saving}
            accessibilityRole="button"
            className="rounded-2xl py-3.5 items-center bg-action active:scale-[0.97]"
            style={{ opacity: saving ? 0.6 : 1 }}
          >
            <Text className="text-white text-base font-bold">
              {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create package'}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </InsetFrame>
  );
}
