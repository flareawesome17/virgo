import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { SendIcon, Trash2Icon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { LoadFailed } from '@/components/LoadFailed';
import { RemoteImage } from '@/components/RemoteImage';
import { useAuth, useCommentActions, useComments, useTheme } from '@/src/hooks';
import { profileActionMessage } from '@/src/lib/profile-media';
import { PALETTES } from '@/theme';

for (const Icon of [SendIcon, Trash2Icon]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/**
 * The conversation under a showcase, on the post's own screen.
 *
 * Oldest first, which is how a conversation reads — newest-first is for a feed,
 * where you are catching up, not for a thread, where you are following along.
 * The newest page loads, and earlier comments come in above it on request.
 *
 * Built from CommentList and CommentComposer, which the comments sheet lays
 * out differently — the list scrolling, the box pinned under it — so the two
 * places a thread is read cannot drift apart in what they allow.
 */
export function CommentThread({
  showcaseId,
  isOwner,
  total,
  onComposerFocus,
}: {
  showcaseId: string;
  isOwner: boolean;
  /**
   * How many there are in all, from the showcase. The header counted the
   * ones loaded, so it read 30 while the card said 41.
   */
  total?: number;
  /** For a parent that has to scroll the box into view above the keyboard. */
  onComposerFocus?: () => void;
}) {
  const { comments } = useComments(showcaseId);
  const count = Math.max(total ?? 0, comments.length);

  return (
    <View className="px-5 pt-6">
      <Text className="text-primary text-[11px] font-bold tracking-[1.5px]">
        {count === 1 ? '1 COMMENT' : count > 0 ? `${count} COMMENTS` : 'COMMENTS'}
      </Text>
      <CommentList showcaseId={showcaseId} isOwner={isOwner} />
      <CommentComposer showcaseId={showcaseId} onFocus={onComposerFocus} className="mt-4" />
    </View>
  );
}

/**
 * The comments themselves, with "View earlier comments" above them and a way
 * to remove the ones that are yours to remove.
 *
 * `onOpenProfile` is for a list inside a sheet: a push from there would land
 * under the sheet, so the sheet closes first and then goes. Without it, a
 * commenter's picture opens their profile directly.
 */
export function CommentList({
  showcaseId,
  isOwner,
  onOpenProfile,
  onEarlier,
}: {
  showcaseId: string;
  isOwner: boolean;
  onOpenProfile?: (handle: string) => void;
  /** Before earlier comments are asked for, for a list that follows the newest. */
  onEarlier?: () => void;
}) {
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  const { user } = useAuth();
  const {
    comments,
    allowed,
    isLoading,
    loadFailed,
    refetch,
    hasEarlier,
    loadEarlier,
    loadingEarlier,
  } = useComments(showcaseId);
  const { remove } = useCommentActions(showcaseId);

  const confirmRemove = (id: string, mine: boolean) => {
    Alert.alert(
      mine ? 'Delete your comment?' : 'Remove this comment?',
      mine ? null : 'It goes from your post. They are not told.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: mine ? 'Delete' : 'Remove',
          style: 'destructive',
          onPress: () =>
            remove.mutate(id, {
              onError: (error) =>
                Alert.alert("Couldn't remove it", profileActionMessage(error, 'unshowcase')),
            }),
        },
      ],
    );
  };

  const openProfile = (handle: string | null) => {
    if (!handle) return;
    if (onOpenProfile) onOpenProfile(handle);
    else router.push(`/u/${handle}`);
  };

  // The owner still sees the thread with comments off — the server sends it
  // to them so they can keep track of it and remove from it — and it was
  // hidden from them along with everyone else.
  if (!allowed && !isOwner) {
    return (
      <Text className="text-muted-foreground text-[13px] leading-5 mt-3">
        Comments are off for this post.
      </Text>
    );
  }
  if (isLoading) {
    return (
      <View className="py-6 items-center">
        <ActivityIndicator color={palette.primary} />
      </View>
    );
  }
  if (loadFailed && comments.length === 0) {
    return (
      <View className="mt-3">
        <LoadFailed what="the comments" onRetry={() => refetch()} compact />
      </View>
    );
  }

  return (
    <>
      {!allowed && (
        <Text className="text-muted-foreground text-[13px] leading-5 mt-3">
          You have commenting turned off. Nobody else sees the thread, and nothing new
          can be added.
        </Text>
      )}
      {hasEarlier && (
        <Pressable
          onPress={() => {
            onEarlier?.();
            void loadEarlier();
          }}
          disabled={loadingEarlier}
          accessibilityRole="button"
          className="mt-3 min-h-[44px] self-start justify-center active:opacity-60"
        >
          {loadingEarlier ? (
            <ActivityIndicator size="small" color={palette.primary} />
          ) : (
            <Text className="text-primary text-[13px] font-bold">View earlier comments</Text>
          )}
        </Pressable>
      )}
      {comments.length === 0 ? (
        <Text className="text-muted-foreground text-[13px] leading-5 mt-3">
          {allowed
            ? 'Nothing said yet. If the note taught you something, that is worth saying.'
            : 'Nothing was said before you turned them off.'}
        </Text>
      ) : (
        <View className="mt-3 gap-4">
          {comments.map((comment) => (
            <View key={comment.id} className="flex-row gap-2.5">
              <Pressable
                onPress={() => openProfile(comment.author.handle)}
                disabled={!comment.author.handle}
                accessibilityRole="button"
                accessibilityLabel={`${comment.author.displayName}'s profile`}
                hitSlop={6}
                className="w-8 h-8 rounded-full overflow-hidden bg-primary/15 items-center justify-center active:opacity-70"
              >
                {comment.author.avatarUrl ? (
                  <RemoteImage
                    source={{ uri: comment.author.avatarUrl }}
                    style={{ width: 32, height: 32 }}
                  />
                ) : (
                  <Text className="text-primary text-[12px] font-bold">
                    {comment.author.displayName.charAt(0).toUpperCase()}
                  </Text>
                )}
              </Pressable>
              <View className="flex-1 min-w-0">
                <Text className="text-foreground text-[13px] font-bold">
                  {comment.author.displayName}
                </Text>
                <Text className="text-foreground text-[13.5px] leading-5 mt-0.5">
                  {comment.body}
                </Text>
              </View>
              {comment.canRemove && (
                <Pressable
                  // Yours by who wrote it. Judged by whose post it was, the
                  // owner deleting their own comment was told "they are not
                  // told".
                  onPress={() => confirmRemove(comment.id, comment.author.id === user?.id)}
                  accessibilityRole="button"
                  accessibilityLabel="Remove this comment"
                  className="w-11 h-11 -mr-2 -mt-2 items-center justify-center active:opacity-60"
                >
                  <Trash2Icon size={14} className="text-muted-foreground" />
                </Pressable>
              )}
            </View>
          ))}
        </View>
      )}
    </>
  );
}

/**
 * The box a comment is written in. Not drawn at all while commenting is off,
 * for the owner too: nothing new can be added then, by anyone.
 */
export function CommentComposer({
  showcaseId,
  onFocus,
  onSent,
  className = '',
}: {
  showcaseId: string;
  onFocus?: () => void;
  /** Around the box, and gone with it when there is no box to draw. */
  className?: string;
  /** Once the comment is in the thread, for a list that should show it. */
  onSent?: () => void;
}) {
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  const { allowed, isLoading, loadFailed, comments } = useComments(showcaseId);
  const { add } = useCommentActions(showcaseId);
  const [draft, setDraft] = useState('');

  const send = () => {
    const body = draft.trim();
    if (!body) return;
    add.mutate(body, {
      // Cleared on success only: a failed send that also lost what somebody
      // typed is the version of this people rewrite from memory.
      onSuccess: () => {
        setDraft('');
        onSent?.();
      },
      onError: (error) =>
        Alert.alert("Couldn't post that", profileActionMessage(error, 'comment')),
    });
  };

  // Hidden until the thread has said whether it takes comments, so a box is
  // not offered and then taken away; and on a thread that failed to load,
  // where the list above already says so.
  if (!allowed || isLoading || (loadFailed && comments.length === 0)) return null;

  return (
    <View className={`flex-row items-end gap-2 ${className}`}>
      <TextInput
        value={draft}
        onChangeText={setDraft}
        placeholder="Say something"
        placeholderTextColor={palette.mutedForeground}
        onFocus={onFocus}
        multiline
        maxLength={1000}
        accessibilityLabel="Write a comment"
        className="flex-1 bg-card rounded-2xl px-4 py-3 min-h-11 max-h-32 text-foreground text-[13.5px] leading-5"
        style={{ textAlignVertical: 'top' }}
      />
      <Pressable
        onPress={send}
        disabled={!draft.trim() || add.isPending}
        accessibilityRole="button"
        accessibilityLabel="Post this comment"
        accessibilityState={{ busy: add.isPending, disabled: !draft.trim() }}
        className="w-11 h-11 rounded-full bg-action items-center justify-center active:opacity-90"
        style={{ opacity: !draft.trim() || add.isPending ? 0.45 : 1 }}
      >
        {add.isPending ? (
          <ActivityIndicator size="small" color={palette.actionForeground} />
        ) : (
          <SendIcon size={17} className="text-action-foreground" />
        )}
      </Pressable>
    </View>
  );
}
