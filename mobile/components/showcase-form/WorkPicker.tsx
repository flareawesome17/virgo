import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { RemoteImage } from '@/components/RemoteImage';
import { VideoThumbnail } from '@/components/VideoThumbnail';
import { LoadFailed } from '@/components/LoadFailed';
import { kindOf, useTheme } from '@/src/hooks';
import type { StoredFile } from '@/src/api';
import { PALETTES } from '@/theme';
import { FilmMark, type PieceKind } from './parts';

/** Between tiles: a hairline, so the grid reads as one sheet of work. */
const GRID_GAP = 1.5;

/** A tile's still: the thumbnail, never the original. None for a film with no poster. */
export function stillOf(file: StoredFile): string | undefined {
  return (
    (kindOf(file.contentType) === 'video' ? file.posterUrl : (file.thumbnailUrl ?? file.url)) ??
    undefined
  );
}

/**
 * The library to choose from: the albums as pills, and their work three
 * across, edge to edge, virtualised. It was every file drawn at once, from its
 * full-size original.
 *
 * `header` is what the form says above it (what is chosen, and anything wrong
 * with it), so it scrolls away with the grid rather than pinning a third of
 * the screen.
 */
export function WorkPicker({
  header,
  albums,
  albumId,
  onAlbum,
  files,
  state,
  hasMore,
  loadingMore,
  onMore,
  onRetry,
  onUpload,
  picked,
  hasFilm,
  filmAlone,
  noMixing,
  onToggle,
}: {
  header: ReactNode;
  albums: { id: string; name: string }[];
  /** Undefined is everything. */
  albumId: string | undefined;
  onAlbum: (id: string | undefined) => void;
  files: StoredFile[];
  state: 'loading' | 'failed' | 'ready';
  hasMore: boolean;
  loadingMore: boolean;
  onMore: () => void;
  onRetry: () => void;
  onUpload: () => void;
  picked: string[];
  hasFilm: boolean;
  /** Said to a screen reader on a tile the rule has dimmed. */
  filmAlone: string;
  noMixing: string;
  onToggle: (file: StoredFile, still: string | undefined, kind: PieceKind) => void;
}) {
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  const { width } = useWindowDimensions();
  const tile = (width - GRID_GAP * 2) / 3;

  const top = (
    <View className="pt-4 pb-3 gap-3">
      {header}

      {/* Where to look. What is chosen stays chosen across albums. */}
      {albums.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}
        >
          {[{ id: undefined, name: 'All uploads' }, ...albums].map((album) => {
            const on = album.id === albumId;
            return (
              <Pressable
                key={album.id ?? 'all'}
                onPress={() => onAlbum(album.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                hitSlop={{ top: 4, bottom: 4 }}
                className={`h-9 px-3.5 rounded-full items-center justify-center active:opacity-80 ${on ? 'bg-foreground' : 'bg-muted'}`}
              >
                <Text
                  numberOfLines={1}
                  className={`text-[14px] ${on ? 'text-background font-semibold' : 'text-secondary-foreground font-medium'}`}
                  style={{ maxWidth: 180 }}
                >
                  {album.name}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </View>
  );

  const bottom = (
    <>
      {state === 'ready' && hasMore ? (
        <Pressable
          onPress={onMore}
          disabled={loadingMore}
          accessibilityRole="button"
          className="mx-5 mt-4 h-11 rounded-[14px] bg-muted items-center justify-center active:opacity-80"
        >
          {loadingMore ? (
            <ActivityIndicator color={palette.primary} />
          ) : (
            <Text className="text-foreground text-[15px] font-semibold">Show more</Text>
          )}
        </Pressable>
      ) : null}
      <View style={{ height: 24 }} />
    </>
  );

  return (
    <FlatList
      className="flex-1"
      data={state === 'ready' ? files : []}
      keyExtractor={(file) => file.key}
      numColumns={3}
      columnWrapperStyle={{ gap: GRID_GAP }}
      contentContainerStyle={{ gap: GRID_GAP }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      initialNumToRender={18}
      windowSize={7}
      ListHeaderComponent={top}
      ListFooterComponent={bottom}
      ListEmptyComponent={
        state === 'loading' ? (
          <View className="py-10 items-center">
            <ActivityIndicator color={palette.primary} />
          </View>
        ) : state === 'failed' ? (
          <View className="px-5">
            <LoadFailed what="your work" onRetry={onRetry} compact />
          </View>
        ) : albumId ? (
          <Text className="px-8 pt-4 text-muted-foreground text-[15px] leading-[22px] text-center">
            Nothing in this album can be posted yet. Photographs show here once they are
            uploaded, and films once their preview is ready.
          </Text>
        ) : (
          <View className="px-8 pt-4 items-center gap-4">
            <Text className="text-muted-foreground text-[15px] leading-[22px] text-center">
              Your photographs and films live in albums, and there are none here yet.
              Upload some first and they will show up here.
            </Text>
            <Pressable
              onPress={onUpload}
              accessibilityRole="button"
              className="h-11 bg-action rounded-[14px] px-5 items-center justify-center active:opacity-85"
            >
              <Text className="text-action-foreground text-[15px] font-semibold">Upload</Text>
            </Pressable>
          </View>
        )
      }
      renderItem={({ item: file }) => {
        const at = picked.indexOf(file.key);
        const on = at >= 0;
        const film = kindOf(file.contentType) === 'video';
        const still = stillOf(file);
        // Dimmed rather than hidden: still tappable, to say why and offer
        // the swap.
        const blocked = !on && (film ? picked.length > 0 : hasFilm);
        return (
          <Pressable
            onPress={() => onToggle(file, still, film ? 'video' : 'image')}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={
              on
                ? `Chosen, number ${at + 1}. Remove.`
                : film
                  ? `Choose this film${blocked ? `. ${filmAlone}` : ''}`
                  : `Choose this photograph${blocked ? `. ${noMixing}` : ''}`
            }
            style={{ width: tile, height: tile, overflow: 'hidden', opacity: blocked ? 0.4 : 1 }}
            className="bg-muted active:opacity-80"
          >
            {still ? (
              <RemoteImage source={{ uri: still }} style={{ flex: 1 }} recyclingKey={file.key} />
            ) : film ? (
              <View className="flex-1 items-center justify-center bg-secondary">
                <VideoThumbnail size={Math.round(tile * 0.5)} />
              </View>
            ) : null}
            {film ? <FilmMark durationMs={file.durationMs} /> : null}
            {on ? (
              <>
                {/* The ring is drawn over the photograph, inside the tile, so
                    choosing one does not move its neighbours. */}
                <View
                  pointerEvents="none"
                  className="absolute inset-0"
                  style={{ borderWidth: 3, borderColor: palette.action }}
                />
                <View
                  pointerEvents="none"
                  className="absolute right-1 top-1 h-7 min-w-7 px-1.5 rounded-full bg-action items-center justify-center"
                  style={{ borderWidth: 2, borderColor: '#FFFFFF' }}
                >
                  <Text className="text-[13px] font-bold" style={{ color: '#FFFFFF' }}>{at + 1}</Text>
                </View>
              </>
            ) : (
              <View
                pointerEvents="none"
                className="absolute right-1.5 top-1.5 w-6 h-6 rounded-full"
                style={{ borderWidth: 2, borderColor: '#FFFFFF', backgroundColor: 'rgba(20,16,13,0.25)' }}
              />
            )}
          </Pressable>
        );
      }}
    />
  );
}
