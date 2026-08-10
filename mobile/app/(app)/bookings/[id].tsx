import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import {
  useBooking,
  useCancelBooking,
  useConfirmBooking,
  useUpdateBooking,
} from '@/src/hooks';
import { rateLabel, type Booking } from '@/src/api';

/**
 * One booking, and the two things you can do to it.
 *
 * The screen says plainly that this is a record rather than a contract —
 * somebody reading "Agreed" over a rate and a date could reasonably assume
 * more legal weight than there is, and the honest framing costs one line.
 */
export default function BookingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { booking, isLoading, loadFailed } = useBooking(id);
  const [editing, setEditing] = useState(false);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <Stack.Screen options={{ title: 'Booking', headerBackTitle: 'Back' }} />
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        {isLoading ? (
          <ActivityIndicator color="#B66A40" className="mt-10" />
        ) : loadFailed || !booking ? (
          <Text className="text-muted-foreground mt-10 text-center text-[13px]">
            That booking is not available.
          </Text>
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

/** Four states worth telling apart — see the web component for why. */
function stateOf(booking: Booking) {
  if (booking.cancelledAt) {
    return { label: 'Cancelled', detail: booking.cancelReason ?? 'This booking was cancelled.' };
  }
  if (booking.lockedAt) {
    return { label: 'Agreed', detail: 'Both of you confirmed these terms.' };
  }
  if (!booking.youConfirmed) {
    return {
      label: 'Needs you',
      detail: booking.theyConfirmed
        ? 'They have confirmed. Your turn.'
        : 'Neither of you has confirmed yet.',
    };
  }
  return { label: 'Waiting on them', detail: 'You confirmed. Waiting for them to agree.' };
}

function Details({ booking, onEdit }: { booking: Booking; onEdit: () => void }) {
  const state = stateOf(booking);
  const confirm = useConfirmBooking(booking.id);
  const cancel = useCancelBooking(booking.id);
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
    <ScrollView contentContainerClassName="p-5 pb-14 gap-4">
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

        <View className="border-border mt-1 gap-2 border-t pt-3">
          <Confirmed
            who={booking.yourSide === 'poster' ? 'You' : booking.otherParty.displayName}
            at={booking.posterConfirmedAt}
          />
          <Confirmed
            who={booking.yourSide === 'creative' ? 'You' : booking.otherParty.displayName}
            at={booking.creativeConfirmedAt}
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
            ? ' Changing anything here clears both confirmations, so you cannot alter agreed terms on your own.'
            : ` Only ${booking.otherParty.displayName} can change these terms — they posted the job. If something is not right, say so in the chat.`)}
      </Text>

      {!done && (
        <View className="gap-2">
          {!booking.youConfirmed && (
            <Pressable
              className="items-center rounded-2xl py-3.5"
              style={{ backgroundColor: '#B66A40', opacity: confirm.isPending ? 0.5 : 1 }}
              disabled={confirm.isPending}
              onPress={() =>
                confirm.mutate(undefined, {
                  onError: (e: Error) => Alert.alert('Could not confirm', e.message),
                })
              }
            >
              <Text className="text-[15px] font-bold text-white">
                Confirm these terms
              </Text>
            </Pressable>
          )}

          {canEdit && (
            <Pressable
              className="items-center rounded-2xl py-3.5"
              style={{ borderWidth: 1, borderColor: '#B66A40' }}
              onPress={onEdit}
            >
              <Text className="text-[15px] font-bold" style={{ color: '#B66A40' }}>
                {booking.lockedAt ? 'Change the terms' : 'Edit terms'}
              </Text>
            </Pressable>
          )}

          {booking.conversationId && (
            <Pressable
              className="border-border items-center rounded-2xl border py-3.5"
              onPress={() => router.push(`/chat/${booking.conversationId}`)}
            >
              <Text className="text-foreground text-[15px] font-bold">Open chat</Text>
            </Pressable>
          )}

          <Pressable
            className="items-center py-3"
            onPress={() =>
              Alert.alert('Cancel this booking?', 'The other person will be told.', [
                { text: 'Keep it', style: 'cancel' },
                {
                  text: 'Cancel booking',
                  style: 'destructive',
                  onPress: () =>
                    cancel.mutate(undefined, {
                      onError: (e: Error) => Alert.alert('Could not cancel', e.message),
                    }),
                },
              ])
            }
          >
            <Text className="text-[13px] font-semibold" style={{ color: '#dc2626' }}>
              Cancel booking
            </Text>
          </Pressable>
        </View>
      )}

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
      <Text
        className="text-[13px] font-semibold"
        style={{ color: at ? '#10b981' : undefined }}
      >
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

  const save = () => {
    const parsed = rate.trim() === '' ? null : Math.round(Number(rate) * 100);
    if (parsed != null && (!Number.isFinite(parsed) || parsed < 0)) {
      Alert.alert('Check the rate', 'Give a number, or leave it blank.');
      return;
    }
    update.mutate(
      {
        role: role.trim() || null,
        eventDate: eventDate.trim() || null,
        location: location.trim() || null,
        rateMinor: parsed,
        notes: notes.trim() || null,
      },
      {
        onSuccess: onDone,
        onError: (e: Error) => Alert.alert('Could not save', e.message),
      },
    );
  };

  return (
    <ScrollView contentContainerClassName="p-5 pb-14 gap-4">
      <View>
        <Text className="text-foreground text-[17px] font-bold">Edit the terms</Text>
        <Text className="text-muted-foreground mt-1 text-[12px] leading-5">
          {booking.lockedAt
            ? 'This booking is agreed. Changing it clears both confirmations and asks them to agree again.'
            : 'Yours to set — they confirm it. Any change clears both confirmations.'}
        </Text>
      </View>

      <Field label="Role" value={role} onChange={setRole} />
      <Field label="Date (YYYY-MM-DD)" value={eventDate} onChange={setEventDate} />
      <Field label="Location" value={location} onChange={setLocation} />
      <Field
        label={`Rate (${booking.currency})`}
        value={rate}
        onChange={setRate}
        keyboardType="numeric"
      />
      <Field label="What is included" value={notes} onChange={setNotes} multiline />

      <Pressable
        className="items-center rounded-2xl py-3.5"
        style={{ backgroundColor: '#B66A40', opacity: update.isPending ? 0.5 : 1 }}
        disabled={update.isPending}
        onPress={save}
      >
        <Text className="text-[15px] font-bold text-white">
          {update.isPending ? 'Saving…' : 'Save terms'}
        </Text>
      </Pressable>
      <Pressable className="items-center py-2" onPress={onDone}>
        <Text className="text-muted-foreground text-[13px]">Cancel</Text>
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
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  keyboardType?: 'numeric';
}) {
  return (
    <View className="gap-1.5">
      <Text className="text-muted-foreground text-[12px] font-semibold">{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        multiline={multiline}
        keyboardType={keyboardType}
        placeholderTextColor="#9ca3af"
        className="border-border text-foreground rounded-lg border px-3 py-2.5 text-[14px]"
        style={multiline ? { minHeight: 90, textAlignVertical: 'top' } : undefined}
      />
    </View>
  );
}
