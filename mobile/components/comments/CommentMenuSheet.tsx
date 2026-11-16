import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { CopyIcon, Trash2Icon, UserRoundIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { BottomSheet } from '@/components/BottomSheet';
import { CommentAvatar } from '@/components/comments/CommentAvatar';
import type { Comment } from '@/src/api';

for (const Icon of [CopyIcon, Trash2Icon, UserRoundIcon]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/**
 * What can be done with one comment: copy it, go to whoever wrote it, take it
 * out of the thread.
 *
 * The remove row is the whole of the asking. It used to be a bin beside the
 * comment and then an alert; here the comment is quoted above the row, which
 * says what will happen, so a second "are you sure" would only be the same
 * question twice.
 */
export function CommentMenuSheet({
  comment,
  mine,
  onClose,
  onClosed,
  onViewProfile,
  onRemove,
}: {
  /** The comment the menu is for, or null for none. */
  comment: Comment | null;
  /**
   * Yours by who wrote it. Judged by whose post it was, the owner deleting
   * their own comment was told "they are not told".
   */
  mine: boolean;
  onClose: () => void;
  onClosed?: () => void;
  /** Left out for somebody with no profile to go to. */
  onViewProfile?: (handle: string) => void;
  onRemove: (comment: Comment) => void;
}) {
  const handle = comment?.author.handle ?? null;
  const first = comment?.author.displayName.trim().split(/\s+/)[0] ?? '';

  return (
    <BottomSheet visible={comment !== null} onClose={onClose} onClosed={onClosed}>
      {comment ? (
        <View className="pb-2">
          <Text
            accessibilityRole="header"
            className="text-foreground text-[18px] leading-[26px] font-bold px-5"
          >
            This comment
          </Text>
          <View className="mx-5 mt-2 mb-2 p-3.5 rounded-2xl bg-muted flex-row gap-2.5">
            <CommentAvatar
              name={comment.author.displayName}
              url={comment.author.avatarUrl}
              size={28}
            />
            <Text
              numberOfLines={4}
              className="flex-1 text-secondary-foreground text-[15px] leading-[22px]"
            >
              <Text className="text-foreground font-semibold">{comment.author.displayName}</Text>{' '}
              {comment.body}
            </Text>
          </View>

          <MenuRow
            icon={<CopyIcon size={20} className="text-foreground" />}
            label="Copy the words"
            onPress={() => {
              void Clipboard.setStringAsync(comment.body);
              onClose();
            }}
          />
          {handle && onViewProfile ? (
            <MenuRow
              icon={<UserRoundIcon size={20} className="text-foreground" />}
              label={first ? `View ${first}'s profile` : 'View their profile'}
              onPress={() => onViewProfile(handle)}
            />
          ) : null}
          <MenuRow
            destructive
            icon={<Trash2Icon size={20} className="text-destructive" />}
            label={mine ? 'Delete your comment' : 'Remove from your post'}
            note={mine ? undefined : 'It goes from the thread. They are not told.'}
            onPress={() => onRemove(comment)}
          />

          <View className="px-5 pt-2">
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              className="h-11 rounded-[14px] bg-muted items-center justify-center active:opacity-80"
            >
              <Text className="text-foreground text-[15px] leading-5 font-semibold">Cancel</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </BottomSheet>
  );
}

function MenuRow({
  icon,
  label,
  note,
  destructive = false,
  onPress,
}: {
  icon: ReactNode;
  label: string;
  note?: string;
  destructive?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={note}
      className="min-h-[56px] flex-row items-center gap-3.5 px-5 py-2 active:opacity-60"
    >
      <View
        className={`w-10 h-10 rounded-xl items-center justify-center ${destructive ? 'bg-destructive/10' : 'bg-muted'}`}
      >
        {icon}
      </View>
      <View className="flex-1 min-w-0">
        <Text
          className={`text-[15px] leading-5 font-semibold ${destructive ? 'text-destructive' : 'text-foreground'}`}
        >
          {label}
        </Text>
        {note ? (
          <Text className="text-muted-foreground text-[13px] leading-[18px]">{note}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}
