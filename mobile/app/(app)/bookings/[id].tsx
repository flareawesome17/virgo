import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { KEYBOARD_DONE } from '@/components/KeyboardDoneBar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useWindowInsets } from '@/src/lib/window-insets';
import { router, useLocalSearchParams } from 'expo-router';
import {
  useBooking,
  useCancelBooking,
  useConfirmBooking,
  useTheme,
  useUpdateBooking,
} from '@/src/hooks';
import { PALETTES } from '@/theme';
import { useShade } from '@/components/BottomSheet';
import { MAX_ROLE_BUDGET_MINOR } from '@/src/lib/job-form';
import { ApiError, rateLabel, type Booking } from '@/src/api';
import { LoadFailed } from '@/components/LoadFailed';
import { ScreenHeader } from '@/components/ScreenHeader';
import { DateTimeField } from '@/components/DateTimeField';
import { dateToKey, parseDateKey } from '@/src/lib/calendar';

/**
 * One booking, and the two things you can do to it.
 *
 * The screen says plainly that this is a record rather than a contract —
 * somebody reading "Agreed" over a rate and a date could reasonably assume
 * more legal weight than there is, and the honest framing costs one line.
 */
export default function BookingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { booking, isLoading, loadFailed, error, refetch } = useBooking(id);
  const [editing, setEditing] = useState(false);
  // Gone for good, as opposed to not reachable right now. Only the second is
  // worth a retry.
  const missing = error instanceof ApiError && error.status === 404;
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <ScreenHeader
        title={editing ? 'Edit terms' : 'Booking'}
        // Out of the form first, then off the screen: the form is a step of
        // this screen, not a screen of its own.
        onBack={editing ? () => setEditing(false) : undefined}
      />
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {isLoading ? (
          <ActivityIndicator color={palette.primary} className="mt-10" />
        ) : missing ? (
          <Text className="text-muted-foreground mt-10 px-8 text-center text-[13px] leading-5">
            That booking is not available. It may have been removed along with its job post.
          </Text>
        ) : loadFailed || !booking ? (
          <LoadFailed what="this booking" onRetry={() => void refetch()} />
        ) : editing && booking.yourSide === 'poster' ? (
          /* `editing` is only ever set by a button the creative does not get,
             but the check is here too — a form that 403s on save is a worse
             way to learn this than not being offered it. */
          <EditForm booking={booking} onDone={() => setEditing(false)} />
        ) : (
          <Details booking={booking} onEdit={() => setEditing(true)} />
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** Matches web's bookingState so both clients say the same words. */
function stateOf(booking: Booking) {
  if (booking.cancelledAt) {
    return { label: 'Cancelled', detail: booking.cancelReason ?? 'This booking was cancelled.' };
  }
  if (booking.confirmed) {
    return {
      label: 'Agreed',
      detail:
        booking.yourSide === 'poster'
          ? 'They confirmed these terms.'
          : 'You confirmed these terms.',
    };
  }
  // Unconfirmed says different things to the two sides now: the poster is
  // waiting on somebody, the creative is the somebody.
  return booking.yourSide === 'poster'
    ? {
        label: 'Waiting on them',
        detail: 'They have not confirmed these terms yet.',
      }
    : {
        label: 'Needs you',
        detail: 'They set these terms. Confirm them, or say so in the chat.',
      };
}

function Details({ booking, onEdit }: { booking: Booking; onEdit: () => void }) {
  const state = stateOf(booking);
  const confirm = useConfirmBooking(booking.id);
  const cancel = useCancelBooking(booking.id);
  const [cancelling, setCancelling] = useState(false);
  const rate = rateLabel(booking.rateMinor, booking.currency);
  const done = !!booking.cancelledAt;
  /*
   * Only the poster sets the terms.
   *
   * They are hiring and paying, so the booking is their offer; the creative's
   * answer is to confirm it or not. Negotiating by editing a form at each
   * other is a worse way to argue about a rate than the chat next to it.
   *
   * The server refuses either way — this only decides whether to offer a
   * button that would be rejected.
   */
  const canEdit = booking.yourSide === 'poster';

  return (
    <ScrollView keyboardDismissMode="on-drag" contentContainerClassName="p-5 pb-14 gap-4" keyboardShouldPersistTaps="handled">
      <View>
        <Text className="text-foreground text-[18px] font-bold">
          {booking.postTitle}
        </Text>
        <Text className="text-muted-foreground mt-1 text-[12px]">
          With {booking.otherParty.displayName} ·{' '}
          {booking.yourSide === 'poster' ? 'you posted this' : 'you were hired'}
        </Text>
      </View>

      <View className="bg-card gap-3 rounded-2xl p-4">
        <Row label="Role" value={booking.role} />
        <Row
          label="Date"
          value={
            booking.eventDate
              ? new Date(`${booking.eventDate}T12:00:00`).toLocaleDateString()
              : null
          }
        />
        <Row label="Location" value={booking.location} />
        <Row label="Rate" value={rate} strong />
        <Row label="Notes" value={booking.notes} />

        {/* One line, not two. The poster wrote these terms, so there was
            never anything to say about whether they agreed with them. */}
        <View className="border-border mt-1 border-t pt-3">
          <Confirmed
            who={booking.yourSide === 'creative' ? 'You' : booking.otherParty.displayName}
            at={booking.confirmedAt}
          />
        </View>
      </View>

      {/*
        Two different sentences, because the two sides can do different things.
        Telling somebody who has no Edit button that changing things clears the
        confirmations describes a control they cannot see.
      */}
      <Text className="text-muted-foreground text-[12px] leading-5">
        {state.detail}
        {!done &&
          (canEdit
            ? ' Changing anything here clears their confirmation, so you cannot alter agreed terms on your own.'
            : ` Only ${booking.otherParty.displayName} can change these terms — they posted the job. If something is not right, say so in the chat.`)}
      </Text>

      {!done && (
        <View className="gap-2">
          {/* Only the person hired. The poster wrote the offer; agreeing
              with your own offer is a step with no decision in it. */}
          {!canEdit && !booking.confirmed && (
            <Pressable
              className="items-center justify-center rounded-2xl min-h-[52px] bg-action active:opacity-85"
              style={{ opacity: confirm.isPending ? 0.5 : 1 }}
              disabled={confirm.isPending}
              accessibilityRole="button"
              accessibilityState={{ disabled: confirm.isPending, busy: confirm.isPending }}
              onPress={() =>
                confirm.mutate(undefined, {
                  onError: (e: Error) => Alert.alert("Couldn't confirm them", e.message),
                })
              }
            >
              <Text className="text-action-foreground text-[15px] font-bold">
                Confirm these terms
              </Text>
            </Pressable>
          )}

          {canEdit && (
            <Pressable
              className="items-center justify-center rounded-2xl min-h-[52px] border border-primary active:opacity-80"
              accessibilityRole="button"
              onPress={onEdit}
            >
              <Text className="text-primary text-[15px] font-bold">
                {booking.confirmed ? 'Change the terms' : 'Edit terms'}
              </Text>
            </Pressable>
          )}

          {booking.conversationId && (
            <Pressable
              className="border-border items-center justify-center rounded-2xl border min-h-[52px] active:opacity-80"
              accessibilityRole="button"
              onPress={() => router.push(`/chat/${booking.conversationId}`)}
            >
              <Text className="text-foreground text-[15px] font-bold">Open chat</Text>
            </Pressable>
          )}

          {/* Asks why. The reason was always stored and shown on the
              cancelled booking, but nothing ever asked for one, so every
              cancellation read "This booking was cancelled." */}
          <Pressable
            className="items-center justify-center min-h-[44px] active:opacity-60"
            accessibilityRole="button"
            disabled={cancel.isPending}
            onPress={() => setCancelling(true)}
          >
            {cancel.isPending ? (
              <ActivityIndicator size="small" />
            ) : (
              <Text className="text-destructive text-[14px] font-semibold">Cancel booking</Text>
            )}
          </Pressable>
        </View>
      )}

      <CancelSheet
        visible={cancelling}
        who={booking.otherParty.displayName}
        role={booking.role}
        poster={booking.yourSide === 'poster'}
        onKeep={() => setCancelling(false)}
        onCancel={(reason) => {
          setCancelling(false);
          cancel.mutate(reason || undefined, {
            onError: (e: Error) => Alert.alert("Couldn't cancel it", e.message),
          });
        }}
      />

      <Text className="text-muted-foreground text-[11px] leading-5">
        A record of what you agreed, not a legal contract. It is here so neither
        of you has to rely on memory or scroll back through a chat.
      </Text>
    </ScrollView>
  );
}

function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value: string | null;
  strong?: boolean;
}) {
  return (
    <View className="flex-row items-baseline justify-between gap-4">
      <Text className="text-muted-foreground text-[13px]">{label}</Text>
      <Text
        className={
          value
            ? strong
              ? 'text-foreground flex-1 text-right text-[13px] font-bold'
              : 'text-foreground flex-1 text-right text-[13px]'
            : 'text-muted-foreground flex-1 text-right text-[13px]'
        }
      >
        {value || 'Not set'}
      </Text>
    </View>
  );
}

function Confirmed({ who, at }: { who: string; at: string | null }) {
  return (
    <View className="flex-row items-center justify-between gap-4">
      <Text className="text-muted-foreground text-[13px]">{who}</Text>
      {/* "Not yet" had no colour of its own and fell back to black — invisible
          on the dark card. */}
      <Text className={`text-[13px] font-semibold ${at ? 'text-success' : 'text-muted-foreground'}`}>
        {at ? `Confirmed ${new Date(at).toLocaleDateString()}` : 'Not yet'}
      </Text>
    </View>
  );
}

function EditForm({ booking, onDone }: { booking: Booking; onDone: () => void }) {
  const update = useUpdateBooking(booking.id);
  const [role, setRole] = useState(booking.role ?? '');
  const [eventDate, setEventDate] = useState(booking.eventDate ?? '');
  const [location, setLocation] = useState(booking.location ?? '');
  // Shown in pesos, stored in centavos.
  const [rate, setRate] = useState(
    booking.rateMinor == null ? '' : String(booking.rateMinor / 100),
  );
  const [notes, setNotes] = useState(booking.notes ?? '');

  // "15,000" and "₱15,000" are how people write a rate; Number() read both
  // as not a number and refused them.
  const typed = rate.replace(/[^\d.]/g, '');
  const parsed = typed === '' ? null : Math.round(Number(typed) * 100);
  const rateProblem =
    rate.trim() !== '' && (parsed == null || !Number.isFinite(parsed) || parsed < 0)
      ? 'Give a number, or leave it blank.'
      : parsed != null && parsed > MAX_ROLE_BUDGET_MINOR
        ? 'A rate can be up to ₱500,000.'
        : null;

  const save = () => {
    if (rateProblem) {
      Alert.alert('Check the rate', rateProblem);
      return;
    }
    // Only what changed. Saving the form as it stood still sent every field,
    // which cleared the creative's confirmation for terms that had not moved.
    const next = {
      role: role.trim() || null,
      eventDate: eventDate.trim() || null,
      location: location.trim() || null,
      rateMinor: parsed,
      notes: notes.trim() || null,
    };
    const was = {
      role: booking.role ?? null,
      eventDate: booking.eventDate ?? null,
      location: booking.location ?? null,
      rateMinor: booking.rateMinor ?? null,
      notes: booking.notes ?? null,
    };
    const changed = Object.fromEntries(
      (Object.keys(next) as (keyof typeof next)[])
        .filter((key) => next[key] !== was[key])
        .map((key) => [key, next[key]]),
    );
    if (Object.keys(changed).length === 0) {
      onDone();
      return;
    }
    update.mutate(changed, {
      onSuccess: onDone,
      onError: (e: Error) => Alert.alert("Couldn't save the terms", e.message),
    });
  };

  return (
    <ScrollView keyboardDismissMode="on-drag" contentContainerClassName="p-5 pb-14 gap-4" keyboardShouldPersistTaps="handled">
      <View>
        <Text className="text-foreground text-[17px] font-bold">Edit the terms</Text>
        <Text className="text-muted-foreground mt-1 text-[12px] leading-5">
          {booking.confirmed
            ? 'They have agreed to these. Changing anything asks them to agree again.'
            : 'Yours to set — they confirm it.'}
        </Text>
      </View>

      <Field label="Role" value={role} onChange={setRole} />
      {/* The picker, not typed text: "2026-02-30" used to reach the server
          as a 500, and a date already gone by was accepted. */}
      <DateTimeField
        label="Date"
        mode="date"
        value={eventDate ? parseDateKey(eventDate) : null}
        minimumDate={new Date()}
        emptyLabel="Pick a date (optional)"
        clearable
        onChange={(picked) => setEventDate(picked ? dateToKey(picked) : '')}
      />
      <Field label="Location" value={location} onChange={setLocation} />
      <Field
        label={`Rate (${booking.currency})`}
        value={rate}
        onChange={setRate}
        keyboardType="numeric"
        error={rateProblem}
      />
      <Field label="What is included" value={notes} onChange={setNotes} multiline />

      <Pressable
        className="items-center justify-center rounded-2xl min-h-[52px] bg-action active:opacity-85"
        style={{ opacity: update.isPending || rateProblem ? 0.5 : 1 }}
        disabled={update.isPending || !!rateProblem}
        accessibilityRole="button"
        accessibilityState={{ disabled: update.isPending || !!rateProblem, busy: update.isPending }}
        onPress={save}
      >
        <Text className="text-action-foreground text-[15px] font-bold">
          {update.isPending ? 'Saving…' : 'Save terms'}
        </Text>
      </Pressable>
      <Pressable
        className="items-center justify-center min-h-[44px] active:opacity-60"
        accessibilityRole="button"
        onPress={onDone}
      >
        <Text className="text-muted-foreground text-[14px]">Cancel</Text>
      </Pressable>
    </ScrollView>
  );
}

function Field({
  label,
  value,
  onChange,
  multiline,
  keyboardType,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  keyboardType?: 'numeric';
  /** Said under the field, as you type, rather than on Save. */
  error?: string | null;
}) {
  return (
    <View className="gap-1.5">
      <Text className="text-muted-foreground text-[12px] font-semibold">{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        multiline={multiline}
        keyboardType={keyboardType}
        inputAccessoryViewID={keyboardType ? KEYBOARD_DONE : undefined}
        accessibilityLabel={label}
        className={`text-foreground rounded-lg border px-3 py-3 text-[15px] ${error ? 'border-destructive' : 'border-border'}`}
        style={multiline ? { minHeight: 90, textAlignVertical: 'top' } : undefined}
      />
      {error ? <Text className="text-destructive text-[12px]">{error}</Text> : null}
    </View>
  );
}

/**
 * Cancelling, with a reason.
 *
 * A card at the top like NameSheet, so the keyboard for the reason does not
 * cover the buttons. The reason is optional and goes to the other person with
 * the cancellation.
 */
function CancelSheet({
  visible,
  who,
  role,
  poster,
  onKeep,
  onCancel,
}: {
  visible: boolean;
  who: string;
  role: string | null;
  poster: boolean;
  onKeep: () => void;
  onCancel: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  const insets = useWindowInsets();
  const shade = useShade();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onKeep}
      onShow={() => setReason('')}
    >
      <View className="flex-1">
        <Pressable
          className="absolute inset-0"
          style={{ backgroundColor: shade }}
          onPress={onKeep}
          accessibilityLabel="Keep the booking"
        />
        <View pointerEvents="box-none" className="px-4" style={{ paddingTop: insets.top + 24 }}>
          <View className="bg-card rounded-3xl px-5 pt-5 pb-4">
            <Text className="text-foreground text-lg font-bold" accessibilityRole="header">
              Cancel this booking?
            </Text>
            <Text className="text-muted-foreground text-[13px] leading-5 mt-1.5 mb-4">
              {who} will be told, with your reason if you give one.
              {poster && role ? ` ${role} opens again on the post, so you can hire someone else.` : ''}
            </Text>
            <TextInput
              value={reason}
              onChangeText={setReason}
              autoFocus
              multiline
              maxLength={500}
              placeholder="Why, in a line (optional)"
              accessibilityLabel="Reason for cancelling"
              className="rounded-2xl border border-input bg-background px-4 py-3 text-foreground text-base"
              style={{ minHeight: 76, textAlignVertical: 'top' }}
            />
            <View className="flex-row gap-3 mt-5">
              <Pressable
                onPress={onKeep}
                accessibilityRole="button"
                className="flex-1 bg-muted rounded-2xl min-h-[48px] items-center justify-center active:opacity-70"
              >
                <Text className="text-foreground text-base font-semibold">Keep it</Text>
              </Pressable>
              <Pressable
                onPress={() => onCancel(reason.trim())}
                accessibilityRole="button"
                className="flex-[2] bg-destructive rounded-2xl min-h-[48px] items-center justify-center active:opacity-85"
              >
                <Text className="text-destructive-foreground text-base font-bold">Cancel booking</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}
