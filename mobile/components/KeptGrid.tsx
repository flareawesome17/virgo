import { useCallback, useState, type ReactElement } from 'react';
import { FlatList, Pressable, RefreshControl, useWindowDimensions } from 'react-native';
import { RemoteImage } from '@/components/RemoteImage';
import { ShowcasePostSheet } from '@/components/ShowcasePostSheet';
import { useTheme } from '@/src/hooks';
import { makerOf, type ShelfEntry } from '@/src/api';
import { PALETTES } from '@/theme';

/** Between tiles: enough to tell one from the next, no more. */
const GAP = 1.5;
/** A tile is upright, 4:5: most of what is kept is a portrait photograph. */
const TILE_ASPECT = 5 / 4;

/**
 * What is on a shelf, three across in upright tiles, the way a saved
 * collection is laid out everywhere else: many at a glance, each one a tap
 * from the whole post.
 *
 * A tile is a thumbnail and is cropped like one; the post it opens, in a
 * sheet over the grid, is the work whole, with whoever made it credited at
 * the top and the keeper's note above that. It was one full-width picture
 * after another, two to a screen, cropped to a band 200 points tall.
 *
 * A tile carries no film or set mark: an entry says neither whether it is a
 * film nor how many pieces it has.
 *
 * `onRemove` takes a post off the shelf from the sheet — for your own shelves
 * only, and the way to clear a tile whose post has gone.
 */
export function KeptGrid({
  entries,
  onRemove,
  removeLabel,
  onRefresh,
  header,
  postTitle,
  noteLabel,
}: {
  entries: ShelfEntry[];
  onRemove?: (showcaseId: string) => Promise<unknown>;
  removeLabel?: string;
  onRefresh?: () => Promise<unknown>;
  header?: ReactElement;
  /** What the opened post is titled ("From your shelf"); its own title without one. */
  postTitle?: string;
  /** What the keeper's note is called on the opened post. */
  noteLabel?: string;
}) {
  const { width } = useWindowDimensions();
  const tile = (width - GAP * 2) / 3;
  const tileHeight = Math.round(tile * TILE_ASPECT);
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  const [open, setOpen] = useState<ShelfEntry | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    if (!onRefresh) return;
    setRefreshing(true);
    await onRefresh().catch(() => undefined);
    setRefreshing(false);
  }, [onRefresh]);

  const renderItem = useCallback(
    ({ item: entry }: { item: ShelfEntry }) => (
      <Pressable
        onPress={() => setOpen(entry)}
        accessibilityRole="button"
        accessibilityLabel={`${entry.title ?? 'A showcase'} by ${makerOf(entry).displayName}. Open the post.`}
        className="bg-muted active:opacity-80"
        style={{ width: tile, height: tileHeight }}
      >
        <RemoteImage
          source={{ uri: entry.url }}
          style={{ width: tile, height: tileHeight }}
          contentFit="cover"
          recyclingKey={entry.showcaseId}
        />
      </Pressable>
    ),
    [tile, tileHeight],
  );

  return (
    <>
      <FlatList
        data={entries}
        keyExtractor={(entry) => entry.showcaseId}
        numColumns={3}
        renderItem={renderItem}
        columnWrapperStyle={{ gap: GAP }}
        contentContainerStyle={{ gap: GAP, paddingBottom: 60 }}
        ListHeaderComponent={header}
        initialNumToRender={18}
        windowSize={7}
        showsVerticalScrollIndicator={false}
        refreshControl={
          onRefresh ? (
            <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={palette.primary} />
          ) : undefined
        }
      />
      <ShowcasePostSheet
        showcaseId={open?.showcaseId ?? null}
        note={open?.note}
        title={postTitle}
        noteLabel={noteLabel}
        onClose={() => setOpen(null)}
        onRemove={onRemove}
        removeLabel={removeLabel}
      />
    </>
  );
}
