import type { ReactNode } from 'react';
import { View } from 'react-native';
import { BookmarkIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { RemoteImage } from '@/components/RemoteImage';
import type { ShelfSummary } from '@/src/api';

cssInterop(BookmarkIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

/** Between the tiles of a mosaic cover. */
const MOSAIC_GAP = 2;

/**
 * The stills for a shelf's cover, newest kept first. An API that predates the
 * mosaic sends the one cover, and a shelf with nothing on it sends none.
 */
export function shelfCoverUrls(shelf: Pick<ShelfSummary, 'coverUrl' | 'coverUrls'>): string[] {
  if (shelf.coverUrls?.length) return shelf.coverUrls;
  return shelf.coverUrl ? [shelf.coverUrl] : [];
}

/**
 * A shelf's cover: the newest four things kept on it, two by two. Fewer fill
 * the square differently — one whole, two side by side, three as one large
 * beside two small — so a shelf with three on it does not show a hole. An
 * empty shelf is a bookmark on a quiet tile.
 *
 * One drawing for every size it is shown at: the 48 point cover of a row in
 * the Keep sheet, the 72 point one on All kept, and the half-screen square of
 * a shelf under Taste.
 */
export function ShelfMosaic({
  urls,
  size,
  radius = 20,
}: {
  urls: string[];
  size: number;
  radius?: number;
}) {
  const half = (size - MOSAIC_GAP) / 2;
  const tile = (uri: string, index: number, width: number, height: number) => (
    // By place, not by address: two things kept from one post can share a still.
    <View key={index} className="bg-muted" style={{ width, height }}>
      <RemoteImage source={{ uri }} style={{ width, height }} contentFit="cover" />
    </View>
  );

  let body: ReactNode;
  if (urls.length === 0) {
    body = (
      <View className="flex-1 items-center justify-center bg-muted">
        <BookmarkIcon size={size < 64 ? 18 : 22} className="text-muted-foreground" />
      </View>
    );
  } else if (urls.length === 1) {
    body = tile(urls[0], 0, size, size);
  } else if (urls.length === 2) {
    body = (
      <View className="flex-row" style={{ gap: MOSAIC_GAP }}>
        {tile(urls[0], 0, half, size)}
        {tile(urls[1], 1, half, size)}
      </View>
    );
  } else if (urls.length === 3) {
    body = (
      <View className="flex-row" style={{ gap: MOSAIC_GAP }}>
        {tile(urls[0], 0, half, size)}
        <View style={{ gap: MOSAIC_GAP }}>
          {tile(urls[1], 1, half, half)}
          {tile(urls[2], 2, half, half)}
        </View>
      </View>
    );
  } else {
    body = (
      <View className="flex-row flex-wrap" style={{ gap: MOSAIC_GAP }}>
        {urls.slice(0, 4).map((uri, index) => tile(uri, index, half, half))}
      </View>
    );
  }

  return (
    <View
      className="overflow-hidden bg-background"
      style={{ width: size, height: size, borderRadius: radius }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {body}
    </View>
  );
}
