import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  PixelRatio,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { RemoteImage, stableCacheKey } from '@/components/RemoteImage';
import { LinearGradient } from 'expo-linear-gradient';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import { canSaveToPhotos } from '@/src/lib/photo-permission';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import {
  DownloadIcon,
  HeartIcon,
  InfoIcon,
  Share2Icon,
  Trash2Icon,
  XIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { useQueryClient } from '@tanstack/react-query';
import { useAlbum, useAlbumFiles, useAuth, useUpdateAlbum, usageQueryKey } from '@/src/hooks';
import { ActionSheet } from '@/components/WorkspaceBits';
import {
  displaySourceAtLeast,
  formatBytes,
  originalForDetail,
  queryKeys,
  storageApi,
  type StoredFile,
} from '@/src/api';

for (const Icon of [DownloadIcon, HeartIcon, InfoIcon, Share2Icon, Trash2Icon, XIcon]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

const SPRING = { damping: 22, stiffness: 220 };
const MAX_SCALE = 4;

/**
 * Magnified past this, the original is loaded over the display copy.
 *
 * The copy covers the screen at 1x and a little past it; by one and a half
 * times a pinch is magnifying pixels the copy does not have, which is where a
 * photographer checking focus sees mush instead of eyelashes.
 */
const DETAIL_AT = 1.5;

/**
 * The largest original loaded for that, in pixels.
 *
 * Drawn at full size, a photograph costs four bytes a pixel in memory: 24 MP
 * is about 96 MB, held while it is magnified. Past that — a 48 MP still — the
 * 3072 px copy is as far as a pinch goes.
 */
const MAX_DETAIL_PIXELS = 24_000_000;

/** Originals iOS draws that Android does not. */
const IOS_ALSO_DRAWS = ['image/heic', 'image/heif'];

/** Vertical travel that commits to closing. Below it, the photo springs back. */
const DISMISS_AT = 130;
const THUMB = 46;
/** How far a finger may move and still be tapping, not swiping. */
const TAP_SLOP = 12;
/** Upward travel that opens Info. Shorter than closing: it undoes with a flick. */
const INFO_AT = 56;
/** A client's pick, and Remove, on black: the brand colours are too dark there. */
const PICK = '#E79A6F';
const REMOVE = '#F2A9A0';
const SHEET = '#1C1917';

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
  onInfo,
  onHold,
}: {
  photo: StoredFile;
  width: number;
  height: number;
  onZoomChange: (zoomed: boolean) => void;
  onTap: () => void;
  onDismiss: () => void;
  /** Swiped up, at rest. */
  onInfo: () => void;
  /** Pressed and held, at rest. */
  onHold: () => void;
}) {
  const scale = useSharedValue(1);
  const startScale = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const dismissY = useSharedValue(0);

  // The copy that covers the screen's long edge at its real pixels, so the
  // photograph is sharp upright or turned and a first pinch has room. The
  // widest one was used whatever the screen: 2048 px, stretched on most
  // phones of the last few years.
  const screenPixels = Math.max(width, height) * PixelRatio.get();
  const copy = displaySourceAtLeast(photo, screenPixels);
  const base = copy ?? photo.url ?? photo.thumbnailUrl ?? undefined;
  const original =
    (photo.width ?? 0) * (photo.height ?? 0) <= MAX_DETAIL_PIXELS
      ? originalForDetail(photo, { alsoDraws: Platform.OS === 'ios' ? IOS_ALSO_DRAWS : [] })
      : null;
  // Loaded once a pinch passes DETAIL_AT, and let go when the photograph is
  // back at rest, so only the one being magnified holds a camera file.
  const [detail, setDetail] = useState(false);
  useAnimatedReaction(
    () => (scale.value > DETAIL_AT ? 'detail' : scale.value <= 1.01 ? 'rest' : 'between'),
    (now, before) => {
      if (now === before) return;
      if (now === 'detail') runOnJS(setDetail)(true);
      else if (now === 'rest') runOnJS(setDetail)(false);
    },
  );

  /*
   * Whether this photo is magnified, as state the gestures can be switched by.
   *
   * The pan that moves a magnified photo began after two points of travel in
   * any direction, magnified or not, and merely did nothing when it was not.
   * But beginning is what counts: on iOS a recogniser that has begun stops
   * the carousel's own scroll from ever starting, which needs ten points, and
   * in the race below it also cancelled the drag that closes the photo. So a
   * resting photo could not be swiped to the next one, nor dragged away. The
   * pan now exists only while there is something for it to move.
   */
  const [isZoomed, setIsZoomed] = useState(false);
  const reportZoom = (zoomed: boolean) => {
    setIsZoomed(zoomed);
    onZoomChange(zoomed);
  };

  const reset = () => {
    'worklet';
    scale.value = withSpring(1, SPRING);
    x.value = withSpring(0, SPRING);
    y.value = withSpring(0, SPRING);
  };

  // Where the pinch began: the point between the fingers, and the photo as it was.
  const focalX = useSharedValue(0);
  const focalY = useSharedValue(0);

  /**
   * The pinch grows the photo from between the fingers, and carries it with
   * them.
   *
   * It grew from the middle of the screen whatever was pinched, so a face in
   * a corner slid off as it got larger and had to be dragged back afterwards;
   * and it stopped dead at each end. The point under the fingers now stays
   * under them, two fingers moving together move the photo, and it gives a
   * little past both ends before settling.
   */
  const pinch = Gesture.Pinch()
    .onStart((event) => {
      startScale.value = scale.value;
      startX.value = x.value;
      startY.value = y.value;
      focalX.value = event.focalX;
      focalY.value = event.focalY;
    })
    .onUpdate((event) => {
      const next = Math.max(0.8, Math.min(MAX_SCALE * 1.15, startScale.value * event.scale));
      const ratio = next / startScale.value;
      // The point that was under the fingers, kept under where they are now.
      const cx = width / 2;
      const cy = height / 2;
      let nextX = event.focalX - cx - ratio * (focalX.value - cx - startX.value);
      let nextY = event.focalY - cy - ratio * (focalY.value - cy - startY.value);
      const maxX = Math.max((width * (next - 1)) / 2, 0);
      const maxY = Math.max((height * (next - 1)) / 2, 0);
      nextX = Math.max(-maxX, Math.min(maxX, nextX));
      nextY = Math.max(-maxY, Math.min(maxY, nextY));
      scale.value = next;
      x.value = nextX;
      y.value = nextY;
    })
    .onEnd(() => {
      if (scale.value < 1.05) {
        reset();
        runOnJS(reportZoom)(false);
        return;
      }
      if (scale.value > MAX_SCALE) {
        // Back to the most it goes, keeping what is in view inside the frame.
        const maxX = (width * (MAX_SCALE - 1)) / 2;
        const maxY = (height * (MAX_SCALE - 1)) / 2;
        scale.value = withSpring(MAX_SCALE, SPRING);
        x.value = withSpring(Math.max(-maxX, Math.min(maxX, x.value)), SPRING);
        y.value = withSpring(Math.max(-maxY, Math.min(maxY, y.value)), SPRING);
      }
      runOnJS(reportZoom)(true);
    });

  /** Only while zoomed. Unzoomed horizontal drags belong to the carousel. */
  const panZoomed = Gesture.Pan()
    .enabled(isZoomed)
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
   * Drag down to close, the way Photos does; up, for Info.
   *
   * `failOffsetX` hands sideways drags to the carousel, so the two gestures do
   * not argue over the same finger. Only active at rest: while zoomed, a
   * vertical drag is panning the photo.
   *
   * Up used to close as well, which left no direction for anything else and
   * made the photo leave towards the top of the screen for no reason.
   */
  const dragToDismiss = Gesture.Pan()
    .enabled(!isZoomed)
    // One finger: the second finger of a pinch that has not ended yet is not
    // somebody dragging the photo away.
    .maxPointers(1)
    .activeOffsetY([-14, 14])
    .failOffsetX([-18, 18])
    .onUpdate((event) => {
      if (scale.value > 1.01) return;
      // Upwards it only leans: the photo is staying, and Info is coming.
      dismissY.value = event.translationY < 0 ? event.translationY * 0.3 : event.translationY;
    })
    .onEnd((event) => {
      if (scale.value > 1.01) return;
      if (event.translationY < 0) {
        if (event.translationY < -INFO_AT || event.velocityY < -700) runOnJS(onInfo)();
        dismissY.value = withSpring(0, SPRING);
        return;
      }
      if (event.translationY > DISMISS_AT || event.velocityY > 900) {
        // It carries on the way it was thrown, at the speed it was thrown,
        // while the screen fades out under it. It used to stop where the
        // finger let go and the whole screen then slid away sideways.
        const remaining = height - event.translationY;
        const speed = Math.max(event.velocityY, 1200) / 1000;
        dismissY.value = withTiming(height, {
          duration: Math.min(Math.max(remaining / speed, 120), 280),
        });
        runOnJS(onDismiss)();
      } else {
        dismissY.value = withSpring(0, SPRING);
      }
    });

  /**
   * Twice on a spot zooms in on that spot. It zoomed on the centre, so a face
   * at the edge of the frame left the screen as it grew.
   */
  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDistance(TAP_SLOP)
    .onEnd((event) => {
      if (scale.value > 1.01) {
        reset();
        runOnJS(reportZoom)(false);
      } else {
        const to = 2.4;
        const maxX = (width * (to - 1)) / 2;
        const maxY = (height * (to - 1)) / 2;
        const dx = -(event.x - width / 2) * (to - 1);
        const dy = -(event.y - height / 2) * (to - 1);
        scale.value = withSpring(to, SPRING);
        x.value = withSpring(Math.max(-maxX, Math.min(maxX, dx)), SPRING);
        y.value = withSpring(Math.max(-maxY, Math.min(maxY, dy)), SPRING);
        runOnJS(reportZoom)(true);
      }
    });

  /** Held still, at rest. Zoomed, a resting finger is somebody looking. */
  const hold = Gesture.LongPress()
    .enabled(!isZoomed)
    .minDuration(380)
    .onStart(() => {
      if (scale.value > 1.01) return;
      runOnJS(onHold)();
    });

  /*
   * A tap stays where it lands. With no limit on how far the finger may
   * travel, a quick flick was a tap as well: swiping up opened Info and the
   * tap that came with it closed it again a moment later.
   */
  const singleTap = Gesture.Tap()
    .numberOfTaps(1)
    .maxDistance(TAP_SLOP)
    .onEnd(() => runOnJS(onTap)());

  const gesture = Gesture.Simultaneous(
    pinch,
    Gesture.Race(panZoomed, dragToDismiss),
    // The hold first: without that a press of half a second was a tap as well,
    // and the bars vanished under the sheet it had just opened.
    Gesture.Exclusive(hold, doubleTap, singleTap),
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
          {/* A display copy, not the original. `url` is the camera file — a
              6 MB JPEG or a 40 MB TIFF from a bucket in California — and this
              screen draws it a few hundred points wide until somebody
              pinches. */}
          <RemoteImage
            source={{ uri: base }}
            // The thumbnail first — it is sharper and, coming from the grid
            // this screen was opened from, almost always already cached. Keyed
            // the way the grid stored it, or the cache never matched it. The
            // inline preview is the fallback: less sharp, but it needs no
            // fetch at all, so there is never nothing to show.
            placeholder={
              photo.thumbnailUrl
                ? { uri: photo.thumbnailUrl, cacheKey: stableCacheKey(photo.thumbnailUrl) }
                : photo.blurDataUrl
                  ? { uri: photo.blurDataUrl }
                  : undefined
            }
            placeholderContentFit="contain"
            style={{ width: '100%', height: '100%' }}
            contentFit="contain"
            transition={160}
            recyclingKey={photo.key}
            // Kept at the copy's own size. Scaled down to the screen, a pinch
            // magnified the smaller bitmap and the copy's extra pixels were
            // decoded only to be thrown away.
            allowDownscaling={false}
          />
          {/* The original, over the copy, once a pinch is past what the copy
              holds. Until it arrives — or if it never does — the copy shows
              through, so a slow or failed load costs nothing on screen. */}
          {detail && original && original !== base ? (
            <RemoteImage
              source={{ uri: original }}
              style={StyleSheet.absoluteFill}
              contentFit="contain"
              transition={200}
              allowDownscaling={false}
            />
          ) : null}
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
  const { user } = useAuth();
  const { data: album } = useAlbum(albumId);
  const updateAlbum = useUpdateAlbum();
  const isOwner = !!album && !!user && album.user_id === user.id;
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
  const [holding, setHolding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sharing, setSharing] = useState(false);
  const chrome = useSharedValue(1);
  // Whether the controls are showing, for touches. Their opacity alone hid
  // them without taking them away: a tap that hid them left the filmstrip,
  // close, Save and Remove all still answering, unseen.
  const [chromeShown, setChromeShown] = useState(true);

  const photo = photos[currentIndex] ?? photos[0];

  const toggleChrome = useCallback(() => {
    // With Info open a tap on the photo puts Info away, as a tap outside any
    // sheet does; it took the whole chrome with it.
    if (showInfoRef.current) {
      // Not the tap that arrives with the swipe which opened it.
      if (Date.now() - infoOpenedAt.current > 450) setShowInfo(false);
      return;
    }
    const next = chrome.value > 0.5 ? 0 : 1;
    chrome.value = withTiming(next, { duration: 180 });
    setChromeShown(next === 1);
  }, [chrome]);

  const chromeStyle = useAnimatedStyle(() => ({ opacity: chrome.value }));

  const showInfoRef = useRef(showInfo);
  useEffect(() => {
    showInfoRef.current = showInfo;
  }, [showInfo]);

  /** Swiped up: Info, and the bars with it if a tap had hidden them. */
  const infoOpenedAt = useRef(0);
  const openInfo = useCallback(() => {
    infoOpenedAt.current = Date.now();
    showInfoRef.current = true;
    chrome.value = withTiming(1, { duration: 180 });
    setChromeShown(true);
    setShowInfo(true);
  }, [chrome]);

  const openHold = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setHolding(true);
  }, []);

  /** Info goes back down the way it came. */
  const closeInfo = Gesture.Pan()
    .activeOffsetY(12)
    .onEnd((event) => {
      if (event.translationY > 36) runOnJS(setShowInfo)(false);
    });

  /** Keeps the filmstrip centred on whatever the pager settled on. */
  useEffect(() => {
    if (!photos.length) return;
    strip.current?.scrollToIndex({
      index: Math.min(currentIndex, photos.length - 1),
      animated: true,
      viewPosition: 0.5,
    });
    // And again when the strip returns from under Info: it remounts at zero.
  }, [currentIndex, photos.length, showInfo]);

  useEffect(() => {
    if (currentIndex >= photos.length && photos.length) {
      setCurrentIndex(photos.length - 1);
    }
  }, [currentIndex, photos.length]);

  /**
   * Where to land once a removal has been refetched.
   *
   * By key, because the list shifts under the pager. Removing the third of
   * five left the pager on what had been the fourth while the index stepped
   * back to the second — so the next Remove deleted a photograph nobody was
   * looking at. Applied only once the removed one is gone from the list: the
   * neighbour's index changes with it.
   */
  const landAfterRemove = useRef<{ removed: string; next: string; index: number } | null>(
    null,
  );
  useEffect(() => {
    const pending = landAfterRemove.current;
    if (!pending || photos.some((p) => p.key === pending.removed)) return;
    landAfterRemove.current = null;
    const found = photos.findIndex((p) => p.key === pending.next);
    const at = found >= 0 ? found : Math.min(pending.index, photos.length - 1);
    if (at < 0) return;
    setCurrentIndex(at);
    pager.current?.scrollToIndex({ index: at, animated: false });
  }, [photos]);

  const goTo = useCallback((index: number) => {
    setCurrentIndex(index);
    setShowInfo(false);
    pager.current?.scrollToIndex({ index, animated: true });
  }, []);

  /**
   * Shares the photograph itself.
   *
   * It shared the link to the private original — a signed URL that stopped
   * working minutes later, handed to whoever received it — and it did so for
   * people the album does not let download. Sending the file is a download,
   * so it needs the same permission, and it is the file that is sent.
   *
   * iOS only: React Native's share sheet can carry a file there and only text
   * on Android, where Save does the job until a native share module ships.
   */
  const canShare = Platform.OS === 'ios' && Boolean(photo?.capabilities.download);
  const sharePhoto = async () => {
    const source = photo?.downloadUrl ?? photo?.url;
    if (!source || sharing || !canShare || !photo) return;
    setSharing(true);
    let local: string | null = null;
    try {
      const safeName = photo.originalName.replace(/[^a-z0-9._-]/gi, '_');
      const result = await FileSystem.downloadAsync(
        source,
        `${FileSystem.cacheDirectory}share-${Date.now()}-${safeName}`,
      );
      local = result.uri;
      if (result.status < 200 || result.status >= 300) {
        throw new Error('The photo could not be downloaded.');
      }
      await Share.share({ url: result.uri });
    } catch (error) {
      // Cancelling the sheet rejects on some platforms, which is not a failure
      // worth interrupting anybody over. A real one is.
      if (error instanceof Error && !/cancel/i.test(error.message)) {
        Alert.alert('Could not share', 'Check your connection and try again.');
      }
    } finally {
      if (local) await FileSystem.deleteAsync(local, { idempotent: true }).catch(() => {});
      setSharing(false);
    }
  };

  const savePhoto = async () => {
    const source = photo?.downloadUrl ?? photo?.url;
    if (!source || saving || !photo?.capabilities.download) return;
    setSaving(true);
    try {
      if (!(await canSaveToPhotos('this photo'))) return;
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
            const at = photos.findIndex((p) => p.key === photo.key);
            // The one after it, as a gallery does; the one before if it was last.
            const neighbour = photos[at + 1] ?? photos[at - 1] ?? null;
            try {
              await storageApi.remove(photo.key);
              if (neighbour) {
                landAfterRemove.current = {
                  removed: photo.key,
                  next: neighbour.key,
                  index: Math.max(at, 0),
                };
              }
              await queryClient.invalidateQueries({
                queryKey: ['storage', 'files', albumId],
              });
              // The album's counts and cover, and the storage it used, all
              // changed too; only the file list used to be refreshed.
              void queryClient.invalidateQueries({ queryKey: queryKeys.albums.all });
              void queryClient.invalidateQueries({ queryKey: usageQueryKey });
              void queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.all });
              void queryClient.invalidateQueries({ queryKey: ['storage', 'breakdown'] });
              if (!neighbour) router.back();
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

  const makeCover = () => {
    if (!photo) return;
    updateAlbum.mutate(
      { id: albumId, cover_key: photo.key },
      {
        onSuccess: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
        onError: () => Alert.alert('Could not set the cover', 'Please try again.'),
      },
    );
  };

  const holdActions = [
    ...(canShare ? [{ label: 'Share this photo', onPress: () => void sharePhoto() }] : []),
    ...(photo?.capabilities.download ? [{ label: 'Save it to this phone', onPress: () => void savePhoto() }] : []),
    ...(isOwner ? [{ label: 'Make it the album’s cover', onPress: makeCover }] : []),
    { label: 'See its details', onPress: openInfo },
  ];

  if (!photo) {
    // "No photos yet" was the answer to every way of having none to show: a
    // load still running, or one that failed, said the album was empty.
    const failed = filesQuery.loadFailed;
    const loading = !failed && (filesQuery.isLoading || filesQuery.isFetching);
    return (
      <View className="flex-1 bg-black items-center justify-center px-8">
        {loading ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <>
            <Text className="text-white text-lg font-semibold text-center">
              {failed ? "Couldn't load these photos" : 'No photos yet'}
            </Text>
            {failed && (
              <Text className="text-white/70 text-sm text-center mt-2">
                Check your connection and try again.
              </Text>
            )}
            <View className="flex-row gap-3 mt-6">
              {failed && (
                <Pressable
                  onPress={() => void filesQuery.refetch()}
                  accessibilityRole="button"
                  className="bg-white rounded-full px-6 py-3 active:opacity-70"
                >
                  <Text className="text-black font-semibold">Try again</Text>
                </Pressable>
              )}
              <Pressable
                onPress={() => router.back()}
                accessibilityRole="button"
                className="bg-white/10 rounded-full px-6 py-3 active:opacity-70"
              >
                <Text className="text-white font-semibold">Go back</Text>
              </Pressable>
            </View>
          </>
        )}
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
        // The photo on screen and one either side. The default window kept
        // about twenty-one full-screen photographs decoded at once.
        windowSize={3}
        initialNumToRender={1}
        maxToRenderPerBatch={2}
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
            onInfo={openInfo}
            onHold={openHold}
          />
        )}
      />

      <Animated.View
        // Placed by a style: beside an animated style the class is dropped on
        // the web, and the bars landed below the screen.
        style={[StyleSheet.absoluteFill, chromeStyle]}
        pointerEvents={zoomed || !chromeShown ? 'none' : 'box-none'}
      >
        <LinearGradient
          colors={['rgba(0,0,0,0.72)', 'rgba(0,0,0,0)']}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 160 }}
          pointerEvents="none"
        />
        {!showInfo && (
          <LinearGradient
            colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.85)']}
            style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 260 }}
            pointerEvents="none"
          />
        )}

        {/* When it was taken, not what the camera called it. "DSC_0421.JPG"
            led the screen; the name is in Info for whoever needs it. */}
        <SafeAreaView edges={['top']} className="absolute top-0 left-0 right-0">
          <View className="px-2 pt-1 flex-row items-center">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={() => router.back()}
              hitSlop={6}
              className="w-11 h-11 items-center justify-center active:opacity-60"
            >
              <XIcon size={24} color="#fff" />
            </Pressable>
            <View className="flex-1 min-w-0 items-center">
              <Text className="text-white text-[15px] leading-5 font-semibold" numberOfLines={1}>
                {whenLabel(photo)}
              </Text>
              <Text className="text-white/60 text-[12px] leading-4">
                {currentIndex + 1} of {filesQuery.counts.image}
              </Text>
            </View>
            {/* The client's pick, which this screen never showed. */}
            <View
              className="w-11 h-11 items-center justify-center"
              accessible={!!photo.picked}
              accessibilityLabel={photo.picked ? 'Picked by your client' : undefined}
            >
              {photo.picked ? <HeartIcon size={22} color={PICK} fill={PICK} /> : null}
            </View>
          </View>
        </SafeAreaView>

        <SafeAreaView
          edges={['bottom']}
          className="absolute bottom-0 left-0 right-0"
          style={
            showInfo
              ? { backgroundColor: SHEET, borderTopLeftRadius: 24, borderTopRightRadius: 24 }
              : undefined
          }
        >
          {showInfo ? (
            <GestureDetector gesture={closeInfo}>
              <View className="px-5 pt-2.5" accessibilityViewIsModal>
                <View className="self-center w-9 h-1 rounded-full bg-white/25 mb-3.5" />
                <Text className="text-white text-[17px] leading-6 font-bold" numberOfLines={2}>
                  {photo.originalName}
                </Text>
                {photo.picked ? (
                  <View className="flex-row items-center gap-1.5 mt-0.5">
                    <HeartIcon size={12} color={PICK} fill={PICK} />
                    <Text style={{ color: PICK }} className="text-[13px] leading-[18px]">
                      Picked by your client
                    </Text>
                  </View>
                ) : null}
                <View className="mt-3">
                  {/* When it was taken, from the camera. It showed the upload
                      date under that label. */}
                  {photo.takenAt ? <InfoRow label="Taken" value={takenLabel(photo.takenAt)} /> : null}
                  <InfoRow
                    label="Uploaded"
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
                        ? `${photo.width.toLocaleString()} × ${photo.height.toLocaleString()}`
                        : 'Not available'
                    }
                  />
                </View>
              </View>
            </GestureDetector>
          ) : (
            /* One continuous strip, not a sliding window over a slice. It scrolls
               with the pager and can be dragged independently. */
            <FlatList
              ref={strip}
              data={photos}
              keyExtractor={(item) => `strip-${item.key}`}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 16, gap: 6, alignItems: 'center' }}
              getItemLayout={(_, index) => ({
                length: THUMB + 6,
                offset: (THUMB + 6) * index,
                index,
              })}
              onScrollToIndexFailed={() => {}}
              renderItem={({ item, index }) => (
                <Pressable
                  onPress={() => goTo(index)}
                  accessibilityRole="button"
                  accessibilityLabel={`Photo ${index + 1}`}
                  style={{ width: THUMB, height: THUMB }}
                  className={
                    index === currentIndex
                      ? 'rounded-[9px] overflow-hidden border-2 border-white'
                      : 'rounded-[9px] overflow-hidden opacity-45'
                  }
                >
                  <RemoteImage
                    source={{ uri: item.thumbnailUrl ?? item.url ?? undefined }}
                    placeholder={item.blurDataUrl ? { uri: item.blurDataUrl } : undefined}
                    placeholderContentFit="cover"
                    style={{ width: '100%', height: '100%' }}
                    contentFit="cover"
                    recyclingKey={item.key}
                  />
                </Pressable>
              )}
            />
          )}

          {/* Each with its word. They were four unlabelled grey circles, and
              Info and Share are not glyphs everybody reads. */}
          <View className={`flex-row px-2 pb-1 ${showInfo ? 'mt-2 border-t border-white/10' : 'pt-2'}`}>
            {canShare && (
              <Action onPress={sharePhoto} label="Share" disabled={sharing}>
                {sharing ? <ActivityIndicator size="small" color="#fff" /> : <Share2Icon size={22} color="#fff" />}
              </Action>
            )}
            {photo.capabilities.download && (
              <Action onPress={savePhoto} label="Save" disabled={saving}>
                {saving ? <ActivityIndicator size="small" color="#fff" /> : <DownloadIcon size={22} color="#fff" />}
              </Action>
            )}
            <Action onPress={() => setShowInfo((value) => !value)} label="Info" active={showInfo}>
              <InfoIcon size={22} color="#fff" />
            </Action>
            {photo.capabilities.delete && (
              <Action onPress={deletePhoto} label="Remove">
                <Trash2Icon size={22} color={REMOVE} />
              </Action>
            )}
          </View>
        </SafeAreaView>
      </Animated.View>

      {/* Press and hold: the two or three things done to one photograph,
          without hunting along the bar for them. */}
      <ActionSheet
        visible={holding}
        // Says where in the album it is: the camera's file name told nobody
        // which photograph the menu was about.
        title={`Photo ${currentIndex + 1} of ${filesQuery.counts.image} · ${whenLabel(photo)}`}
        actions={holdActions}
        onClose={() => setHolding(false)}
      />
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
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!active, disabled: !!disabled }}
      className="flex-1 h-14 items-center justify-center gap-1 active:opacity-60"
    >
      {children}
      <Text className={`text-[12px] leading-4 font-medium ${active ? 'text-white' : 'text-white/75'}`}>
        {label}
      </Text>
    </Pressable>
  );
}

/** "21 December, 4:12 PM" from the camera; the upload day when it wrote none. */
function whenLabel(photo: StoredFile): string {
  if (!photo.takenAt) {
    return new Date(photo.createdAt).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }
  // From its parts, as takenLabel does and for the same reason.
  const [date, time = '00:00:00'] = photo.takenAt.split('T');
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const at = new Date(y, m - 1, d, hh, mm);
  const day = at.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
  const clockTime = at.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${day}, ${clockTime}`;
}

/**
 * "14 March 2026, 4:12 pm", as the camera wrote it.
 *
 * Built from its parts rather than parsed: it carries no zone, and parsing
 * would move a frame shot late at night onto another day for anyone outside
 * the zone it was taken in.
 */
function takenLabel(takenAt: string): string {
  const [date, time = '00:00:00'] = takenAt.split('T');
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const at = new Date(y, m - 1, d, hh, mm);
  const day = at.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  // The clock the rest of the app shows: it read "at 15:35" here alone.
  return `${day}, ${at.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="min-h-[44px] flex-row items-center justify-between gap-4 border-t border-white/10">
      <Text className="text-white/60 text-[14px]">{label}</Text>
      <Text className="text-white text-[14px] font-medium flex-shrink text-right">{value}</Text>
    </View>
  );
}
