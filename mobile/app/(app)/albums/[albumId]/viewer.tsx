import { View, Text, Pressable, Image, Dimensions, ScrollView } from 'react-native';
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

cssInterop(XIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ShareIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(DownloadIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(InfoIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ChevronLeftIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ChevronRightIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

const SCREEN_WIDTH = Dimensions.get('window').width;
const SCREEN_HEIGHT = Dimensions.get('window').height;

const PHOTOS = Array.from({ length: 36 }, (_, i) => ({
  id: `photo-${i + 1}`,
  uri: `https://picsum.photos/seed/album-viewer-${i + 1}/1200/1600`,
  name: `IMG_${4821 + i}.CR3`,
  date: new Date(Date.now() - i * 86400000).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }),
  size: `${(Math.random() * 20 + 18).toFixed(1)} MB`,
  dimensions: `${3000 + Math.floor(Math.random() * 2000)} × ${2000 + Math.floor(Math.random() * 2000)}`,
  iso: [100, 200, 400, 800, 1600][Math.floor(Math.random() * 5)],
  aperture: `f/${[1.4, 2.0, 2.8, 4.0, 5.6][Math.floor(Math.random() * 5)]}`,
  shutter: ['1/125', '1/250', '1/500', '1/1000', '1/2000'][Math.floor(Math.random() * 5)],
}));

export default function PhotoViewerScreen() {
  const { albumId, index: paramIndex } = useLocalSearchParams<{ albumId: string; index?: string }>();
  const [currentIndex, setCurrentIndex] = useState(parseInt(paramIndex || '0'));
  const [showInfo, setShowInfo] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const totalPhotos = PHOTOS.length;
  const photo = PHOTOS[currentIndex] || PHOTOS[0];

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
        {PHOTOS.map((p, i) => (
          <View key={p.id} style={{ width: SCREEN_WIDTH, height: SCREEN_HEIGHT, justifyContent: 'center', alignItems: 'center' }}>
            <Image
              source={{ uri: p.uri }}
              style={{
                width: SCREEN_WIDTH,
                height: SCREEN_HEIGHT * 0.7,
              }}
              resizeMode="contain"
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
              <Pressable className="w-10 h-10 rounded-full bg-white/12 items-center justify-center active:scale-[0.90]">
                <ShareIcon size={18} className="text-white" />
              </Pressable>
              <Pressable className="w-10 h-10 rounded-full bg-white/12 items-center justify-center active:scale-[0.90]">
                <DownloadIcon size={18} className="text-white" />
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
                <InfoRow label="Date" value={photo.date} />
                <InfoRow label="Size" value={photo.size} />
                <InfoRow label="Dimensions" value={photo.dimensions} />
                <InfoRow label="ISO" value={String(photo.iso)} />
                <InfoRow label="Aperture" value={photo.aperture} />
                <InfoRow label="Shutter" value={photo.shutter} />
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
