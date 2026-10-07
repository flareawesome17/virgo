import { useRef } from 'react';
import { ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { BottomSheet } from '@/components/BottomSheet';
import { CommentComposer, CommentList } from '@/components/CommentThread';

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
  onClose,
  onOpenProfile,
}: {
  /** The post whose thread is open, or null for none. */
  showcaseId: string | null;
  isOwner: boolean;
  onClose: () => void;
  onOpenProfile: (handle: string) => void;
}) {
  const { height: windowHeight } = useWindowDimensions();
  const list = useRef<ScrollView>(null);
  // Newest is at the end. Kept there as the thread loads and after a send;
  // let go of once somebody asks for earlier comments, which arrive above.
  const stickToEnd = useRef(true);
  const after = useRef<(() => void) | null>(null);

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
        <Text
          accessibilityRole="header"
          className="text-foreground text-[15px] font-bold text-center pt-1 pb-2"
        >
          Comments
        </Text>
        <View className="h-px bg-border" />
        {showcaseId ? (
          <>
            <ScrollView
              ref={list}
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 16 }}
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
              className="px-4 pt-2 border-t border-border"
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
