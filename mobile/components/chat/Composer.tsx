import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, TextInput, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AtSignIcon, ReplyIcon, SendIcon, XIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import type { ConversationMessage, Participant } from '@/src/api';
import { sendTyping } from '@/src/lib/presence-store';
import { useTheme } from '@/src/hooks';
import { useKeyboardUp } from '@/src/lib/keyboard';
import { PALETTES } from '@/theme';

for (const Icon of [AtSignIcon, ReplyIcon, SendIcon, XIcon]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/** How often "still typing" is said while someone keeps typing. */
const TYPING_HEARTBEAT_MS = 3000;
/** How long a pause is before it counts as having stopped. */
const TYPING_IDLE_MS = 3000;

// Moved to src/lib/keyboard so forms outside chat can use it; kept here for
// the chat screen, which imports it with the composer.
export { useKeyboardUp };

interface ComposerProps {
  conversationId: string;
  isGroup: boolean;
  /** Everyone but you: who can be mentioned. */
  others: readonly Participant[];
  replyTo: ConversationMessage | null;
  onCancelReply: () => void;
  onSend: (message: { body: string; mentionIds: string[] }) => void;
}

/**
 * The box at the bottom of a thread, with the mention picker and the reply
 * bar above it.
 *
 * Its own component, holding its own draft: the draft lived in the screen, so
 * each keystroke re-rendered the screen and every bubble in it.
 */
export const Composer = memo(function Composer({
  conversationId,
  isGroup,
  others,
  replyTo,
  onCancelReply,
  onSend,
}: ComposerProps) {
  const insets = useSafeAreaInsets();
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  const keyboardUp = useKeyboardUp();
  const [draft, setDraft] = useState('');
  const [mentioned, setMentioned] = useState<Participant[]>([]);

  /*
   * "Typing", said again every few seconds while it carries on.
   *
   * It was said once, at the first keystroke, and the other side forgets it
   * after six seconds — so anyone writing more than a line dropped out of
   * "typing…" halfway through. A keystroke still never becomes a frame of its
   * own: at most one per heartbeat.
   */
  const typingSent = useRef(false);
  const lastBeat = useRef(0);
  const idle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const stopTyping = useCallback(() => {
    clearTimeout(idle.current);
    if (!typingSent.current) return;
    typingSent.current = false;
    sendTyping(conversationId, false);
  }, [conversationId]);

  const noteTyping = useCallback(
    (value: string) => {
      // An emptied box is not typing.
      if (!value.trim()) {
        stopTyping();
        return;
      }
      const now = Date.now();
      if (!typingSent.current || now - lastBeat.current >= TYPING_HEARTBEAT_MS) {
        typingSent.current = true;
        lastBeat.current = now;
        sendTyping(conversationId, true);
      }
      clearTimeout(idle.current);
      idle.current = setTimeout(stopTyping, TYPING_IDLE_MS);
    },
    [conversationId, stopTyping],
  );

  // Leaving the thread, or the composer going away because the thread froze,
  // must not strand the indicator on the other screen.
  useEffect(() => stopTyping, [stopTyping]);

  /**
   * The partial `@word` being typed at the end of the draft, if any.
   *
   * Only the tail is considered: re-opening the picker for a mention typed
   * earlier in the line would fight the user as they carry on writing.
   */
  const mentionQuery = useMemo(() => {
    const match = /(?:^|\s)@([^\s@]*)$/.exec(draft);
    return match ? match[1] : null;
  }, [draft]);

  const mentionOptions = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return others.filter((p) => p.name.toLowerCase().startsWith(q)).slice(0, 6);
  }, [mentionQuery, others]);

  const pickMention = (person: Participant) => {
    setDraft((current) => current.replace(/@[^\s@]*$/, `@${person.name} `));
    setMentioned((prev) => (prev.some((p) => p.id === person.id) ? prev : [...prev, person]));
  };

  const submit = () => {
    const body = draft.trim();
    if (!body) return;
    // Only the people actually still named in the text.
    const mentionIds = mentioned.filter((p) => body.includes(`@${p.name}`)).map((p) => p.id);
    setDraft('');
    setMentioned([]);
    // Sending is the clearest possible "stopped typing".
    stopTyping();
    onSend({ body, mentionIds });
  };

  const border = isDark ? '#2A2522' : '#F0E8E2';
  const ready = draft.trim().length > 0;

  return (
    <View>
      {/* Mention picker — only while an @word is being typed. */}
      {mentionOptions.length > 0 && (
        <View
          className="mx-4 mb-2 bg-card rounded-2xl overflow-hidden"
          style={{
            shadowColor: '#000',
            shadowOpacity: 0.1,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: -2 },
            elevation: 6,
          }}
        >
          <View
            className="px-4 py-2 flex-row items-center gap-2"
            style={{ borderBottomWidth: 1, borderBottomColor: border }}
          >
            <AtSignIcon size={12} className="text-primary" />
            <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[1.5px]">
              Mention
            </Text>
          </View>
          <ScrollView style={{ maxHeight: 200 }} keyboardShouldPersistTaps="handled">
            {mentionOptions.map((p, i) => (
              <Pressable
                key={p.id}
                onPress={() => pickMention(p)}
                accessibilityRole="button"
                accessibilityLabel={`Mention ${p.name}`}
                className="px-4 min-h-[44px] py-2 flex-row items-center gap-3 active:bg-muted/40"
                style={
                  i < mentionOptions.length - 1
                    ? { borderBottomWidth: 1, borderBottomColor: border }
                    : undefined
                }
              >
                <View className="w-7 h-7 rounded-full items-center justify-center bg-primary/10">
                  <Text className="text-primary font-bold text-xs">
                    {p.name.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <Text className="text-foreground text-sm font-semibold">{p.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      {/* What you are replying to */}
      {replyTo && (
        <View
          className="mx-4 mb-2 bg-card rounded-2xl pl-3 flex-row items-center gap-3"
          style={{ borderLeftWidth: 3, borderLeftColor: palette.primary }}
        >
          <ReplyIcon size={14} className="text-primary" />
          <View className="flex-1 min-w-0 py-2.5">
            <Text className="text-primary text-xs font-bold" numberOfLines={1}>
              Replying to {replyTo.sender_name}
            </Text>
            <Text className="text-muted-foreground text-xs" numberOfLines={1}>
              {replyTo.body}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cancel reply"
            onPress={onCancelReply}
            className="w-11 h-11 items-center justify-center active:opacity-60"
          >
            <XIcon size={16} className="text-muted-foreground" />
          </Pressable>
        </View>
      )}

      <View
        className="px-3 pt-2 flex-row items-end gap-2 border-t border-border/50 bg-background"
        style={{ paddingBottom: (keyboardUp ? 0 : insets.bottom) + 8, borderTopColor: border }}
      >
        <View className="flex-1 bg-muted rounded-[22px] px-4 py-2.5 min-h-[44px] justify-center">
          <TextInput
            value={draft}
            onChangeText={(value) => {
              setDraft(value);
              noteTyping(value);
            }}
            onBlur={stopTyping}
            placeholder={isGroup ? 'Message — use @ to mention' : 'Message'}
            placeholderTextColor={palette.mutedForeground}
            accessibilityLabel="Message"
            multiline
            // The server's limit. Past it the send was refused, and the
            // bubble offered a retry that could only fail again.
            maxLength={4000}
            className="text-foreground text-[15px]"
            style={{ maxHeight: 120 }}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send message"
          accessibilityState={{ disabled: !ready }}
          onPress={submit}
          disabled={!ready}
          className={`w-11 h-11 rounded-full items-center justify-center active:scale-[0.94] ${
            ready ? 'bg-action' : 'bg-muted'
          }`}
        >
          <SendIcon size={17} className={ready ? 'text-action-foreground' : 'text-muted-foreground'} />
        </Pressable>
      </View>
    </View>
  );
});
