import { useRef } from 'react';
import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { XIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { BottomSheet } from '@/components/BottomSheet';
import {
  CommentComposer,
  CommentList,
  CommentsOffNotice,
  useCommentCount,
} from '@/components/CommentThread';

cssInterop(XIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

/**
 * A post's thread, over the feed rather than on a screen of its own: the
 * comments scrolling, the box pinned under them.
 *
 * Keyboard-safe through the sheet itself, which rises with the keyboard and
 * gives up height to it — the list is what shrinks, so the box and what is
 * being typed stay in sight. A KeyboardAvoidingView in here as well would
 * lift it twice.
 *
 * `onOpenProfile` gets a commenter's handle once the sheet has gone, so the
 * profile does not open underneath it.
 */
export function CommentsSheet({
  showcaseId,
  isOwner,
  makerId,
  total,
  onClose,
  onOpenProfile,
}: {
  /** The post whose thread is open, or null for none. */
  showcaseId: string | null;
  isOwner: boolean;
  /** Who made the post, so their own comments can say "Maker". */
  makerId?: string | null;
  /** How many comments the post says it has, for beside the title. */
  total?: number;
  onClose: () => void;
  onOpenProfile: (handle: string) => void;
}) {
  const { height: windowHeight } = useWindowDimensions();
  const list = useRef<ScrollView>(null);
  // Newest is at the end. Kept there as the thread loads and after a send;
  // let go of once somebody asks for earlier comments, which arrive above.
  const stickToEnd = useRef(true);
  const after = useRef<(() => void) | null>(null);
  const count = useCommentCount(showcaseId ?? undefined, total);

  return (
    <BottomSheet
      visible={showcaseId !== null}
      onClose={onClose}
      onClosed={() => {
        stickToEnd.current = true;
        const run = after.current;
        after.current = null;
        run?.();
      }}
      closeLabel="Close the comments"
    >
      {/* Tall whatever the thread's length, the way every feed's comment
          sheet is, and shrinking only for a small screen or the keyboard. */}
      <View style={{ height: Math.round(windowHeight * 0.72), flexShrink: 1 }}>
        <View className="flex-row items-center justify-between pl-5 pr-4 pb-1.5">
          <Text
            accessibilityRole="header"
            accessibilityLabel={
              count === 1 ? '1 comment' : count > 0 ? `${count} comments` : 'Comments'
            }
            className="text-foreground text-[18px] leading-[26px] font-bold"
          >
            Comments
            {count > 0 ? (
              <Text className="text-muted-foreground font-medium">{` ${count}`}</Text>
            ) : null}
          </Text>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close the comments"
            hitSlop={4}
            className="w-9 h-9 rounded-full bg-muted items-center justify-center active:opacity-70"
          >
            <XIcon size={16} className="text-foreground" />
          </Pressable>
        </View>
        {showcaseId ? (
          <>
            {/* Above what scrolls: the list keeps to its newest end, which
                would carry this out of sight as the sheet opened. */}
            <CommentsOffNotice
              showcaseId={showcaseId}
              isOwner={isOwner}
              className="mx-5 mt-1.5 mb-1.5"
            />
            <ScrollView
              ref={list}
              style={{ flex: 1 }}
              // Grows to the sheet's height, so "Nothing said yet" sits in
              // the middle of it rather than under the title.
              contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 20, paddingBottom: 12 }}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              onContentSizeChange={() => {
                if (stickToEnd.current) list.current?.scrollToEnd({ animated: false });
              }}
              onScrollBeginDrag={() => {
                stickToEnd.current = false;
              }}
            >
              <CommentList
                showcaseId={showcaseId}
                isOwner={isOwner}
                makerId={makerId}
                hideOffNotice
                onEarlier={() => {
                  stickToEnd.current = false;
                }}
                onOpenProfile={(handle) => {
                  after.current = () => onOpenProfile(handle);
                  onClose();
                }}
              />
            </ScrollView>
            <CommentComposer
              showcaseId={showcaseId}
              className="pl-4 pr-3 pt-2.5 pb-0.5 border-t border-border/60"
              onSent={() => {
                stickToEnd.current = true;
                setTimeout(() => list.current?.scrollToEnd({ animated: true }), 50);
              }}
            />
          </>
        ) : null}
      </View>
    </BottomSheet>
  );
}
