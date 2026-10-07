import { useCallback, useRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { XIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { BottomSheet } from '@/components/BottomSheet';
import { LoadFailed } from '@/components/LoadFailed';
import { ShowcaseCard } from '@/components/ShowcaseCard';
import { useShowcaseCardHost } from '@/components/ShowcaseCardHost';
import { useAuth, useShowcase, useTheme } from '@/src/hooks';
import { ApiError } from '@/src/api';
import { profileActionMessage } from '@/src/lib/profile-media';
import { PALETTES } from '@/theme';

cssInterop(XIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

/** The API answers "not yours" and "not there" alike, so ids cannot be probed. */
const isGone = (error: unknown) =>
  error instanceof ApiError && (error.status === 404 || error.status === 403);

/**
 * One post, opened from a grid — a shelf, All kept, a profile's work — in a
 * sheet over it, drawn as the same card the feed draws.
 *
 * A sheet rather than a screen: the grid is where somebody is, and the post is
 * a look at one of its tiles. The card's own sheets (comments, keep, ⋯) open
 * over this one, and anything that leaves — a profile, Edit — closes this
 * first, so the next screen is not pushed underneath it.
 *
 * A post that has gone since the grid was loaded says so, with `onRemove`
 * offered to clear its tile away.
 */
export function ShowcasePostSheet({
  showcaseId,
  onClose,
  note,
  onRemove,
  removeLabel = 'Remove from this shelf',
}: {
  /** The post to show, or null for none. */
  showcaseId: string | null;
  onClose: () => void;
  /** What the keeper wrote about why they kept it, shown above the post. */
  note?: string | null;
  /** Taking it off the shelf it was opened from, when that shelf is yours. */
  onRemove?: (showcaseId: string) => Promise<unknown>;
  removeLabel?: string;
}) {
  const { height: windowHeight } = useWindowDimensions();
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  const { user } = useAuth();
  const { showcase, error, loadFailed, refetch } = useShowcase(showcaseId ?? undefined);

  // What to do once the sheet has gone: the push a card asked for.
  const after = useRef<(() => void) | null>(null);
  const latestClose = useRef(onClose);
  latestClose.current = onClose;
  const leave = useCallback((then: () => void) => {
    after.current = then;
    latestClose.current();
  }, []);
  const host = useShowcaseCardHost({ leave, onRemoved: () => latestClose.current() });

  const remove = () => {
    if (!showcaseId || !onRemove) return;
    const id = showcaseId;
    Alert.alert(`${removeLabel}?`, 'It stays in the feed and on their profile.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          onRemove(id).then(
            () => latestClose.current(),
            (e: unknown) => Alert.alert("Couldn't take it off", profileActionMessage(e, 'keep')),
          );
        },
      },
    ]);
  };

  const gone = !showcase && isGone(error);

  return (
    <BottomSheet
      visible={showcaseId !== null}
      onClose={onClose}
      onClosed={() => {
        const run = after.current;
        after.current = null;
        run?.();
      }}
      surface="background"
      closeLabel="Close the post"
    >
      {/* As tall as the sheet may be, shrinking only for a small screen. */}
      <View style={{ height: windowHeight, flexShrink: 1 }}>
        <View className="flex-row items-center pl-4 pr-1 pb-1">
          <Text
            accessibilityRole="header"
            className="flex-1 text-foreground text-[15px] font-bold"
            numberOfLines={1}
          >
            {showcase?.title ?? 'Post'}
          </Text>
          {onRemove && showcase ? (
            <Pressable
              onPress={remove}
              accessibilityRole="button"
              className="min-h-[44px] px-3 items-center justify-center active:opacity-60"
            >
              <Text className="text-primary text-[13px] font-semibold">Remove</Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
            className="w-11 h-11 items-center justify-center rounded-full active:opacity-60"
          >
            <XIcon size={20} className="text-foreground" />
          </Pressable>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 24 }}
          showsVerticalScrollIndicator={false}
        >
          {note && showcase ? (
            <View className="mx-4 mb-2 pl-2.5 border-l-2 border-border">
              <Text className="text-primary text-[10px] font-bold tracking-[1.5px]">
                WHY IT WAS KEPT
              </Text>
              <Text className="text-secondary-foreground text-[12.5px] leading-[18px] italic mt-0.5">
                {note}
              </Text>
            </View>
          ) : null}

          {showcase ? (
            <ShowcaseCard
              item={showcase}
              mine={Boolean(user && showcase.userId === user.id)}
              actions={host.actions}
              filmActive={showcaseId !== null}
            />
          ) : gone ? (
            // Deleted, made private or taken down since the grid was drawn.
            // Not a connection problem, and a Retry could only fail again.
            <View className="items-center px-10 pt-16">
              <Text className="text-foreground text-[15px] font-bold text-center">
                This post is no longer available
              </Text>
              <Text className="text-muted-foreground text-[13px] text-center mt-2 leading-5">
                Whoever posted it took it down or deleted it.
              </Text>
              {onRemove ? (
                <Pressable
                  onPress={remove}
                  accessibilityRole="button"
                  className="mt-5 min-h-11 px-5 rounded-xl bg-secondary items-center justify-center active:opacity-80"
                >
                  <Text className="text-secondary-foreground text-[13px] font-bold">
                    {removeLabel}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : loadFailed ? (
            <View className="px-5 pt-10">
              <LoadFailed what="this post" onRetry={() => refetch()} compact />
            </View>
          ) : (
            <View className="pt-16 items-center">
              <ActivityIndicator color={palette.primary} />
            </View>
          )}
        </ScrollView>
      </View>
      {host.element}
    </BottomSheet>
  );
}
