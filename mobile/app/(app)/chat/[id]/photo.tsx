import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  Text,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import * as WebBrowser from 'expo-web-browser';
import {
  AlertCircleIcon,
  ClockIcon,
  DownloadIcon,
  ForwardIcon,
  ImagesIcon,
  ReplyIcon,
  XIcon,
  type LucideIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import {
  ApiError,
  filesCaption,
  isStorageFull,
  type Album,
  type ChatAttachment,
  type ConversationMessage,
} from '@/src/api';
import { useAuth, useConversation, useParticipants } from '@/src/hooks';
import { findThreadMessage } from '@/src/hooks/useChat';
import { attachmentLink, useAddToAlbum } from '@/src/hooks/useChatFiles';
import { canSaveToPhotos } from '@/src/lib/photo-permission';
import { InsetFrame } from '@/components/InsetFrame';
import { goBackOr } from '@/components/ScreenHeader';
import { chatError } from '@/components/chat/chat-words';
import { useChatToast } from '@/components/chat/ChatToast';
import { ForwardSheet } from '@/components/chat/ForwardSheet';
import { AlbumPickSheet } from '@/components/chat/files/AlbumPickSheet';
import { chatPhotoKey } from '@/components/chat/files/FilesMessage';
import { alertStorageFull } from '@/components/chat/files/files-words';
import { forgetChatPhoto, shownChatPhoto } from '@/components/chat/files/viewer-handoff';
import { requestInThread } from '@/components/chat/thread-requests';
import { dayLabel, timeLabel } from '@/components/chat/ThreadRows';

for (const Icon of [AlertCircleIcon, ClockIcon, DownloadIcon, ForwardIcon, ImagesIcon, ReplyIcon, XIcon]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/**
 * The message as the thread holds it now — a reaction, an unsend — or as it
 * was handed over when the thread no longer holds it.
 */
function useLiveMessage(conversationId: string, messageId: string): ConversationMessage | null {
  const queryClient = useQueryClient();
  const read = useCallback(
    () => findThreadMessage(queryClient, conversationId, messageId) ?? shownChatPhoto(messageId),
    [queryClient, conversationId, messageId],
  );
  const [message, setMessage] = useState(read);
  useEffect(
    () =>
      queryClient.getQueryCache().subscribe(() => {
        const next = read();
        setMessage((prev) => (prev === next ? prev : next));
      }),
    [queryClient, read],
  );
  useEffect(() => () => forgetChatPhoto(messageId), [messageId]);
  return message;
}

/**
 * A chat photo, full screen (board 143): who sent it and when, which of the
 * message's photos this is, its caption, and Reply, Forward, Save and Add to
 * album. Swiped between the message's photos by a paging list, with no pan
 * wrapped round it: on iOS that stops the list scrolling.
 *
 * Opening it is what loads the full photo; the thumbnail stands in until then.
 */
export default function ChatPhotoScreen() {
  const params = useLocalSearchParams<{ id: string; messageId: string; index?: string }>();
  if (!params.id || !params.messageId) return null;
  return (
    <ChatPhotoViewer
      conversationId={params.id}
      messageId={params.messageId}
      startAt={Math.max(0, Number(params.index) || 0)}
    />
  );
}

function ChatPhotoViewer({
  conversationId,
  messageId,
  startAt,
}: {
  conversationId: string;
  messageId: string;
  startAt: number;
}) {
  const { width: windowWidth } = useWindowDimensions();
  const { user } = useAuth();
  const { participants } = useParticipants(conversationId);
  const { conversation } = useConversation(conversationId);
  const message = useLiveMessage(conversationId, messageId);
  const toast = useChatToast(96);
  const addToAlbum = useAddToAlbum(conversationId);

  const photos = useMemo(
    () => (message?.attachments ?? []).filter((a) => a.kind === 'photo'),
    [message?.attachments],
  );
  const [page, setPage] = useState(() => Math.min(startAt, Math.max(photos.length - 1, 0)));
  const [pageSize, setPageSize] = useState({ width: windowWidth, height: 0 });
  const [saving, setSaving] = useState(false);
  const [forwarding, setForwarding] = useState(false);
  const [picking, setPicking] = useState(false);
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const listRef = useRef<FlatList<ChatAttachment>>(null);

  // Unsent while open: there is nothing left to show.
  const gone = !message || !!message.deleted_at || photos.length === 0;
  useEffect(() => {
    if (message?.deleted_at) goBackOr();
  }, [message?.deleted_at]);

  const current = photos[Math.min(page, photos.length - 1)] ?? null;
  const mine = message?.sender_id === user?.id;
  const isGroup = conversation?.isGroup ?? participants.length > 2;
  const other = participants.find((p) => p.id !== user?.id);
  const chatName = isGroup ? (conversation?.title?.trim() || 'this chat') : (other?.name ?? conversation?.title ?? 'this chat');
  const who = mine ? 'You' : (message?.sender_name ?? 'Someone');
  const when = message ? `${dayLabel(message.created_at)}, ${timeLabel(message.created_at)} · in ${chatName}` : '';
  const caption = message ? filesCaption(message) : null;
  const allIn = photos.length > 0 && photos.every((a) => a.status === 'ready');

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width !== pageSize.width || height !== pageSize.height) setPageSize({ width, height });
  };

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const w = pageSize.width || windowWidth;
      const next = Math.round(e.nativeEvent.contentOffset.x / w);
      setPage((prev) => (prev === next ? prev : Math.max(0, Math.min(next, photos.length - 1))));
    },
    [pageSize.width, windowWidth, photos.length],
  );

  const reply = () => {
    if (!message) return;
    requestInThread(conversationId, { kind: 'reply', messageId: message.id });
    goBackOr();
  };

  /**
   * Into the phone's Photos, as the album viewer saves: add-only permission,
   * the file downloaded from its hour's link, then handed to the library.
   * On the web there is no library: the link downloads it.
   */
  const save = async () => {
    if (!message || !current || current.status !== 'ready' || saving) return;
    setSaving(true);
    let local: string | null = null;
    try {
      const { url } = await attachmentLink(conversationId, message.id, current.id);
      if (Platform.OS === 'web') {
        await WebBrowser.openBrowserAsync(url);
        return;
      }
      if (!(await canSaveToPhotos('this photo'))) return;
      const ext = current.contentType === 'image/png' ? 'png' : current.contentType === 'image/jpeg' ? 'jpg' : 'webp';
      const result = await FileSystem.downloadAsync(url, `${FileSystem.cacheDirectory}chat-${current.id}.${ext}`);
      local = result.uri;
      if (result.status < 200 || result.status >= 300) throw new Error('not downloaded');
      await MediaLibrary.saveToLibraryAsync(result.uri);
      toast.show('Saved to your Photos');
    } catch (err) {
      // Gone (unsent meanwhile) says so; anything else is the connection.
      toast.show(
        err instanceof ApiError && err.status === 404
          ? chatError(err)
          : "Couldn't save it. Check your connection and try again.",
      );
    } finally {
      if (local) void FileSystem.deleteAsync(local, { idempotent: true }).catch(() => undefined);
      setSaving(false);
    }
  };

  const addTo = (album: Album) => {
    if (!message || !current) return;
    setAddingTo(album.id);
    addToAlbum.mutate(
      { messageId: message.id, attachmentId: current.id, albumId: album.id },
      {
        onSuccess: () => {
          setPicking(false);
          toast.show(`Added to ${album.name}`);
        },
        onError: (err) => {
          setPicking(false);
          if (isStorageFull(err)) {
            alertStorageFull();
            return;
          }
          toast.show(
            err instanceof ApiError && err.status === 403 && err.message
              ? err.message
              : chatError(err),
          );
        },
        onSettled: () => setAddingTo(null),
      },
    );
  };

  const renderItem = useCallback(
    ({ item }: { item: ChatAttachment }) => (
      <View style={{ width: pageSize.width || windowWidth, height: pageSize.height }} className="items-center justify-center">
        {item.status === 'ready' && item.url ? (
          <Image
            source={{ uri: item.url, cacheKey: chatPhotoKey(item.id, 'full') }}
            placeholder={
              item.thumbUrl
                ? { uri: item.thumbUrl, cacheKey: chatPhotoKey(item.id, 'thumb') }
                : item.blur
                  ? { uri: item.blur }
                  : undefined
            }
            placeholderContentFit="contain"
            cachePolicy="memory-disk"
            contentFit="contain"
            transition={160}
            style={{ width: '100%', height: '100%' }}
            accessibilityLabel={item.name}
          />
        ) : item.status === 'failed' ? (
          <View className="items-center gap-2 px-10">
            <AlertCircleIcon size={26} className="text-white/70" />
            <Text className="text-white/80 text-[15px] text-center">{"This photo didn't arrive."}</Text>
          </View>
        ) : (
          <View className="items-center gap-2 px-10">
            <ClockIcon size={26} className="text-white/70" />
            <Text className="text-white/80 text-[15px] text-center">Still on its way.</Text>
          </View>
        )}
      </View>
    ),
    [pageSize.width, pageSize.height, windowWidth],
  );

  return (
    <InsetFrame edges={['top', 'bottom']} className="flex-1 bg-black">
      {/* Who, when and where; and which of them. */}
      <View className="min-h-14 flex-row items-center gap-1 pl-1 pr-4">
        <Pressable
          onPress={() => goBackOr()}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Close"
          className="w-11 h-11 items-center justify-center active:opacity-60"
        >
          <XIcon size={22} className="text-white" />
        </Pressable>
        <View className="flex-1 min-w-0">
          <Text className="text-white text-[16px] leading-5 font-bold" numberOfLines={1}>
            {who}
          </Text>
          <Text className="text-white/70 text-[12px] leading-4" numberOfLines={1}>
            {when}
          </Text>
        </View>
        {photos.length > 1 ? (
          <Text className="text-white/80 text-[14px] font-bold" accessibilityLabel={`Photo ${page + 1} of ${photos.length}`}>
            {page + 1} of {photos.length}
          </Text>
        ) : null}
      </View>

      <View className="flex-1" onLayout={onLayout}>
        {gone ? (
          <View className="flex-1 items-center justify-center px-10">
            <Text className="text-white/80 text-[15px] text-center">{"This photo isn't here any more."}</Text>
          </View>
        ) : pageSize.height > 0 ? (
          <FlatList
            ref={listRef}
            data={photos}
            keyExtractor={(a) => a.id}
            renderItem={renderItem}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            initialScrollIndex={Math.min(startAt, photos.length - 1)}
            getItemLayout={(_data, index) => ({
              length: pageSize.width,
              offset: pageSize.width * index,
              index,
            })}
            onScroll={onScroll}
            scrollEventThrottle={32}
            windowSize={3}
            initialNumToRender={1}
            maxToRenderPerBatch={2}
          />
        ) : null}
      </View>

      {caption ? (
        <Text className="text-white text-[15px] leading-[21px] px-4 pt-3" numberOfLines={4}>
          {caption}
        </Text>
      ) : null}

      <View className="flex-row items-stretch justify-around px-2 pt-4 pb-2">
        <BarButton Icon={ReplyIcon} label="Reply" onPress={reply} disabled={gone} />
        <BarButton Icon={ForwardIcon} label="Forward" onPress={() => setForwarding(true)} disabled={gone || !allIn} />
        <BarButton
          Icon={DownloadIcon}
          label="Save"
          onPress={() => void save()}
          disabled={gone || current?.status !== 'ready'}
          busy={saving}
        />
        <BarButton
          Icon={ImagesIcon}
          label="Add to album"
          onPress={() => setPicking(true)}
          disabled={gone || current?.status !== 'ready'}
        />
      </View>
      {toast.element}

      <ForwardSheet
        message={forwarding && message ? message : null}
        conversationId={conversationId}
        onClose={() => setForwarding(false)}
        onSent={(sent, skipped) => {
          setForwarding(false);
          toast.show(
            skipped > 0
              ? `Forwarded to ${sent} of ${sent + skipped} chats. The others can't take messages right now.`
              : `Forwarded to ${sent} chat${sent === 1 ? '' : 's'}`,
          );
        }}
      />

      <AlbumPickSheet visible={picking} busyId={addingTo} onClose={() => setPicking(false)} onPick={addTo} />
    </InsetFrame>
  );
}

function BarButton({
  Icon,
  label,
  onPress,
  disabled,
  busy,
}: {
  Icon: LucideIcon;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, busy: !!busy }}
      className="min-w-[72px] min-h-[52px] items-center justify-center gap-1.5 px-2 active:opacity-60"
      style={{ opacity: disabled ? 0.4 : 1 }}
    >
      {busy ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Icon size={20} className="text-white" />}
      <Text className="text-white text-[12px] leading-4 font-bold">{label}</Text>
    </Pressable>
  );
}
