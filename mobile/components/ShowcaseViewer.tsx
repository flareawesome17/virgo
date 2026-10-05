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
 */
export function ShowcaseViewer({
  pieces,
  startIndex,
  visible,
  onClose,
}: {
  pieces: ShowcasePiece[];
  startIndex: number;
  visible: boolean;
  onClose: () => void;
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

        <View
          className="absolute left-0 right-0 flex-row items-center justify-between px-2"
          style={{ top: insets.top + 4 }}
          pointerEvents="box-none"
        >
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
            className="w-11 h-11 rounded-full items-center justify-center active:opacity-70"
            style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
          >
            <XIcon size={20} color="#FFFFFF" />
          </Pressable>
          {pieces.length > 1 && (
            <View className="rounded-full px-3 py-1.5 mr-1" style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}>
              <Text className="text-[12px] font-bold" style={{ color: '#FFFFFF' }}>
                {index + 1} of {pieces.length}
              </Text>
            </View>
          )}
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}
