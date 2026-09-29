import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
  type ViewToken,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import {
  BookmarkIcon,
  ChevronUpIcon,
  FlagIcon,
  HeartIcon,
  ImageIcon,
  PlusIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { AppTopBar } from '@/components';
import { LoadFailed } from '@/components/LoadFailed';
import { RemoteImage } from '@/components/RemoteImage';
import { ShowcaseFilm } from '@/components/ShowcaseFilm';
import { KeepSheet } from '@/components/KeepSheet';
import { ShowcaseReportSheet } from '@/components/ShowcaseReportSheet';
import { useAuth, useFeed, useLike, useTheme } from '@/src/hooks';
import { useChrome } from '@/src/providers/ChromeProvider';
import { makerOf, type FeedItem } from '@/src/api';
import { PALETTES } from '@/theme';

for (const Icon of [BookmarkIcon, ChevronUpIcon, FlagIcon, HeartIcon, ImageIcon, PlusIcon]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/**
 * The feed.
 *
 * A gallery placard, not a social card. The work hangs full bleed and a warm
 * card sits over the bottom of it with who made it, what it is, and — the part
 * that makes a scroll worth anything to another photographer — how it was made.
 *
 * The craft note is why this is not an image grid. A photograph you cannot
 * learn anything from is a photograph you scroll past.
 */
export default function FeedScreen() {
  const chrome = useChrome();
  const { user } = useAuth();
  const userId = user?.id;
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  const [scope, setScope] = useState<'everyone' | 'connections'>('everyone');
  const [keeping, setKeeping] = useState<FeedItem | null>(null);
  const [reporting, setReporting] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [visibleId, setVisibleId] = useState<string | null>(null);

  const {
    items,
    loadFailed,
    isLoading,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useFeed(scope);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const onEnd = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  /**
   * Which card is on screen, so a film that scrolls away stops.
   *
   * Both of these are held in refs because FlatList refuses a viewability
   * callback whose identity changes between renders, and this one would change
   * on every scroll if it closed over state.
   */
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken<FeedItem>[] }) =>
      // `item` is typed non-null but arrives null for a row that has just been
      // removed, and this runs during that frame.
      setVisibleId(viewableItems[0]?.item?.id ?? null),
  ).current;

  /**
   * Whether the Feed is the screen being looked at.
   *
   * Tabs stay mounted, and so does a screen with another pushed over it, so
   * "the card on screen" alone kept a film playing — sound and all — after
   * switching tabs or opening the post, with its controls nowhere in sight.
   */
  const focused = useIsFocused();

  const renderItem = useCallback(
    ({ item }: { item: FeedItem }) => (
      <Placard
        item={item}
        mine={item.userId === userId}
        visible={focused && item.id === visibleId}
        onKeep={() => setKeeping(item)}
        onReport={() => setReporting(item.id)}
      />
    ),
    [visibleId, userId, focused],
  );

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <AppTopBar />

      <View className="px-5 pt-3 pb-2 flex-row items-center gap-2">
        <ScopeTab label="Everyone" on={scope === 'everyone'} onPress={() => setScope('everyone')} />
        <ScopeTab
          label="Connections"
          on={scope === 'connections'}
          onPress={() => setScope('connections')}
        />
        <View className="flex-1" />
        <Pressable
          onPress={() => router.push('/showcase/new')}
          accessibilityRole="button"
          accessibilityLabel="Post a showcase"
          className="w-11 h-11 rounded-xl bg-action items-center justify-center active:scale-[0.96]"
        >
          <PlusIcon size={20} className="text-action-foreground" />
        </Pressable>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={palette.primary} />
        </View>
      ) : loadFailed && items.length === 0 ? (
        <LoadFailed what="the feed" onRetry={() => refetch()} />
      ) : (
        <FlatList
          onScroll={chrome.onScroll}
          scrollEventThrottle={16}
          data={items}
          keyExtractor={(i) => i.id}
          renderItem={renderItem}
          extraData={`${visibleId}:${focused}`}
          viewabilityConfig={viewabilityConfig}
          onViewableItemsChanged={onViewableItemsChanged}
          contentContainerStyle={{ paddingBottom: 130 }}
          showsVerticalScrollIndicator={false}
          onEndReached={onEnd}
          onEndReachedThreshold={0.6}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={palette.primary}
            />
          }
          ListEmptyComponent={<EmptyFeed scope={scope} />}
          ListFooterComponent={
            isFetchingNextPage ? (
              <View className="py-6">
                <ActivityIndicator color={palette.primary} />
              </View>
            ) : null
          }
        />
      )}

      <KeepSheet item={keeping} onClose={() => setKeeping(null)} />
      <ShowcaseReportSheet showcaseId={reporting} onClose={() => setReporting(null)} />
    </SafeAreaView>
  );
}

function ScopeTab({
  label,
  on,
  onPress,
}: {
  label: string;
  on: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      className={`min-h-11 px-4 rounded-full items-center justify-center ${on ? 'bg-action' : 'bg-secondary'}`}
    >
      <Text
        className={`text-[13px] font-bold ${on ? 'text-action-foreground' : 'text-muted-foreground'}`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * One showcase.
 *
 * The photograph takes a fixed share of the screen rather than its own aspect
 * ratio, so the placard lands in the same place on every card and the thumb
 * does not have to hunt for Keep.
 */
function Placard({
  item,
  mine,
  visible,
  onKeep,
  onReport,
}: {
  item: FeedItem;
  /**
   * Your own post. Your own work is in the feed, and the card offered to keep
   * it, hire you and report you — the first and second refused by the server,
   * the third absurd.
   */
  mine: boolean;
  /** Whether this card is the one on screen; a film that is not, stops. */
  visible: boolean;
  onKeep: () => void;
  onReport: () => void;
}) {
  const { isDark } = useTheme();
  const like = useLike();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  const width = Dimensions.get('window').width;
  const height = Math.round(width * 1.15);
  const cover = item.pieces[0];
  // Never read straight off the payload: see makerOf.
  const maker = makerOf(item);

  return (
    <View className="mb-5">
      {/* A film is its own control, so it is not wrapped in the Pressable that
          opens the showcase — a tap meant for play would otherwise navigate
          away from the thing it was meant to start. The placard below still
          opens it, as does "See it all". */}
      {cover?.kind === 'video' ? (
        <View style={{ width, height }}>
          {/* Lifted clear of the placard, which overlaps the foot by 32. */}
          <ShowcaseFilm
            piece={cover}
            width={width}
            height={height}
            active={visible}
            controlsInset={32}
          />
          {item.pieces.length > 1 && (
            <View
              className="absolute right-3 top-3 flex-row items-center gap-1 rounded-full bg-foreground/55 px-2.5 py-1"
              pointerEvents="none"
            >
              <ImageIcon size={12} className="text-background" />
              <Text className="text-background text-[11px] font-bold">{item.pieces.length}</Text>
            </View>
          )}
        </View>
      ) : (
        <Pressable
          onPress={() => router.push(`/showcase/${item.id}`)}
          accessibilityRole="button"
          accessibilityLabel={item.title ?? 'Open this showcase'}
        >
          <View style={{ width, height }} className="bg-muted">
            <RemoteImage
              source={{ uri: cover?.url }}
              style={{ width, height }}
              contentFit="cover"
            />
            {item.pieces.length > 1 && (
              <View className="absolute right-3 top-3 flex-row items-center gap-1 rounded-full bg-foreground/55 px-2.5 py-1">
                <ImageIcon size={12} className="text-background" />
                <Text className="text-background text-[11px] font-bold">{item.pieces.length}</Text>
              </View>
            )}
          </View>
        </Pressable>
      )}

      {/* The placard, laid over the foot of the photograph. */}
      <View className="-mt-8 mx-2.5 rounded-2xl bg-card overflow-hidden">
        <View className="px-4 pt-3.5">
          <View className="flex-row items-center gap-2.5">
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
              className="w-9 h-9 rounded-full overflow-hidden bg-primary/15 items-center justify-center"
            >
              {maker.avatarUrl ? (
                <RemoteImage
                  source={{ uri: maker.avatarUrl }}
                  style={{ width: 36, height: 36 }}
                />
              ) : (
                <Text className="text-primary text-[14px] font-bold">
                  {maker.displayName.charAt(0).toUpperCase()}
                </Text>
              )}
            </Pressable>
            <View className="flex-1 min-w-0">
              <Text className="text-foreground text-[14px] font-bold" numberOfLines={1}>
                {maker.displayName}
              </Text>
              {maker.title ? (
                <Text className="text-muted-foreground text-[11px]" numberOfLines={1}>
                  {maker.title}
                  {item.location ? ` · ${item.location}` : ''}
                </Text>
              ) : item.location ? (
                <Text className="text-muted-foreground text-[11px]" numberOfLines={1}>
                  {item.location}
                </Text>
              ) : null}
            </View>
            {!mine && (
              <Pressable
                onPress={onReport}
                accessibilityRole="button"
                accessibilityLabel="Report this post"
                hitSlop={8}
                className="w-9 h-9 items-center justify-center active:opacity-60"
              >
                <FlagIcon size={15} className="text-muted-foreground" />
              </Pressable>
            )}
            {item.showHire && maker.handle && !mine && (
              <Pressable
                onPress={() => router.push(`/hire/${maker.handle}`)}
                accessibilityRole="button"
                className="min-h-9 px-3.5 rounded-full bg-action items-center justify-center active:opacity-90"
              >
                <Text className="text-action-foreground text-[12px] font-bold">Hire</Text>
              </Pressable>
            )}
          </View>

          {item.title ? (
            <Text className="text-foreground text-[17px] font-semibold mt-3">{item.title}</Text>
          ) : null}
          {item.caption ? (
            <Text className="text-secondary-foreground text-[13px] leading-5 mt-1" numberOfLines={3}>
              {item.caption}
            </Text>
          ) : null}

          {/* How it was made. The reason to read rather than scroll. */}
          {item.craftNote || item.craftTags.length > 0 ? (
            <View className="mt-3 pt-3 border-t border-border">
              <Text className="text-primary text-[10px] font-bold tracking-[1.5px]">
                HOW IT WAS MADE
              </Text>
              {item.craftNote ? (
                <Text className="text-foreground text-[13px] leading-5 mt-1.5" numberOfLines={4}>
                  {item.craftNote}
                </Text>
              ) : null}
              {item.craftTags.length > 0 && (
                <View className="flex-row flex-wrap gap-1.5 mt-2.5">
                  {item.craftTags.map((tag) => (
                    <View key={tag} className="rounded-full bg-muted px-2.5 py-1">
                      <Text className="text-secondary-foreground text-[11px] font-semibold">
                        {tag}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          ) : null}
        </View>

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
              size={16}
              className={item.likedByMe ? 'text-destructive' : 'text-muted-foreground'}
              // A literal colour, not currentColor, which renders hollow on a
              // device. Unfilled is the whole difference between the states.
              fill={item.likedByMe ? palette.destructive : 'none'}
            />
            <Text
              className={`text-[12px] font-bold ${item.likedByMe ? 'text-destructive' : 'text-secondary-foreground'}`}
            >
              {item.likeCount > 0 ? item.likeCount : 'Like'}
            </Text>
          </Pressable>
          <View className="w-px bg-border my-2.5" />
          <Pressable
            onPress={() => router.push(`/showcase/${item.id}`)}
            accessibilityRole="button"
            className="flex-1 min-h-12 flex-row items-center justify-center gap-1.5 active:opacity-70"
          >
            <ChevronUpIcon size={15} className="text-muted-foreground" />
            <Text className="text-secondary-foreground text-[12px] font-bold">
              {item.commentCount > 0
                ? `${item.commentCount} ${item.commentCount === 1 ? 'comment' : 'comments'}`
                : 'See it all'}
            </Text>
          </Pressable>
          {mine ? (
            // Keeping your own work is refused, so it is not offered; how many
            // people kept it is what is worth seeing on your own post.
            item.keptCount > 0 ? (
              <>
                <View className="w-px bg-border my-2.5" />
                <View className="flex-[1.2] min-h-12 flex-row items-center justify-center gap-1.5">
                  <BookmarkIcon size={15} className="text-muted-foreground" />
                  <Text className="text-muted-foreground text-[12px] font-bold">
                    {item.keptCount} kept
                  </Text>
                </View>
              </>
            ) : null
          ) : (
            <>
              <View className="w-px bg-border my-2.5" />
              <Pressable
                onPress={onKeep}
                accessibilityRole="button"
                accessibilityState={{ selected: item.keptByMe }}
                accessibilityLabel={item.keptByMe ? 'Kept. Change where.' : 'Keep this'}
                className={`flex-[1.2] min-h-12 flex-row items-center justify-center gap-1.5 active:opacity-90 ${item.keptByMe ? 'bg-secondary' : 'bg-action'}`}
              >
                <BookmarkIcon
                  size={15}
                  className={item.keptByMe ? 'text-primary' : 'text-action-foreground'}
                  // Filled once it is yours: an outline that means "kept" and an
                  // outline that means "keep" are the same picture. A literal
                  // colour, not currentColor — that renders hollow on a device.
                  fill={item.keptByMe ? palette.primary : 'none'}
                />
                <Text
                  className={`text-[12px] font-bold ${item.keptByMe ? 'text-primary' : 'text-action-foreground'}`}
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
}

function EmptyFeed({ scope }: { scope: 'everyone' | 'connections' }) {
  return (
    <View className="items-center px-10 mt-24">
      <View className="w-20 h-20 rounded-full bg-primary/10 items-center justify-center mb-5">
        <ImageIcon size={30} className="text-primary" />
      </View>
      <Text className="text-foreground text-lg font-bold">
        {scope === 'connections' ? 'Nothing from your connections yet' : 'Nothing here yet'}
      </Text>
      <Text className="text-muted-foreground text-sm text-center mt-2 leading-5">
        {scope === 'connections'
          ? 'When people you are connected with post their work, it shows up here.'
          : 'Be the first. Post a piece of work and say how you made it — that is what other people come here to read.'}
      </Text>
      <Pressable
        onPress={() => router.push('/showcase/new')}
        accessibilityRole="button"
        className="mt-7 min-h-11 bg-action rounded-xl px-7 items-center justify-center active:scale-[0.98]"
      >
        <Text className="text-action-foreground text-sm font-bold">Post a showcase</Text>
      </Pressable>
    </View>
  );
}
