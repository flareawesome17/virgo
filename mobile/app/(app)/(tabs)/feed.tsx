import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
  type ViewToken,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { router, useNavigation } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { CheckIcon, ImageIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { EmptyState, FeedSkeleton, TabScreen, useTabBottomInset } from '@/components';
import { LoadFailed } from '@/components/LoadFailed';
import { RemoteImage } from '@/components/RemoteImage';
import { ShowcaseCard, type ShowcaseCardActions } from '@/components/ShowcaseCard';
import { useShowcaseCardHost } from '@/components/ShowcaseCardHost';
import { useAuth, useFeed, useTheme } from '@/src/hooks';
import { useChrome, useChromeScroll } from '@/src/providers/ChromeProvider';
import type { FeedItem } from '@/src/api';
import { createFilmTurn } from '@/src/lib/film-turn';
import { PALETTES } from '@/theme';

for (const Icon of [CheckIcon, ImageIcon]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/**
 * The feed.
 *
 * One list: public work from everyone, what your connections showed to
 * connections only, and your own. It was two tabs, Everyone and Connections,
 * and the second was the first with most of it taken away.
 *
 * Each post is a card with everything on it — the work at its own shape, the
 * heart, the thread and the shelf a tap away in sheets — so reading the feed
 * never means opening and closing a screen per post.
 */
export default function FeedScreen() {
  const list = useRef<FlatList<FeedItem> | null>(null);
  const host = useShowcaseCardHost();
  const { reveal } = useChrome();

  // Tapping the Feed tab while on it goes back to the top, as every feed does.
  const navigation = useNavigation();
  const focused = useIsFocused();
  useEffect(() => {
    // 'tabPress' is a tab navigator event, which this screen's navigation is.
    const off = (navigation as unknown as {
      addListener: (event: 'tabPress', cb: () => void) => () => void;
    }).addListener('tabPress', () => {
      if (!focused) return;
      list.current?.scrollToOffset({ offset: 0, animated: true });
      reveal();
    });
    return off;
  }, [navigation, focused, reveal]);

  return (
    <TabScreen title="Feed" create="showcase">
      <FeedList
        listRef={(next) => {
          list.current = next;
        }}
        actions={host.actions}
      />
      {host.element}
    </TabScreen>
  );
}

/** The list, with its pages and its film turn. */
function FeedList({
  listRef,
  actions,
}: {
  listRef: (list: FlatList<FeedItem> | null) => void;
  actions: ShowcaseCardActions;
}) {
  const onScroll = useChromeScroll();
  const bottomInset = useTabBottomInset();
  const { user, profile } = useAuth();
  const userId = user?.id;
  const { reveal } = useChrome();
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  const [refreshing, setRefreshing] = useState(false);
  const filmTurn = useRef(createFilmTurn()).current;
  const list = useRef<FlatList<FeedItem> | null>(null);

  const {
    items,
    loadFailed,
    isLoading,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
  } = useFeed('everyone');

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const onEnd = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage && !isFetchNextPageError) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage]);

  /**
   * Which card is on screen, so a film that scrolls away stops.
   *
   * Held in refs because FlatList refuses a viewability callback whose
   * identity changes between renders.
   */
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken<FeedItem>[] }) =>
      // `item` is typed non-null but arrives null for a row that has just been
      // removed, and this runs during that frame.
      filmTurn.set({ id: viewableItems[0]?.item?.id ?? null }),
  ).current;

  /**
   * Whether the feed is the screen being looked at. Tabs stay mounted, and so
   * does a screen with another pushed over it, so "the card on screen" alone
   * kept a film playing.
   */
  const focused = useIsFocused();
  useEffect(() => filmTurn.set({ focused }), [filmTurn, focused]);

  const renderItem = useCallback(
    ({ item }: { item: FeedItem }) => (
      <ShowcaseCard item={item} mine={item.userId === userId} actions={actions} filmTurn={filmTurn} />
    ),
    [userId, actions, filmTurn],
  );

  if (isLoading) return <FeedSkeleton />;
  if (loadFailed && items.length === 0) {
    return <LoadFailed what="the feed" onRetry={() => refetch()} />;
  }

  return (
    <Animated.FlatList
      ref={((next: FlatList<FeedItem> | null) => {
        list.current = next;
        listRef(next);
      }) as never}
      onScroll={onScroll}
      scrollEventThrottle={16}
      data={items}
      keyExtractor={(i) => i.id}
      renderItem={renderItem}
      viewabilityConfig={viewabilityConfig}
      onViewableItemsChanged={onViewableItemsChanged}
      // Each card is most of a screen tall, with a photograph or a film in
      // it. The defaults keep ten screens' worth mounted and add ten at a
      // time, which is a lot of decoding for a list read one card at once.
      initialNumToRender={2}
      maxToRenderPerBatch={2}
      windowSize={5}
      contentContainerStyle={{ paddingTop: 4, paddingBottom: bottomInset }}
      showsVerticalScrollIndicator={false}
      onEndReached={onEnd}
      onEndReachedThreshold={0.6}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.primary} />
      }
      // Posting is offered where the feed is read, not only behind the plus.
      ListHeaderComponent={
        items.length > 0 ? (
          <PostPrompt name={profile?.displayName ?? null} avatarUrl={profile?.avatarUrl ?? null} />
        ) : null
      }
      ListEmptyComponent={<EmptyFeed />}
      ListFooterComponent={
        isFetchingNextPage ? (
          <View className="py-6">
            <ActivityIndicator color={palette.primary} />
          </View>
        ) : isFetchNextPageError ? (
          // A failed page looked like the end of the feed, with nothing to
          // try again with.
          <View className="py-5 items-center">
            <Text className="text-muted-foreground text-[13px] leading-[18px]">{"Couldn't load more."}</Text>
            <Pressable
              onPress={() => void fetchNextPage()}
              accessibilityRole="button"
              className="mt-2 h-11 px-5 rounded-[14px] bg-secondary items-center justify-center active:opacity-80"
            >
              <Text className="text-foreground text-[15px] font-semibold">Try again</Text>
            </Pressable>
          </View>
        ) : items.length > 0 && !hasNextPage ? (
          <FeedEnd
            onTop={() => {
              list.current?.scrollToOffset({ offset: 0, animated: true });
              reveal();
            }}
          />
        ) : null
      }
    />
  );
}

function EmptyFeed() {
  return (
    <View className="pt-12">
      <EmptyState
        icon={ImageIcon}
        title="Nothing here yet"
        body="Be the first. Post a piece of work and say how you made it — that is what other people come here to read."
        action={{ label: 'Post a showcase', onPress: () => router.push('/showcase/new') }}
      />
    </View>
  );
}

/**
 * "Show a piece of your work": the way to post, at the head of the feed.
 *
 * The plus in the header does the same. This is for whoever is reading the
 * feed and has not thought to look there.
 */
function PostPrompt({ name, avatarUrl }: { name: string | null; avatarUrl: string | null }) {
  return (
    <Pressable
      onPress={() => router.push('/showcase/new')}
      accessibilityRole="button"
      accessibilityLabel="Post a showcase"
      className="mx-5 mt-2 mb-3 h-[52px] rounded-2xl border border-border/40 bg-card flex-row items-center gap-3 pl-2.5 pr-2 active:opacity-80"
    >
      <View className="w-8 h-8 rounded-full overflow-hidden bg-muted items-center justify-center">
        {avatarUrl ? (
          <RemoteImage source={{ uri: avatarUrl }} style={{ width: 32, height: 32 }} />
        ) : (
          <Text className="text-foreground text-[13px] font-bold">{(name ?? '').charAt(0).toUpperCase()}</Text>
        )}
      </View>
      <Text className="flex-1 text-muted-foreground text-[15px]" numberOfLines={1}>
        Show a piece of your work
      </Text>
      <View className="h-9 px-3.5 rounded-xl bg-muted flex-row items-center gap-1.5">
        <ImageIcon size={16} className="text-foreground" />
        <Text className="text-foreground text-[14px] font-semibold">Post</Text>
      </View>
    </Pressable>
  );
}

/** The end of the feed: said plainly, with the two things left to do. */
function FeedEnd({ onTop }: { onTop: () => void }) {
  return (
    <View className="mx-5 mt-1 mb-6 rounded-[20px] border border-border/40 bg-card px-5 py-6 items-center">
      <View className="w-12 h-12 rounded-2xl bg-muted items-center justify-center mb-3">
        <CheckIcon size={22} className="text-secondary-foreground" strokeWidth={2.4} />
      </View>
      <Text className="text-foreground text-[17px] leading-6 font-bold text-center" accessibilityRole="header">
        You have seen it all
      </Text>
      <Text className="text-muted-foreground text-[15px] leading-[22px] text-center mt-1.5">
        That is every piece of work on the feed. Add yours, and say how you made it.
      </Text>
      <View className="flex-row gap-2 self-stretch mt-4">
        <Pressable
          onPress={() => router.push('/showcase/new')}
          accessibilityRole="button"
          className="flex-1 h-11 rounded-[14px] bg-action items-center justify-center active:opacity-85"
        >
          <Text className="text-action-foreground text-[15px] font-semibold">Post your work</Text>
        </Pressable>
        <Pressable
          onPress={onTop}
          accessibilityRole="button"
          className="flex-1 h-11 rounded-[14px] bg-secondary items-center justify-center active:opacity-80"
        >
          <Text className="text-foreground text-[15px] font-semibold">Back to the top</Text>
        </Pressable>
      </View>
    </View>
  );
}
