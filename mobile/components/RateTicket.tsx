import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { StarIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import type { SupportTicket } from '@/src/api';
import { useRateTicket } from '@/src/hooks';

const interop = { className: { target: 'style', nativeStyleToProp: { color: true } } } as const;
cssInterop(StarIcon, interop);

/** The support screen's accent, which the stars fill with. */
const ACCENT = '#B66A40';
/** An empty star: the placeholder grey the screen's inputs use. */
const EMPTY = '#9ca3af';

const LABEL: Record<number, string> = {
  1: 'Very poor',
  2: 'Poor',
  3: 'Okay',
  4: 'Good',
  5: 'Great',
};

/**
 * "How did we do?" under a resolved or closed request.
 *
 * Asked only then: mid-conversation a rating would score help that has not
 * finished. Once given it reads back as thanks, with a way to change it.
 * The stars pass their colour as `fill` outright — `currentColor` draws them
 * hollow on a device.
 */
export function RateTicket({ ticket }: { ticket: SupportTicket }) {
  const rate = useRateTicket(ticket.id);
  const [editing, setEditing] = useState(false);
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');

  if (ticket.status !== 'resolved' && ticket.status !== 'closed') return null;

  if (ticket.rating && !editing) {
    return (
      <View className="mt-4 rounded-xl border border-border p-4">
        <View className="flex-row items-center gap-2">
          <View
            className="flex-row"
            accessible
            accessibilityLabel={`You rated this ${ticket.rating} out of 5`}
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <StarIcon
                key={n}
                size={15}
                color={n <= (ticket.rating ?? 0) ? ACCENT : EMPTY}
                fill={n <= (ticket.rating ?? 0) ? ACCENT : 'transparent'}
              />
            ))}
          </View>
          <Text className="flex-1 text-[13px] text-foreground">
            Thanks — you rated this {ticket.rating} out of 5.
          </Text>
          <Pressable
            onPress={() => {
              setStars(ticket.rating ?? 0);
              setComment(ticket.rating_comment ?? '');
              setEditing(true);
            }}
            accessibilityRole="button"
            hitSlop={8}
          >
            <Text className="text-[13px] font-semibold" style={{ color: ACCENT }}>
              Change
            </Text>
          </Pressable>
        </View>
        {ticket.rating_comment ? (
          <Text className="mt-1.5 text-[12px] text-muted-foreground">
            “{ticket.rating_comment}”
          </Text>
        ) : null}
      </View>
    );
  }

  return (
    <View className="mt-4 gap-3 rounded-xl border border-border p-4">
      <View>
        <Text className="text-[14px] font-semibold text-foreground">How did we do?</Text>
        <Text className="mt-0.5 text-[12px] text-muted-foreground">
          Your answer goes to the support team.
        </Text>
      </View>
      <View className="flex-row items-center" accessibilityRole="radiogroup">
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable
            key={n}
            onPress={() => setStars(n)}
            accessibilityRole="radio"
            accessibilityState={{ checked: stars === n }}
            accessibilityLabel={`${n} out of 5, ${LABEL[n].toLowerCase()}`}
            hitSlop={4}
            className="p-1"
          >
            <StarIcon
              size={30}
              color={n <= stars ? ACCENT : EMPTY}
              fill={n <= stars ? ACCENT : 'transparent'}
            />
          </Pressable>
        ))}
        {stars > 0 && (
          <Text className="ml-2 text-[13px] text-muted-foreground">{LABEL[stars]}</Text>
        )}
      </View>
      {stars > 0 && (
        <TextInput
          value={comment}
          onChangeText={setComment}
          multiline
          maxLength={1000}
          placeholder="Anything you'd like to add? (optional)"
          placeholderTextColor={EMPTY}
          className="min-h-16 rounded-lg border border-border px-3 py-2.5 text-[14px] text-foreground"
          style={{ textAlignVertical: 'top' }}
        />
      )}
      {rate.isError && (
        <Text className="text-[12px] text-destructive">
          That did not send. Check your connection and try again.
        </Text>
      )}
      <View className="flex-row items-center gap-2">
        <Pressable
          disabled={!stars || rate.isPending}
          onPress={() =>
            rate.mutate({ rating: stars, comment }, { onSuccess: () => setEditing(false) })
          }
          accessibilityRole="button"
          style={{ opacity: !stars || rate.isPending ? 0.5 : 1, backgroundColor: ACCENT }}
          className="rounded-xl px-4 py-2.5"
        >
          <Text className="text-[13px] font-bold text-white">
            {rate.isPending ? 'Sending…' : 'Send'}
          </Text>
        </Pressable>
        {editing && (
          <Pressable onPress={() => setEditing(false)} accessibilityRole="button" className="px-3 py-2.5">
            <Text className="text-[13px] font-semibold text-muted-foreground">Cancel</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}
