import { useMemo } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { BottomSheet } from '@/components/BottomSheet';
import type { ConversationMessage, Participant } from '@/src/api';
import { useOpenDirectChat } from '@/src/hooks/useChat';
import { lastSeenLabel, usePresence } from '@/src/lib/presence-store';
import { ChatAvatar } from './ChatAvatar';
import { chatError, firstNameOf, momentLabel } from './chat-words';

const at = (iso: string | null) => (iso ? new Date(iso).getTime() : -1);

/** "Online", or when they were last around, kept current by the socket. */
function LastSeen({ person }: { person: Participant }) {
  const presence = usePresence(person.id);
  // The store answers "offline" for anyone it has not heard about, so the
  // fetched state stands until the socket says otherwise.
  const online = presence.online || (!presence.lastSeenAt && person.online === true);
  const lastSeenAt = presence.lastSeenAt ?? person.last_seen_at;
  if (!online && !lastSeenAt) return null;
  return (
    <Text className="text-muted-foreground text-[13px] leading-[18px]" numberOfLines={1}>
      {online ? 'Online' : lastSeenLabel(lastSeenAt)}
    </Text>
  );
}

/**
 * Who has seen one of your messages in a group, by name.
 *
 * Worked out from each member's own receipts, the same as the ticks: seen is
 * read up to or past the moment it was sent; on their phone is delivered but
 * not read; and the rest it has not reached yet.
 */
export function SeenBySheet({
  message,
  others,
  onClose,
}: {
  message: ConversationMessage | null;
  /** Everyone in the chat but you. */
  others: readonly Participant[];
  onClose: () => void;
}) {
  const openDirect = useOpenDirectChat();

  const { seen, delivered, waiting } = useMemo(() => {
    const sent = message ? new Date(message.created_at).getTime() : 0;
    const seen: Participant[] = [];
    const delivered: Participant[] = [];
    const waiting: Participant[] = [];
    for (const p of others) {
      if (at(p.last_read_at) >= sent) seen.push(p);
      else if (at(p.last_delivered_at) >= sent) delivered.push(p);
      else waiting.push(p);
    }
    // Who saw it first, first.
    seen.sort((a, b) => at(a.last_read_at) - at(b.last_read_at));
    return { seen, delivered, waiting };
  }, [message, others]);

  const messageThem = (person: Participant) => {
    openDirect.mutate(person.id, {
      onSuccess: ({ id }) => {
        onClose();
        router.push(`/chat/${id}`);
      },
      onError: (err) => Alert.alert(`Couldn't message ${firstNameOf(person.name)}`, chatError(err)),
    });
  };

  const heading = (label: string, count: number) => (
    <Text
      accessibilityRole="header"
      className="px-5 pt-4 pb-1.5 text-muted-foreground text-[11px] font-bold uppercase tracking-[1px]"
    >
      {label} · {count}
    </Text>
  );

  const person = (p: Participant, detail: 'time' | 'presence') => (
    <View key={p.id} className="min-h-[56px] px-5 flex-row items-center gap-3">
      <ChatAvatar name={p.name} url={p.avatar_url} size={40} />
      <View className="flex-1 min-w-0">
        <Text className="text-foreground text-[15px] leading-5 font-semibold" numberOfLines={1}>
          {p.name}
        </Text>
        {detail === 'presence' ? <LastSeen person={p} /> : null}
      </View>
      {detail === 'time' && p.last_read_at ? (
        <Text className="text-muted-foreground text-[13px]">{momentLabel(p.last_read_at)}</Text>
      ) : null}
      {detail === 'presence' && !p.blocked_by_me ? (
        <Pressable
          onPress={() => messageThem(p)}
          disabled={openDirect.isPending}
          accessibilityRole="button"
          accessibilityLabel={`Message ${p.name}`}
          // 36 high as drawn, 44 to the thumb.
          hitSlop={{ top: 4, bottom: 4 }}
          className="h-9 px-3.5 rounded-xl bg-muted items-center justify-center active:opacity-70"
        >
          {openDirect.isPending && openDirect.variables === p.id ? (
            <ActivityIndicator size="small" />
          ) : (
            <Text className="text-foreground text-[14px] font-semibold" numberOfLines={1}>
              Message {firstNameOf(p.name)}
            </Text>
          )}
        </Pressable>
      ) : null}
    </View>
  );

  return (
    <BottomSheet visible={!!message} onClose={onClose}>
      <View className="pt-1 pb-3" style={{ flexShrink: 1 }}>
        <Text className="text-foreground text-[17px] leading-6 font-bold px-5" accessibilityRole="header">
          {"Who's seen it"}
        </Text>
        {message?.body ? (
          <Text className="text-muted-foreground text-[13px] leading-[18px] px-5 mt-0.5" numberOfLines={2}>
            {message.body}
          </Text>
        ) : null}
        <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ paddingBottom: 4 }}>
          {seen.length > 0 ? (
            <>
              {heading('Seen', seen.length)}
              {seen.map((p) => person(p, 'time'))}
            </>
          ) : null}
          {delivered.length > 0 ? (
            <>
              {heading('On their phone, not seen yet', delivered.length)}
              {delivered.map((p) => person(p, 'presence'))}
            </>
          ) : null}
          {waiting.length > 0 ? (
            <>
              {heading('Not on their phone yet', waiting.length)}
              {waiting.map((p) => person(p, 'presence'))}
            </>
          ) : null}
        </ScrollView>
      </View>
    </BottomSheet>
  );
}
