import { View, Text, FlatList, RefreshControl, Pressable, Image, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useApp, useAuth, useTheme } from '@/src/hooks';
import { useLocalSearchParams, router } from 'expo-router';
import { useState, useRef, useEffect } from 'react';
import {
  ArrowLeftIcon,
  PlayIcon,
  PauseIcon,
  Volume2Icon,
  VolumeXIcon,
  MaximizeIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ScissorsIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';

cssInterop(ArrowLeftIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(PlayIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(PauseIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(Volume2Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(VolumeXIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(MaximizeIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ChevronLeftIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ChevronRightIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ScissorsIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

const SCREEN_WIDTH = Dimensions.get('window').width;

const VIDEOS = [
  {
    id: 'vid-1',
    uri: 'https://picsum.photos/seed/video-thumb-1/800/450',
    title: 'BTS Reel — Look 1',
    duration: '3:42',
    durationSec: 222,
    size: '156.3 MB',
    date: 'Nov 14, 2025',
    resolution: '4K · 3840×2160',
    fps: '24 fps',
  },
  {
    id: 'vid-2',
    uri: 'https://picsum.photos/seed/video-thumb-2/800/450',
    title: 'Ceremony Highlights',
    duration: '8:17',
    durationSec: 497,
    size: '412.8 MB',
    date: 'Nov 12, 2025',
    resolution: '4K · 3840×2160',
    fps: '60 fps',
  },
  {
    id: 'vid-3',
    uri: 'https://picsum.photos/seed/video-thumb-3/800/450',
    title: 'Golden Hour Slow-Mo',
    duration: '1:55',
    durationSec: 115,
    size: '89.4 MB',
    date: 'Nov 10, 2025',
    resolution: '1080p · 1920×1080',
    fps: '120 fps',
  },
  {
    id: 'vid-4',
    uri: 'https://picsum.photos/seed/video-thumb-4/800/450',
    title: 'Product B-Roll — Alinea',
    duration: '2:28',
    durationSec: 148,
    size: '104.2 MB',
    date: 'Nov 8, 2025',
    resolution: '4K · 3840×2160',
    fps: '24 fps',
  },
];

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function VideoPlayerCard({
  video,
  isActive,
  onSelect,
}: {
  video: (typeof VIDEOS)[0];
  isActive: boolean;
  onSelect: () => void;
}) {
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showControls, setShowControls] = useState(isActive);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!isActive) {
      setPlaying(false);
      setProgress(0);
      if (timerRef.current) clearInterval(timerRef.current);
      setShowControls(false);
    } else {
      setShowControls(true);
    }
  }, [isActive]);

  useEffect(() => {
    if (playing) {
      timerRef.current = setInterval(() => {
        setProgress((prev) => {
          const next = prev + 0.45;
          if (next >= 100) {
            setPlaying(false);
            if (timerRef.current) clearInterval(timerRef.current);
            return 100;
          }
          return next;
        });
      }, 200);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [playing]);

  const togglePlay = () => {
    if (progress >= 100) setProgress(0);
    if (!isActive) onSelect();
    setPlaying(!playing);
  };

  const currentTime = (progress / 100) * video.durationSec;
  const remaining = video.durationSec - currentTime;

  return (
    <Pressable
      onPress={() => { if (!isActive) onSelect(); setShowControls(true); }}
      className="bg-[#1E1B18] rounded-2xl overflow-hidden active:scale-[0.99]"
      style={{ shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 6 }}
    >
      {/* Thumbnail / Player surface */}
      <View>
        <Image
          source={{ uri: video.uri }}
          style={{ width: '100%', aspectRatio: 16 / 9, opacity: isActive && playing ? 0.3 : 1 }}
        />

        {/* Center play button */}
        <Pressable
          onPress={togglePlay}
          className="absolute inset-0 items-center justify-center"
        >
          <View className="w-16 h-16 rounded-full bg-black/50 items-center justify-center active:scale-[0.92]">
            {playing ? (
              <PauseIcon size={26} className="text-white" />
            ) : (
              <PlayIcon size={28} className="text-white ml-1" />
            )}
          </View>
        </Pressable>

        {/* Top gradient overlay */}
        <View
          className="absolute top-0 left-0 right-0 h-20"
          style={{
            backgroundColor: 'rgba(0,0,0,0.5)',
            opacity: showControls ? 1 : 0,
          }}
        >
          <View className="px-4 pt-3 flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              <View className="bg-primary rounded-md px-2 py-0.5">
                <Text className="text-white text-[10px] font-bold">{video.resolution.split('·')[0]}</Text>
              </View>
              <Text className="text-white/60 text-[10px]">{video.fps}</Text>
            </View>
            <Text className="text-white/60 text-[10px]">{video.size}</Text>
          </View>
        </View>

        {/* Bottom controls overlay */}
        {showControls && (
          <View
            className="absolute bottom-0 left-0 right-0"
            style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
          >
            {/* Seek bar */}
            <Pressable
              className="h-8 justify-center px-2"
              onPress={(e) => {
                const x = e.nativeEvent.locationX;
                const w = SCREEN_WIDTH - 32;
                const pct = Math.max(0, Math.min(100, (x / w) * 100));
                setProgress(pct);
              }}
            >
              <View className="h-1 bg-white/20 rounded-full overflow-hidden">
                <View className="h-full bg-primary rounded-full" style={{ width: `${progress}%` }} />
              </View>
              <View
                className="absolute w-3.5 h-3.5 rounded-full bg-white"
                style={{
                  left: `${progress}%`,
                  top: 10,
                  marginLeft: -7,
                  shadowColor: '#000',
                  shadowOpacity: 0.3,
                  shadowRadius: 4,
                  shadowOffset: { width: 0, height: 1 },
                }}
              />
            </Pressable>

            {/* Controls row */}
            <View className="flex-row items-center justify-between px-4 pb-3 pt-1">
              <View className="flex-row items-center gap-3">
                <Pressable onPress={togglePlay} className="active:scale-[0.90]">
                  {playing ? (
                    <PauseIcon size={18} className="text-white" />
                  ) : (
                    <PlayIcon size={18} className="text-white ml-0.5" />
                  )}
                </Pressable>
                <Text className="text-white text-xs font-mono">
                  {formatTime(currentTime)}
                  <Text className="text-white/40"> / {video.duration}</Text>
                </Text>
                <Text className="text-white/40 text-[10px]">
                  -{formatTime(remaining)}
                </Text>
              </View>

              <View className="flex-row items-center gap-3">
                <Pressable onPress={() => setMuted(!muted)} className="active:scale-[0.90]">
                  {muted ? (
                    <VolumeXIcon size={16} className="text-white/70" />
                  ) : (
                    <Volume2Icon size={16} className="text-white/70" />
                  )}
                </Pressable>
                <Pressable className="active:scale-[0.90]">
                  <MaximizeIcon size={15} className="text-white/70" />
                </Pressable>
              </View>
            </View>
          </View>
        )}
      </View>

      {/* Info footer */}
      <View className="px-4 py-3">
        <Text className="text-white text-sm font-bold" numberOfLines={1}>
          {video.title}
        </Text>
        <View className="flex-row items-center gap-3 mt-1">
          <Text className="text-white/40 text-[11px]">{video.duration}</Text>
          <Text className="text-white/40 text-[11px]">·</Text>
          <Text className="text-white/40 text-[11px]">{video.resolution}</Text>
        </View>
      </View>
    </Pressable>
  );
}

export default function VideosScreen() {
  const { albumId } = useLocalSearchParams<{ albumId: string }>();
  const { client } = useApp();
  const { user } = useAuth();
  const { isDark } = useTheme();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);

  const { data: album } = useQuery({
    queryKey: ['album', albumId],
    queryFn: async () => {
      const { data, error } = await client
        .from('albums')
        .select('id, name, item_count')
        .eq('id', albumId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!albumId,
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['album', albumId] });
    setRefreshing(false);
  };

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-[#141210]">
      <FlatList
        data={VIDEOS}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#C17745"
          />
        }
        ListHeaderComponent={
          <View className="px-4 pt-3 pb-4 flex-row items-center gap-3">
            <Pressable
              onPress={() => router.back()}
              className="w-10 h-10 rounded-2xl bg-white/10 items-center justify-center active:scale-[0.94]"
            >
              <ArrowLeftIcon size={18} className="text-white" />
            </Pressable>
            <View>
              <Text className="text-white text-lg font-bold tracking-tight">
                {album?.name || 'Videos'}
              </Text>
              <Text className="text-white/40 text-xs mt-0.5">
                {VIDEOS.length} videos
              </Text>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <View className="px-4 mb-4">
            <VideoPlayerCard
              video={item}
              isActive={activeVideoId === item.id}
              onSelect={() => setActiveVideoId(item.id)}
            />
          </View>
        )}
      />
    </SafeAreaView>
  );
}
