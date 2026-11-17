import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { BottomSheet } from '@/components/BottomSheet';
import { MAX_SAVED_REPLIES, type SavedReply } from '@/src/api';
import { useTheme } from '@/src/hooks';
import { useDeleteSavedReply, useSavedReplies, useSaveReply } from '@/src/hooks/useChat';
import { PALETTES } from '@/theme';
import { chatError } from './chat-words';

for (const Icon of [PencilIcon, PlusIcon, Trash2Icon]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

const TITLE_MAX = 60;
const BODY_MAX = 2000;

type Mode = { kind: 'list' } | { kind: 'manage' } | { kind: 'form'; reply: SavedReply | null; from: 'list' | 'manage' };

/**
 * Saved replies: answers given often — rates, what's included, the down
 * payment — put into the message box with one tap, to change before sending.
 *
 * One sheet with three faces: the list, the list to manage (change or
 * delete each), and the small form for a new one or a change. The sheet
 * rises with the keyboard and its form scrolls inside it, so the field being
 * typed in and the Save under it stay above the keyboard on a small phone.
 */
export function SavedRepliesSheet({
  visible,
  onClose,
  onClosed,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  /** Once it has fully gone: when the message box can take the keyboard. */
  onClosed?: () => void;
  /** The words of the one tapped, for the composer. */
  onPick: (body: string) => void;
}) {
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  const { replies, isLoading, loadFailed, refetch } = useSavedReplies(visible);
  const save = useSaveReply();
  const remove = useDeleteSavedReply();
  const [mode, setMode] = useState<Mode>({ kind: 'list' });
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  const atLimit = replies.length >= MAX_SAVED_REPLIES;
  const managing = mode.kind === 'manage';

  const openForm = (reply: SavedReply | null) => {
    setTitle(reply?.title ?? '');
    setBody(reply?.body ?? '');
    setMode({ kind: 'form', reply, from: managing ? 'manage' : 'list' });
  };

  const close = () => {
    if (save.isPending) return;
    onClose();
  };

  // Each time it opens, it opens on the list.
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setMode({ kind: 'list' });
  }

  const confirmDelete = (reply: SavedReply) => {
    Alert.alert(`Delete “${reply.title}”?`, 'It goes from your phone, the web and the desktop app.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          remove.mutate(reply.id, {
            onError: (err) => Alert.alert("Couldn't delete it", chatError(err)),
          }),
      },
    ]);
  };

  const submit = () => {
    if (mode.kind !== 'form') return;
    const t = title.trim();
    const b = body.trim();
    if (!t || !b || save.isPending) return;
    save.mutate(
      { id: mode.reply?.id, title: t, body: b },
      {
        onSuccess: () => setMode({ kind: mode.from }),
        onError: (err) => Alert.alert("Couldn't save it", chatError(err)),
      },
    );
  };

  let content;
  if (mode.kind === 'form') {
    const ready = title.trim().length > 0 && body.trim().length > 0;
    content = (
      <ScrollView
        style={{ flexShrink: 1 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="none"
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 12 }}
      >
        <Text className="text-foreground text-[17px] leading-6 font-bold pt-1" accessibilityRole="header">
          {mode.reply ? 'Change saved reply' : 'New saved reply'}
        </Text>
        <Text className="text-muted-foreground text-[13px] leading-[18px] mt-0.5">
          Only you see the name. The words go into your message.
        </Text>

        <Text className="text-foreground text-[13px] font-semibold mt-4 mb-1.5">Name</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          autoFocus={!mode.reply}
          maxLength={TITLE_MAX}
          placeholder="Wedding rates 2027"
          placeholderTextColor={palette.mutedForeground}
          returnKeyType="next"
          accessibilityLabel="Name"
          className="rounded-[14px] border border-input bg-background px-4 h-12 text-foreground text-[15px]"
        />

        <View className="flex-row items-baseline justify-between mt-4 mb-1.5">
          <Text className="text-foreground text-[13px] font-semibold">Words</Text>
          {body.length > BODY_MAX - 200 ? (
            <Text className="text-muted-foreground text-[12px]">
              {body.length} / {BODY_MAX}
            </Text>
          ) : null}
        </View>
        <TextInput
          value={body}
          onChangeText={setBody}
          multiline
          maxLength={BODY_MAX}
          placeholder="Photo only ₱45,000 · Photo and video ₱75,000…"
          placeholderTextColor={palette.mutedForeground}
          accessibilityLabel="Words"
          textAlignVertical="top"
          className="rounded-[14px] border border-input bg-background px-4 pt-3 pb-3 text-foreground text-[15px] leading-5"
          style={{ minHeight: 112, maxHeight: 180 }}
        />

        <View className="flex-row gap-3 mt-5">
          <Pressable
            onPress={() => setMode({ kind: mode.from })}
            disabled={save.isPending}
            accessibilityRole="button"
            className="flex-1 h-11 rounded-[14px] bg-muted items-center justify-center active:opacity-70"
          >
            <Text className="text-foreground text-[15px] font-semibold">Cancel</Text>
          </Pressable>
          <Pressable
            onPress={submit}
            disabled={!ready || save.isPending}
            accessibilityRole="button"
            accessibilityState={{ disabled: !ready, busy: save.isPending }}
            className={`flex-[2] h-11 rounded-[14px] items-center justify-center active:opacity-85 ${
              ready ? 'bg-action' : 'bg-muted'
            }`}
          >
            {save.isPending ? (
              <ActivityIndicator size="small" color={palette.actionForeground} />
            ) : (
              <Text className={`text-[15px] font-semibold ${ready ? 'text-action-foreground' : 'text-muted-foreground'}`}>
                Save
              </Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    );
  } else {
    content = (
      <View style={{ flexShrink: 1 }}>
        <View className="flex-row items-center justify-between pl-5 pr-2">
          <Text className="text-foreground text-[17px] leading-6 font-bold" accessibilityRole="header">
            Saved replies
          </Text>
          {replies.length > 0 ? (
            <Pressable
              onPress={() => setMode({ kind: managing ? 'list' : 'manage' })}
              accessibilityRole="button"
              accessibilityLabel={managing ? 'Done' : 'Edit saved replies'}
              className="h-11 px-3 items-center justify-center active:opacity-60"
            >
              <Text className="text-primary text-[15px] font-semibold">{managing ? 'Done' : 'Edit'}</Text>
            </Pressable>
          ) : (
            <View className="h-11" />
          )}
        </View>
        <Text className="px-5 pb-2.5 text-muted-foreground text-[13px] leading-[18px]">
          {managing
            ? 'Change or delete any of them.'
            : 'Tap one to put it in your message. Change anything before you send.'}
        </Text>

        <ScrollView style={{ flexShrink: 1 }}>
          {isLoading ? (
            <View className="py-8 items-center">
              <ActivityIndicator size="small" color={palette.primary} />
            </View>
          ) : loadFailed && replies.length === 0 ? (
            <Pressable onPress={() => refetch()} accessibilityRole="button" className="px-5 py-6 active:opacity-60">
              <Text className="text-muted-foreground text-[15px] text-center">
                {"Couldn't load your saved replies. Tap to try again."}
              </Text>
            </Pressable>
          ) : replies.length === 0 ? (
            <View className="mx-5 px-4 py-5 rounded-[20px] bg-background">
              <Text className="text-foreground text-[15px] leading-5 font-semibold">No saved replies yet</Text>
              <Text className="text-muted-foreground text-[13px] leading-[18px] mt-0.5">
                Save the answers you give often, like your rates or what a package includes.
              </Text>
            </View>
          ) : (
            <View className="mx-5 rounded-[20px] border border-border/60 overflow-hidden">
              {replies.map((reply, i) => (
                <View
                  key={reply.id}
                  className={`flex-row items-center ${i > 0 ? 'border-t border-border/40' : ''}`}
                >
                  <Pressable
                    onPress={() => (managing ? openForm(reply) : onPick(reply.body))}
                    accessibilityRole="button"
                    accessibilityLabel={managing ? `Change ${reply.title}` : reply.title}
                    accessibilityHint={managing ? undefined : 'Puts it in your message'}
                    className="flex-1 min-w-0 px-3.5 py-3 active:bg-muted/40"
                  >
                    <Text className="text-foreground text-[15px] leading-5 font-semibold" numberOfLines={1}>
                      {reply.title}
                    </Text>
                    <Text className="text-muted-foreground text-[13px] leading-[18px]" numberOfLines={2}>
                      {reply.body}
                    </Text>
                  </Pressable>
                  {managing ? (
                    <View className="flex-row items-center pr-1">
                      <Pressable
                        onPress={() => openForm(reply)}
                        accessibilityRole="button"
                        accessibilityLabel={`Change ${reply.title}`}
                        className="w-11 h-11 items-center justify-center active:opacity-60"
                      >
                        <PencilIcon size={17} className="text-foreground" />
                      </Pressable>
                      <Pressable
                        onPress={() => confirmDelete(reply)}
                        disabled={remove.isPending && remove.variables === reply.id}
                        accessibilityRole="button"
                        accessibilityLabel={`Delete ${reply.title}`}
                        className="w-11 h-11 items-center justify-center active:opacity-60"
                      >
                        {remove.isPending && remove.variables === reply.id ? (
                          <ActivityIndicator size="small" color={palette.destructive} />
                        ) : (
                          <Trash2Icon size={17} className="text-destructive" />
                        )}
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              ))}
            </View>
          )}
        </ScrollView>

        <View className="px-5 pt-3 pb-2">
          <Pressable
            onPress={() => openForm(null)}
            disabled={atLimit || isLoading}
            accessibilityRole="button"
            accessibilityState={{ disabled: atLimit }}
            className={`h-11 rounded-[14px] bg-muted flex-row items-center justify-center gap-2 active:opacity-70 ${
              atLimit ? 'opacity-50' : ''
            }`}
          >
            <PlusIcon size={18} className="text-foreground" />
            <Text className="text-foreground text-[15px] font-semibold">New saved reply</Text>
          </Pressable>
          <Text className="pt-2.5 text-muted-foreground text-[12px] leading-4 text-center">
            {atLimit
              ? `That's ${MAX_SAVED_REPLIES}, the most you can keep. Delete one to make room.`
              : `Up to ${MAX_SAVED_REPLIES}. They follow you to the web and the desktop app.`}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <BottomSheet visible={visible} onClose={close} onClosed={onClosed}>
      {content}
    </BottomSheet>
  );
}
