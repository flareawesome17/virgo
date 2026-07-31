import { View, Text, FlatList, RefreshControl, Pressable, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeftIcon,
  VideoIcon,
  PlayIcon,
  PauseIcon,
  UploadIcon,
  Volume2Icon,
  VolumeXIcon,
  MaximizeIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { fileNameFromKey, useAlbum, useAlbumFiles } from '@/src/hooks';
import { formatBytes, type StoredFile } from '@/src/api';
import { useVideoPlayer, VideoView, type VideoView as VideoViewType } from 'expo-video';

cssInterop(ArrowLeftIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(VideoIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(PlayIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(PauseIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(UploadIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(Volume2Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(VolumeXIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(MaximizeIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

const SCREEN_WIDTH = Dimensions.get('window').width;

/** Seconds -> `m:ss`. */
function clock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * One video card: surface, centre play button, and an overlay with a seek bar,
 * elapsed/remaining time, mute and fullscreen.
 *
 * The layout is the original design. What it does is new — the original card
 * rendered a picsum still with a setInterval advancing a fake progress bar, a
 * seek handler that only moved that bar, and a fullscreen button wired to
 * nothing.
 */
function VideoCard({ file }: { file: StoredFile }) {
  const [showControls, setShowControls] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const viewRef = useRef<VideoViewType>(null);

  const player = useVideoPlayer(file.url ?? '', (p) => {
    p.muted = false;
  });

  // expo-video exposes position by polling rather than a status hook, so the
  // overlay's clock is driven from here while something is playing.
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setPosition(player.currentTime ?? 0);
      setDuration(player.duration ?? 0);
    }, 250);
    return () => clearInterval(id);
  }, [playing, player]);

  const togglePlay = () => {
    if (playing) {
      player.pause();
      setPlaying(false);
    } else {
      player.play();
      setPlaying(true);
    }
    setShowControls(true);
  };

  const toggleMute = () => {
    const next = !muted;
    player.muted = next;
    setMuted(next);
  };

  const progress = duration > 0 ? Math.min((position / duration) * 100, 100) : 0;
  const remaining = Math.max(duration - position, 0);

  return (
    <Pressable
      onPress={() => setShowControls((v) => !v)}
      className="bg-[#1E1B18] rounded-2xl overflow-hidden"
      style={{ shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 6 }}
    >
      <View>
        <VideoView
          ref={viewRef}
          player={player}
          style={{ width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000' }}
          contentFit="contain"
          // Our own overlay is the control surface; the native one would sit
          // on top of it and duplicate every button.
          nativeControls={false}
          allowsFullscreen
        />

        {/* Centre play button — hidden while playing so it does not sit over
            the picture. */}
        {(!playing || showControls) && (
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
        )}

        {/* Top overlay. The original showed an invented resolution and frame
            rate here; a stored object carries neither, so it shows the file
            type and real size. */}
        {showControls && (
          <View
            className="absolute top-0 left-0 right-0 h-20"
            style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
            pointerEvents="none"
          >
            <View className="px-4 pt-3 flex-row items-center justify-between">
              <View className="bg-primary rounded-md px-2 py-0.5">
                <Text className="text-white text-[10px] font-bold">
                  {file.contentType?.split('/')[1]?.toUpperCase() ?? 'VIDEO'}
                </Text>
              </View>
              <Text className="text-white/60 text-[10px]">{formatBytes(file.sizeBytes)}</Text>
            </View>
          </View>
        )}

        {showControls && (
          <View
            className="absolute bottom-0 left-0 right-0"
            style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
          >
            {/* Seek bar — real, unlike the original which only moved the bar. */}
            <Pressable
              className="h-8 justify-center px-2"
              onPress={(e) => {
                if (duration <= 0) return;
                const w = SCREEN_WIDTH - 32;
                const fraction = Math.max(0, Math.min(e.nativeEvent.locationX / w, 1));
                player.currentTime = fraction * duration;
                setPosition(fraction * duration);
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
                  {clock(position)}
                  <Text className="text-white/40">
                    {' / '}
                    {duration > 0 ? clock(duration) : '--:--'}
                  </Text>
                </Text>
                {duration > 0 && (
                  <Text className="text-white/40 text-[10px]">-{clock(remaining)}</Text>
                )}
              </View>

              <View className="flex-row items-center gap-3">
                <Pressable onPress={toggleMute} className="active:scale-[0.90]">
                  {muted ? (
                    <VolumeXIcon size={16} className="text-white/70" />
                  ) : (
                    <Volume2Icon size={16} className="text-white/70" />
                  )}
                </Pressable>
                {/* This button did nothing before. */}
                {/* Native fullscreen. This button did nothing before. */}
                <Pressable
                  onPress={() => viewRef.current?.enterFullscreen()}
                  className="active:scale-[0.90]"
                >
                  <MaximizeIcon size={15} className="text-white/70" />
                </Pressable>
              </View>
            </View>
          </View>
        )}
      </View>

      <View className="px-4 py-3">
        <Text className="text-white text-sm font-semibold" numberOfLines={1}>
          {fileNameFromKey(file.key)}
        </Text>
      </View>
    </Pressable>
  );
}

/**
 * Videos stored in an album.
 *
 * The screen previously shipped four hardcoded clips with invented durations,
 * resolutions and frame rates, picsum thumbnails and simulated playback. It now
 * lists what is really in the bucket and plays it through expo-video.
 *
 * There are still no thumbnails: nothing generates them, and a stock image
 * would misrepresent the file. The player surface itself stands in.
 */
export default function VideosScreen() {
  const { albumId } = useLocalSearchParams<{ albumId: string }>();
  const [refreshing, setRefreshing] = useState(false);

  const { data: album, refetch: refetchAlbum } = useAlbum(albumId);
  const { videos: files, refetch: refetchFiles, isLoading } = useAlbumFiles(albumId);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refetchAlbum(), refetchFiles()]);
    setRefreshing(false);
  };

  const totalBytes = files.reduce((s, f) => s + f.sizeBytes, 0);

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-[#141210]">
      <FlatList
        data={files}
        keyExtractor={(item) => item.key}
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#C17745" />
        }
        ListHeaderComponent={
          <View className="px-4 pt-3 pb-3 flex-row items-center gap-3">
            <Pressable
              onPress={() => router.back()}
              className="w-10 h-10 rounded-2xl bg-white/10 items-center justify-center active:scale-[0.94]"
            >
              <ArrowLeftIcon size={18} className="text-white" />
            </Pressable>
            <View className="flex-1 min-w-0">
              <Text className="text-white text-lg font-bold tracking-tight" numberOfLines={1}>
                {album?.name || 'Videos'}
              </Text>
              <Text className="text-white/40 text-xs mt-0.5">
                {files.length} video{files.length === 1 ? '' : 's'}
                {files.length > 0 ? ` · ${formatBytes(totalBytes)}` : ''}
              </Text>
            </View>
          </View>
        }
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        renderItem={({ item }) => (
          <View className="px-4">
            <VideoCard file={item} />
          </View>
        )}
        ListEmptyComponent={
          isLoading ? null : (
            <View className="items-center px-10 mt-20">
              <View className="w-20 h-20 rounded-full bg-white/[0.06] items-center justify-center mb-5">
                <VideoIcon size={30} className="text-white/30" />
              </View>
              <Text className="text-white text-base font-bold">No videos yet</Text>
              <Text className="text-white/40 text-sm text-center mt-2">
                Videos you upload to this album will appear here.
              </Text>
              <Pressable
                onPress={() => router.push(`/albums/upload?albumId=${albumId}&kind=media`)}
                className="mt-7 bg-primary rounded-2xl px-7 py-3 flex-row items-center gap-2 active:scale-[0.96]"
              >
                <UploadIcon size={16} className="text-white" />
                <Text className="text-white text-sm font-bold">Upload video</Text>
              </Pressable>
            </View>
          )
        }
      />
    </SafeAreaView>
  );
}
