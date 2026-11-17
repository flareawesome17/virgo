import {
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type Ref,
} from 'react';
import { View, Text, Pressable, TextInput, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AtSignIcon, CheckIcon, PencilIcon, PlusIcon, ReplyIcon, SendIcon, XIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { EDIT_WINDOW_MINUTES, type ConversationMessage, type Participant } from '@/src/api';
import { sendTyping } from '@/src/lib/presence-store';
import { getConnectionQuality } from '@/src/hooks/useConnectionQuality';
import { useTheme } from '@/src/hooks';
import { useKeyboardUp } from '@/src/lib/keyboard';
import { PALETTES } from '@/theme';

for (const Icon of [AtSignIcon, CheckIcon, PencilIcon, PlusIcon, ReplyIcon, SendIcon, XIcon]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/** How often "still typing" is said while someone keeps typing. */
const TYPING_HEARTBEAT_MS = 3000;
/** How long a pause is before it counts as having stopped. */
const TYPING_IDLE_MS = 3000;

// Moved to src/lib/keyboard so forms outside chat can use it; kept here for
// the chat screen, which imports it with the composer.
export { useKeyboardUp };

/** What the screen can do to the box from outside it. */
export interface ComposerHandle {
  /**
   * Puts words in the box — a saved reply. Added after what is already
   * there, on a new line or after a space, or in place of an empty box.
   */
  insert: (text: string) => void;
  focus: () => void;
}

interface ComposerProps {
  conversationId: string;
  isGroup: boolean;
  /** Everyone but you: who can be mentioned. */
  others: readonly Participant[];
  replyTo: ConversationMessage | null;
  onCancelReply: () => void;
  onSend: (message: { body: string; mentionIds: string[] }) => void;
  /** The message being changed, or null. The box holds its words meanwhile. */
  editing: ConversationMessage | null;
  /** Who will see it marked Edited, said under Editing. */
  editNote: string;
  onCancelEdit: () => void;
  onSaveEdit: (change: { message: ConversationMessage; body: string; mentionIds: string[] }) => void;
  /**
   * The edit window closed while the box held the change. The words stay in
   * the box, to send as a new message or clear.
   */
  onEditExpired: () => void;
  /** The round + at the start of the box: saved replies, in this phase. */
  onPlus?: () => void;
  ref?: Ref<ComposerHandle>;
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
  editing,
  editNote,
  onCancelEdit,
  onSaveEdit,
  onEditExpired,
  onPlus,
  ref,
}: ComposerProps) {
  const insets = useSafeAreaInsets();
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  const keyboardUp = useKeyboardUp();
  const [draft, setDraft] = useState('');
  const [mentioned, setMentioned] = useState<Participant[]>([]);
  const inputRef = useRef<TextInput>(null);

  // The latest of each, for the effects and timers below, which should not
  // re-run on every keystroke.
  const latest = useRef({ draft, mentioned, others, onEditExpired });
  latest.current = { draft, mentioned, others, onEditExpired };

  useImperativeHandle(
    ref,
    () => ({
      insert: (text: string) => {
        setDraft((current) => {
          if (!current.trim()) return text;
          if (/\s$/.test(current)) return `${current}${text}`;
          const joiner = current.includes('\n') || text.includes('\n') ? '\n' : ' ';
          return `${current}${joiner}${text}`;
        });
      },
      focus: () => inputRef.current?.focus(),
    }),
    [],
  );

  /*
   * Editing borrows the box. What was being written before is put aside and
   * comes back after Save or Cancel. Going from one edit straight to another
   * keeps the first thing put aside, not the first edit.
   */
  const stash = useRef<{ draft: string; mentioned: Participant[] } | null>(null);
  const editingId = editing?.id ?? null;
  useEffect(() => {
    if (!editing) {
      // Left by the screen — the window closed, or the message went. What is
      // in the box stays there.
      stash.current = null;
      return undefined;
    }
    const { draft: current, mentioned: named, others: people } = latest.current;
    if (!stash.current) stash.current = { draft: current, mentioned: named };
    setDraft(editing.body);
    setMentioned(people.filter((p) => editing.body.includes(`@${p.name}`)));
    inputRef.current?.focus();

    // The window closes while the change is still in the box.
    const left = new Date(editing.created_at).getTime() + EDIT_WINDOW_MINUTES * 60_000 - Date.now();
    const timer = setTimeout(() => {
      stash.current = null;
      latest.current.onEditExpired();
    }, Math.max(0, left));
    return () => clearTimeout(timer);
    // Keyed on which message, not on the object: a reaction arriving on it
    // must not start the edit again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId]);

  const restoreStash = () => {
    const kept = stash.current;
    stash.current = null;
    setDraft(kept?.draft ?? '');
    setMentioned(kept?.mentioned ?? []);
  };

  const cancelEdit = () => {
    restoreStash();
    onCancelEdit();
  };

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
      // On 2G or 3G only "started" and "stopped" go, not the heartbeat: a
      // frame every three seconds is worth less there than the message.
      const heartbeat = getConnectionQuality() !== 'slow';
      if (
        !typingSent.current ||
        (heartbeat && now - lastBeat.current >= TYPING_HEARTBEAT_MS)
      ) {
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
    if (editing) {
      const message = editing;
      restoreStash();
      // Saved unchanged is no change: nothing is marked Edited for it.
      if (body === message.body.trim()) onCancelEdit();
      else onSaveEdit({ message, body, mentionIds });
      return;
    }
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

      {/* What you are replying to — put aside while a message is edited. */}
      {replyTo && !editing && (
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

      {/* Editing: which message, who will see it changed, and the way out. */}
      {editing && (
        <View
          className="pl-4 pr-1 py-2 flex-row items-center gap-3 border-t border-border/50 bg-card"
          style={{ borderTopColor: border }}
        >
          <PencilIcon size={18} className="text-primary" />
          <View className="flex-1 min-w-0">
            <Text className="text-primary text-[13px] leading-[18px] font-bold">Editing</Text>
            <Text className="text-muted-foreground text-[13px] leading-[18px]" numberOfLines={1}>
              {editNote}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Stop editing"
            onPress={cancelEdit}
            className="w-11 h-11 items-center justify-center active:opacity-60"
          >
            <XIcon size={18} className="text-secondary-foreground" />
          </Pressable>
        </View>
      )}

      <View
        className={`px-3 pt-2 flex-row items-end gap-2 ${
          editing ? 'bg-card' : 'border-t border-border/50 bg-background'
        }`}
        style={{
          paddingBottom: (keyboardUp ? 0 : insets.bottom) + 8,
          ...(editing ? null : { borderTopColor: border }),
        }}
      >
        {/* Quiet, so the send button stays the one thing in colour. */}
        {onPlus && !editing ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Saved replies"
            accessibilityHint="Puts one of your saved replies in the message"
            onPress={onPlus}
            className="w-11 h-11 rounded-full bg-muted items-center justify-center active:scale-[0.94]"
          >
            <PlusIcon size={20} className="text-foreground" />
          </Pressable>
        ) : null}
        <View className="flex-1 bg-muted rounded-[22px] px-4 py-2.5 min-h-[44px] justify-center">
          <TextInput
            ref={inputRef}
            value={draft}
            onChangeText={(value) => {
              setDraft(value);
              // A change to something already sent is not "typing…".
              if (!editing) noteTyping(value);
            }}
            onBlur={stopTyping}
            placeholder={
              editing ? 'Edit your message' : isGroup ? 'Message — use @ to mention' : 'Message'
            }
            placeholderTextColor={palette.mutedForeground}
            accessibilityLabel={editing ? 'Edit message' : 'Message'}
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
          accessibilityLabel={editing ? 'Save the change' : 'Send message'}
          accessibilityState={{ disabled: !ready }}
          onPress={submit}
          disabled={!ready}
          className={`w-11 h-11 rounded-full items-center justify-center active:scale-[0.94] ${
            ready ? 'bg-action' : 'bg-muted'
          }`}
        >
          {editing ? (
            <CheckIcon size={20} className={ready ? 'text-action-foreground' : 'text-muted-foreground'} />
          ) : (
            <SendIcon size={17} className={ready ? 'text-action-foreground' : 'text-muted-foreground'} />
          )}
        </Pressable>
      </View>
    </View>
  );
});
