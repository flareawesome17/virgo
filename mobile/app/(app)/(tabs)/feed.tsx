import { memo, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
  useWindowDimensions,
  type ViewToken,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { router, useNavigation } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import {
  BookmarkIcon,
  EllipsisIcon,
  FlagIcon,
  HeartIcon,
  ImageIcon,
  MessageCircleIcon,
  PencilIcon,
  UserIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import {
  EmptyState,
  FeedSkeleton,
  SegmentedTabs,
  TabScreen,
  useTabBottomInset,
} from '@/components';
import { BottomSheet } from '@/components/BottomSheet';
import { LoadFailed } from '@/components/LoadFailed';
import { RemoteImage } from '@/components/RemoteImage';
import { ShowcaseFilm } from '@/components/ShowcaseFilm';
import { ShowcaseReportSheet } from '@/components/ShowcaseReportSheet';
import { useKeepFlow } from '@/components/KeepFlow';
import { PieceCarousel, PieceImage, feedAspect } from '@/components/ShowcaseMedia';
import { useAuth, useFeed, useLike, useTheme } from '@/src/hooks';
import { useChrome, useChromeScroll } from '@/src/providers/ChromeProvider';
import { makerOf, type FeedItem } from '@/src/api';
import { PALETTES } from '@/theme';

for (const Icon of [
  BookmarkIcon, EllipsisIcon, FlagIcon, HeartIcon, ImageIcon, MessageCircleIcon, PencilIcon, UserIcon,
]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

type Scope = 'everyone' | 'connections';

/** A caption or note longer than this is cut short on the card, with "more". */
const CAPTION_CUT = 140;
const NOTE_CUT = 200;

/**
 * Which card's film may play: the one on screen, while the Feed is the screen
 * being looked at.
 *
 * A store each card subscribes to for its own answer, rather than state the
 * list passes down. As state, every change of card re-rendered every mounted
 * card — likes, images, films and all — in the middle of the scroll that
 * caused it. Now only the card that stops and the card that starts hear about
 * it.
 */
interface FilmTurn {
  set: (next: { id?: string | null; focused?: boolean }) => void;
  subscribe: (listener: () => void) => () => void;
  isActive: (id: string) => boolean;
}

function createFilmTurn(): FilmTurn {
  let visibleId: string | null = null;
  let focused = true;
  const listeners = new Set<() => void>();
  return {
    set: (next) => {
      const id = next.id !== undefined ? next.id : visibleId;
      const f = next.focused ?? focused;
      if (id === visibleId && f === focused) return;
      visibleId = id;
      focused = f;
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    isActive: (id) => focused && visibleId === id,
  };
}

/**
 * The feed.
 *
 * A gallery placard, not a social card. The work hangs full bleed at its own
 * proportions and a warm card sits under it with who made it, what it is,
 * and — the part that makes a scroll worth anything to another photographer
 * — how it was made.
 */
export default function FeedScreen() {
  const [scope, setScope] = useState<Scope>('everyone');
  // Each scope keeps its own list, mounted once shown: one list for both
  // carried the scroll offset from one to the other, and an uncached scope
  // lost your place in the first.
  const [shown, setShown] = useState<Record<Scope, boolean>>({ everyone: true, connections: false });
  const lists = useRef<Record<Scope, FlatList<FeedItem> | null>>({ everyone: null, connections: null });
  const keepFlow = useKeepFlow();
  const [reporting, setReporting] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<{ item: FeedItem; mine: boolean } | null>(null);
  const { reveal } = useChrome();

  const choose = (next: Scope) => {
    setShown((current) => (current[next] ? current : { ...current, [next]: true }));
    setScope(next);
  };

  // Tapping the Feed tab while on it goes back to the top, as every feed does.
  const navigation = useNavigation();
  const focused = useIsFocused();
  useEffect(() => {
    // 'tabPress' is a tab navigator event, which this screen's navigation is.
    const off = (navigation as unknown as {
      addListener: (event: 'tabPress', cb: () => void) => () => void;
    }).addListener('tabPress', () => {
      if (!focused) return;
      lists.current[scope]?.scrollToOffset({ offset: 0, animated: true });
      reveal();
    });
    return off;
  }, [navigation, focused, scope, reveal]);

  const onMenu = useCallback((item: FeedItem, mine: boolean) => setMenuFor({ item, mine }), []);

  return (
    <TabScreen title="Feed" create="showcase">
      <View className="px-5 pt-2 pb-2">
        <SegmentedTabs<Scope>
          segments={[
            { key: 'everyone', label: 'Everyone' },
            { key: 'connections', label: 'Connections' },
          ]}
          value={scope}
          onChange={choose}
        />
      </View>

      {(['everyone', 'connections'] as const).map((s) =>
        shown[s] ? (
          <View key={s} className="flex-1" style={scope === s ? undefined : { display: 'none' }}>
            <FeedList
              scope={s}
              active={scope === s}
              listRef={(list) => {
                lists.current[s] = list;
              }}
              onKeep={keepFlow.onKeep}
              onMenu={onMenu}
            />
          </View>
        ) : null,
      )}

      {/* A … menu rather than a flag on every card: reporting is rare, and a
          flag beside somebody's name read as an accusation. */}
      <BottomSheet visible={!!menuFor} onClose={() => setMenuFor(null)}>
        <View className="px-5 pt-2 pb-5">
          {menuFor && !menuFor.mine && makerOf(menuFor.item).handle ? (
            <MenuRow
              icon={UserIcon}
              label={`View ${makerOf(menuFor.item).displayName}'s profile`}
              onPress={() => {
                const handle = makerOf(menuFor.item).handle;
                setMenuFor(null);
                router.push(`/u/${handle}`);
              }}
            />
          ) : null}
          {menuFor?.mine ? (
            <MenuRow
              icon={PencilIcon}
              label="Edit this post"
              onPress={() => {
                const id = menuFor.item.id;
                setMenuFor(null);
                router.push({ pathname: '/showcase/new', params: { edit: id } });
              }}
            />
          ) : (
            <MenuRow
              icon={FlagIcon}
              label="Report this post"
              destructive
              onPress={() => {
                const id = menuFor?.item.id ?? null;
                setMenuFor(null);
                setReporting(id);
              }}
            />
          )}
          <Pressable
            onPress={() => setMenuFor(null)}
            accessibilityRole="button"
            className="mt-3 bg-muted rounded-2xl min-h-[48px] items-center justify-center active:scale-[0.98]"
          >
            <Text className="text-foreground text-base font-semibold">Cancel</Text>
          </Pressable>
        </View>
      </BottomSheet>

      {keepFlow.element}
      <ShowcaseReportSheet showcaseId={reporting} onClose={() => setReporting(null)} />
    </TabScreen>
  );
}

function MenuRow({
  icon: Icon,
  label,
  onPress,
  destructive,
}: {
  icon: typeof FlagIcon;
  label: string;
  onPress: () => void;
  destructive?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className="min-h-[52px] flex-row items-center gap-3 border-b border-border active:opacity-60"
    >
      <Icon size={18} className={destructive ? 'text-destructive' : 'text-foreground'} />
      <Text className={`text-base ${destructive ? 'text-destructive' : 'text-foreground'}`}>{label}</Text>
    </Pressable>
  );
}

/** One scope's list, with its own scroll position, pages and film turn. */
function FeedList({
  scope,
  active,
  listRef,
  onKeep,
  onMenu,
}: {
  scope: Scope;
  active: boolean;
  listRef: (list: FlatList<FeedItem> | null) => void;
  onKeep: (item: FeedItem) => void;
  onMenu: (item: FeedItem, mine: boolean) => void;
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
  } = useFeed(scope);

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
   * Whether this list is the one being looked at: the Feed focused, and this
   * scope the one chosen. Tabs stay mounted, and so does a screen with another
   * pushed over it, so "the card on screen" alone kept a film playing.
   */
  const focused = useIsFocused();
  useEffect(() => filmTurn.set({ focused: focused && active }), [filmTurn, focused, active]);

  const renderItem = useCallback(
    ({ item }: { item: FeedItem }) => (
      <Placard
        item={item}
        mine={item.userId === userId}
        filmTurn={filmTurn}
        onKeep={onKeep}
        onMenu={onMenu}
      />
    ),
    [userId, filmTurn, onKeep, onMenu],
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
      contentContainerStyle={{ paddingBottom: bottomInset }}
      showsVerticalScrollIndicator={false}
      onEndReached={onEnd}
      onEndReachedThreshold={0.6}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.primary} />
      }
      ListEmptyComponent={<EmptyFeed scope={scope} />}
      ListFooterComponent={
        isFetchingNextPage ? (
          <View className="py-6">
            <ActivityIndicator color={palette.primary} />
          </View>
        ) : isFetchNextPageError ? (
          // A failed page looked like the end of the feed, with nothing to
          // try again with.
          <View className="py-5 items-center">
            <Text className="text-muted-foreground text-[13px]">Couldn't load more.</Text>
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

/**
 * One showcase.
 *
 * At its own shape, between 4:5 and 1.91:1, with every piece of a set a
 * swipe away.
 */
const Placard = memo(function Placard({
  item,
  mine,
  filmTurn,
  onKeep,
  onMenu,
}: {
  item: FeedItem;
  /**
   * Your own post. Your own work is in the feed, and the card offered to keep
   * it, hire you and report you — the first and second refused by the server,
   * the third absurd.
   */
  mine: boolean;
  /** Whose turn it is to play; a film that is not on screen, stops. */
  filmTurn: FilmTurn;
  onKeep: (item: FeedItem) => void;
  onMenu: (item: FeedItem, mine: boolean) => void;
}) {
  const { isDark } = useTheme();
  const like = useLike(item.id);
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  const { width } = useWindowDimensions();
  const height = Math.round(width / feedAspect(item.pieces[0]));
  // Never read straight off the payload: see makerOf.
  const maker = makerOf(item);
  const [page, setPage] = useState(0);
  const open = () => router.push(`/showcase/${item.id}`);
  const label = item.title ?? `${maker.displayName}'s showcase`;

  return (
    <View className="mb-6">
      <PieceCarousel
        pieces={item.pieces}
        width={width}
        height={height}
        onIndexChange={setPage}
        renderPage={(piece, index) =>
          // A film is its own control, so it is not wrapped in the Pressable
          // that opens the post — a tap meant for play would otherwise
          // navigate away from the thing it was meant to start.
          piece.kind === 'video' ? (
            <FeedFilm
              id={item.id}
              filmTurn={filmTurn}
              piece={piece}
              width={width}
              height={height}
              current={index === page}
            />
          ) : (
            <Pressable
              onPress={open}
              accessibilityRole="button"
              accessibilityLabel={`${label}. Open the post.`}
              className="bg-muted active:opacity-90"
              style={{ width, height }}
            >
              <PieceImage piece={piece} width={width} height={height} />
            </Pressable>
          )
        }
      />

      <View className="mx-2.5 mt-2.5 rounded-2xl bg-card overflow-hidden">
        <View className="pl-2 pr-1 pt-2 flex-row items-center gap-1">
          <Pressable
            onPress={() => {
              // Your own profile needs no published handle; anybody else's
              // is only reachable once they have published one.
              if (mine) router.push('/profile');
              else if (maker.handle) router.push(`/u/${maker.handle}`);
            }}
            disabled={!mine && !maker.handle}
            accessibilityRole="button"
            accessibilityLabel={mine ? 'Your profile' : `${maker.displayName}'s profile`}
            className="flex-1 min-w-0 min-h-[48px] flex-row items-center gap-2.5 px-2 rounded-xl active:opacity-70"
          >
            <View className="w-9 h-9 rounded-full overflow-hidden bg-primary/15 items-center justify-center">
              {maker.avatarUrl ? (
                <RemoteImage source={{ uri: maker.avatarUrl }} style={{ width: 36, height: 36 }} />
              ) : (
                <Text className="text-primary text-[14px] font-bold">
                  {maker.displayName.charAt(0).toUpperCase()}
                </Text>
              )}
            </View>
            <View className="flex-1 min-w-0">
              <Text className="text-foreground text-[14px] font-bold" numberOfLines={1}>
                {maker.displayName}
              </Text>
              {maker.title || item.location ? (
                <Text className="text-muted-foreground text-[12px]" numberOfLines={1}>
                  {[maker.title, item.location].filter(Boolean).join(' · ')}
                </Text>
              ) : null}
            </View>
          </Pressable>
          {item.showHire && maker.handle && !mine && (
            <Pressable
              onPress={() => router.push(`/hire/${maker.handle}`)}
              accessibilityRole="button"
              accessibilityLabel={`Hire ${maker.displayName}`}
              className="min-h-[44px] px-4 rounded-full bg-action items-center justify-center active:opacity-90"
            >
              <Text className="text-action-foreground text-[13px] font-bold">Hire</Text>
            </Pressable>
          )}
          <Pressable
            onPress={() => onMenu(item, mine)}
            accessibilityRole="button"
            accessibilityLabel="More options for this post"
            className="w-11 h-11 items-center justify-center rounded-full active:opacity-60"
          >
            <EllipsisIcon size={18} className="text-muted-foreground" />
          </Pressable>
        </View>

        {/* The words open the post too: a film's post could only be reached
            from "See it all", and long text was cut with no way to the rest. */}
        <Pressable
          onPress={open}
          accessibilityRole="button"
          accessibilityLabel={`${label}. Read it all.`}
          className="px-4 pt-1 active:opacity-80"
        >
          {item.title ? (
            <Text className="text-foreground text-[17px] font-semibold mt-1">{item.title}</Text>
          ) : null}
          {item.caption ? (
            <Text className="text-secondary-foreground text-[13.5px] leading-5 mt-1" numberOfLines={3}>
              {item.caption}
            </Text>
          ) : null}
          {item.caption && item.caption.length > CAPTION_CUT ? (
            <Text className="text-primary text-[12px] font-bold mt-0.5">more</Text>
          ) : null}

          {/* How it was made. The reason to read rather than scroll. */}
          {item.craftNote || item.craftTags.length > 0 ? (
            <View className="mt-3 pt-3 border-t border-border">
              <Text className="text-primary text-[11px] font-bold tracking-[1.5px]">
                HOW IT WAS MADE
              </Text>
              {item.craftNote ? (
                <Text className="text-foreground text-[13.5px] leading-5 mt-1.5" numberOfLines={4}>
                  {item.craftNote}
                </Text>
              ) : null}
              {item.craftNote && item.craftNote.length > NOTE_CUT ? (
                <Text className="text-primary text-[12px] font-bold mt-0.5">more</Text>
              ) : null}
              {item.craftTags.length > 0 && (
                <View className="flex-row flex-wrap gap-1.5 mt-2.5">
                  {item.craftTags.map((tag) => (
                    <View key={tag} className="rounded-full bg-muted px-2.5 py-1">
                      <Text className="text-secondary-foreground text-[12px] font-semibold">{tag}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          ) : null}
        </Pressable>

        <View className="mt-3 border-t border-border flex-row items-stretch">
          <Pressable
            onPress={() => like.mutate({ showcaseId: item.id, liked: !item.likedByMe })}
            accessibilityRole="button"
            accessibilityState={{ selected: item.likedByMe }}
            accessibilityLabel={
              item.likedByMe
                ? `Liked, ${item.likeCount}. Tap to unlike.`
                : `Like. ${item.likeCount} so far.`
            }
            className="flex-1 min-h-12 flex-row items-center justify-center gap-1.5 active:opacity-70"
          >
            <HeartIcon
              size={17}
              className={item.likedByMe ? 'text-destructive' : 'text-muted-foreground'}
              // A literal colour, not currentColor, which renders hollow on a
              // device. Unfilled is the whole difference between the states.
              fill={item.likedByMe ? palette.destructive : 'none'}
            />
            <Text
              className={`text-[13px] font-bold ${item.likedByMe ? 'text-destructive' : 'text-secondary-foreground'}`}
            >
              {item.likeCount > 0 ? item.likeCount : 'Like'}
            </Text>
          </Pressable>
          <View className="w-px bg-border my-2.5" />
          <Pressable
            onPress={open}
            accessibilityRole="button"
            accessibilityLabel={
              item.commentCount > 0 ? `${item.commentCount} comments. Open the post.` : 'Open the post'
            }
            className="flex-1 min-h-12 flex-row items-center justify-center gap-1.5 active:opacity-70"
          >
            <MessageCircleIcon size={16} className="text-muted-foreground" />
            <Text className="text-secondary-foreground text-[13px] font-bold">
              {item.commentCount > 0 ? item.commentCount : 'Comment'}
            </Text>
          </Pressable>
          {mine ? (
            // Keeping your own work is refused, so it is not offered; how many
            // people kept it is what is worth seeing on your own post.
            item.keptCount > 0 ? (
              <>
                <View className="w-px bg-border my-2.5" />
                <View className="flex-[1.2] min-h-12 flex-row items-center justify-center gap-1.5">
                  <BookmarkIcon size={16} className="text-muted-foreground" />
                  <Text className="text-muted-foreground text-[13px] font-bold">{item.keptCount} kept</Text>
                </View>
              </>
            ) : null
          ) : (
            <>
              <View className="w-px bg-border my-2.5" />
              <Pressable
                onPress={() => onKeep(item)}
                accessibilityRole="button"
                accessibilityState={{ selected: item.keptByMe }}
                accessibilityLabel={item.keptByMe ? 'Kept. Change where.' : 'Keep this'}
                className={`flex-[1.2] min-h-12 flex-row items-center justify-center gap-1.5 active:opacity-90 ${item.keptByMe ? 'bg-secondary' : 'bg-action'}`}
              >
                <BookmarkIcon
                  size={16}
                  className={item.keptByMe ? 'text-primary' : 'text-action-foreground'}
                  // Filled once it is yours: an outline that means "kept" and an
                  // outline that means "keep" are the same picture.
                  fill={item.keptByMe ? palette.primary : 'none'}
                />
                <Text
                  className={`text-[13px] font-bold ${item.keptByMe ? 'text-primary' : 'text-action-foreground'}`}
                >
                  {item.keptByMe ? 'Kept' : 'Keep'}
                  {item.keptCount > 0 ? ` · ${item.keptCount}` : ''}
                </Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    </View>
  );
});

/**
 * A card's film, and the one part of the card that listens for whose turn it
 * is — so a change of turn re-renders the film alone.
 *
 * Playing makes it this card's turn. A card that never reached 60% on screen
 * was never anybody's turn, so the first tap started the film and the turn
 * stopped it again at once.
 */
function FeedFilm({
  id,
  filmTurn,
  piece,
  width,
  height,
  current,
}: {
  id: string;
  filmTurn: FilmTurn;
  piece: FeedItem['pieces'][number];
  width: number;
  height: number;
  /** Whether this is the page of the set that is showing. */
  current: boolean;
}) {
  const active = useSyncExternalStore(filmTurn.subscribe, () => filmTurn.isActive(id));
  return (
    <ShowcaseFilm
      piece={piece}
      width={width}
      height={height}
      active={active && current}
      onPlay={() => filmTurn.set({ id })}
    />
  );
}

function EmptyFeed({ scope }: { scope: Scope }) {
  return (
    <View className="pt-12">
      <EmptyState
        icon={ImageIcon}
        title={scope === 'connections' ? 'Nothing from your connections yet' : 'Nothing here yet'}
        body={
          scope === 'connections'
            ? 'When people you are connected with post their work, it shows up here.'
            : 'Be the first. Post a piece of work and say how you made it — that is what other people come here to read.'
        }
        action={{ label: 'Post a showcase', onPress: () => router.push('/showcase/new') }}
      />
    </View>
  );
}
