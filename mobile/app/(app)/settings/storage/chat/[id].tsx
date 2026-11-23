import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { CheckIcon, ImageIcon, Trash2Icon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { chatFileSize, fileDetailLine, formatBytes, type ConversationMessage } from '@/src/api';
import { useTheme } from '@/src/hooks';
import { useMediaAutoLoad } from '@/src/hooks/useConnectionQuality';
import { useChatFilesUsage, useSentFiles, useUnsendFiles } from '@/src/hooks/useChatFiles';
import { BottomSheet } from '@/components/BottomSheet';
import { LoadFailed } from '@/components/LoadFailed';
import { ScreenHeader } from '@/components/ScreenHeader';
import { chatError, momentLabel } from '@/components/chat/chat-words';
import { useChatToast } from '@/components/chat/ChatToast';
import { chatPhotoKey } from '@/components/chat/files/FilesMessage';
import { PALETTES } from '@/theme';

for (const Icon of [CheckIcon, ImageIcon, Trash2Icon]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

const COLUMNS = 3;
const GAP = 4;
const SIDE = 20;
/** Over a photograph: dark in either theme. */
const SCRIM = `${PALETTES.light.foreground}8C`;

/** What one message of yours uses: every photo in it, or its file. */
function bytesOf(m: ConversationMessage): number {
  return (m.attachments ?? []).reduce((sum, a) => sum + a.sizeBytes, 0);
}

/**
 * What you sent in one chat (from the storage screen): your photos as a grid
 * and your files as rows, each with what it uses. Pick some, then Delete for
 * everyone takes them back from the chat and frees the room — in a chat you
 * have left as well, where they still count.
 */
export default function WhatYouSentScreen() {
  const { id, title: titleParam } = useLocalSearchParams<{ id: string; title?: string }>();
  const { width } = useWindowDimensions();
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  const { autoLoad } = useMediaAutoLoad();
  const { usage } = useChatFilesUsage();
  const { messages, data, isLoading, loadFailed, refetch } = useSentFiles(id);
  const unsend = useUnsendFiles();
  const toast = useChatToast(96);
  const [picked, setPicked] = useState<Set<string>>(() => new Set());

  const chat = usage?.chats.find((c) => c.conversationId === id);
  const title = chat?.title ?? titleParam ?? 'this chat';
  const left = chat ? !chat.member : false;

  // Only what can still be taken back: an unsent one has nothing left in it.
  const live = useMemo(() => messages.filter((m) => !m.deleted_at && (m.attachments ?? []).length > 0), [messages]);
  const photos = live.filter((m) => m.kind === 'photos');
  const files = live.filter((m) => m.kind === 'file');
  const total = live.reduce((sum, m) => sum + bytesOf(m), 0);
  const pickedBytes = live.filter((m) => picked.has(m.id)).reduce((sum, m) => sum + bytesOf(m), 0);
  const tile = Math.floor((Math.min(width, 560) - SIDE * 2 - GAP * (COLUMNS - 1)) / COLUMNS);

  const toggle = (messageId: string) =>
    setPicked((now) => {
      const next = new Set(now);
      if (next.has(messageId)) next.delete(messageId);
      else next.add(messageId);
      return next;
    });

  /** Asking first: it can't be undone, and it reaches everyone in the chat. */
  const [asking, setAsking] = useState(false);
  const size = formatBytes(pickedBytes);
  const deleteForEveryone = () => {
    const ids = [...picked];
    if (ids.length === 0 || unsend.isPending) return;
    unsend.mutate(ids, {
      onSuccess: () => {
        setAsking(false);
        setPicked(new Set());
        toast.show(`Deleted for everyone. ${size} freed.`);
      },
      onError: (err) => {
        setAsking(false);
        toast.show(chatError(err));
      },
    });
  };

  const count = picked.size;
  let body;
  if (!data && isLoading) {
    body = (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator color={palette.primary} />
      </View>
    );
  } else if (!data && loadFailed) {
    body = <LoadFailed what="what you sent" onRetry={() => void refetch()} />;
  } else if (live.length === 0) {
    body = (
      <View className="flex-1 items-center justify-center px-10">
        <Text className="text-foreground text-[15px] font-bold text-center">Nothing left here</Text>
        <Text className="text-muted-foreground text-[13px] text-center mt-1.5 leading-5">
          {"Photos and files you send in this chat from your phone show here, with what they use."}
        </Text>
      </View>
    );
  } else {
    body = (
      <ScrollView contentContainerStyle={{ paddingHorizontal: SIDE, paddingBottom: 140, gap: 16 }}>
        {left ? (
          <View className="rounded-2xl bg-muted px-4 py-3">
            <Text className="text-secondary-foreground text-[13px] leading-[18px]">
              {"You've left this chat. What you sent still counts until you delete it."}
            </Text>
          </View>
        ) : null}
        <Text className="text-muted-foreground text-[13px] leading-[18px]">
          Tap the ones to take back. Others in the chat stop seeing them, and the room they use is yours again.
        </Text>

        {photos.length > 0 ? (
          <View>
            <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px] mb-2 ml-1">Photos</Text>
            <View className="flex-row flex-wrap" style={{ gap: GAP }}>
              {photos.map((m) => {
                const first = m.attachments?.find((a) => a.status === 'ready') ?? m.attachments?.[0];
                const n = m.attachments?.length ?? 0;
                const on = picked.has(m.id);
                const uri = first?.status === 'ready' ? (autoLoad && first.thumbUrl ? first.thumbUrl : first.blur) : null;
                return (
                  <Pressable
                    key={m.id}
                    onPress={() => toggle(m.id)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={`${n === 1 ? 'Photo' : `${n} photos`}, ${chatFileSize(bytesOf(m))}, ${momentLabel(m.created_at)}`}
                    className={`rounded-xl overflow-hidden bg-muted ${on ? 'border-2 border-primary' : ''}`}
                    style={{ width: tile, height: tile }}
                  >
                    {uri && first ? (
                      <Image
                        source={uri === first.thumbUrl ? { uri, cacheKey: chatPhotoKey(first.id, 'thumb') } : { uri }}
                        cachePolicy={uri === first.thumbUrl ? 'memory-disk' : 'memory'}
                        contentFit="cover"
                        style={{ width: '100%', height: '100%' }}
                      />
                    ) : (
                      <View className="flex-1 items-center justify-center">
                        <ImageIcon size={20} className="text-muted-foreground" />
                      </View>
                    )}
                    {n > 1 ? (
                      <View className="absolute top-1.5 left-1.5 rounded-full px-1.5" style={{ backgroundColor: SCRIM }}>
                        <Text className="text-action-foreground text-[11px] font-bold">{n}</Text>
                      </View>
                    ) : null}
                    <View className="absolute bottom-0 left-0 right-0 px-1.5 py-1" style={{ backgroundColor: SCRIM }}>
                      <Text className="text-action-foreground text-[11px] font-semibold">{chatFileSize(bytesOf(m))}</Text>
                    </View>
                    <Tick on={on} floating />
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        {files.length > 0 ? (
          <View>
            <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px] mb-2 ml-1">Files</Text>
            <View className="bg-card rounded-2xl overflow-hidden">
              {files.map((m, i) => {
                const a = m.attachments?.[0];
                const on = picked.has(m.id);
                return (
                  <Pressable
                    key={m.id}
                    onPress={() => toggle(m.id)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    className={`flex-row items-center gap-3 px-4 py-3 ${on ? 'bg-secondary' : ''} ${i < files.length - 1 ? 'border-b border-border/60' : ''}`}
                  >
                    <Tick on={on} />
                    <View className="w-9 h-11 rounded-lg bg-destructive/10 items-center justify-end pb-1.5">
                      <Text className="text-destructive text-[9px] font-extrabold">PDF</Text>
                    </View>
                    <View className="flex-1 min-w-0">
                      <Text className="text-foreground text-sm font-semibold" numberOfLines={1}>
                        {a?.name ?? 'File'}
                      </Text>
                      <Text className="text-muted-foreground text-xs mt-0.5" numberOfLines={1}>
                        {a ? fileDetailLine(a) : ''} · {momentLabel(m.created_at)}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        {data && data.total > messages.length ? (
          <Text className="text-muted-foreground text-xs text-center">
            The newest {messages.length} are here. Delete some to see older ones.
          </Text>
        ) : null}
      </ScrollView>
    );
  }

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <ScreenHeader
        title={`What you sent in ${title}`}
        subtitle={live.length > 0 ? `${formatBytes(total)} of your storage` : undefined}
      />
      <View className="flex-1">
        {body}
        {toast.element}
      </View>
      {count > 0 ? (
        <SafeAreaView edges={['bottom']} className="absolute left-0 right-0 bottom-0 bg-card border-t border-border">
          <View className="px-4 pt-3 pb-2">
            <Pressable
              onPress={() => setAsking(true)}
              disabled={unsend.isPending}
              accessibilityRole="button"
              accessibilityLabel={`Delete for everyone, ${count} picked, ${size}`}
              accessibilityState={{ busy: unsend.isPending }}
              className="min-h-12 flex-row items-center justify-center gap-2 rounded-xl bg-destructive active:opacity-90"
            >
              <Trash2Icon size={16} className="text-destructive-foreground" />
              <Text className="text-destructive-foreground text-[14px] font-bold">
                Delete for everyone · {size}
              </Text>
            </Pressable>
          </View>
        </SafeAreaView>
      ) : null}

      <BottomSheet visible={asking} onClose={() => setAsking(false)} dismissible={!unsend.isPending}>
        <View className="px-5 gap-2">
          <Text className="text-foreground text-[18px] leading-[26px] font-bold" accessibilityRole="header">
            Delete for everyone?
          </Text>
          <Text className="text-secondary-foreground text-[15px] leading-[21px]">
            {`This takes them back for everyone in ${title} and frees ${size}. It can't be undone.`}
          </Text>
          <View className="flex-row gap-2.5 pt-3 pb-1">
            <Pressable
              onPress={() => setAsking(false)}
              disabled={unsend.isPending}
              accessibilityRole="button"
              className="flex-1 min-h-12 rounded-xl bg-muted items-center justify-center active:opacity-80"
            >
              <Text className="text-foreground text-[15px] font-semibold">Cancel</Text>
            </Pressable>
            <Pressable
              onPress={deleteForEveryone}
              disabled={unsend.isPending}
              accessibilityRole="button"
              accessibilityState={{ busy: unsend.isPending }}
              accessibilityLabel="Delete them for everyone"
              className="flex-1 min-h-12 rounded-xl bg-destructive flex-row items-center justify-center gap-2 active:opacity-90"
            >
              {unsend.isPending ? (
                <ActivityIndicator size="small" color={palette.destructiveForeground} />
              ) : null}
              <Text className="text-destructive-foreground text-[15px] font-bold">Delete for everyone</Text>
            </Pressable>
          </View>
        </View>
      </BottomSheet>
    </SafeAreaView>
  );
}

function Tick({ on, floating = false }: { on: boolean; floating?: boolean }) {
  return (
    <View
      className={`w-6 h-6 rounded-full items-center justify-center ${on ? 'bg-primary' : floating ? 'border-2 border-white' : 'border-2 border-border'} ${floating ? 'absolute top-1.5 right-1.5' : ''}`}
      style={floating && !on ? { backgroundColor: SCRIM } : undefined}
    >
      {on ? <CheckIcon size={14} className="text-primary-foreground" /> : null}
    </View>
  );
}
