import { View, Text, Pressable, Dimensions, ScrollView, Share, Platform, Alert, ActivityIndicator } from 'react-native';
// expo-image rather than RN Image: it decodes AVIF (and HEIC) on OS
// versions where the RN one silently renders nothing.
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { useState, useRef } from 'react';
import {
  XIcon,
  ShareIcon,
  DownloadIcon,
  InfoIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system/legacy';
import { fileDate, fileNameFromKey, useAlbumFiles } from '@/src/hooks';
import { formatBytes } from '@/src/api';

cssInterop(XIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ShareIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(DownloadIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(InfoIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ChevronLeftIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ChevronRightIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

const SCREEN_WIDTH = Dimensions.get('window').width;
const SCREEN_HEIGHT = Dimensions.get('window').height;

export default function PhotoViewerScreen() {
  const { albumId, index: paramIndex } = useLocalSearchParams<{ albumId: string; index?: string }>();
  const [currentIndex, setCurrentIndex] = useState(parseInt(paramIndex || '0'));
  const [showInfo, setShowInfo] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  // Real stored images. The old array invented 36 photos with random ISO,
  // aperture and shutter values — none of which exist on a stored object.
  const { images } = useAlbumFiles(albumId);
  const photos = images.map((f) => ({
    id: f.key,
    uri: f.url ?? undefined,
    name: fileNameFromKey(f.key),
    date: fileDate(f.createdAt),
    size: formatBytes(f.sizeBytes),
  }));

  const totalPhotos = photos.length;
  const photo = photos[currentIndex] ?? photos[0];

  const [saving, setSaving] = useState(false);

  /** Hands the image's URL to the system share sheet. */
  const sharePhoto = async () => {
    if (!photo?.uri) return;
    try {
      await Share.share(
        // iOS renders `url` as a proper link preview; Android has no url field
        // and only reads `message`.
        Platform.OS === 'ios'
          ? { url: photo.uri, message: photo.name }
          : { message: `${photo.name} — ${photo.uri}` },
      );
    } catch {
      // The user dismissing the sheet throws on some platforms; not an error.
    }
  };

  /**
   * Saves the image to the device's photo library.
   *
   * Downloads to the cache first: MediaLibrary only accepts a local file, not
   * a remote URL.
   */
  const savePhoto = async () => {
    if (!photo?.uri || saving) return;
    setSaving(true);
    try {
      const permission = await MediaLibrary.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Permission needed',
          'Allow photo access to save images to your library.',
        );
        return;
      }

      const target = `${FileSystem.cacheDirectory}${photo.name}`;
      const { uri, status } = await FileSystem.downloadAsync(photo.uri, target);
      if (status < 200 || status >= 300) {
        Alert.alert('Download failed', 'The image could not be fetched.');
        return;
      }

      await MediaLibrary.saveToLibraryAsync(uri);
      // Cached copy has served its purpose; leaving it doubles the space used.
      await FileSystem.deleteAsync(uri, { idempotent: true });
      Alert.alert('Saved', 'The photo is in your library.');
    } catch (err) {
      Alert.alert(
        'Could not save',
        err instanceof Error ? err.message : 'Please try again.',
      );
    } finally {
      setSaving(false);
    }
  };

  // With no stored images `photo` is undefined and every read below would
  // crash. The old generated array made this state unreachable.
  if (!photo) {
    return (
      <View className="flex-1 bg-black items-center justify-center px-10">
        <Text className="text-white text-base font-bold">No photos yet</Text>
        <Text className="text-white/50 text-sm text-center mt-2">
          Upload some media to this album to view it here.
        </Text>
        <Pressable
          onPress={() => router.back()}
          className="mt-7 bg-white/15 rounded-2xl px-7 py-3 active:scale-[0.96]"
        >
          <Text className="text-white text-sm font-bold">Go back</Text>
        </Pressable>
      </View>
    );
  }

  const goNext = () => {
    if (currentIndex < totalPhotos - 1) {
      const next = currentIndex + 1;
      setCurrentIndex(next);
      scrollRef.current?.scrollTo({ x: next * SCREEN_WIDTH, animated: true });
    }
  };

  const goPrev = () => {
    if (currentIndex > 0) {
      const prev = currentIndex - 1;
      setCurrentIndex(prev);
      scrollRef.current?.scrollTo({ x: prev * SCREEN_WIDTH, animated: true });
    }
  };

  return (
    <View className="flex-1 bg-black">
      {/* Main image area */}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => {
          const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
          setCurrentIndex(Math.max(0, Math.min(idx, totalPhotos - 1)));
        }}
        contentOffset={{ x: currentIndex * SCREEN_WIDTH, y: 0 }}
      >
        {photos.map((p, i) => (
          <View key={p.id} style={{ width: SCREEN_WIDTH, height: SCREEN_HEIGHT, justifyContent: 'center', alignItems: 'center' }}>
            <Image
              source={{ uri: p.uri }}
              style={{
                width: SCREEN_WIDTH,
                height: SCREEN_HEIGHT * 0.7,
              }}
              contentFit="contain"
            />
          </View>
        ))}
      </ScrollView>

      {/* Close button */}
      <Pressable
        onPress={() => router.back()}
        className="absolute top-14 right-4 w-10 h-10 rounded-full bg-black/50 items-center justify-center active:scale-[0.90]"
      >
        <XIcon size={20} className="text-white" />
      </Pressable>

      {/* Counter */}
      <View className="absolute top-14 left-4 bg-black/50 rounded-full px-3 py-1.5">
        <Text className="text-white text-xs font-bold">
          {currentIndex + 1} / {totalPhotos}
        </Text>
      </View>

      {/* Prev / Next arrows */}
      {currentIndex > 0 && (
        <Pressable
          onPress={goPrev}
          className="absolute left-3 top-1/2 -mt-6 w-11 h-11 rounded-full bg-white/15 items-center justify-center active:scale-[0.90]"
        >
          <ChevronLeftIcon size={22} className="text-white" />
        </Pressable>
      )}
      {currentIndex < totalPhotos - 1 && (
        <Pressable
          onPress={goNext}
          className="absolute right-3 top-1/2 -mt-6 w-11 h-11 rounded-full bg-white/15 items-center justify-center active:scale-[0.90]"
        >
          <ChevronRightIcon size={22} className="text-white" />
        </Pressable>
      )}

      {/* Bottom bar */}
      <SafeAreaView edges={['bottom']} className="absolute bottom-0 left-0 right-0">
        <View className="px-5 pb-6 pt-2">
          <View className="flex-row items-center justify-between">
            {/* Actions */}
            <View className="flex-row items-center gap-3">
              {/* Both of these rendered as buttons and had no onPress. */}
              <Pressable
                onPress={sharePhoto}
                className="w-10 h-10 rounded-full bg-white/12 items-center justify-center active:scale-[0.90]"
              >
                <ShareIcon size={18} className="text-white" />
              </Pressable>
              <Pressable
                onPress={savePhoto}
                disabled={saving}
                className="w-10 h-10 rounded-full bg-white/12 items-center justify-center active:scale-[0.90]"
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <DownloadIcon size={18} className="text-white" />
                )}
              </Pressable>
              <Pressable
                onPress={() => setShowInfo(!showInfo)}
                className={`w-10 h-10 rounded-full items-center justify-center active:scale-[0.90] ${
                  showInfo ? 'bg-white/20' : 'bg-white/12'
                }`}
              >
                <InfoIcon size={18} className="text-white" />
              </Pressable>
            </View>

            {/* File name */}
            <Text className="text-white/60 text-xs font-medium">{photo.name}</Text>
          </View>

          {/* Info panel */}
          {showInfo && (
            <View
              className="mt-3 rounded-2xl px-4 py-3"
              style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
            >
              <View className="flex-row flex-wrap gap-x-5 gap-y-2">
                {/* Only what a stored object actually carries. ISO, aperture,
                    shutter and dimensions were Math.random() values. */}
                <InfoRow label="Date" value={photo.date} />
                <InfoRow label="Size" value={photo.size} />
              </View>
            </View>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="gap-0.5" style={{ minWidth: '30%' }}>
      <Text className="text-white/40 text-[10px] uppercase tracking-wider font-medium">{label}</Text>
      <Text className="text-white text-xs font-semibold">{value}</Text>
    </View>
  );
}
