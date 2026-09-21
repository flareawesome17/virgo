import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  Share,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { RemoteImage } from '@/components/RemoteImage';
import { LinearGradient } from 'expo-linear-gradient';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import {
  DownloadIcon,
  InfoIcon,
  Share2Icon,
  Trash2Icon,
  XIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { useQueryClient } from '@tanstack/react-query';
import { useAlbumFiles } from '@/src/hooks';
import {
  formatBytes,
  largestDisplaySource,
  storageApi,
  type StoredFile,
} from '@/src/api';

for (const Icon of [DownloadIcon, InfoIcon, Share2Icon, Trash2Icon, XIcon]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

const SPRING = { damping: 22, stiffness: 220 };
const MAX_SCALE = 4;
/** Vertical travel that commits to closing. Below it, the photo springs back. */
const DISMISS_AT = 130;
const THUMB = 46;

/**
 * One photo, zoomable, inside a paged carousel.
 *
 * Its own component so each page owns its zoom state. The previous viewer had a
 * single transformed view and swapped the source underneath it, which meant the
 * neighbouring photos never existed: a swipe moved one image sideways and then
 * a new one appeared in place. Real pages let the next photo come in from the
 * edge, which is the whole feel of a photo viewer.
 *
 * Reports zoom upward so the carousel can stop scrolling horizontally while a
 * photo is magnified. Otherwise panning a zoomed photo pages away from it.
 */
function ZoomablePhoto({
  photo,
  width,
  height,
  onZoomChange,
  onTap,
  onDismiss,
}: {
  photo: StoredFile;
  width: number;
  height: number;
  onZoomChange: (zoomed: boolean) => void;
  onTap: () => void;
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
      scale.value = Math.max(
        1,
        Math.min(MAX_SCALE, startScale.value * event.scale),
      );
    })
    .onEnd(() => {
      if (scale.value < 1.05) {
        reset();
        runOnJS(onZoomChange)(false);
      } else {
        runOnJS(onZoomChange)(true);
      }
    });

  /** Only while zoomed. Unzoomed horizontal drags belong to the carousel. */
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
      x.value = Math.max(
        -maxX,
        Math.min(maxX, startX.value + event.translationX),
      );
      y.value = Math.max(
        -maxY,
        Math.min(maxY, startY.value + event.translationY),
      );
    });

  /**
   * Drag down to close, the way Photos does.
   *
   * `failOffsetX` hands sideways drags to the carousel, so the two gestures do
   * not argue over the same finger. Only active at rest: while zoomed, a
   * downward drag is panning the photo, not closing it.
   */
  const dragToDismiss = Gesture.Pan()
    .activeOffsetY([-14, 14])
    .failOffsetX([-18, 18])
    .onUpdate((event) => {
      if (scale.value > 1.01) return;
      dismissY.value = event.translationY;
    })
    .onEnd((event) => {
      if (scale.value > 1.01) return;
      if (Math.abs(event.translationY) > DISMISS_AT || event.velocityY > 900) {
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

  const singleTap = Gesture.Tap()
    .numberOfTaps(1)
    .onEnd(() => runOnJS(onTap)());

  const gesture = Gesture.Simultaneous(
    pinch,
    Gesture.Race(panZoomed, dragToDismiss),
    Gesture.Exclusive(doubleTap, singleTap),
  );

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: x.value },
      { translateY: y.value + dismissY.value },
      // Shrinks as it is dragged away, so the gesture reads as putting the
      // photo back rather than sliding it off an edge.
      {
        scale:
          scale.value *
          interpolate(
            Math.abs(dismissY.value),
            [0, 260],
            [1, 0.82],
            'clamp',
          ),
      },
      // `as const` because RN's transform type is a union of single-key
      // objects; without it TypeScript widens the array and rejects every
      // member for missing the other eleven keys.
    ] as const,
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        style={{ width, height }}
        className="items-center justify-center"
      >
        <Animated.View style={[{ width, height }, style]}>
          {/* The widest display copy, not the original. `url` is the camera
              file — a 6 MB JPEG or a 40 MB TIFF from a bucket in California —
              and this screen draws it a few hundred points wide. */}
          <RemoteImage
            source={{
              uri:
                largestDisplaySource(photo) ??
                photo.url ??
                photo.thumbnailUrl ??
                undefined,
            }}
            // The thumbnail first — it is sharper and, coming from the grid
            // this screen was opened from, almost always already cached. The
            // inline preview is the fallback: less sharp, but it needs no
            // fetch at all, so there is never nothing to show.
            placeholder={
              photo.thumbnailUrl
                ? { uri: photo.thumbnailUrl }
                : photo.blurDataUrl
                  ? { uri: photo.blurDataUrl }
                  : undefined
            }
            placeholderContentFit="contain"
            style={{ width: '100%', height: '100%' }}
            contentFit="contain"
            transition={160}
            recyclingKey={photo.key}
          />
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}

export default function PhotoViewerScreen() {
  const params = useLocalSearchParams<{
    albumId: string;
    index?: string;
    /** The photograph that was tapped. Preferred over `index`. */
    key?: string;
    /** The grid's filter, so this reads the same cached pages it drew from. */
    kind?: string;
    section?: string;
    order?: string;
    picked?: string;
  }>();
  const { albumId, index: routeIndex } = params;
  const { width, height } = useWindowDimensions();
  const queryClient = useQueryClient();
  // The same filter as the grid that opened this, which is what makes it the
  // same query: the viewer then holds every page the grid had already loaded,
  // rather than starting over at page one and not containing the photograph
  // that was tapped.
  const filesQuery = useAlbumFiles(albumId, {
    kind: params.kind === 'image' ? 'image' : undefined,
    section: params.section || undefined,
    order: params.order === 'oldest' ? 'oldest' : undefined,
    picked: params.picked === '1' ? true : undefined,
  });
  const photos = filesQuery.images;

  const pager = useRef<FlatList<StoredFile>>(null);
  const strip = useRef<FlatList<StoredFile>>(null);
  // Opened by key: an index means nothing to a grid that mixes photographs
  // with films, and it silently shifts when a page loads above it.
  const [currentIndex, setCurrentIndex] = useState(() => {
    const at = params.key ? photos.findIndex((p) => p.key === params.key) : -1;
    return at >= 0 ? at : Math.max(0, Number(routeIndex) || 0);
  });
  const openedOnKey = useRef(!params.key || photos.some((p) => p.key === params.key));

  // A deep link arrives with nothing cached, so the photograph is found when
  // its page does.
  useEffect(() => {
    if (openedOnKey.current || !params.key) return;
    const at = photos.findIndex((p) => p.key === params.key);
    if (at < 0) return;
    openedOnKey.current = true;
    setCurrentIndex(at);
    pager.current?.scrollToIndex({ index: at, animated: false });
  }, [photos, params.key]);
  const [zoomed, setZoomed] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [saving, setSaving] = useState(false);
  const chrome = useSharedValue(1);

  const photo = photos[currentIndex] ?? photos[0];

  const toggleChrome = useCallback(() => {
    chrome.value = withTiming(chrome.value > 0.5 ? 0 : 1, { duration: 180 });
  }, [chrome]);

  const chromeStyle = useAnimatedStyle(() => ({ opacity: chrome.value }));

  /** Keeps the filmstrip centred on whatever the pager settled on. */
  useEffect(() => {
    if (!photos.length) return;
    strip.current?.scrollToIndex({
      index: Math.min(currentIndex, photos.length - 1),
      animated: true,
      viewPosition: 0.5,
    });
  }, [currentIndex, photos.length]);

  useEffect(() => {
    if (currentIndex >= photos.length && photos.length) {
      setCurrentIndex(photos.length - 1);
    }
  }, [currentIndex, photos.length]);

  const goTo = useCallback((index: number) => {
    setCurrentIndex(index);
    setShowInfo(false);
    pager.current?.scrollToIndex({ index, animated: true });
  }, []);

  const sharePhoto = async () => {
    if (!photo?.url) return;
    try {
      await Share.share(
        Platform.OS === 'ios'
          ? { url: photo.url, message: photo.originalName }
          : { message: `${photo.originalName} - ${photo.url}` },
      );
    } catch (error) {
      // Cancelling the sheet rejects on some platforms, which is not a failure
      // worth interrupting anybody over. A real one is.
      if (error instanceof Error && !/cancel/i.test(error.message)) {
        Alert.alert('Could not share', 'Please try again.');
      }
    }
  };

  const savePhoto = async () => {
    const source = photo?.downloadUrl ?? photo?.url;
    if (!source || saving || !photo?.capabilities.download) return;
    setSaving(true);
    try {
      const permission = await MediaLibrary.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission needed', 'Allow photo access to save images.');
        return;
      }
      const safeName = photo.originalName.replace(/[^a-z0-9._-]/gi, '_');
      const target = `${FileSystem.cacheDirectory}${safeName}`;
      const result = await FileSystem.downloadAsync(source, target);
      if (result.status < 200 || result.status >= 300) {
        throw new Error('The image could not be downloaded.');
      }
      await MediaLibrary.saveToLibraryAsync(result.uri);
      await FileSystem.deleteAsync(result.uri, { idempotent: true });
      Alert.alert('Saved', 'The photo is in your library.');
    } catch (error) {
      Alert.alert(
        'Could not save',
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setSaving(false);
    }
  };

  const deletePhoto = () => {
    if (!photo) return;
    Alert.alert(
      'Remove photo?',
      'This permanently removes the original and its thumbnail.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await storageApi.remove(photo.key);
              await queryClient.invalidateQueries({
                queryKey: ['storage', 'files', albumId],
              });
              if (photos.length <= 1) router.back();
              else setCurrentIndex((value) => Math.max(0, value - 1));
            } catch (error) {
              Alert.alert(
                'Could not remove photo',
                error instanceof Error ? error.message : 'Please try again.',
              );
            }
          },
        },
      ],
    );
  };

  if (!photo) {
    return (
      <View className="flex-1 bg-black items-center justify-center px-8">
        <Text className="text-white text-lg font-semibold">No photos yet</Text>
        <Pressable
          onPress={() => router.back()}
          className="mt-6 bg-white/10 rounded-full px-6 py-3 active:opacity-70"
        >
          <Text className="text-white font-semibold">Go back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-black">
      <FlatList
        ref={pager}
        data={photos}
        keyExtractor={(item) => item.key}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEnabled={!zoomed}
        initialScrollIndex={Math.min(currentIndex, Math.max(photos.length - 1, 0))}
        getItemLayout={(_, index) => ({
          length: width,
          offset: width * index,
          index,
        })}
        onMomentumScrollEnd={(event) => {
          const next = Math.round(event.nativeEvent.contentOffset.x / width);
          if (next !== currentIndex) {
            setCurrentIndex(next);
            setShowInfo(false);
          }
          if (
            next >= photos.length - 3 &&
            filesQuery.hasNextPage &&
            !filesQuery.isFetchingNextPage
          ) {
            filesQuery.fetchNextPage();
          }
        }}
        renderItem={({ item }) => (
          <ZoomablePhoto
            photo={item}
            width={width}
            height={height}
            onZoomChange={setZoomed}
            onTap={toggleChrome}
            onDismiss={() => router.back()}
          />
        )}
      />

      <Animated.View
        style={chromeStyle}
        pointerEvents={zoomed ? 'none' : 'box-none'}
        className="absolute inset-0"
      >
        <LinearGradient
          colors={['rgba(0,0,0,0.72)', 'rgba(0,0,0,0)']}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 160 }}
          pointerEvents="none"
        />
        <LinearGradient
          colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.82)']}
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 260,
          }}
          pointerEvents="none"
        />

        <SafeAreaView edges={['top']} className="absolute top-0 left-0 right-0">
          <View className="px-4 pt-2 flex-row items-center gap-3">
            <Pressable
              onPress={() => router.back()}
              hitSlop={8}
              className="w-10 h-10 rounded-full bg-black/45 items-center justify-center active:opacity-70"
            >
              <XIcon size={19} color="#fff" />
            </Pressable>
            <View className="flex-1 min-w-0">
              <Text
                className="text-white text-[15px] font-semibold"
                numberOfLines={1}
              >
                {photo.originalName}
              </Text>
              <Text className="text-white/45 text-[11px] mt-0.5">
                {currentIndex + 1} of {filesQuery.counts.image}
              </Text>
            </View>
          </View>
        </SafeAreaView>

        <SafeAreaView
          edges={['bottom']}
          className="absolute bottom-0 left-0 right-0"
        >
          {showInfo && (
            <View className="mx-4 mb-3 rounded-2xl bg-black/55 px-4 py-3">
              <InfoRow
                label="Taken"
                value={new Date(photo.createdAt).toLocaleDateString('en-GB', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              />
              <InfoRow label="Size" value={formatBytes(photo.sizeBytes)} />
              <InfoRow
                label="Dimensions"
                value={
                  photo.width && photo.height
                    ? `${photo.width} x ${photo.height}`
                    : 'Not available'
                }
              />
            </View>
          )}

          {/* One continuous strip, not a sliding window over a slice. It scrolls
              with the pager and can be dragged independently. */}
          <FlatList
            ref={strip}
            data={photos}
            keyExtractor={(item) => `strip-${item.key}`}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, gap: 6 }}
            getItemLayout={(_, index) => ({
              length: THUMB + 6,
              offset: (THUMB + 6) * index,
              index,
            })}
            onScrollToIndexFailed={() => {}}
            renderItem={({ item, index }) => (
              <Pressable
                onPress={() => goTo(index)}
                style={{ width: THUMB, height: THUMB }}
                className={
                  index === currentIndex
                    ? 'rounded-[9px] overflow-hidden border-2 border-white'
                    : 'rounded-[9px] overflow-hidden opacity-45'
                }
              >
                <RemoteImage
                  source={{ uri: item.thumbnailUrl ?? item.url ?? undefined }}
                  placeholder={
                    item.blurDataUrl ? { uri: item.blurDataUrl } : undefined
                  }
                  placeholderContentFit="cover"
                  style={{ width: '100%', height: '100%' }}
                  contentFit="cover"
                  recyclingKey={item.key}
                />
              </Pressable>
            )}
          />

          <View className="flex-row items-center gap-2 px-4 pt-4 pb-2">
            <Action onPress={sharePhoto} label="Share">
              <Share2Icon size={19} color="#fff" />
            </Action>
            {photo.capabilities.download && (
              <Action onPress={savePhoto} label="Save" disabled={saving}>
                {saving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <DownloadIcon size={19} color="#fff" />
                )}
              </Action>
            )}
            <Action
              onPress={() => setShowInfo((value) => !value)}
              label="Info"
              active={showInfo}
            >
              <InfoIcon size={19} color="#fff" />
            </Action>
            <View className="flex-1" />
            {photo.capabilities.delete && (
              <Action onPress={deletePhoto} label="Remove">
                <Trash2Icon size={19} color="#F2A9A0" />
              </Action>
            )}
          </View>
        </SafeAreaView>
      </Animated.View>
    </View>
  );
}

function Action({
  children,
  onPress,
  label,
  disabled,
  active,
}: {
  children: React.ReactNode;
  onPress: () => void;
  label: string;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={label}
      hitSlop={6}
      className={`w-11 h-11 rounded-full items-center justify-center active:opacity-70 ${
        active ? 'bg-white/25' : 'bg-white/10'
      }`}
    >
      {children}
    </Pressable>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row justify-between gap-4 py-1">
      <Text className="text-white/45 text-xs">{label}</Text>
      <Text className="text-white text-xs font-medium">{value}</Text>
    </View>
  );
}
