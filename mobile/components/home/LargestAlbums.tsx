import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { formatBytes } from '@/src/api';

/** An album and what it takes up, from the storage breakdown. */
export interface AlbumSize {
  albumId: string;
  name: string;
  bytes: number;
}

/**
 * The albums taking the most storage, each as a bar against the largest.
 *
 * Where to look first when storage fills up: the breakdown on Settings →
 * Storage listed every album, three screens away from the Dashboard that says
 * storage is nearly full. Files in no album are left out here; Storage has
 * its own row for those.
 */
export function LargestAlbums({ albums }: { albums: AlbumSize[] }) {
  const largest = Math.max(1, ...albums.map((a) => a.bytes));
  return (
    <View className="bg-card rounded-2xl border border-border/40 px-4 py-1.5">
      {albums.map((album) => (
        <Pressable
          key={album.albumId}
          onPress={() => router.push(`/albums/${album.albumId}`)}
          accessibilityRole="button"
          accessibilityLabel={`${album.name}, ${formatBytes(album.bytes)}`}
          className="flex-row items-center gap-3 min-h-11 py-2 active:opacity-70"
        >
          <Text className="text-foreground text-sm font-medium" numberOfLines={1} style={{ width: '36%' }}>
            {album.name}
          </Text>
          <View className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
            <View
              className="h-full rounded-full bg-primary"
              style={{ width: `${Math.max((album.bytes / largest) * 100, 2)}%` }}
            />
          </View>
          <Text className="text-muted-foreground text-xs text-right" style={{ width: 58 }}>
            {formatBytes(album.bytes)}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
