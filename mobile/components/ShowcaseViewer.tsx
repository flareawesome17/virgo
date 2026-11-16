import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Modal,
  PixelRatio,
  Pressable,
  StatusBar,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useWindowInsets } from '@/src/lib/window-insets';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { XIcon } from 'lucide-react-native';
import { RemoteImage } from '@/components/RemoteImage';
import { ShowcaseFilm } from '@/components/ShowcaseFilm';
import { naturalAspect } from '@/components/ShowcaseMedia';
import { pieceSource, type ShowcasePiece } from '@/src/api';

const SPRING = { damping: 22, stiffness: 220 };
const MAX_SCALE = 4;
/** Vertical travel that commits to closing. Below it, the photo springs back. */
const DISMISS_AT = 130;

/**
 * One photograph, zoomable: pinch, double tap, pan while zoomed, and drag
 * down to close.
 *
 * The same gestures as the album viewer's, for a piece of a showcase rather
 * than a stored file. Every piece on a post was cropped to one shape and could
 * not be looked at closely at all.
 */
function ZoomablePiece({
  piece,
  width,
  height,
  onZoomChange,
  onDismiss,
}: {
  piece: ShowcasePiece;
  width: number;
  height: number;
  onZoomChange: (zoomed: boolean) => void;
  onDismiss: () => void;
}) {
  const scale = useSharedValue(1);
  const startScale = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const dismissY = useSharedValue(0);

  const reset = () => {
    'worklet';
    scale.value = withSpring(1, SPRING);
    x.value = withSpring(0, SPRING);
    y.value = withSpring(0, SPRING);
  };

  const pinch = Gesture.Pinch()
    .onStart(() => {
      startScale.value = scale.value;
    })
    .onUpdate((event) => {
      scale.value = Math.max(1, Math.min(MAX_SCALE, startScale.value * event.scale));
    })
    .onEnd(() => {
      if (scale.value < 1.05) {
        reset();
        runOnJS(onZoomChange)(false);
      } else {
        runOnJS(onZoomChange)(true);
      }
    });

  /** Only while zoomed. Unzoomed sideways drags belong to the pager. */
  const panZoomed = Gesture.Pan()
    .minDistance(2)
    .onStart(() => {
      startX.value = x.value;
      startY.value = y.value;
    })
    .onUpdate((event) => {
      if (scale.value <= 1.01) return;
      const maxX = (width * (scale.value - 1)) / 2;
      const maxY = (height * (scale.value - 1)) / 2;
      x.value = Math.max(-maxX, Math.min(maxX, startX.value + event.translationX));
      y.value = Math.max(-maxY, Math.min(maxY, startY.value + event.translationY));
    });

  const dragToDismiss = Gesture.Pan()
    .activeOffsetY([-14, 14])
    .failOffsetX([-18, 18])
    .onUpdate((event) => {
      if (scale.value > 1.01) return;
      dismissY.value = event.translationY;
    })
    .onEnd((event) => {
      if (scale.value > 1.01) return;
      if (Math.abs(event.translationY) > DISMISS_AT || Math.abs(event.velocityY) > 900) {
        const direction = event.translationY < 0 ? -1 : 1;
        dismissY.value = withTiming(direction * height, { duration: 200 });
        runOnJS(onDismiss)();
      } else {
        dismissY.value = withSpring(0, SPRING);
      }
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > 1.01) {
        reset();
        runOnJS(onZoomChange)(false);
      } else {
        scale.value = withSpring(2.4, SPRING);
        runOnJS(onZoomChange)(true);
      }
    });

  const gesture = Gesture.Simultaneous(pinch, Gesture.Race(panZoomed, dragToDismiss), doubleTap);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: x.value },
      { translateY: y.value + dismissY.value },
      {
        scale:
          scale.value * interpolate(Math.abs(dismissY.value), [0, 260], [1, 0.82], 'clamp'),
      },
    ] as const,
  }));

  // The widest copy there is: this is where somebody looks closely.
  const uri = pieceSource(piece, Math.round(width * PixelRatio.get() * 2));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={{ width, height }} className="items-center justify-center">
        <Animated.View style={[{ width, height }, style]}>
          <RemoteImage
            source={{ uri }}
            placeholder={uri !== piece.url ? { uri: piece.url } : undefined}
            placeholderContentFit="contain"
            style={{ width: '100%', height: '100%' }}
            contentFit="contain"
            transition={120}
            recyclingKey={piece.fileKey}
            accessibilityLabel="Photograph. Pinch or double tap to zoom."
          />
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}

/**
 * A showcase's pieces, full screen: swipe between them, pinch to look closer,
 * drag down or tap the cross to go back.
 *
 * Whoever opens it may say what the post is (its title, who made it, how it
 * was made) and that is written along the bottom. Without them the photograph
 * has the bottom to itself. There is no heart, thread or bookmark in here:
 * those belong to the card, and the viewer is only handed the pieces.
 */
export function ShowcaseViewer({
  pieces,
  startIndex,
  visible,
  onClose,
  title,
  makerName,
  craftTags,
}: {
  pieces: ShowcasePiece[];
  startIndex: number;
  visible: boolean;
  onClose: () => void;
  /** The post's title, along the bottom. */
  title?: string | null;
  /** Who made it, under the title. */
  makerName?: string | null;
  /** How it was made. The first three are shown, after the maker's name. */
  craftTags?: string[] | null;
}) {
  const { width, height } = useWindowDimensions();
  // The window's: this covers the banners, which zero the top inset.
  const insets = useWindowInsets();
  const [index, setIndex] = useState(startIndex);
  const [zoomed, setZoomed] = useState(false);
  const pager = useRef<FlatList<ShowcasePiece>>(null);

  useEffect(() => {
    if (!visible) return;
    setIndex(startIndex);
    setZoomed(false);
    // Opened on the piece that was tapped. initialScrollIndex alone is not
    // always honoured inside a Modal, which opened on the first piece while
    // the count said otherwise.
    const timer = setTimeout(
      () => pager.current?.scrollToOffset({ offset: startIndex * width, animated: false }),
      0,
    );
    return () => clearTimeout(timer);
  }, [visible, startIndex, width]);

  const onScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) =>
      setIndex(Math.round(e.nativeEvent.contentOffset.x / width)),
    [width],
  );

  const many = pieces.length > 1;
  const credit = [makerName, ...(craftTags ?? []).slice(0, 3)].filter(Boolean).join(' · ');
  const words = Boolean(title || credit);
  // A magnified photograph is being looked at closely, so everything written
  // over it steps aside. The cross stays: it is the way out. A film has its
  // own controls along the bottom, and nothing is laid over those either.
  const chrome = !zoomed;
  const bottom = chrome && pieces[index]?.kind !== 'video' && (words || many);

  return (
    <Modal
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
      supportedOrientations={['portrait', 'landscape']}
    >
      <StatusBar barStyle="light-content" />
      {/* A Modal draws outside the app's gesture root, so it needs its own. */}
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#000' }}>
        <FlatList
          ref={pager}
          data={pieces}
          keyExtractor={(piece) => piece.fileKey}
          horizontal
          pagingEnabled
          // While a photograph is magnified, a sideways drag pans it rather
          // than paging away from it.
          scrollEnabled={!zoomed}
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={Math.min(startIndex, Math.max(0, pieces.length - 1))}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          onScroll={onScrollEnd}
          scrollEventThrottle={32}
          renderItem={({ item, index: i }) => {
            if (item.kind === 'video') {
              const aspect = naturalAspect(item);
              const w = Math.min(width, height * aspect);
              return (
                <View style={{ width, height }} className="items-center justify-center">
                  <ShowcaseFilm
                    piece={item}
                    width={w}
                    height={Math.round(w / aspect)}
                    active={visible && i === index}
                  />
                </View>
              );
            }
            return (
              <ZoomablePiece
                piece={item}
                width={width}
                height={height}
                onZoomChange={setZoomed}
                onDismiss={onClose}
              />
            );
          }}
        />

        {chrome ? (
          <LinearGradient
            colors={['rgba(0,0,0,0.6)', 'rgba(0,0,0,0)']}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, height: insets.top + 76 }}
            pointerEvents="none"
          />
        ) : null}

        {chrome && many ? (
          <View
            className="absolute left-0 right-0 h-10 items-center justify-center"
            style={{ top: insets.top + 4 }}
            pointerEvents="none"
          >
            <Text className="text-[15px] leading-5 font-semibold" style={{ color: '#FFFFFF' }}>
              {index + 1} of {pieces.length}
            </Text>
          </View>
        ) : null}

        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
          // A 40 pt disc in a 44 pt target.
          hitSlop={4}
          className="absolute w-10 h-10 rounded-full items-center justify-center active:opacity-70"
          style={{ top: insets.top + 4, left: 12, backgroundColor: 'rgba(20,16,13,0.55)' }}
        >
          <XIcon size={20} color="#FFFFFF" />
        </Pressable>

        {bottom ? (
          <LinearGradient
            colors={
              words
                ? ['rgba(0,0,0,0)', 'rgba(0,0,0,0.8)', 'rgba(0,0,0,0.8)']
                : ['rgba(0,0,0,0)', 'rgba(0,0,0,0.5)', 'rgba(0,0,0,0.5)']
            }
            locations={[0, 0.45, 1]}
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              paddingTop: 60,
              paddingHorizontal: 20,
              paddingBottom: Math.max(insets.bottom, 12) + 12,
              gap: 12,
            }}
            pointerEvents="none"
          >
            {words ? (
              <View>
                {title ? (
                  <Text
                    className="text-[15px] leading-5 font-semibold"
                    style={{ color: '#FFFFFF' }}
                    numberOfLines={2}
                  >
                    {title}
                  </Text>
                ) : null}
                {credit ? (
                  <Text
                    className="text-[13px] leading-[18px]"
                    style={{ color: 'rgba(255,255,255,0.7)' }}
                    numberOfLines={1}
                  >
                    {credit}
                  </Text>
                ) : null}
              </View>
            ) : null}
            {many ? (
              <View className="flex-row justify-center" style={{ gap: 5 }}>
                {pieces.map((piece, i) => (
                  <View
                    key={piece.fileKey}
                    style={{
                      width: i === index ? 16 : 6,
                      height: 6,
                      borderRadius: 3,
                      backgroundColor: i === index ? '#FFFFFF' : 'rgba(255,255,255,0.45)',
                    }}
                  />
                ))}
              </View>
            ) : null}
          </LinearGradient>
        ) : null}
      </GestureHandlerRootView>
    </Modal>
  );
}
