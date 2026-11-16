import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import {
  ArrowUpIcon,
  EllipsisIcon,
  MessageCircleIcon,
  MessageCircleOffIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { LoadFailed } from '@/components/LoadFailed';
import { CommentAvatar } from '@/components/comments/CommentAvatar';
import { CommentMenuSheet } from '@/components/comments/CommentMenuSheet';
import {
  useAuth,
  useCommentActions,
  useComments,
  useShowcaseActions,
  useTheme,
} from '@/src/hooks';
import type { Comment } from '@/src/api';
import { postedAgo } from '@/src/lib/posted-time';
import { profileActionMessage } from '@/src/lib/profile-media';
import { PALETTES } from '@/theme';

for (const Icon of [ArrowUpIcon, EllipsisIcon, MessageCircleIcon, MessageCircleOffIcon]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/** The most a comment can be, and where the box starts counting towards it. */
const LIMIT = 1000;
const COUNT_FROM = 800;

/**
 * How many comments to say there are, beside the word "Comments".
 *
 * The showcase's own count until the thread has loaded, and wherever there
 * are earlier comments still to fetch: counting only the ones loaded read 30
 * while the card said 41. Once the whole thread is in hand it is counted
 * instead, since the showcase a sheet was opened with does not hear about a
 * comment added or removed since.
 */
export function useCommentCount(showcaseId: string | undefined, total?: number): number {
  const { comments, hasEarlier, isLoading, loadFailed } = useComments(showcaseId);
  if (isLoading || (loadFailed && comments.length === 0)) return total ?? 0;
  return hasEarlier ? Math.max(total ?? 0, comments.length) : comments.length;
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
  makerId,
  total,
  onComposerFocus,
}: {
  showcaseId: string;
  isOwner: boolean;
  /** Who made the post, so their own comments can say "Maker". */
  makerId?: string | null;
  /**
   * How many there are in all, from the showcase. The header counted the
   * ones loaded, so it read 30 while the card said 41.
   */
  total?: number;
  /** For a parent that has to scroll the box into view above the keyboard. */
  onComposerFocus?: () => void;
}) {
  const count = useCommentCount(showcaseId, total);

  return (
    <View className="px-5 pt-6">
      <Text
        accessibilityRole="header"
        accessibilityLabel={count === 1 ? '1 comment' : count > 0 ? `${count} comments` : 'Comments'}
        className="text-foreground text-[17px] leading-6 font-bold"
      >
        Comments
        {count > 0 ? <Text className="text-muted-foreground font-medium">{` ${count}`}</Text> : null}
      </Text>
      <CommentList showcaseId={showcaseId} isOwner={isOwner} makerId={makerId} />
      <CommentComposer showcaseId={showcaseId} onFocus={onComposerFocus} className="mt-3" />
    </View>
  );
}

/**
 * What the owner is told while their post takes no comments, with the way
 * back. Nothing at all for anybody else, or while commenting is on.
 *
 * Its own piece because the sheet pins it above the scrolling thread: inside
 * a list that keeps to its newest end it would be scrolled out of sight on
 * arrival.
 */
export function CommentsOffNotice({
  showcaseId,
  isOwner,
  className = '',
}: {
  showcaseId: string;
  isOwner: boolean;
  className?: string;
}) {
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  const { comments, allowed, isLoading, loadFailed } = useComments(showcaseId);
  const { update } = useShowcaseActions();

  if (allowed || !isOwner || isLoading || (loadFailed && comments.length === 0)) return null;

  // The same change the edit form's switch makes. Every showcase query is
  // refreshed by it, this thread's among them, which is what brings the box
  // back.
  const turnOn = () =>
    update.mutate(
      { id: showcaseId, body: { allowComments: true } },
      {
        onError: (error) =>
          Alert.alert("Couldn't change that", profileActionMessage(error, 'setting')),
      },
    );

  return (
    <View className={`rounded-2xl bg-muted p-3.5 gap-2.5 ${className}`}>
      <View className="flex-row gap-2.5">
        <MessageCircleOffIcon size={18} className="text-secondary-foreground mt-0.5" />
        <Text className="flex-1 text-secondary-foreground text-[15px] leading-[22px]">
          <Text className="text-foreground font-semibold">Comments are off.</Text> Nobody else
          sees the thread, and nothing new can be added. Nothing said was deleted.
        </Text>
      </View>
      <Pressable
        onPress={turnOn}
        disabled={update.isPending}
        accessibilityRole="button"
        accessibilityState={{ busy: update.isPending, disabled: update.isPending }}
        className="h-11 rounded-[14px] bg-card items-center justify-center active:opacity-80"
      >
        {update.isPending ? (
          <ActivityIndicator size="small" color={palette.primary} />
        ) : (
          <Text className="text-foreground text-[15px] leading-5 font-semibold">
            Turn comments on
          </Text>
        )}
      </Pressable>
    </View>
  );
}

/**
 * The comments themselves, with "View earlier comments" above them and, on
 * the ones that are yours to remove, a menu to do it from.
 *
 * `onOpenProfile` is for a list inside a sheet: a push from there would land
 * under the sheet, so the sheet closes first and then goes. Without it, a
 * commenter's picture opens their profile directly.
 */
export function CommentList({
  showcaseId,
  isOwner,
  makerId,
  onOpenProfile,
  onEarlier,
  hideOffNotice = false,
}: {
  showcaseId: string;
  isOwner: boolean;
  /**
   * Who made the post, so their own comments can say "Maker". Without it the
   * owner's are still marked on their own post, where the maker is known to
   * be whoever is looking.
   */
  makerId?: string | null;
  onOpenProfile?: (handle: string) => void;
  /** Before earlier comments are asked for, for a list that follows the newest. */
  onEarlier?: () => void;
  /** For a parent that draws CommentsOffNotice itself, outside what scrolls. */
  hideOffNotice?: boolean;
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
  const [menuFor, setMenuFor] = useState<Comment | null>(null);
  // What to do once the menu has gone: a profile opened while it was still
  // leaving would have the sheet behind it closing with a sheet still on it.
  const afterMenu = useRef<(() => void) | null>(null);

  const maker = makerId ?? (isOwner ? user?.id : undefined);

  const removeComment = (comment: Comment) => {
    setMenuFor(null);
    remove.mutate(comment.id, {
      onError: (error) =>
        Alert.alert("Couldn't remove it", profileActionMessage(error, 'unshowcase')),
    });
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
      <View className="grow items-center justify-center px-5 py-10 gap-1.5">
        <View className="w-12 h-12 rounded-2xl bg-muted items-center justify-center mb-1.5">
          <MessageCircleOffIcon size={22} className="text-secondary-foreground" />
        </View>
        <Text className="text-muted-foreground text-[15px] leading-[22px] text-center">
          Comments are off for this post.
        </Text>
      </View>
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
      {!hideOffNotice && (
        <CommentsOffNotice showcaseId={showcaseId} isOwner={isOwner} className="mt-3" />
      )}
      {hasEarlier && (
        <Pressable
          onPress={() => {
            onEarlier?.();
            void loadEarlier();
          }}
          disabled={loadingEarlier}
          accessibilityRole="button"
          className="mt-1 min-h-[44px] self-start justify-center active:opacity-60"
        >
          {loadingEarlier ? (
            <ActivityIndicator size="small" color={palette.primary} />
          ) : (
            <Text className="text-primary text-[15px] leading-5 font-semibold">
              View earlier comments
            </Text>
          )}
        </Pressable>
      )}
      {comments.length === 0 ? (
        allowed ? (
          <View className="grow items-center justify-center px-5 py-10 gap-1.5">
            <View className="w-12 h-12 rounded-2xl bg-muted items-center justify-center mb-1.5">
              <MessageCircleIcon size={22} className="text-secondary-foreground" />
            </View>
            <Text className="text-foreground text-[17px] leading-6 font-bold text-center">
              Nothing said yet
            </Text>
            <Text className="text-muted-foreground text-[15px] leading-[22px] text-center">
              If the note taught you something, that is worth saying.
            </Text>
          </View>
        ) : (
          <Text className="text-muted-foreground text-[15px] leading-[22px] mt-3">
            Nothing was said before you turned them off.
          </Text>
        )
      ) : (
        // Dimmed while commenting is off: the thread is kept, not live. The
        // owner can still take a comment out of it.
        <View className="mt-1" style={allowed ? undefined : { opacity: 0.55 }}>
          {comments.map((comment) => {
            const ago = postedAgo(comment.createdAt);
            return (
              <View key={comment.id} className="flex-row gap-3 py-2.5">
                <Pressable
                  onPress={() => openProfile(comment.author.handle)}
                  disabled={!comment.author.handle}
                  accessibilityRole="button"
                  accessibilityLabel={`${comment.author.displayName}'s profile`}
                  hitSlop={4}
                  className="self-start active:opacity-70"
                >
                  <CommentAvatar
                    name={comment.author.displayName}
                    url={comment.author.avatarUrl}
                    size={36}
                  />
                </Pressable>
                <View className="flex-1 min-w-0 gap-0.5">
                  <View className="flex-row items-center gap-1.5">
                    <Text
                      numberOfLines={1}
                      className="shrink text-foreground text-[15px] leading-5 font-semibold"
                    >
                      {comment.author.displayName}
                    </Text>
                    {maker && comment.author.id === maker ? (
                      <View className="rounded-full bg-muted px-[7px] py-0.5">
                        <Text className="text-secondary-foreground text-[12px] leading-4 font-semibold">
                          Maker
                        </Text>
                      </View>
                    ) : null}
                    {ago.short ? (
                      <Text
                        accessibilityLabel={ago.label}
                        className="text-muted-foreground text-[13px] leading-[18px]"
                      >
                        {/* "Just now" is a post's; in a thread, beside a name,
                            the short word sits better with "2h" and "3d". */}
                        {ago.short === 'Just now' ? 'now' : ago.short}
                      </Text>
                    ) : null}
                  </View>
                  <Text className="text-secondary-foreground text-[15px] leading-[22px]">
                    {comment.body}
                  </Text>
                </View>
                {comment.canRemove ? (
                  <Pressable
                    onPress={() => setMenuFor(comment)}
                    accessibilityRole="button"
                    accessibilityLabel="Options for this comment"
                    className="w-11 h-11 -mr-3 -mt-1 items-center justify-center active:opacity-60"
                  >
                    <EllipsisIcon size={18} className="text-muted-foreground" />
                  </Pressable>
                ) : null}
              </View>
            );
          })}
        </View>
      )}
      <CommentMenuSheet
        comment={menuFor}
        mine={menuFor?.author.id === user?.id}
        onClose={() => setMenuFor(null)}
        onClosed={() => {
          const run = afterMenu.current;
          afterMenu.current = null;
          run?.();
        }}
        onViewProfile={(handle) => {
          afterMenu.current = () => openProfile(handle);
          setMenuFor(null);
        }}
        onRemove={removeComment}
      />
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
  const { user, profile } = useAuth();
  const { allowed, isLoading, loadFailed, comments } = useComments(showcaseId);
  const { add } = useCommentActions(showcaseId);
  const [draft, setDraft] = useState('');
  const [focused, setFocused] = useState(false);

  const send = () => {
    const body = draft.trim();
    if (!body) return;
    // The comment is in the thread on the tap (see useCommentActions), so the
    // box empties on the tap too. If the server refuses, the words come back
    // to the box, unless something new has been typed there since: a failed
    // send that also lost what somebody wrote is the version of this people
    // rewrite from memory.
    setDraft('');
    onSent?.();
    add.mutate(body, {
      onError: (error) => {
        setDraft((now) => (now.trim() ? now : body));
        Alert.alert("Couldn't post that", profileActionMessage(error, 'comment'));
      },
    });
  };

  // Hidden until the thread has said whether it takes comments, so a box is
  // not offered and then taken away; and on a thread that failed to load,
  // where the list above already says so.
  if (!allowed || isLoading || (loadFailed && comments.length === 0)) return null;

  const ready = Boolean(draft.trim());
  const name = profile?.displayName?.trim() || user?.email.split('@')[0] || '';

  return (
    <View className={`gap-2 ${className}`}>
      <View className="flex-row items-end gap-2.5">
        {/* Lined up with a one-line box, and staying at the foot of a tall one. */}
        <View className="mb-1.5">
          <CommentAvatar name={name} url={profile?.avatarUrl} size={32} />
        </View>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Say something"
          placeholderTextColor={palette.mutedForeground}
          onFocus={() => {
            setFocused(true);
            onFocus?.();
          }}
          onBlur={() => setFocused(false)}
          multiline
          maxLength={LIMIT}
          accessibilityLabel="Write a comment"
          className={`flex-1 bg-muted rounded-[14px] border-[1.5px] px-3.5 py-[9.5px] min-h-11 max-h-32 text-foreground text-[16px] leading-[22px] ${focused ? 'border-action' : 'border-transparent'}`}
          style={{ textAlignVertical: 'top' }}
        />
        <Pressable
          onPress={send}
          disabled={!ready || add.isPending}
          accessibilityRole="button"
          accessibilityLabel="Post this comment"
          accessibilityState={{ busy: add.isPending, disabled: !ready }}
          className={`w-11 h-11 rounded-full items-center justify-center active:opacity-90 ${ready ? 'bg-action' : 'bg-secondary'}`}
        >
          {add.isPending ? (
            <ActivityIndicator size="small" color={palette.actionForeground} />
          ) : (
            <ArrowUpIcon
              size={20}
              strokeWidth={2.4}
              className={ready ? 'text-action-foreground' : 'text-muted-foreground'}
            />
          )}
        </Pressable>
      </View>
      {draft.length > COUNT_FROM ? (
        // Under the box's right edge, clear of the button beside it.
        <Text className="self-end pr-[54px] text-muted-foreground text-[12px] leading-4">
          {draft.length >= LIMIT ? '1,000' : draft.length} of 1,000
        </Text>
      ) : null}
    </View>
  );
}
