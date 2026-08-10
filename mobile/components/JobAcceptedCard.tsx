import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { BriefcaseIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { useBooking, useConfirmBooking } from '@/src/hooks';
import { rateLabel, type Booking, type JobAcceptedContext } from '@/src/api';

cssInterop(BriefcaseIcon, {
  className: { target: 'style', nativeStyleToProp: { color: true } },
});

/** Matches web's bookingState so both clients say the same words. */
function stateOf(booking: Booking): string {
  if (booking.cancelledAt) {
    return booking.cancelReason ?? 'This booking was cancelled.';
  }
  if (booking.lockedAt) return 'Both of you confirmed these terms.';
  if (!booking.youConfirmed) {
    return booking.theyConfirmed
      ? 'They have confirmed. Your turn.'
      : 'Neither of you has confirmed yet.';
  }
  return 'You confirmed. Waiting for them to agree.';
}

/**
 * The first thing in a job's conversation.
 *
 * Accepting somebody opened this chat and left it empty. Both people arrived
 * at a blank thread and had to remember which job it was, which role was
 * accepted, and what had been agreed — while the booking that answers all
 * three sat on a screen neither of them was on.
 *
 * Read live from the booking rather than from a snapshot in the message,
 * because the terms are editable: a card frozen at the rate it opened with
 * would put two different agreements on one screen.
 */
export function JobAcceptedCard({ context }: { context: JobAcceptedContext }) {
  const { booking, isLoading, loadFailed } = useBooking(context.bookingId);
  const confirm = useConfirmBooking(context.bookingId);
  const rate = booking ? rateLabel(booking.rateMinor, booking.currency) : null;

  return (
    <View className="border-border bg-card my-1.5 gap-2 rounded-2xl border p-4">
      <View className="flex-row items-center gap-1.5">
        <BriefcaseIcon size={12} color="#9ca3af" />
        <Text className="text-muted-foreground text-[10px] font-bold uppercase tracking-[1.5px]">
          {context.role ? `Hired as ${context.role}` : 'Hired'}
        </Text>
      </View>

      <Pressable onPress={() => router.push(`/jobs/${context.postSlug}`)}>
        <Text className="text-foreground text-[15px] font-bold leading-snug">
          {context.postTitle}
        </Text>
      </Pressable>

      {isLoading ? (
        <ActivityIndicator color="#B66A40" className="my-2" />
      ) : loadFailed || !booking ? (
        // The card is the only path to the booking from here, so a failed load
        // has to say so rather than quietly show a title and nothing.
        <Pressable onPress={() => router.push('/bookings')}>
          <Text className="text-muted-foreground text-[12px] leading-5">
            Could not load the terms.{' '}
            <Text style={{ color: '#B66A40', fontWeight: '600' }}>Open bookings</Text>
          </Text>
        </Pressable>
      ) : (
        <>
          <View className="border-border gap-1.5 border-t pt-2.5">
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
          </View>

          <Text className="text-muted-foreground text-[11px] leading-5">
            {stateOf(booking)}
          </Text>

          {!booking.cancelledAt && !booking.youConfirmed && (
            <Pressable
              className="items-center rounded-xl py-3"
              style={{ backgroundColor: '#B66A40', opacity: confirm.isPending ? 0.5 : 1 }}
              disabled={confirm.isPending}
              onPress={() =>
                confirm.mutate(undefined, {
                  onError: (e: Error) => Alert.alert('Could not confirm', e.message),
                })
              }
            >
              <Text className="text-[13px] font-bold text-white">
                Confirm these terms
              </Text>
            </Pressable>
          )}

          <Pressable
            className="border-border items-center rounded-xl border py-3"
            onPress={() => router.push(`/bookings/${booking.id}`)}
          >
            <Text className="text-foreground text-[13px] font-bold">
              {/* Only the poster gets an offer to change them. The creative is
                  looking at somebody else's terms, and this chat is where they
                  say what they think of them. */}
              {booking.yourSide === 'poster' && !booking.cancelledAt
                ? 'Change the terms'
                : 'View booking'}
            </Text>
          </Pressable>

          <Text className="text-muted-foreground text-[10px] leading-4">
            A record of what you agreed, not a legal contract.{' '}
            {booking.yourSide === 'poster'
              ? 'Changing anything clears both confirmations, so you cannot alter agreed terms on your own.'
              : 'Only they can change these terms — if something is not right, say so here.'}
          </Text>
        </>
      )}
    </View>
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
      <Text className="text-muted-foreground text-[12px]">{label}</Text>
      <Text
        className={
          value
            ? strong
              ? 'text-foreground flex-1 text-right text-[12px] font-bold'
              : 'text-foreground flex-1 text-right text-[12px]'
            : 'text-muted-foreground flex-1 text-right text-[12px]'
        }
      >
        {value || 'Not set'}
      </Text>
    </View>
  );
}
