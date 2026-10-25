import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  PixelRatio,
  Pressable,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { router } from 'expo-router';
import { BookmarkIcon, ImageIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { LoadFailed } from '@/components/LoadFailed';
import { SegmentedTabs } from '@/components/SegmentedTabs';
import { RemoteImage, stableCacheKey } from '@/components/RemoteImage';
import { ShowcasePostSheet } from '@/components/ShowcasePostSheet';
import {
  useAllKept,
  useMyShowcases,
  useProfileTaste,
  useProfileWork,
  useShelves,
  useTheme,
} from '@/src/hooks';
import {
  longEdgeToCover,
  pieceSource,
  showcaseStatus,
  THUMBNAIL_EDGE,
  type ShowcasePiece,
  type ShowcaseStatus,
} from '@/src/api';
import { PALETTES } from '@/theme';

for (const Icon of [BookmarkIcon, ImageIcon]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/** A work card's height, in points. */
const CARD_HEIGHT = 132;
/** Between the tiles of a shelf's mosaic cover. */
const MOSAIC_GAP = 2;

/**
 * The still for a work card: the piece's 640 px thumbnail, or a display copy
 * once the card needs more pixels than that.
 *
 * A card is half the screen across and cropped to its height, so a portrait
 * photograph has to cover the card's width with its short edge. On a phone at
 * 3x that is already more than the thumbnail has, and it was drawn stretched.
 */
function cardStill(piece: ShowcasePiece | undefined, cardWidth: number): string | undefined {
  if (!piece) return undefined;
  const ratio = PixelRatio.get();
  const need = longEdgeToCover(piece, cardWidth * ratio, CARD_HEIGHT * ratio);
  return need > THUMBNAIL_EDGE ? pieceSource(piece, need) : piece.url;
}

/**
 * The two halves of a creative: what they made, and what they respond to.
 *
 * One component for both profiles, so the page somebody visits and the page you
 * see of yourself are drawn from the same shape — the old profile had three
 * screens claiming to show the same thing and disagreeing about it.
 *
 * Neither half is the portfolio. `portfolio_items` still exists and still
 * renders below this; showcases are a different object and both are shown until
 * the old one is migrated across.
 *
 * Your own profile reads your own lists rather than the by-handle ones. Those
 * need a handle, and posting does not — so anybody without one saw "You have
 * not posted anything yet" over posts they had made. Your own list also keeps
 * what you made private, marked, which is the only place left to find it again.
 *
 * A piece of work opens in a sheet as the feed's own card, over the profile,
 * rather than on a screen of its own. Your own Taste leads with All kept —
 * everything you kept, whatever shelf it is on — before the shelves.
 */
export function ProfileWorkTaste({
  handle,
  isSelf,
  firstName,
  workLabel = 'Work',
  className = 'mt-6',
}: {
  handle: string | undefined;
  isSelf: boolean;
  firstName: string;
  /**
   * The first half's name. The Dashboard calls it Posts: it sits under a tab
   * already called Work, and two "Work"s one above the other read as a fault.
   */
  workLabel?: string;
  className?: string;
}) {
  const [tab, setTab] = useState<'work' | 'taste'>('work');
  const [openWork, setOpenWork] = useState<string | null>(null);
  const { width: screenWidth } = useWindowDimensions();
  // Two across, inside the 20 pt margins and the 8 pt gap.
  const cardWidth = (screenWidth - 40) * 0.48;
  const shelfSize = Math.floor((screenWidth - 40 - 8) / 2);
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;

  // Both pairs are called, one of them disabled: hooks cannot be chosen by
  // a condition, only switched off by one.
  const visitorWork = useProfileWork(isSelf ? undefined : handle);
  const visitorTaste = useProfileTaste(isSelf ? undefined : handle);
  const ownWork = useMyShowcases({ enabled: isSelf });
  const ownTaste = useShelves({ enabled: isSelf });
  const work = isSelf ? ownWork : visitorWork;
  const taste = isSelf ? ownTaste : visitorTaste;
  // Left out, rather than shown as a failure, by an API that predates it: the
  // shelves under it are still everything there is to see.
  const allKept = useAllKept({ enabled: isSelf });
  const showAllKept = isSelf && allKept.total > 0;

  return (
    <View className={className}>
      <View className="mx-5">
        <SegmentedTabs<typeof tab>
          segments={[
            { key: 'work', label: workLabel },
            { key: 'taste', label: 'Taste' },
          ]}
          value={tab}
          onChange={setTab}
        />
      </View>

      {tab === 'work' ? (
        work.isLoading ? (
          <Spinner colour={palette.primary} />
        ) : work.loadFailed && work.showcases.length === 0 ? (
          <View className="px-5 pt-4">
            <LoadFailed what="this work" onRetry={() => work.refetch()} compact />
          </View>
        ) : work.showcases.length === 0 ? (
          <Empty
            icon="work"
            title={isSelf ? 'You have not posted anything yet' : `${firstName} has not posted yet`}
            body={
              isSelf
                ? 'A showcase is a piece of work and a note on how you made it. It goes on your profile and into the feed.'
                : 'When they post work, it will show up here.'
            }
            action={isSelf ? { label: 'Post a showcase', to: '/showcase/new' } : undefined}
          />
        ) : (
          <View className="flex-row flex-wrap gap-2 px-5 pt-4">
            {work.showcases.map((showcase) => (
              <Pressable
                key={showcase.id}
                onPress={() => setOpenWork(showcase.id)}
                accessibilityRole="button"
                accessibilityLabel={showcase.title ?? 'Open this showcase'}
                style={{ width: '48%' }}
              >
                <View className="rounded-xl overflow-hidden bg-muted" style={{ height: CARD_HEIGHT }}>
                  <WorkCardStill piece={showcase.pieces[0]} width={cardWidth} />
                  {isSelf && <StatusBadge status={showcaseStatus(showcase)} />}
                  {showcase.pieces.length > 1 && (
                    <View
                      className="absolute right-1.5 top-1.5 rounded-full px-2 py-0.5"
                      style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
                    >
                      <Text className="text-[10px] font-bold" style={{ color: '#FFFFFF' }}>
                        {showcase.pieces.length}
                      </Text>
                    </View>
                  )}
                </View>
                {showcase.title ? (
                  <Text className="text-foreground text-[12px] font-bold mt-1.5" numberOfLines={1}>
                    {showcase.title}
                  </Text>
                ) : null}
                <Text className="text-muted-foreground text-[10.5px]" numberOfLines={1}>
                  {[showcase.category, showcase.keptCount > 0 ? `${showcase.keptCount} kept` : null]
                    .filter(Boolean)
                    .join(' · ') || 'Showcase'}
                </Text>
              </Pressable>
            ))}
            {/* A visitor saw the newest 24 and no way to the rest. */}
            {!isSelf && visitorWork.hasNextPage ? (
              <Pressable
                onPress={() => void visitorWork.fetchNextPage()}
                disabled={visitorWork.isFetchingNextPage}
                accessibilityRole="button"
                className="w-full mt-2 min-h-11 rounded-xl bg-secondary items-center justify-center active:opacity-80"
              >
                {visitorWork.isFetchingNextPage ? (
                  <ActivityIndicator color={palette.primary} />
                ) : (
                  <Text className="text-secondary-foreground text-[13px] font-bold">Show more</Text>
                )}
              </Pressable>
            ) : null}
          </View>
        )
      ) : taste.isLoading ? (
        <Spinner colour={palette.primary} />
      ) : taste.loadFailed && taste.shelves.length === 0 ? (
        <View className="px-5 pt-4">
          <LoadFailed what="these shelves" onRetry={() => taste.refetch()} compact />
        </View>
      ) : taste.shelves.length === 0 && !showAllKept ? (
        <Empty
          icon="taste"
          title={isSelf ? 'Nothing kept yet' : `${firstName} has not kept anything yet`}
          body={
            isSelf
              ? 'Keep work you respond to from the feed. What you keep says as much about you as what you make.'
              : 'What somebody keeps says as much about them as what they make.'
          }
          action={isSelf ? { label: 'Open the feed', to: '/feed' } : undefined}
        />
      ) : (
        <View className="flex-row flex-wrap gap-2 px-5 pt-4">
          {showAllKept ? (
            <CollectionCard
              name="All kept"
              count={allKept.total}
              isPrivate
              urls={allKept.entries.slice(0, 4).map((entry) => entry.url)}
              size={shelfSize}
              onPress={() => router.push('/shelf/all')}
            />
          ) : null}
          {taste.shelves.map((shelf) => (
            <CollectionCard
              key={shelf.id}
              name={shelf.name}
              count={shelf.count}
              isPrivate={!shelf.isPublic}
              // An API that predates the mosaic sends the one cover.
              urls={
                shelf.coverUrls?.length ? shelf.coverUrls : shelf.coverUrl ? [shelf.coverUrl] : []
              }
              size={shelfSize}
              onPress={() =>
                // Somebody else's shelf has to be read through the public
                // route: the default is your own, and asking /me/shelves for a
                // shelf that is not yours answers 404 — every shelf on every
                // other profile opened as "no longer available".
                router.push({
                  pathname: '/shelf/[id]',
                  params: isSelf
                    ? { id: shelf.id, name: shelf.name }
                    : { id: shelf.id, name: shelf.name, own: '0' },
                })
              }
            />
          ))}
        </View>
      )}

      <ShowcasePostSheet showcaseId={openWork} onClose={() => setOpenWork(null)} />
    </View>
  );
}

/** A shelf, or All kept: its mosaic, its name, how much is on it. */
function CollectionCard({
  name,
  count,
  isPrivate,
  urls,
  size,
  onPress,
}: {
  name: string;
  count: number;
  isPrivate: boolean;
  urls: string[];
  size: number;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${count} kept${isPrivate ? ', private' : ''}`}
      className="active:opacity-80"
      style={{ width: size }}
    >
      <ShelfMosaic urls={urls} size={size} />
      <Text className="text-foreground text-[12px] font-bold mt-1.5" numberOfLines={1}>
        {name}
      </Text>
      <Text className="text-muted-foreground text-[10.5px]">
        {count} kept{isPrivate ? ' · Private' : ''}
      </Text>
    </Pressable>
  );
}

/**
 * A shelf's cover: the newest four things kept on it, two by two. Fewer fill
 * the square differently — one whole, two side by side, three as one large
 * beside two small — so a shelf with three on it does not show a hole.
 */
function ShelfMosaic({ urls, size }: { urls: string[]; size: number }) {
  const half = (size - MOSAIC_GAP) / 2;
  const tile = (uri: string, width: number, height: number) => (
    <View key={uri} className="bg-muted" style={{ width, height }}>
      <RemoteImage source={{ uri }} style={{ width, height }} contentFit="cover" />
    </View>
  );

  let body: ReactNode;
  if (urls.length === 0) {
    body = (
      <View className="flex-1 items-center justify-center bg-muted">
        <BookmarkIcon size={20} className="text-muted-foreground" />
      </View>
    );
  } else if (urls.length === 1) {
    body = tile(urls[0], size, size);
  } else if (urls.length === 2) {
    body = (
      <View className="flex-row" style={{ gap: MOSAIC_GAP }}>
        {tile(urls[0], half, size)}
        {tile(urls[1], half, size)}
      </View>
    );
  } else if (urls.length === 3) {
    body = (
      <View className="flex-row" style={{ gap: MOSAIC_GAP }}>
        {tile(urls[0], half, size)}
        <View style={{ gap: MOSAIC_GAP }}>
          {tile(urls[1], half, half)}
          {tile(urls[2], half, half)}
        </View>
      </View>
    );
  } else {
    body = (
      <View className="flex-row flex-wrap" style={{ gap: MOSAIC_GAP }}>
        {urls.slice(0, 4).map((uri) => tile(uri, half, half))}
      </View>
    );
  }

  return (
    <View
      className="rounded-xl overflow-hidden bg-background"
      style={{ width: size, height: size }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {body}
    </View>
  );
}

function Spinner({ colour }: { colour: string }) {
  return (
    <View className="py-10 items-center">
      <ActivityIndicator color={colour} />
    </View>
  );
}

function Empty({
  icon,
  title,
  body,
  action,
}: {
  icon: 'work' | 'taste';
  title: string;
  body: string;
  action?: { label: string; to: string };
}) {
  const Icon = icon === 'work' ? ImageIcon : BookmarkIcon;
  return (
    <View className="items-center px-8 py-10">
      <View className="w-16 h-16 rounded-full bg-primary/10 items-center justify-center mb-4">
        <Icon size={24} className="text-primary" />
      </View>
      <Text className="text-foreground text-[15px] font-bold text-center">{title}</Text>
      <Text className="text-muted-foreground text-[13px] text-center mt-2 leading-5">{body}</Text>
      {action && (
        <Pressable
          onPress={() => router.push(action.to)}
          accessibilityRole="button"
          className="mt-5 min-h-11 bg-action rounded-xl px-6 items-center justify-center active:scale-[0.98]"
        >
          <Text className="text-action-foreground text-[13px] font-bold">{action.label}</Text>
        </Pressable>
      )}
    </View>
  );
}

/** Only drawn on your own work, and only when it is not out for everyone. */
function StatusBadge({ status }: { status: ShowcaseStatus }) {
  if (status === 'live') return null;
  // Never posted and taken down are the same thing to the person looking:
  // only they can see it, until they make it public.
  const label = status === 'removed' ? 'Removed by Virgo' : 'Private';
  return (
    <View
      className={`absolute left-1.5 bottom-1.5 rounded-full px-2 py-0.5 ${status === 'removed' ? 'bg-destructive' : 'bg-foreground/70'}`}
    >
      <Text
        className={`text-[10px] font-bold ${status === 'removed' ? 'text-destructive-foreground' : 'text-background'}`}
      >
        {label}
      </Text>
    </View>
  );
}

/** A work card's picture, with its thumbnail under a display copy while that loads. */
function WorkCardStill({ piece, width }: { piece: ShowcasePiece | undefined; width: number }) {
  const uri = cardStill(piece, width);
  const thumbnail = piece?.url;
  return (
    <RemoteImage
      source={{ uri }}
      placeholder={
        thumbnail && uri !== thumbnail
          ? { uri: thumbnail, cacheKey: stableCacheKey(thumbnail) }
          : undefined
      }
      placeholderContentFit="cover"
      style={{ width: '100%', height: CARD_HEIGHT }}
      contentFit="cover"
    />
  );
}
