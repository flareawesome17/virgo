import { useCallback, useRef, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  BellIcon,
  BellOffIcon,
  MailOpenIcon,
  MessageSquareDotIcon,
  PinIcon,
  PinOffIcon,
  Trash2Icon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { BottomSheet } from '@/components/BottomSheet';
import { MAX_PINNED_CHATS, type Conversation, type ListStatePatch } from '@/src/api';
import {
  useDeleteConversation,
  useMarkThreadRead,
  useMuteChat,
  useSetListState,
} from '@/src/hooks/useChat';
import { chatError, MUTE_OPTIONS } from './chat-words';
import { looksUnread, previewLine, RowAvatar } from './ConversationRow';
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

for (const Icon of [
  ArchiveIcon, ArchiveRestoreIcon, BellIcon, BellOffIcon, MailOpenIcon, MessageSquareDotIcon,
  PinIcon, PinOffIcon, Trash2Icon,
]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

const SIDE = 12;
const MENU_WIDTH = 236;

/** Whether a mute is still running. */
function isMuted(c: Conversation): boolean {
  return Boolean(c.muted) && (!c.mutedUntil || new Date(c.mutedUntil).getTime() > Date.now());
}

/**
 * Holding a chat in the list: the row lifts, and under it Pin to top, Mark as
 * unread, Mute, Archive and Delete chat — each the other way round when it
 * already is.
 *
 * Returns what the list renders (the overlay, the mute sheet) and `hold`, for
 * the rows. `pinnedCount` is how many are pinned already, so a sixth is
 * answered here before the server has to. In Archived the menu offers
 * Unarchive and no Pin, which would quietly take it out of Archived.
 */
export function useChatRowMenu({
  archivedList = false,
  pinnedCount,
  onNotice,
}: {
  archivedList?: boolean;
  pinnedCount: number;
  onNotice: (text: string) => void;
}) {
  const setListState = useSetListState();
  const markRead = useMarkThreadRead();
  const mute = useMuteChat();
  const remove = useDeleteConversation();

  const [held, setHeld] = useState<{ item: Conversation; rect: HeldRect } | null>(null);
  const [muteFor, setMuteFor] = useState<Conversation | null>(null);
  /** What to do once the overlay has gone: an alert or a sheet cannot open over it. */
  const afterClose = useRef<(() => void) | null>(null);

  const hold = useCallback((item: Conversation, rect: HeldRect) => setHeld({ item, rect }), []);
  const close = useCallback(() => setHeld(null), []);
  const closeThen = (action: () => void) => {
    afterClose.current = action;
    setHeld(null);
  };
  const onClosed = useCallback(() => {
    const action = afterClose.current;
    afterClose.current = null;
    action?.();
  }, []);

  const patch = (
    item: Conversation,
    change: ListStatePatch,
    failed: string,
    done?: string,
  ) =>
    setListState.mutate(
      { conversationId: item.id, patch: change },
      {
        onSuccess: () => done && onNotice(done),
        onError: (err) => Alert.alert(failed, chatError(err)),
      },
    );

  const confirmDelete = (item: Conversation) => {
    Alert.alert(
      'Delete conversation',
      item.isGroup
        ? 'This removes the conversation and its history from your app, and leaves the group.'
        : 'This clears the conversation from your app. The other person keeps their copy, and a new message from them will start the thread again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () =>
            remove.mutate(item.id, {
              onError: (err) => Alert.alert('Could not delete', chatError(err)),
            }),
        },
      ],
    );
  };

  const entries = (item: Conversation): HoldMenuEntry[] => {
    const list: HoldMenuEntry[] = [];
    if (!archivedList) {
      list.push(
        item.pinned
          ? {
              key: 'unpin',
              label: 'Unpin',
              Icon: PinOffIcon,
              onPress: () => closeThen(() => patch(item, { pinned: false }, "Couldn't unpin it")),
            }
          : {
              key: 'pin',
              label: 'Pin to top',
              Icon: PinIcon,
              onPress: () =>
                closeThen(() => {
                  if (pinnedCount >= MAX_PINNED_CHATS) {
                    Alert.alert(
                      `You can pin up to ${MAX_PINNED_CHATS} chats`,
                      'Unpin one to make room for this one.',
                    );
                    return;
                  }
                  patch(item, { pinned: true }, "Couldn't pin it");
                }),
            },
      );
    }
    list.push(
      looksUnread(item)
        ? {
            key: 'read',
            label: 'Mark as read',
            Icon: MailOpenIcon,
            onPress: () =>
              closeThen(() =>
                markRead.mutate(item.id, {
                  onError: (err) => Alert.alert("Couldn't mark it read", chatError(err)),
                }),
              ),
          }
        : {
            key: 'unread',
            label: 'Mark as unread',
            Icon: MessageSquareDotIcon,
            onPress: () => closeThen(() => patch(item, { markedUnread: true }, "Couldn't mark it unread")),
          },
      isMuted(item)
        ? {
            key: 'unmute',
            label: 'Unmute',
            Icon: BellIcon,
            onPress: () =>
              closeThen(() =>
                mute.mutate(
                  { conversationId: item.id, minutes: 0 },
                  { onError: (err) => Alert.alert('Could not change notifications', chatError(err)) },
                ),
              ),
          }
        : {
            key: 'mute',
            label: 'Mute',
            Icon: BellOffIcon,
            onPress: () => closeThen(() => setMuteFor(item)),
          },
      archivedList
        ? {
            key: 'unarchive',
            label: 'Unarchive',
            Icon: ArchiveRestoreIcon,
            onPress: () =>
              closeThen(() =>
                patch(item, { archived: false }, "Couldn't unarchive it", 'Back in your chats'),
              ),
          }
        : {
            key: 'archive',
            label: 'Archive',
            Icon: ArchiveIcon,
            onPress: () =>
              closeThen(() =>
                patch(
                  item,
                  { archived: true },
                  "Couldn't archive it",
                  'Archived. It comes back when someone writes.',
                ),
              ),
          },
      {
        key: 'delete',
        label: 'Delete chat',
        Icon: Trash2Icon,
        destructive: true,
        onPress: () => closeThen(() => confirmDelete(item)),
      },
    );
    return list;
  };

  const menu = held ? entries(held.item) : [];
  const below = HOLD_GAP + holdMenuHeight(menu);
  const { top, copyHeight } = useHoldPlacement(held?.rect ?? null, 0, below);

  const applyMute = (minutes: number) => {
    const item = muteFor;
    setMuteFor(null);
    if (!item) return;
    mute.mutate(
      { conversationId: item.id, minutes },
      { onError: (err) => Alert.alert('Could not change notifications', chatError(err)) },
    );
  };

  const element = (
    <>
      <HoldOverlay visible={!!held} onClose={close} onClosed={onClosed}>
        {held ? (
          <View
            pointerEvents="box-none"
            style={{ position: 'absolute', top, left: SIDE, right: SIDE, gap: HOLD_GAP }}
          >
            {/* The row, lifted out of the dimmed list. */}
            <View
              accessible
              accessibilityLabel={`${held.item.title}, ${previewLine(held.item)}`}
              className="rounded-[20px] bg-background px-2 flex-row items-center gap-3 overflow-hidden"
              style={[{ minHeight: Math.min(72, copyHeight) }, LIFTED]}
            >
              <RowAvatar item={held.item} />
              <View className="flex-1 min-w-0 py-2.5">
                <Text
                  className={`text-foreground text-[16px] leading-[22px] ${
                    looksUnread(held.item) ? 'font-bold' : 'font-medium'
                  }`}
                  numberOfLines={1}
                >
                  {held.item.title}
                </Text>
                <Text className="text-muted-foreground text-[14px] leading-5" numberOfLines={1}>
                  {previewLine(held.item)}
                </Text>
              </View>
            </View>
            <HoldMenu entries={menu} width={MENU_WIDTH} />
          </View>
        ) : null}
      </HoldOverlay>

      <BottomSheet visible={!!muteFor} onClose={() => setMuteFor(null)}>
        <View className="px-5 pt-2 pb-5">
          <Text className="text-foreground text-[17px] leading-6 font-bold" accessibilityRole="header">
            Mute for how long?
          </Text>
          <Text className="text-muted-foreground text-[13px] leading-[18px] mt-1">
            Messages keep arriving and wait in the chat. They just will not
            sound, show a banner or add to the badge.
          </Text>
          <View className="mt-4">
            {MUTE_OPTIONS.map((option, i) => (
              <Pressable
                key={option.minutes}
                onPress={() => applyMute(option.minutes)}
                accessibilityRole="button"
                className={`py-3.5 min-h-[48px] justify-center active:opacity-60 ${
                  i < MUTE_OPTIONS.length - 1 ? 'border-b border-border/40' : ''
                }`}
              >
                <Text className="text-foreground text-base">{option.label}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable
            onPress={() => setMuteFor(null)}
            accessibilityRole="button"
            className="mt-4 bg-muted rounded-[14px] h-11 items-center justify-center active:scale-[0.97]"
          >
            <Text className="text-foreground text-[15px] font-semibold">Cancel</Text>
          </Pressable>
        </View>
      </BottomSheet>
    </>
  );

  return { hold, element };
}
