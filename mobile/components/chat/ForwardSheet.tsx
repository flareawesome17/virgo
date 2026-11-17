import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { CheckIcon, ForwardIcon, SearchIcon, XIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { BottomSheet } from '@/components/BottomSheet';
import { MAX_FORWARD_TARGETS, type ConversationMessage } from '@/src/api';
import { useTheme } from '@/src/hooks';
import { useConversations, useForwardMessage } from '@/src/hooks/useChat';
import { PALETTES } from '@/theme';
import { ChatAvatar } from './ChatAvatar';
import { chatError } from './chat-words';

for (const Icon of [CheckIcon, ForwardIcon, SearchIcon, XIcon]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/**
 * Forward: the message quoted at the top, your chats to pick from, and one
 * button that sends it to each — as your own message, marked Forwarded.
 *
 * Up to five at once, as the server allows. The chats are the list you
 * already have, searched by name here rather than on the server: forwarding
 * is to somebody, not to something somebody said.
 */
export function ForwardSheet({
  message,
  conversationId,
  onClose,
  onSent,
}: {
  message: ConversationMessage | null;
  conversationId: string;
  onClose: () => void;
  /** With how many it went to, and how many could not take it. */
  onSent: (sent: number, skipped: number) => void;
}) {
  // Not closed by a swipe or the shade while it is sending: the answer is
  // what says how many it reached.
  const [busy, setBusy] = useState(false);
  return (
    <BottomSheet visible={!!message} onClose={onClose} dismissible={!busy}>
      {/* Only while open, so the list is not fetched for a sheet nobody opened. */}
      {message ? (
        <ForwardContent
          message={message}
          conversationId={conversationId}
          onClose={onClose}
          onSent={onSent}
          onBusy={setBusy}
        />
      ) : null}
    </BottomSheet>
  );
}

function ForwardContent({
  message,
  conversationId,
  onClose,
  onSent,
  onBusy,
}: {
  message: ConversationMessage;
  conversationId: string;
  onClose: () => void;
  onSent: (sent: number, skipped: number) => void;
  onBusy: (busy: boolean) => void;
}) {
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  const { conversations, loadingFirst, loadFailed, refetch } = useConversations();
  const forward = useForwardMessage(conversationId);
  useEffect(() => {
    onBusy(forward.isPending);
    return () => onBusy(false);
  }, [forward.isPending, onBusy]);
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [forId, setForId] = useState<string | null>(null);
  // Each message starts afresh.
  if (message.id !== forId) {
    setForId(message.id);
    setPicked([]);
    setSearch('');
  }

  const chats = useMemo(() => {
    const q = search.trim().toLowerCase();
    return conversations.filter(
      (c) => c.id !== conversationId && (!q || c.title.toLowerCase().includes(q)),
    );
  }, [conversations, conversationId, search]);

  const full = picked.length >= MAX_FORWARD_TARGETS;
  const toggle = (id: string) =>
    setPicked((now) =>
      now.includes(id) ? now.filter((p) => p !== id) : now.length >= MAX_FORWARD_TARGETS ? now : [...now, id],
    );

  const send = () => {
    if (picked.length === 0 || forward.isPending) return;
    forward.mutate(
      { messageId: message.id, targetIds: picked },
      {
        onSuccess: ({ sent, skipped }) => onSent(sent, skipped),
        onError: (err) => Alert.alert("Couldn't forward it", chatError(err)),
      },
    );
  };

  const count = picked.length;

  return (
    <View style={{ flexShrink: 1 }}>
      <View className="flex-row items-center pl-5 pr-2">
        <Text className="flex-1 text-foreground text-[17px] leading-6 font-bold" accessibilityRole="header">
          Forward to
        </Text>
        <Pressable
          onPress={onClose}
          disabled={forward.isPending}
          accessibilityRole="button"
          accessibilityLabel="Close"
          className="w-11 h-11 items-center justify-center active:opacity-60"
        >
          <XIcon size={18} className="text-secondary-foreground" />
        </Pressable>
      </View>

      {/* What is going. */}
      <View className="mx-5 mt-1 mb-3 px-3 py-2.5 rounded-[14px] bg-background flex-row items-start gap-2.5">
        <ForwardIcon size={16} className="text-muted-foreground" style={{ marginTop: 2 }} />
        <Text className="flex-1 text-secondary-foreground text-[14px] leading-5" numberOfLines={3}>
          {message.body}
        </Text>
      </View>

      <View className="mx-5 mb-1.5 h-11 rounded-[14px] bg-muted flex-row items-center gap-2.5 px-3.5">
        <SearchIcon size={17} className="text-muted-foreground" />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search chats"
          placeholderTextColor={palette.mutedForeground}
          accessibilityLabel="Search chats"
          autoCorrect={false}
          returnKeyType="search"
          className="flex-1 text-foreground text-[15px]"
        />
      </View>

      <Text className="px-5 pt-2.5 pb-1 text-muted-foreground text-[11px] font-bold uppercase tracking-[1px]">
        {search.trim() ? 'Chats' : 'Recent'}
      </Text>

      <ScrollView style={{ flexShrink: 1 }} keyboardShouldPersistTaps="handled">
        {loadingFirst ? (
          <View className="py-8 items-center">
            <ActivityIndicator size="small" color={palette.primary} />
          </View>
        ) : loadFailed && chats.length === 0 ? (
          <Pressable onPress={() => refetch()} accessibilityRole="button" className="px-5 py-6 active:opacity-60">
            <Text className="text-muted-foreground text-[15px] text-center">
              {"Couldn't load your chats. Tap to try again."}
            </Text>
          </Pressable>
        ) : chats.length === 0 ? (
          <Text className="px-5 py-6 text-muted-foreground text-[15px] text-center">
            {search.trim() ? `No chats called “${search.trim()}”.` : 'No other chats yet.'}
          </Text>
        ) : (
          chats.map((c) => {
            const on = picked.includes(c.id);
            const off = !on && full;
            return (
              <Pressable
                key={c.id}
                onPress={() => toggle(c.id)}
                disabled={off || forward.isPending}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on, disabled: off }}
                accessibilityLabel={c.isGroup ? `${c.title}, group of ${c.participantCount}` : c.title}
                className={`min-h-[60px] px-5 flex-row items-center gap-3 active:bg-muted/40 ${off ? 'opacity-40' : ''}`}
              >
                <ChatAvatar name={c.title} url={c.avatarUrl} size={44} group={c.isGroup} />
                <View className="flex-1 min-w-0">
                  <Text className="text-foreground text-[15px] leading-5 font-semibold" numberOfLines={1}>
                    {c.title}
                  </Text>
                  {c.isGroup ? (
                    <Text className="text-muted-foreground text-[13px] leading-[18px]">
                      {c.participantCount} people
                    </Text>
                  ) : null}
                </View>
                {on ? (
                  <View className="w-6 h-6 rounded-full bg-action items-center justify-center">
                    <CheckIcon size={14} className="text-action-foreground" />
                  </View>
                ) : (
                  <View className="w-6 h-6 rounded-full border-2 border-border" />
                )}
              </Pressable>
            );
          })
        )}
      </ScrollView>

      <View className="px-5 pt-3 gap-2 border-t border-border/50">
        <Text className="text-muted-foreground text-[13px] leading-[18px]">
          {full
            ? `Up to ${MAX_FORWARD_TARGETS} chats at a time. Sent as your own message, marked Forwarded`
            : 'Sent as your own message, marked Forwarded'}
        </Text>
        <Pressable
          onPress={send}
          disabled={count === 0 || forward.isPending}
          accessibilityRole="button"
          accessibilityState={{ disabled: count === 0, busy: forward.isPending }}
          className={`h-[52px] rounded-[14px] items-center justify-center active:opacity-85 ${
            count > 0 ? 'bg-action' : 'bg-muted'
          }`}
        >
          {forward.isPending ? (
            <ActivityIndicator size="small" color={palette.actionForeground} />
          ) : (
            <Text
              className={`text-[15px] font-semibold ${count > 0 ? 'text-action-foreground' : 'text-muted-foreground'}`}
            >
              {count === 0 ? 'Pick a chat' : `Send to ${count} chat${count === 1 ? '' : 's'}`}
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}
