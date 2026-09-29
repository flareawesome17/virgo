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
import { useCommentActions, useComments, useTheme } from '@/src/hooks';
import { profileActionMessage } from '@/src/lib/profile-media';
import { PALETTES } from '@/theme';

for (const Icon of [SendIcon, Trash2Icon]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/**
 * The conversation under a showcase.
 *
 * Oldest first, which is how a conversation reads — newest-first is for a feed,
 * where you are catching up, not for a thread, where you are following along.
 */
export function CommentThread({
  showcaseId,
  isOwner,
  onComposerFocus,
}: {
  showcaseId: string;
  isOwner: boolean;
  /** For a parent that has to scroll the box into view above the keyboard. */
  onComposerFocus?: () => void;
}) {
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  const { comments, allowed, isLoading, loadFailed, refetch } = useComments(showcaseId);
  const { add, remove } = useCommentActions(showcaseId);
  const [draft, setDraft] = useState('');

  const send = () => {
    const body = draft.trim();
    if (!body) return;
    add.mutate(body, {
      // Cleared on success only: a failed send that also lost what somebody
      // typed is the version of this people rewrite from memory.
      onSuccess: () => setDraft(''),
      onError: (error) =>
        Alert.alert("Couldn't post that", profileActionMessage(error, 'showcase')),
    });
  };

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

  return (
    <View className="px-5 pt-6">
      <Text className="text-primary text-[10px] font-bold tracking-[1.5px]">
        {comments.length > 0 ? `${comments.length} COMMENTS` : 'COMMENTS'}
      </Text>

      {!allowed ? (
        <Text className="text-muted-foreground text-[13px] leading-5 mt-3">
          {isOwner
            ? 'You have commenting turned off for this post. Nobody else sees the thread.'
            : 'Comments are off for this post.'}
        </Text>
      ) : isLoading ? (
        <View className="py-6 items-center">
          <ActivityIndicator color={palette.primary} />
        </View>
      ) : loadFailed && comments.length === 0 ? (
        <View className="mt-3">
          <LoadFailed what="the comments" onRetry={() => refetch()} compact />
        </View>
      ) : (
        <>
          {comments.length === 0 ? (
            <Text className="text-muted-foreground text-[13px] leading-5 mt-3">
              Nothing said yet. If the note taught you something, that is worth saying.
            </Text>
          ) : (
            <View className="mt-3 gap-4">
              {comments.map((comment) => (
                <View key={comment.id} className="flex-row gap-2.5">
                  <Pressable
                    onPress={() =>
                      comment.author.handle
                        ? router.push(`/u/${comment.author.handle}`)
                        : undefined
                    }
                    accessibilityRole="button"
                    accessibilityLabel={`${comment.author.displayName}'s profile`}
                    className="w-8 h-8 rounded-full overflow-hidden bg-primary/15 items-center justify-center"
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
                      onPress={() => confirmRemove(comment.id, !isOwner)}
                      accessibilityRole="button"
                      accessibilityLabel="Remove this comment"
                      hitSlop={10}
                      className="w-8 h-8 items-center justify-center active:opacity-60"
                    >
                      <Trash2Icon size={14} className="text-muted-foreground" />
                    </Pressable>
                  )}
                </View>
              ))}
            </View>
          )}

          <View className="flex-row items-end gap-2 mt-4">
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Say something"
              placeholderTextColor={palette.mutedForeground}
              onFocus={onComposerFocus}
              multiline
              maxLength={1000}
              className="flex-1 bg-card rounded-2xl px-4 py-3 min-h-11 text-foreground text-[13.5px] leading-5"
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
        </>
      )}
    </View>
  );
}
