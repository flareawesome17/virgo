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
 * How far a feed card bends to a piece's shape before it stops: no taller than
 * a phone's 9:16 frame, no wider than 3:1. Between the two a card is exactly
 * the cover's shape, so nothing is cut off; past either end the piece is shown
 * whole inside a frame of that limit, letterboxed, so one panorama does not
 * become a strip and one tall screenshot does not become a wall.
 *
 * The feed used to clamp to 4:5–1.91:1 and crop to fit — a portrait taken on a
 * phone lost a third of itself, which is the part photographers notice first.
 */
export const FEED_TALLEST = 9 / 16;
export const FEED_WIDEST = 3;
/** For a piece whose size is not known: the feed's default portrait shape. */
const DEFAULT_ASPECT = 4 / 5;

/** The piece's own shape, for the post, where nothing is cropped. */
export function naturalAspect(piece: ShowcasePiece | undefined): number {
  return (piece && pieceAspect(piece)) ?? DEFAULT_ASPECT;
}

/**
 * The shape of a card's frame: the cover's own, within FEED_TALLEST and
 * FEED_WIDEST. A set keeps this one frame for every piece in it, so the card
 * does not change height under the thumb as it is swiped.
 */
export function feedFrameAspect(cover: ShowcasePiece | undefined): number {
  return Math.min(FEED_WIDEST, Math.max(FEED_TALLEST, naturalAspect(cover)));
}

/**
 * How a piece sits in a frame: filling it when it is the frame's shape, and
 * whole inside it otherwise — never cropped. A piece whose size is not known
 * is drawn whole too, since there is no telling what filling would cut off.
 *
 * Within a hair of the frame counts as its shape: the frame's height is
 * rounded to a point, and drawing such a piece "whole" left a one-pixel line
 * along an edge.
 */
export function fitIn(piece: ShowcasePiece, frameAspect: number): 'cover' | 'contain' {
  const own = pieceAspect(piece);
  return own && Math.abs(own - frameAspect) / frameAspect < 0.01 ? 'cover' : 'contain';
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
 * One frame for the whole set, shaped by the cover, the way the big feeds do
 * it: the card does not change height under the thumb as it swipes. The
 * pieces that are not the cover's shape are drawn whole inside it (see fitIn)
 * — the caller decides that per page, since it is the caller that draws them.
 *
 * `overlay` is drawn over the frame, above every page and the count: the
 * heart a double tap leaves, or a badge saying a post is private.
 */
export function PieceCarousel({
  pieces,
  width,
  height,
  renderPage,
  onIndexChange,
  overlay,
}: {
  pieces: ShowcasePiece[];
  width: number;
  height: number;
  /** Draws one page; `current` is whether it is the page showing. */
  renderPage: (piece: ShowcasePiece, index: number, current: boolean) => ReactNode;
  onIndexChange?: (index: number) => void;
  overlay?: ReactNode;
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
    return (
      <View style={{ width, height }}>
        {renderPage(pieces[0], 0, true)}
        {overlay}
      </View>
    );
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
          // A set is at most twenty, and its pages are a screen wide: two
          // either side is enough to swipe without a blank.
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
        {overlay}
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
