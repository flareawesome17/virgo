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
import { onlineManager } from '@tanstack/react-query';
import { ChevronRightIcon, RepeatIcon, ToggleLeftIcon, ToggleRightIcon, Trash2Icon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import {
  ApiError,
  dateOfIso,
  isoDay,
  minorToPesos,
  MONEY_CATEGORIES,
  MONEY_METHODS,
  pesosToMinor,
  todayIso,
  type MoneyEntryInput,
  type MoneyKind,
  type MoneyMethod,
  bookingLabel,
  dayOfMonthLabel,
} from '@/src/api';
import {
  useCreateMoneyEntry,
  useDeleteMoneyEntry,
  useMoneyEntry,
  useMoneyForBooking,
  useMoneyPackage,
  useRepeatMoneyEntry,
  useUpdateMoneyEntry,
} from '@/src/hooks';
import { DateTimeField } from '@/components';
import { DetailFallback } from '@/components/DetailFallback';
import { FormHeader } from '@/components/FormHeader';
import { InsetFrame } from '@/components/InsetFrame';
import { KEYBOARD_DONE } from '@/components/KeyboardDoneBar';
import { SegmentedTabs } from '@/components/SegmentedTabs';
import { categoryIcon } from '@/components/money/icons';
import { CARD_SHADOW, Choice, Label, FormSaveBar } from '@/components/money/FormBits';
import { ReceiptField, draftOf, receiptBusy, type ReceiptDraft } from '@/components/money/ReceiptField';
import { useDiscardGuard } from '@/src/lib/discard-guard';
import { queueMoneyEntry } from '@/src/lib/money-outbox';
import { newClientId } from '@/src/lib/outbox';

for (const Icon of [ChevronRightIcon, RepeatIcon, ToggleLeftIcon, ToggleRightIcon, Trash2Icon]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/**
 * A money entry: new (?kind=income|expense), new from an agreed booking
 * (?booking=<id>, filled in from it), a payment toward a package
 * (?package=<id>) or a cost of one (?package=<id>&kind=expense), or an edit
 * (?edit=<id>).
 *
 * Built for the venue: amount, a category, Save — the rest is there when it
 * matters and can be skipped when it doesn't. A new entry with no signal is
 * kept on the phone and sent when there is one (money-outbox), under the id
 * made for it here, so it can never be saved twice.
 */
export default function MoneyEntryScreen() {
  const {
    kind: kindParam,
    edit: editId,
    booking: bookingParam,
    package: packageParam,
  } = useLocalSearchParams<{ kind?: string; edit?: string; booking?: string; package?: string }>();
  const isEdit = Boolean(editId);
  const { entry: existing, error: existingError, loadFailed, refetch } = useMoneyEntry(editId);
  // The booking's offer, when opened from one. Once recorded or turned down
  // there is none, and this is an ordinary new entry.
  const offerQuery = useMoneyForBooking(isEdit ? undefined : bookingParam);
  const offer = offerQuery.suggestion;
  // A payment toward a package, when opened from one: filled in with what is
  // left, and linked to it.
  const packageQuery = useMoneyPackage(isEdit ? undefined : packageParam);
  const toward = packageQuery.pkg;

  // Made once, before the first attempt, and kept across every retry.
  const [id] = useState(() => editId ?? newClientId());
  const [kind, setKind] = useState<MoneyKind>(kindParam === 'income' ? 'income' : 'expense');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<string | null>(kindParam === 'income' ? 'job' : null);
  const [date, setDate] = useState(() => dateOfIso(todayIso()));
  const [paid, setPaid] = useState(true);
  // Null: paid on the entry's own date. Set when it was paid another day.
  const [paidOn, setPaidOn] = useState<Date | null>(null);
  const [method, setMethod] = useState<MoneyMethod | null>(null);
  const [counterparty, setCounterparty] = useState('');
  const [reference, setReference] = useState('');
  const [withheld, setWithheld] = useState('');
  const [note, setNote] = useState('');
  const [receipt, setReceipt] = useState<ReceiptDraft | null>(null);
  const savedReceiptId = useRef<string | null>(null);
  // Repeat every month: made into a repeating entry once this one is saved.
  const [repeat, setRepeat] = useState(false);

  // Editing: filled once from the entry, then the form is theirs.
  const filled = useRef(false);
  useEffect(() => {
    if (!existing || filled.current) return;
    filled.current = true;
    setKind(existing.kind);
    setAmount(minorToPesos(existing.amountMinor));
    setCategory(existing.category);
    setDate(dateOfIso(existing.occurredOn));
    setPaid(existing.paidOn !== null);
    setPaidOn(
      existing.paidOn && existing.paidOn !== existing.occurredOn ? dateOfIso(existing.paidOn) : null,
    );
    setMethod(existing.method);
    setCounterparty(existing.counterparty ?? '');
    setReference(existing.reference ?? '');
    setWithheld(existing.withheldMinor > 0 ? minorToPesos(existing.withheldMinor) : '');
    setNote(existing.note ?? '');
    setReceipt(draftOf(existing.receipt));
    savedReceiptId.current = existing.receipt?.id ?? null;
  }, [existing]);

  // From a booking: filled once from its offer, then the form is theirs.
  useEffect(() => {
    if (!offer || filled.current) return;
    filled.current = true;
    setKind(offer.kind);
    setAmount(offer.amountMinor !== null ? minorToPesos(offer.amountMinor) : '');
    setCategory(offer.category);
    setDate(dateOfIso(offer.occurredOn));
    setPaid(offer.paid);
    setCounterparty(offer.counterparty);
    setNote(offer.note);
  }, [offer]);

  useEffect(() => {
    if (!toward || filled.current) return;
    filled.current = true;
    if (kindParam === 'expense') {
      // A cost of the job — the second shooter, the venue, the transport — so
      // the package can say what the job really earned.
      setKind('expense');
      setCategory(null);
      setNote(`${toward.title} · Cost`);
      return;
    }
    setKind('income');
    const amountLeft = toward.unscheduledMinor > 0 ? toward.unscheduledMinor : toward.balanceMinor;
    setAmount(amountLeft > 0 ? minorToPesos(amountLeft) : '');
    setCategory('job');
    setCounterparty(toward.clientName ?? '');
    setNote(`${toward.title} · Payment`);
  }, [toward, kindParam]);

  // What the form held once it was filled — or, from a booking with nothing
  // left to offer, once that was known — is what "changed" is measured from.
  const ready = isEdit
    ? filled.current
    : packageParam
      ? filled.current || (packageQuery.isFetched && !toward)
      : !bookingParam || filled.current || (offerQuery.isFetched && !offer);
  const { allowLeave } = useDiscardGuard(
    {
      kind, amount, category, date: date.getTime(), paid, paidOn: paidOn?.getTime() ?? null,
      method, counterparty, reference, withheld, note, receipt: receipt?.name ?? null, repeat,
    },
    ready,
  );

  const create = useCreateMoneyEntry();
  const update = useUpdateMoneyEntry();
  const remove = useDeleteMoneyEntry();
  const repeatEntry = useRepeatMoneyEntry();
  const saving = create.isPending || update.isPending || repeatEntry.isPending;

  const switchKind = (next: MoneyKind) => {
    if (next === kind) return;
    setKind(next);
    if (!category || !MONEY_CATEGORIES[next].some((c) => c.slug === category)) {
      setCategory(next === 'income' ? 'job' : null);
    }
  };

  const leave = () => {
    allowLeave();
    router.back();
  };

  const save = () => {
    if (saving) return;
    const amountMinor = pesosToMinor(amount);
    if (!amountMinor) {
      Alert.alert('Enter an amount', 'Type it in pesos, like 1500 or 350.50.');
      return;
    }
    if (!category) {
      Alert.alert('Pick a category', 'It is what the totals and the export are sorted by.');
      return;
    }
    let withheldMinor = 0;
    if (kind === 'income' && withheld.trim()) {
      const parsed = pesosToMinor(withheld);
      if (!parsed) {
        Alert.alert('Check the tax withheld', 'Type it in pesos, or leave it empty if the client kept nothing back.');
        return;
      }
      if (parsed > amountMinor) {
        Alert.alert('Check the tax withheld', "It can't be more than the amount.");
        return;
      }
      withheldMinor = parsed;
    }
    if (receiptBusy(receipt)) {
      Alert.alert('One moment', 'The receipt is still uploading.');
      return;
    }
    if (receipt?.error) {
      Alert.alert("The receipt didn't upload", 'Remove it and add it again, or save without it.');
      return;
    }
    const occurredOn = isoDay(date);
    const paidDay = paid ? isoDay(paidOn ?? date) : null;
    if (paidDay && paidDay > todayIso()) {
      Alert.alert(
        'That day is still ahead',
        kind === 'income'
          ? "Turn off Received — it's money you're still waiting for, due that day."
          : "Turn off Paid — it's a bill still to pay, due that day.",
      );
      return;
    }

    const fields = {
      kind,
      amountMinor,
      withheldMinor,
      category,
      occurredOn,
      paidOn: paidDay,
      method,
      reference: reference.trim() || null,
      counterparty: counterparty.trim() || null,
      note: note.trim() || null,
    };
    const failed = (error: unknown) =>
      Alert.alert(
        "Couldn't save it",
        error instanceof ApiError && error.status !== 0 ? error.message : 'Something went wrong. Please try again.',
      );
    if (repeat && !onlineManager.isOnline()) {
      Alert.alert(
        "You're offline",
        'Repeating every month needs a connection. Turn off Repeat to keep it on this phone for now.',
      );
      return;
    }
    // Saved; then, when asked, made to repeat. The entry stays saved whatever
    // that second step does.
    const saved = () => {
      if (!repeat) {
        leave();
        return;
      }
      repeatEntry.mutate(id, {
        onSuccess: (result) => {
          leave();
          Alert.alert('Repeats every month', result.note);
        },
        onError: (error) => {
          leave();
          Alert.alert(
            "Saved, but it won't repeat yet",
            error instanceof ApiError && error.status !== 0
              ? error.message
              : 'Open the entry again and turn on Repeat when you have a connection.',
          );
        },
      });
    };

    if (isEdit) {
      const receiptId = receipt?.id ?? null;
      if (!onlineManager.isOnline()) {
        Alert.alert("You're offline", 'Changes to an entry need a connection. New entries can be added offline.');
        return;
      }
      update.mutate(
        { id, ...fields, ...(receiptId !== savedReceiptId.current ? { receiptId } : {}) },
        { onSuccess: saved, onError: failed },
      );
      return;
    }

    const input: MoneyEntryInput & { id: string } = {
      id,
      ...fields,
      ...(receipt?.id ? { receiptId: receipt.id } : {}),
      ...(offer ? { bookingId: offer.bookingId } : {}),
      ...(toward ? { packageId: toward.id } : {}),
    };
    // No signal: kept on the phone, and sent when there is one.
    if (!onlineManager.isOnline()) {
      queueMoneyEntry(input);
      leave();
      return;
    }
    create.mutate(input, {
      onSuccess: saved,
      onError: (error) => {
        if (error instanceof ApiError && error.status === 0 && !repeat) {
          queueMoneyEntry(input);
          leave();
          return;
        }
        failed(error);
      },
    });
  };

  const confirmDelete = () =>
    Alert.alert('Delete this entry?', 'It comes out of your totals, and its receipt is deleted too.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          remove.mutate(id, {
            onSuccess: leave,
            onError: (error) =>
              Alert.alert(
                "Couldn't delete it",
                error instanceof ApiError && error.status !== 0 ? error.message : 'Please try again.',
              ),
          }),
      },
    ]);

  if (isEdit && !existing) {
    return (
      <DetailFallback
        title="Edit entry"
        what="this entry"
        gone="It was deleted."
        error={existingError}
        failed={loadFailed}
        onRetry={() => void refetch()}
      />
    );
  }

  const income = kind === 'income';
  const title = isEdit ? 'Edit entry' : income ? 'New income' : 'New expense';
  // The booking it is for, or came from.
  const fromBooking = isEdit ? (existing?.booking ?? null) : offer;
  // The package it is a payment toward, or a cost of.
  const inPackage = isEdit ? (existing?.package ?? null) : (toward ?? null);
  // A one-off by nature — a booking, a package payment — never repeats; one
  // that already does says so instead.
  const repeats = isEdit && (existing?.recurringId ?? null) !== null;
  const canRepeat = !repeats && !inPackage && !fromBooking;
  const repeatDay = dayOfMonthLabel(Math.min(date.getDate(), 28));
  const paidLabel = income ? 'Received' : 'Paid';
  const paidHint = paid
    ? income
      ? 'The money is in'
      : 'It has been paid'
    : income
      ? 'The client still owes this — due on the date above'
      : 'Still to pay — due on the date above';

  return (
    <InsetFrame>
      <FormHeader
        title={title}
        subtitle={
          inPackage
            ? `${income ? 'Payment for' : 'Cost of'} ${inPackage.title}`
            : fromBooking
              ? bookingLabel(fromBooking)
              : undefined
        }
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
          <View className="px-5 mt-4">
            <SegmentedTabs<MoneyKind>
              segments={[
                { key: 'expense', label: 'Expense' },
                { key: 'income', label: 'Income' },
              ]}
              value={kind}
              onChange={switchKind}
            />
          </View>

          {/* The amount, large: the one thing every entry needs. */}
          <View className="px-5 mt-5">
            <Label>Amount</Label>
            <View
              className="bg-card rounded-2xl px-4 py-2 flex-row items-center gap-2"
              style={CARD_SHADOW}
            >
              <Text className={`text-[28px] font-bold ${income ? 'text-success' : 'text-foreground'}`}>₱</Text>
              <TextInput
                value={amount}
                onChangeText={setAmount}
                placeholder="0"
                placeholderTextColor="#A89489"
                keyboardType="decimal-pad"
                inputAccessoryViewID={KEYBOARD_DONE}
                autoFocus={!isEdit}
                accessibilityLabel="Amount in pesos"
                className="flex-1 min-w-0 text-foreground text-[30px] font-bold py-2"
              />
            </View>
          </View>

          <View className="px-5 mt-5">
            <Label>Category</Label>
            <View className="flex-row flex-wrap gap-2">
              {MONEY_CATEGORIES[kind].map((c) => (
                <Choice
                  key={c.slug}
                  label={c.label}
                  icon={categoryIcon(kind, c.slug)}
                  on={category === c.slug}
                  onPress={() => setCategory(c.slug)}
                />
              ))}
            </View>
          </View>

          <View className="px-5 mt-5 flex-row gap-3">
            <DateTimeField
              label={paid ? 'Date' : 'Due'}
              mode="date"
              value={date}
              onChange={(next) => next && setDate(next)}
            />
          </View>

          <View className="px-5 mt-3">
            <Pressable
              onPress={() => {
                setPaid((v) => !v);
                setPaidOn(null);
              }}
              accessibilityRole="switch"
              accessibilityState={{ checked: paid }}
              className="bg-card rounded-2xl px-4 py-3.5 flex-row items-center gap-3 active:scale-[0.98]"
              style={CARD_SHADOW}
            >
              <View className="flex-1">
                <Text className="text-foreground text-sm font-semibold">{paidLabel}</Text>
                <Text className="text-muted-foreground text-xs mt-0.5">{paidHint}</Text>
              </View>
              {paid ? (
                <ToggleRightIcon size={26} className="text-primary" />
              ) : (
                <ToggleLeftIcon size={26} className="text-muted-foreground" />
              )}
            </Pressable>
            {paid && paidOn ? (
              <View className="mt-3 flex-row gap-3">
                <DateTimeField
                  label={income ? 'Received on' : 'Paid on'}
                  mode="date"
                  value={paidOn}
                  onChange={(next) => setPaidOn(next)}
                  clearable
                />
              </View>
            ) : paid ? (
              <Pressable
                onPress={() => setPaidOn(dateOfIso(todayIso()))}
                accessibilityRole="button"
                className="self-start mt-2 ml-1 min-h-[36px] justify-center active:opacity-60"
              >
                <Text className="text-primary text-[13px] font-semibold">
                  {income ? 'Received on a different day?' : 'Paid on a different day?'}
                </Text>
              </Pressable>
            ) : null}
          </View>

          <View className="px-5 mt-5">
            <Label optional>{income ? 'Client' : 'Paid to'}</Label>
            <TextInput
              value={counterparty}
              onChangeText={setCounterparty}
              placeholder={income ? 'e.g. Reyes–Santos wedding' : 'e.g. Grab, Lazada, your assistant'}
              placeholderTextColor="#A89489"
              maxLength={120}
              className="bg-card rounded-2xl px-4 py-3.5 text-foreground text-base"
              style={CARD_SHADOW}
            />
          </View>

          <View className="px-5 mt-5">
            <Label optional>How</Label>
            <View className="flex-row flex-wrap gap-2">
              {MONEY_METHODS.map((m) => (
                <Choice
                  key={m.slug}
                  label={m.label}
                  on={method === m.slug}
                  onPress={() => setMethod((current) => (current === m.slug ? null : m.slug))}
                />
              ))}
            </View>
          </View>

          <View className="px-5 mt-5">
            <Label optional>Reference no.</Label>
            <TextInput
              value={reference}
              onChangeText={setReference}
              placeholder="GCash, bank or invoice number"
              placeholderTextColor="#A89489"
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={80}
              className="bg-card rounded-2xl px-4 py-3.5 text-foreground text-base"
              style={CARD_SHADOW}
            />
          </View>

          {income ? (
            <View className="px-5 mt-5">
              <Label optional>Tax withheld</Label>
              <View className="bg-card rounded-2xl px-4 flex-row items-center gap-2" style={CARD_SHADOW}>
                <Text className="text-muted-foreground text-base font-semibold">₱</Text>
                <TextInput
                  value={withheld}
                  onChangeText={setWithheld}
                  placeholder="0"
                  placeholderTextColor="#A89489"
                  keyboardType="decimal-pad"
                  inputAccessoryViewID={KEYBOARD_DONE}
                  accessibilityLabel="Tax withheld in pesos"
                  className="flex-1 min-w-0 text-foreground text-base py-3.5"
                />
              </View>
              <Text className="text-muted-foreground text-xs mt-2 ml-1 leading-[17px]">
                When a company client keeps part of your fee as tax and gives you a BIR Form 2307.
                Enter the full fee above, and what they kept here.
              </Text>
            </View>
          ) : null}

          <View className="px-5 mt-5">
            <Label optional>Receipt</Label>
            <ReceiptField value={receipt} onChange={setReceipt} disabled={saving} />
          </View>

          <View className="px-5 mt-5">
            <Label optional>Note</Label>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Anything worth remembering…"
              placeholderTextColor="#A89489"
              multiline
              numberOfLines={3}
              maxLength={1000}
              textAlignVertical="top"
              className="bg-card rounded-2xl px-4 py-3.5 text-foreground text-base"
              style={{ ...CARD_SHADOW, minHeight: 72 }}
            />
          </View>

          {canRepeat ? (
            <View className="px-5 mt-5">
              <Pressable
                onPress={() => setRepeat((v) => !v)}
                accessibilityRole="switch"
                accessibilityState={{ checked: repeat }}
                className="bg-card rounded-2xl px-4 py-3.5 flex-row items-center gap-3 active:scale-[0.98]"
                style={CARD_SHADOW}
              >
                <RepeatIcon size={18} className={repeat ? 'text-primary' : 'text-muted-foreground'} />
                <View className="flex-1">
                  <Text className="text-foreground text-sm font-semibold">Repeat every month</Text>
                  <Text className="text-muted-foreground text-xs mt-0.5">
                    {repeat
                      ? `Added for you on ${repeatDay} of each month, ${income ? 'as due' : 'as paid'}`
                      : 'A subscription, your rent, a retainer'}
                  </Text>
                </View>
                {repeat ? (
                  <ToggleRightIcon size={26} className="text-primary" />
                ) : (
                  <ToggleLeftIcon size={26} className="text-muted-foreground" />
                )}
              </Pressable>
            </View>
          ) : repeats ? (
            <View className="px-5 mt-5">
              <Pressable
                onPress={() => router.push('/money/recurring')}
                accessibilityRole="button"
                className="bg-card rounded-2xl px-4 py-3.5 flex-row items-center gap-3 active:opacity-70"
                style={CARD_SHADOW}
              >
                <RepeatIcon size={18} className="text-primary" />
                <View className="flex-1">
                  <Text className="text-foreground text-sm font-semibold">Repeats every month</Text>
                  <Text className="text-muted-foreground text-xs mt-0.5">Change the amount or stop it</Text>
                </View>
                <ChevronRightIcon size={16} className="text-muted-foreground" />
              </Pressable>
            </View>
          ) : null}

          {isEdit && existing?.booking?.cancelled ? (
            <View className="px-5 mt-6">
              <Text className="text-muted-foreground text-[13px] leading-[19px]">
                The booking this came from was cancelled. Keep it only if money actually moved —
                a reservation fee you kept, say. Otherwise delete it.
              </Text>
            </View>
          ) : null}

          {isEdit ? (
            <View className="px-5 mt-8">
              <Pressable
                onPress={confirmDelete}
                disabled={remove.isPending}
                accessibilityRole="button"
                className="min-h-12 flex-row items-center justify-center gap-2 rounded-2xl active:bg-destructive/10"
              >
                <Trash2Icon size={16} className="text-destructive" />
                <Text className="text-destructive text-[15px] font-semibold">
                  {remove.isPending ? 'Deleting…' : 'Delete entry'}
                </Text>
              </Pressable>
            </View>
          ) : null}
        </ScrollView>

        <FormSaveBar
          label={saving ? 'Saving…' : isEdit ? 'Save changes' : income ? 'Save income' : 'Save expense'}
          onPress={save}
          busy={saving}
        />
      </KeyboardAvoidingView>
    </InsetFrame>
  );
}
