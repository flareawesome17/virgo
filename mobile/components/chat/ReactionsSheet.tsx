import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { BottomSheet } from '@/components/BottomSheet';
import {
  groupReactions,
  REACTION_EMOJI,
  REACTION_LABEL,
  type ConversationMessage,
  type Participant,
  type ReactionKey,
} from '@/src/api';
import { ChatAvatar } from './ChatAvatar';
import { quoteLine } from './files/files-words';

/**
 * Who reacted to a message, and with what: All, or one kind at a time.
 *
 * Read from the message as the thread holds it, so a reaction arriving while
 * it is open shows here too. Names come from the chat's members; somebody
 * who has since left is still counted.
 */
export function ReactionsSheet({
  message,
  participants,
  myId,
  onClose,
}: {
  message: ConversationMessage | null;
  participants: readonly Participant[];
  myId: string | undefined;
  onClose: () => void;
}) {
  const [filter, setFilter] = useState<ReactionKey | 'all'>('all');
  const [forId, setForId] = useState<string | null>(null);
  // A new message starts on All.
  if ((message?.id ?? null) !== forId) {
    setForId(message?.id ?? null);
    setFilter('all');
  }

  const reactions = message?.reactions ?? [];
  const groups = useMemo(() => groupReactions(message?.reactions, myId), [message?.reactions, myId]);
  const people = useMemo(() => new Map(participants.map((p) => [p.id, p])), [participants]);
  // The kind picked can run out while the sheet is open.
  const shownFilter = filter !== 'all' && !groups.some((g) => g.reaction === filter) ? 'all' : filter;
  // Yours first, then in the order they came.
  const rows = useMemo(
    () =>
      reactions
        .filter((r) => REACTION_EMOJI[r.reaction] && (shownFilter === 'all' || r.reaction === shownFilter))
        .slice()
        .sort((a, b) => Number(b.userId === myId) - Number(a.userId === myId)),
    [reactions, shownFilter, myId],
  );

  const chip = (key: ReactionKey | 'all', label: string, a11y: string) => {
    const on = shownFilter === key;
    return (
      <Pressable
        key={key}
        onPress={() => setFilter(key)}
        accessibilityRole="tab"
        accessibilityLabel={a11y}
        accessibilityState={{ selected: on }}
        className={`h-9 px-3.5 rounded-full items-center justify-center active:opacity-70 ${
          on ? 'bg-foreground' : 'bg-muted'
        }`}
      >
        <Text className={`text-[14px] font-semibold ${on ? 'text-background' : 'text-foreground'}`}>
          {label}
        </Text>
      </Pressable>
    );
  };

  return (
    <BottomSheet visible={!!message} onClose={onClose}>
      <View className="pt-1 pb-3" style={{ flexShrink: 1 }}>
        <Text className="text-foreground text-[17px] leading-6 font-bold px-5" accessibilityRole="header">
          Reactions
        </Text>
        {message?.body ? (
          <Text className="text-muted-foreground text-[13px] leading-[18px] px-5 mt-0.5" numberOfLines={1}>
            {quoteLine(message)}
          </Text>
        ) : null}

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          accessibilityRole="tablist"
          contentContainerStyle={{ gap: 8, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 6 }}
          style={{ flexGrow: 0 }}
        >
          {chip('all', `All ${reactions.length}`, `All, ${reactions.length}`)}
          {groups.map((g) =>
            chip(g.reaction, `${REACTION_EMOJI[g.reaction]} ${g.count}`, `${REACTION_LABEL[g.reaction]}, ${g.count}`),
          )}
        </ScrollView>

        <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ paddingBottom: 4 }}>
          {rows.map((r) => {
            const person = people.get(r.userId);
            const you = r.userId === myId;
            const name = you ? 'You' : (person?.name ?? 'Someone who left');
            return (
              <View
                key={r.userId}
                accessible
                accessibilityLabel={`${name}, ${REACTION_LABEL[r.reaction]}`}
                className="min-h-[60px] px-5 flex-row items-center gap-3"
              >
                <ChatAvatar name={person?.name ?? name} url={person?.avatar_url} size={40} />
                <Text className="flex-1 text-foreground text-[15px] leading-5 font-semibold" numberOfLines={1}>
                  {name}
                </Text>
                <Text allowFontScaling={false} style={{ fontSize: 22, lineHeight: 28 }}>
                  {REACTION_EMOJI[r.reaction]}
                </Text>
              </View>
            );
          })}
        </ScrollView>

        <Text className="text-muted-foreground text-[13px] leading-[18px] px-5 pt-2">
          A ringed reaction is yours. Tap it on the message to take it back.
        </Text>
      </View>
    </BottomSheet>
  );
}
