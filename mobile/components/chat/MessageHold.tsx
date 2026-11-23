import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import { BriefcaseIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import {
  REACTIONS,
  REACTION_EMOJI,
  REACTION_LABEL,
  type ConversationMessage,
  type JobAcceptedContext,
  type ReactionKey,
} from '@/src/api';
import {
  HOLD_GAP,
  HoldMenu,
  HoldOverlay,
  LIFTED,
  holdMenuHeight,
  useHoldPlacement,
  type HeldRect,
  type HoldMenuEntry,
} from './HoldOverlay';
import { MessageBody, type MentionMatcher } from './ThreadRows';

cssInterop(BriefcaseIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

const REACTION_BAR = 52;
const MENU_WIDTH = 244;
const SIDE = 16;

export interface HeldMessage {
  message: ConversationMessage;
  rect: HeldRect;
  mine: boolean;
}

/**
 * Holding a message: it lifts where it was, the six reactions sit above it
 * with yours picked out, and what can be done with it sits below.
 *
 * In place of the sheet that offered Reply, Copy and Delete. The screen says
 * what the menu holds — it knows the rules (yours, unsent, frozen, a card) —
 * and whether reacting is offered at all.
 */
export function MessageHold({
  held,
  canReact,
  myReaction,
  entries,
  matcher,
  onReact,
  onClose,
  onClosed,
}: {
  held: HeldMessage | null;
  canReact: boolean;
  myReaction: ReactionKey | null;
  entries: readonly HoldMenuEntry[];
  matcher: MentionMatcher;
  onReact: (reaction: ReactionKey) => void;
  onClose: () => void;
  onClosed: () => void;
}) {
  const { width: windowWidth } = useWindowDimensions();
  const above = canReact ? REACTION_BAR + HOLD_GAP : 0;
  const below = entries.length > 0 ? HOLD_GAP + holdMenuHeight(entries) : 0;
  const { top, copyHeight } = useHoldPlacement(held?.rect ?? null, above, below);

  let content = null;
  if (held) {
    const { message, rect, mine } = held;
    const card = message.kind === 'job-accepted';
    // Your own on the right edge, theirs on the left, where they were drawn.
    // A card is nobody's side, and lifts from the left.
    const edge = mine && !card
      ? { right: Math.max(SIDE, windowWidth - (rect.x + rect.width)), alignItems: 'flex-end' as const }
      : { left: Math.max(SIDE, rect.x), alignItems: 'flex-start' as const };
    const lines = Math.max(1, Math.floor((copyHeight - 20) / 20));

    content = (
      <View
        pointerEvents="box-none"
        style={{ position: 'absolute', top, gap: HOLD_GAP, ...edge }}
      >
        {canReact ? (
          <View
            accessibilityRole="toolbar"
            accessibilityLabel="React"
            className="bg-card rounded-full flex-row items-center px-1.5"
            style={[{ height: REACTION_BAR }, LIFTED]}
          >
            {REACTIONS.map((key) => {
              const picked = myReaction === key;
              return (
                <Pressable
                  key={key}
                  onPress={() => onReact(key)}
                  accessibilityRole="button"
                  accessibilityLabel={picked ? `${REACTION_LABEL[key]}, yours. Take it back` : REACTION_LABEL[key]}
                  accessibilityState={{ selected: picked }}
                  className={`w-11 h-11 rounded-full items-center justify-center active:scale-[1.15] ${
                    picked ? 'bg-primary/15' : ''
                  }`}
                >
                  <Text allowFontScaling={false} style={{ fontSize: 26, lineHeight: 32 }}>
                    {REACTION_EMOJI[key]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {/* The message itself, lifted out of the dimmed thread. */}
        <View
          accessible
          accessibilityLabel={
            message.deleted_at ? 'Deleted message' : card ? 'Job accepted card' : message.body
          }
          className={`rounded-[20px] px-3.5 py-2.5 overflow-hidden ${
            message.deleted_at ? 'bg-muted' : mine && !card ? 'bg-action' : 'bg-card'
          }`}
          style={[
            { width: Math.min(rect.width, windowWidth - SIDE * 2), maxHeight: copyHeight },
            LIFTED,
          ]}
        >
          {message.deleted_at ? (
            <Text className="text-muted-foreground text-sm italic">
              {mine ? 'You deleted this message' : 'This message was deleted'}
            </Text>
          ) : card ? (
            <View className="flex-row items-center gap-2.5">
              <BriefcaseIcon size={18} className="text-primary" />
              <Text className="text-foreground text-[15px] font-semibold flex-1" numberOfLines={2}>
                {(message.context as JobAcceptedContext | null)?.postTitle
                  ? `Accepted · ${(message.context as JobAcceptedContext).postTitle}`
                  : 'Job accepted'}
              </Text>
            </View>
          ) : (
            <MessageBody body={message.body} mine={mine} matcher={matcher} numberOfLines={lines} inert />
          )}
        </View>

        {entries.length > 0 ? <HoldMenu entries={entries} width={MENU_WIDTH} /> : null}
      </View>
    );
  }

  return (
    <HoldOverlay visible={!!held} onClose={onClose} onClosed={onClosed}>
      {content}
    </HoldOverlay>
  );
}
