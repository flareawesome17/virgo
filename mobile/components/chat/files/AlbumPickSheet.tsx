import { useEffect, useMemo } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { ImagesIcon, XIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { describeAlbumCount, type Album } from '@/src/api';
import { useInfiniteAlbums, useTheme } from '@/src/hooks';
import { BottomSheet } from '@/components/BottomSheet';
import { RemoteImage } from '@/components/RemoteImage';
import { PALETTES } from '@/theme';

for (const Icon of [ImagesIcon, XIcon]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/** What the server lets add files: the owner, and upload or manage access. */
function canUploadTo(album: Album): boolean {
  const access = album.my_access;
  return access === undefined || access === 'owner' || access === 'upload' || access === 'manage';
}

/**
 * Add to album, from a chat photo or file: your albums you can add to, and
 * one tap files a copy into it. The copy is made on the server and counts in
 * that album, like an upload.
 */
export function AlbumPickSheet({
  visible,
  busyId,
  onClose,
  onPick,
}: {
  visible: boolean;
  /** The album being added to, while it is. */
  busyId: string | null;
  onClose: () => void;
  onPick: (album: Album) => void;
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose} dismissible={!busyId}>
      {visible ? <AlbumList busyId={busyId} onClose={onClose} onPick={onPick} /> : null}
    </BottomSheet>
  );
}

function AlbumList({
  busyId,
  onClose,
  onPick,
}: {
  busyId: string | null;
  onClose: () => void;
  onPick: (album: Album) => void;
}) {
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  const query = useInfiniteAlbums({ orderBy: 'updated_at', direction: 'desc' });
  const { albums: listed, isLoading, loadFailed, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = query;
  const albums = useMemo(() => listed.filter(canUploadTo), [listed]);

  // A page with none you can add to is not the end of the list.
  const searching = albums.length === 0 && !!hasNextPage && !loadFailed;
  useEffect(() => {
    if (searching && !isFetchingNextPage) void fetchNextPage();
  }, [searching, isFetchingNextPage, fetchNextPage]);

  let body;
  if (albums.length === 0 && (isLoading || searching)) {
    body = (
      <View className="py-10 items-center">
        <ActivityIndicator size="small" color={palette.primary} />
      </View>
    );
  } else if (albums.length === 0 && loadFailed) {
    body = (
      <Pressable onPress={() => void refetch()} accessibilityRole="button" className="px-5 py-8 active:opacity-60">
        <Text className="text-muted-foreground text-[15px] text-center">
          {"Couldn't load your albums. Tap to try again."}
        </Text>
      </Pressable>
    );
  } else if (albums.length === 0) {
    body = (
      <Text className="px-5 py-8 text-muted-foreground text-[15px] text-center">
        No albums you can add to yet. Make one, then add photos to it from here.
      </Text>
    );
  } else {
    body = (
      <ScrollView style={{ flexShrink: 1 }}>
        {albums.map((album) => {
          const counts = album.counts ? describeAlbumCount(album.counts) : `${album.item_count} files`;
          const busy = busyId === album.id;
          return (
            <Pressable
              key={album.id}
              onPress={() => onPick(album)}
              disabled={!!busyId}
              accessibilityRole="button"
              accessibilityLabel={`${album.name}, ${counts}`}
              accessibilityHint="Adds a copy here"
              className={`min-h-[64px] px-5 py-2 flex-row items-center gap-3 active:bg-muted/60 ${busyId && !busy ? 'opacity-50' : ''}`}
            >
              <View className="w-12 h-12 rounded-xl bg-muted overflow-hidden items-center justify-center">
                {album.cover_url ? (
                  <RemoteImage source={{ uri: album.cover_url }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                ) : (
                  <ImagesIcon size={18} className="text-muted-foreground" />
                )}
              </View>
              <View className="flex-1 min-w-0">
                <Text className="text-foreground text-[15px] leading-5 font-semibold" numberOfLines={1}>
                  {album.name}
                </Text>
                <Text className="text-muted-foreground text-[13px] leading-[18px]" numberOfLines={1}>
                  {counts}
                </Text>
              </View>
              {busy ? <ActivityIndicator size="small" color={palette.primary} /> : null}
            </Pressable>
          );
        })}
        {isFetchingNextPage ? (
          <View className="py-3 items-center">
            <ActivityIndicator size="small" color={palette.primary} />
          </View>
        ) : hasNextPage ? (
          <Pressable onPress={() => void fetchNextPage()} accessibilityRole="button" className="py-3 items-center active:opacity-60">
            <Text className="text-primary text-[14px] font-semibold">Show more albums</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    );
  }

  return (
    <View style={{ flexShrink: 1 }}>
      <View className="flex-row items-center pl-5 pr-2">
        <Text className="flex-1 text-foreground text-[17px] leading-6 font-bold" accessibilityRole="header">
          Add to album
        </Text>
        <Pressable
          onPress={onClose}
          disabled={!!busyId}
          accessibilityRole="button"
          accessibilityLabel="Close"
          className="w-11 h-11 items-center justify-center active:opacity-60"
        >
          <XIcon size={18} className="text-secondary-foreground" />
        </Pressable>
      </View>
      <Text className="px-5 pb-2 text-muted-foreground text-[13px] leading-[18px]">
        A copy goes into the album and counts there, like an upload.
      </Text>
      {body}
    </View>
  );
}
