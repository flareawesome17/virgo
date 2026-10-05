import { memo, useCallback, useRef, useState, type ReactNode } from 'react';
import {
  FlatList,
  PixelRatio,
  Pressable,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { RemoteImage } from '@/components/RemoteImage';
import { pieceAspect, pieceSource, type ShowcasePiece } from '@/src/api';

/**
 * The shapes a feed card may be: from a portrait 4:5 to a landscape 1.91:1,
 * the range the big feeds settled on. Inside it a piece is drawn at its own
 * proportions; outside it, cropped to the nearest end, so one panorama or one
 * tall phone frame does not turn the feed into a strip or a wall.
 *
 * Every card used to be the same 1:1.15 box, which cut close to half off a
 * 3:2 photograph and half off a 16:9 film.
 */
export const FEED_MIN_ASPECT = 4 / 5;
export const FEED_MAX_ASPECT = 1.91;
/** For a piece whose size is not known: the feed's default portrait shape. */
const DEFAULT_ASPECT = 4 / 5;

export function feedAspect(piece: ShowcasePiece | undefined): number {
  const aspect = (piece && pieceAspect(piece)) ?? DEFAULT_ASPECT;
  return Math.min(FEED_MAX_ASPECT, Math.max(FEED_MIN_ASPECT, aspect));
}

/** The piece's own shape, for the post, where nothing is cropped. */
export function naturalAspect(piece: ShowcasePiece | undefined): number {
  return (piece && pieceAspect(piece)) ?? DEFAULT_ASPECT;
}

/**
 * A photograph at the size it is drawn.
 *
 * The display copy that covers this many device pixels, with the thumbnail
 * (usually already cached from the feed) underneath while it loads.
 */
export const PieceImage = memo(function PieceImage({
  piece,
  width,
  height,
  contentFit = 'cover',
}: {
  piece: ShowcasePiece;
  width: number;
  height: number;
  contentFit?: 'cover' | 'contain';
}) {
  const uri = pieceSource(piece, Math.round(width * PixelRatio.get()));
  return (
    <RemoteImage
      source={{ uri }}
      placeholder={uri !== piece.url ? { uri: piece.url } : undefined}
      placeholderContentFit={contentFit}
      style={{ width, height }}
      contentFit={contentFit}
      transition={120}
      recyclingKey={piece.fileKey}
    />
  );
});

/** The count on a set, in a backing that reads on any photograph. */
export function PieceCount({ index, total }: { index: number; total: number }) {
  return (
    <View
      className="absolute right-3 top-3 rounded-full px-2.5 py-1"
      style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Text className="text-[11px] font-bold" style={{ color: '#FFFFFF' }}>
        {index + 1}/{total}
      </Text>
    </View>
  );
}

function Dots({ index, total }: { index: number; total: number }) {
  if (total < 2) return null;
  return (
    <View className="flex-row justify-center gap-1.5 pt-2.5" pointerEvents="none">
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          className={`rounded-full ${i === index ? 'bg-primary' : 'bg-muted-foreground/35'}`}
          style={{ width: 6, height: 6 }}
        />
      ))}
    </View>
  );
}

/**
 * Every piece of a set, side by side, swiped through.
 *
 * A set of ten showed its cover and a "10" badge, and the other nine only on
 * the post. One frame for the whole set, shaped by the cover, the way the big
 * feeds do it: the card does not change height under the thumb as it swipes.
 */
export function PieceCarousel({
  pieces,
  width,
  height,
  renderPage,
  onIndexChange,
}: {
  pieces: ShowcasePiece[];
  width: number;
  height: number;
  /** Draws one page; `current` is whether it is the page showing. */
  renderPage: (piece: ShowcasePiece, index: number, current: boolean) => ReactNode;
  onIndexChange?: (index: number) => void;
}) {
  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);

  // From the offset as it moves, so the count follows the swipe rather than
  // waiting for it to settle.
  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const next = Math.round(e.nativeEvent.contentOffset.x / width);
      if (next === indexRef.current) return;
      indexRef.current = next;
      setIndex(next);
      onIndexChange?.(next);
    },
    [width, onIndexChange],
  );

  if (pieces.length === 1) {
    return <View style={{ width, height }}>{renderPage(pieces[0], 0, true)}</View>;
  }

  return (
    <View>
      <View style={{ width, height }}>
        <FlatList
          data={pieces}
          keyExtractor={(piece) => piece.fileKey}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          // A set is at most ten, and its pages are a screen wide: two either
          // side is enough to swipe without a blank.
          initialNumToRender={2}
          windowSize={3}
          onScroll={onScroll}
          scrollEventThrottle={32}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          renderItem={({ item, index: i }) => (
            <View style={{ width, height }}>{renderPage(item, i, i === index)}</View>
          )}
          accessibilityLabel={`${pieces.length} pieces. Swipe to see the next.`}
        />
        <PieceCount index={index} total={pieces.length} />
      </View>
      <Dots index={index} total={pieces.length} />
    </View>
  );
}

/** A photograph that opens something when tapped, with a pressed state. */
export function PressablePiece({
  piece,
  width,
  height,
  onPress,
  label,
  contentFit,
}: {
  piece: ShowcasePiece;
  width: number;
  height: number;
  onPress: () => void;
  label: string;
  contentFit?: 'cover' | 'contain';
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="bg-muted active:opacity-90"
      style={{ width, height }}
    >
      <PieceImage piece={piece} width={width} height={height} contentFit={contentFit} />
    </Pressable>
  );
}
