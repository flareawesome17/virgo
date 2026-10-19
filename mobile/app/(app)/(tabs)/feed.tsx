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
import { ImageIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { EmptyState, FeedSkeleton, TabScreen, useTabBottomInset } from '@/components';
import { LoadFailed } from '@/components/LoadFailed';
import { ShowcaseCard, type ShowcaseCardActions } from '@/components/ShowcaseCard';
import { useShowcaseCardHost } from '@/components/ShowcaseCardHost';
import { useAuth, useFeed, useTheme } from '@/src/hooks';
import { useChrome, useChromeScroll } from '@/src/providers/ChromeProvider';
import type { FeedItem } from '@/src/api';
import { createFilmTurn } from '@/src/lib/film-turn';
import { PALETTES } from '@/theme';

cssInterop(ImageIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

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
  const { user } = useAuth();
  const userId = user?.id;
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  const [refreshing, setRefreshing] = useState(false);
  const filmTurn = useRef(createFilmTurn()).current;

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
      ref={listRef as never}
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
            <Text className="text-muted-foreground text-[13px]">{"Couldn't load more."}</Text>
            <Pressable
              onPress={() => void fetchNextPage()}
              accessibilityRole="button"
              className="mt-2 min-h-[44px] px-5 rounded-xl bg-secondary items-center justify-center active:opacity-80"
            >
              <Text className="text-foreground text-[13px] font-bold">Try again</Text>
            </Pressable>
          </View>
        ) : items.length > 0 && !hasNextPage ? (
          <Text className="text-muted-foreground text-[12px] text-center py-6">
            {"You're all caught up."}
          </Text>
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
