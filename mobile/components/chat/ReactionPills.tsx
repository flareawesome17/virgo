import { memo, useMemo } from 'react';
import { Pressable, Text, View, type AccessibilityActionEvent } from 'react-native';
import {
  groupReactions,
  REACTION_EMOJI,
  REACTION_LABEL,
  type MessageReaction,
  type ReactionKey,
} from '@/src/api';

/**
 * The reactions on a message, on its lower edge: each kind once, with how
 * many, ringed in the accent when one of them is yours.
 *
 * A tap is your reaction of that kind — taken back if it is yours, given if
 * not. A long press shows who. Frozen threads and deleted messages keep their
 * pills to look at, and only "who" answers.
 */
export const ReactionPills = memo(function ReactionPills({
  reactions,
  myId,
  align,
  canReact,
  onToggle,
  onShowWho,
}: {
  reactions: readonly MessageReaction[] | undefined;
  myId: string | undefined;
  align: 'start' | 'end';
  canReact: boolean;
  onToggle: (reaction: ReactionKey) => void;
  onShowWho: () => void;
}) {
  const groups = useMemo(() => groupReactions(reactions, myId), [reactions, myId]);
  if (groups.length === 0) return null;

  return (
    <View
      className={`flex-row flex-wrap gap-1 -mt-2 mx-3.5 ${align === 'end' ? 'self-end justify-end' : 'self-start'}`}
      style={{ maxWidth: '80%' }}
    >
      {groups.map((g) => {
        const label = `${REACTION_LABEL[g.reaction]}, ${g.count}${g.mine ? ', including yours' : ''}`;
        const onAction = (e: AccessibilityActionEvent) => {
          if (e.nativeEvent.actionName === 'longpress') onShowWho();
          if (e.nativeEvent.actionName === 'activate' && canReact) onToggle(g.reaction);
        };
        return (
          <Pressable
            key={g.reaction}
            onPress={canReact ? () => onToggle(g.reaction) : onShowWho}
            onLongPress={onShowWho}
            delayLongPress={300}
            // 24 high as drawn, 40 to the thumb.
            hitSlop={{ top: 8, bottom: 8, left: 2, right: 2 }}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityHint={
              canReact
                ? g.mine
                  ? 'Takes your reaction back. Long press to see who reacted'
                  : 'Reacts the same. Long press to see who reacted'
                : 'Shows who reacted'
            }
            accessibilityState={{ selected: g.mine }}
            accessibilityActions={[
              { name: 'activate' },
              { name: 'longpress', label: 'See who reacted' },
            ]}
            onAccessibilityAction={onAction}
            className={`h-6 px-2 rounded-full bg-card flex-row items-center gap-1 active:opacity-70 ${
              g.mine ? 'border-[1.5px] border-primary' : 'border border-border/60'
            }`}
          >
            <Text allowFontScaling={false} style={{ fontSize: 13, lineHeight: 16 }}>
              {REACTION_EMOJI[g.reaction]}
            </Text>
            <Text allowFontScaling={false} className="text-secondary-foreground text-[12px] font-semibold">
              {g.count}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
});
