import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { DatabaseIcon, PlusIcon, XIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import {
  chatFileSize,
  formatBytes,
  MAX_CHAT_CAPTION,
  MAX_CHAT_PHOTOS,
} from '@/src/api';
import { useAuth, useConversation, useParticipants, useTheme, useUsage } from '@/src/hooks';
import { getConnectionQuality } from '@/src/hooks/useConnectionQuality';
import {
  dropChatFile,
  keepChatFile,
  pickChatPhotos,
  shrinkChatPhoto,
  type LocalChatFile,
} from '@/src/lib/chat-files';
import { queueChatFiles } from '@/src/lib/chat-uploads';
import { InsetFrame } from '@/components/InsetFrame';
import { KeyboardFrame, KeyboardScroll, useKeyboardReveal } from '@/components/KeyboardForm';
import { goBackOr } from '@/components/ScreenHeader';
import { useChatToast } from '@/components/chat/ChatToast';
import { quoteLine, STORAGE_FULL_WORDS, tell } from '@/components/chat/files/files-words';
import { takePicked, type PickedForChat } from '@/components/chat/files/picked';
import { requestInThread } from '@/components/chat/thread-requests';
import { PALETTES } from '@/theme';

for (const Icon of [DatabaseIcon, PlusIcon, XIcon]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

const THUMB = 52;
/** Over a photograph: dark in either theme. */
const DARK = `${PALETTES.light.foreground}A6`;

/** One photo on its way to being sent: shown at once, shrunk behind it. */
interface Item {
  key: string;
  /** What the picker gave: drawn while the small copy is made. */
  preview: string;
  fileName: string | null;
  ready: LocalChatFile | null;
  failed: boolean;
}

let itemCount = 0;
const itemsFrom = (assets: { uri: string; fileName?: string | null }[]): Item[] =>
  assets.map((a) => ({ key: `p${++itemCount}`, preview: a.uri, fileName: a.fileName ?? null, ready: null, failed: false }));

/**
 * Check, then send (board 141): what is about to go from this phone, what it
 * costs of your storage, and a caption. Photos can be taken out, or more
 * added, up to ten.
 *
 * Send closes this at once: the message is in the thread straight away, from
 * this phone's copies, and the upload carries on from there (chat-uploads).
 */
export default function SendFilesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [picked] = useState<PickedForChat | null>(() => (id ? takePicked(id) : null));
  // Nothing handed over (a reload, a link): there is nothing to check.
  useEffect(() => {
    if (!picked) goBackOr();
  }, [picked]);
  if (!id || !picked) return <InsetFrame edges={['top']}>{null}</InsetFrame>;
  return <SendFiles conversationId={id} picked={picked} />;
}

function SendFiles({ conversationId, picked }: { conversationId: string; picked: PickedForChat }) {
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  const { user } = useAuth();
  const { participants } = useParticipants(conversationId);
  const { conversation } = useConversation(conversationId);
  const { usage, storageUsedBytes, storageLimitBytes } = useUsage();
  const reveal = useKeyboardReveal();
  const toast = useChatToast(12);

  const isPhotos = picked.kind === 'photos';
  const [items, setItems] = useState<Item[]>(() => (picked.kind === 'photos' ? itemsFrom(picked.assets) : []));
  const [selected, setSelected] = useState(0);
  const [caption, setCaption] = useState('');
  const [sending, setSending] = useState(false);
  const [leftOut, setLeftOut] = useState(0);
  const sent = useRef(false);

  // Who it goes to: the other person in a direct chat, the chat's name in a group.
  const isGroup = conversation?.isGroup ?? participants.length > 2;
  const other = participants.find((p) => p.id !== user?.id);
  const to = isGroup ? (conversation?.title?.trim() || 'this chat') : (other?.name ?? conversation?.title ?? 'this chat');

  const itemsRef = useRef(items);
  itemsRef.current = items;

  // Each photo shrunk in turn, at the size this line can carry (rule 5).
  const working = useRef(false);
  useEffect(() => {
    if (working.current) return;
    const next = items.find((i) => !i.ready && !i.failed);
    if (!next) return;
    working.current = true;
    shrinkChatPhoto({ uri: next.preview, fileName: next.fileName }, getConnectionQuality())
      .then((ready) => {
        // Taken out while it was being made, or left: its copy goes too.
        if (sent.current || !itemsRef.current.some((i) => i.key === next.key)) {
          void dropChatFile(ready.uri);
          return;
        }
        setItems((now) => now.map((i) => (i.key === next.key ? { ...i, ready } : i)));
      })
      .catch(() => {
        setItems((now) => now.filter((i) => i.key !== next.key));
        setLeftOut((n) => n + 1);
      })
      .finally(() => {
        working.current = false;
        // Wake the effect for the next one, even if nothing else changed.
        setItems((now) => [...now]);
      });
  }, [items]);

  // Left without sending: the small copies go.
  useEffect(
    () => () => {
      if (sent.current) return;
      for (const i of itemsRef.current) if (i.ready) void dropChatFile(i.ready.uri);
    },
    [],
  );

  // Every photo gone: nothing left to send. Said, when it's because none could be read.
  useEffect(() => {
    if (!isPhotos || items.length > 0 || sending) return;
    if (leftOut > 0) {
      tell(
        leftOut === 1 ? "That photo couldn't be read" : "Those photos couldn't be read",
        'Try a different one, or save it as a JPEG first.',
      );
    }
    goBackOr();
  }, [isPhotos, items.length, sending, leftOut]);

  const at = Math.min(selected, Math.max(items.length - 1, 0));
  const current = items[at];
  const preparing = isPhotos && items.some((i) => !i.ready);
  const file = picked.kind === 'file' ? picked.file : null;
  const total = isPhotos ? items.reduce((sum, i) => sum + (i.ready?.size ?? 0), 0) : (file?.size ?? 0);
  const left = storageLimitBytes != null ? Math.max(storageLimitBytes - storageUsedBytes, 0) : null;
  // Known not to fit: said here, before anything is asked of the server.
  const wontFit = !!usage && left != null && !preparing && total > left;

  const removeCurrent = () => {
    if (!current) return;
    if (current.ready) void dropChatFile(current.ready.uri);
    setItems((now) => now.filter((i) => i.key !== current.key));
  };

  const addMore = useCallback(async () => {
    const room = MAX_CHAT_PHOTOS - items.length;
    if (room <= 0) return;
    try {
      const assets = await pickChatPhotos(room);
      if (!assets) return;
      const added = itemsFrom(assets);
      setItems((now) => [...now, ...added].slice(0, MAX_CHAT_PHOTOS));
      setSelected(items.length);
    } catch {
      toast.show("Couldn't open your photos. Try again.");
    }
  }, [items.length, toast]);

  const send = async () => {
    if (sending || preparing || wontFit) return;
    const files = isPhotos ? items.map((i) => i.ready).filter((f): f is LocalChatFile => !!f) : file ? [file] : [];
    if (files.length === 0) return;
    setSending(true);
    try {
      // Into the app's own folder first: the caches can be cleared before it's sent.
      const kept = await Promise.all(files.map(keepChatFile));
      sent.current = true;
      const replyTo = picked.replyTo;
      queueChatFiles(queryClient, {
        conversationId,
        kind: isPhotos ? 'photos' : 'file',
        files: kept,
        caption: caption.trim() ? caption.trim().slice(0, MAX_CHAT_CAPTION) : null,
        replyToId: replyTo?.id,
        replyToSender: replyTo?.sender_name ?? null,
        replyToLine: replyTo ? quoteLine(replyTo) : null,
      });
      requestInThread(conversationId, { kind: 'files-sent' });
      goBackOr();
    } catch {
      setSending(false);
      toast.show("Couldn't get that ready to send. Check your phone has some space, then try again.");
    }
  };

  const count = items.length;
  const subtitle = isPhotos ? `${count === 1 ? '1 photo' : `${count} photos`} from your phone` : 'A file from your phone';
  const label = isPhotos ? (count === 1 ? 'Send photo' : `Send ${count} photos`) : 'Send file';
  const previewHeight = Math.min(width - 32, 420);

  return (
    <InsetFrame edges={['top']}>
      {/* Close, then who it goes to and what. */}
      <View className="min-h-14 flex-row items-center gap-1 pl-1 pr-4">
        <Pressable
          onPress={() => goBackOr()}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Close"
          className="w-11 h-11 items-center justify-center active:opacity-60"
        >
          <XIcon size={22} className="text-foreground" />
        </Pressable>
        <View className="flex-1 min-w-0">
          <Text accessibilityRole="header" className="text-foreground text-[16px] leading-5 font-bold" numberOfLines={1}>
            Send to {to}
          </Text>
          <Text className="text-muted-foreground text-[12px] leading-4" numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
      </View>

      <KeyboardFrame>
        <View className="flex-1">
          <KeyboardScroll
            className="flex-1"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 24, gap: 12 }}
          >
            {isPhotos && current ? (
              <>
                {/* The one picked out, large, with a way to take it out. */}
                <View className="rounded-[20px] overflow-hidden bg-muted" style={{ height: previewHeight }}>
                  <Image
                    source={{ uri: current.ready?.uri ?? current.preview }}
                    contentFit="cover"
                    style={{ width: '100%', height: '100%' }}
                    accessibilityLabel={`Photo ${at + 1} of ${count}`}
                  />
                  <Pressable
                    onPress={removeCurrent}
                    accessibilityRole="button"
                    accessibilityLabel="Take this photo out"
                    hitSlop={6}
                    className="absolute top-2.5 right-2.5 w-9 h-9 rounded-full items-center justify-center active:opacity-80"
                    style={{ backgroundColor: DARK }}
                  >
                    <XIcon size={16} className="text-action-foreground" />
                  </Pressable>
                </View>

                {/* All of them; the + adds more, up to ten. */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                  {items.map((item, i) => (
                    <Pressable
                      key={item.key}
                      onPress={() => setSelected(i)}
                      accessibilityRole="button"
                      accessibilityLabel={`Photo ${i + 1} of ${count}`}
                      accessibilityState={{ selected: i === at }}
                      className={`rounded-[12px] overflow-hidden bg-muted ${i === at ? 'border-2 border-primary' : ''}`}
                      style={{ width: THUMB, height: THUMB }}
                    >
                      <Image source={{ uri: item.ready?.uri ?? item.preview }} contentFit="cover" style={{ width: '100%', height: '100%' }} />
                      {!item.ready ? (
                        <View className="absolute inset-0 items-center justify-center" style={{ backgroundColor: `${PALETTES.light.foreground}40` }}>
                          <ActivityIndicator size="small" color={palette.actionForeground} />
                        </View>
                      ) : null}
                    </Pressable>
                  ))}
                  {count < MAX_CHAT_PHOTOS ? (
                    <Pressable
                      onPress={() => void addMore()}
                      accessibilityRole="button"
                      accessibilityLabel="Add more photos"
                      accessibilityHint={`Up to ${MAX_CHAT_PHOTOS} at a time`}
                      className="rounded-[12px] border border-dashed border-border items-center justify-center active:bg-muted/60"
                      style={{ width: THUMB, height: THUMB }}
                    >
                      <PlusIcon size={20} className="text-muted-foreground" />
                    </Pressable>
                  ) : null}
                </ScrollView>
              </>
            ) : file ? (
              // A PDF: what it is and how big.
              <View className="rounded-[20px] bg-card border border-border/40 flex-row items-center gap-3 p-3">
                <View className="w-11 h-[52px] rounded-[10px] bg-destructive/10 items-center justify-end pb-2">
                  <Text className="text-destructive text-[11px] font-extrabold">PDF</Text>
                </View>
                <View className="flex-1 min-w-0">
                  <Text className="text-foreground text-[15px] leading-5 font-semibold" numberOfLines={2}>
                    {file.name}
                  </Text>
                  <Text className="text-muted-foreground text-[13px] leading-[18px]">PDF · {chatFileSize(file.size)}</Text>
                </View>
              </View>
            ) : null}

            {leftOut > 0 ? (
              <Text className="text-muted-foreground text-[13px] leading-[18px]">
                {leftOut === 1
                  ? "1 photo couldn't be read, so it was left out."
                  : `${leftOut} photos couldn't be read, so they were left out.`}
              </Text>
            ) : null}

            <TextInput
              value={caption}
              onChangeText={setCaption}
              onFocus={reveal.onFocus}
              placeholder="Add a caption…"
              placeholderTextColor={palette.mutedForeground}
              maxLength={MAX_CHAT_CAPTION}
              multiline
              accessibilityLabel="Caption"
              className="rounded-[14px] bg-card border border-border px-3.5 py-3 text-foreground text-[15px] leading-5"
              style={{ minHeight: 48, maxHeight: 140 }}
            />

            {/* What it costs, before it costs it. */}
            <View className="rounded-[14px] bg-muted px-3 py-3 flex-row items-start gap-2.5">
              <DatabaseIcon size={16} className="text-foreground" style={{ marginTop: 2 }} />
              {preparing ? (
                <Text className="flex-1 text-secondary-foreground text-[13px] leading-[18px]">
                  Getting {count === 1 ? 'it' : 'them'} ready to send…
                </Text>
              ) : wontFit ? (
                <View className="flex-1 gap-1.5">
                  <Text className="text-foreground text-[13px] leading-[18px]">
                    <Text className="font-bold">{`${chatFileSize(total)} won't fit`}</Text>
                    {` · ${formatBytes(left ?? 0)} left. `}
                    {STORAGE_FULL_WORDS}
                  </Text>
                  <Pressable
                    onPress={() => router.push('/settings/storage')}
                    accessibilityRole="button"
                    hitSlop={8}
                    className="self-start active:opacity-60"
                  >
                    <Text className="text-primary text-[13px] font-bold">Open Storage</Text>
                  </Pressable>
                </View>
              ) : (
                <Text className="flex-1 text-secondary-foreground text-[13px] leading-[18px]">
                  <Text className="text-foreground font-bold">{chatFileSize(total)} of your storage</Text>
                  {left != null ? ` · ${formatBytes(left)} left.` : '.'}
                  {isPhotos ? ' Sent as smaller copies. For full-size files, send them from an album.' : ''}
                </Text>
              )}
            </View>
          </KeyboardScroll>
          {toast.element}
        </View>

        <View className="px-4 pt-3 bg-background" style={{ paddingBottom: Math.max(insets.bottom, 12) }}>
          <Pressable
            onPress={() => void send()}
            disabled={sending || preparing || wontFit}
            accessibilityRole="button"
            accessibilityState={{ disabled: sending || preparing || wontFit, busy: sending }}
            className={`h-[52px] rounded-[14px] flex-row items-center justify-center gap-2 ${
              preparing || wontFit ? 'bg-muted' : 'bg-action active:opacity-85'
            }`}
          >
            {sending ? <ActivityIndicator size="small" color={palette.actionForeground} /> : null}
            <Text
              className={`text-[16px] font-semibold ${preparing || wontFit ? 'text-muted-foreground' : 'text-action-foreground'}`}
            >
              {label}
            </Text>
          </Pressable>
        </View>
      </KeyboardFrame>
    </InsetFrame>
  );
}

