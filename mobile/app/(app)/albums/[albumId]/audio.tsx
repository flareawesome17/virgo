import { View, Text, FlatList, RefreshControl, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ArrowLeftIcon,
  MusicIcon,
  UploadIcon,
  PlayIcon,
  PauseIcon,
  SkipBackIcon,
  SkipForwardIcon,
  ShuffleIcon,
  RepeatIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { fileNameFromKey, useAlbum, useAlbumFiles } from '@/src/hooks';
import { formatBytes, type StoredFile } from '@/src/api';
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from 'expo-audio';

cssInterop(ArrowLeftIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(MusicIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(UploadIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(PlayIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(PauseIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(SkipBackIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(SkipForwardIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ShuffleIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(RepeatIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

/** Seconds -> `m:ss`, or `h:mm:ss` past an hour. */
function clock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

function AudioTrackRow({
  file,
  isActive,
  isPlaying,
  duration,
  onSelect,
}: {
  file: StoredFile;
  isActive: boolean;
  isPlaying: boolean;
  /** Only known once loaded — a stored object carries no duration. */
  duration: string | null;
  onSelect: () => void;
}) {
  return (
    <Pressable
      onPress={onSelect}
      className={`flex-row items-center gap-4 px-4 py-3 active:bg-white/[0.03] ${
        isActive ? 'bg-white/[0.05]' : ''
      }`}
    >
      <View
        className={`w-11 h-11 rounded-xl items-center justify-center ${
          isActive ? 'bg-primary' : 'bg-white/[0.08]'
        }`}
      >
        {isActive && isPlaying ? (
          <PauseIcon size={18} className="text-white" />
        ) : (
          <PlayIcon size={16} className={isActive ? 'text-white' : 'text-white/50 ml-0.5'} />
        )}
      </View>

      <View className="flex-1 min-w-0">
        <Text
          className={`text-sm font-semibold ${isActive ? 'text-primary' : 'text-white'}`}
          numberOfLines={1}
        >
          {fileNameFromKey(file.key)}
        </Text>
        <View className="flex-row items-center gap-2 mt-0.5">
          {/* The original showed an invented artist and duration on every row.
              A stored object has neither, so this shows what it does have. */}
          <Text className="text-white/30 text-xs">
            {file.contentType?.split('/')[1]?.toUpperCase() ?? 'AUDIO'}
          </Text>
          {duration && (
            <>
              <Text className="text-white/20 text-[10px]">·</Text>
              <Text className="text-white/30 text-xs">{duration}</Text>
            </>
          )}
        </View>
      </View>

      <Text className="text-white/20 text-[11px] font-mono">{formatBytes(file.sizeBytes)}</Text>
    </Pressable>
  );
}

/**
 * Audio stored in an album, with playback.
 *
 * The screen shipped with a hardcoded TRACKS list — six invented recordings
 * with fake artists and durations — and a setInterval that advanced a progress
 * bar while nothing played. Its seek handler literally called `Math.random()`.
 *
 * The layout here is that original design, restored. Everything behind it is
 * real: files come from the bucket, and position, duration, seeking, skipping,
 * shuffle and repeat are all driven by expo-audio.
 */
export default function AudioScreen() {
  const { albumId } = useLocalSearchParams<{ albumId: string }>();
  const [refreshing, setRefreshing] = useState(false);
  const [barWidth, setBarWidth] = useState(0);

  const { data: album, refetch: refetchAlbum } = useAlbum(albumId);
  const { audio: files, refetch: refetchFiles, isLoading } = useAlbumFiles(albumId);

  // One player, re-pointed at each track. A player per file would leak.
  const player = useAudioPlayer();
  const status = useAudioPlayerStatus(player);

  const [currentKey, setCurrentKey] = useState<string | null>(null);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState(false);

  const currentIdx = files.findIndex((f) => f.key === currentKey);
  const currentFile = currentIdx >= 0 ? files[currentIdx] : null;

  const duration = status.isLoaded ? status.duration : 0;
  const position = status.isLoaded ? status.currentTime : 0;
  const progress = duration > 0 ? Math.min((position / duration) * 100, 100) : 0;

  // iOS will not play with the ringer switch silenced unless this is set,
  // which otherwise reads as the player being broken.
  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
  }, []);

  const playFile = (file: StoredFile) => {
    if (!file.url) {
      Alert.alert('Cannot play', 'This file has no playable URL.');
      return;
    }
    player.replace({ uri: file.url });
    setCurrentKey(file.key);
    player.play();
  };

  const selectTrack = (file: StoredFile) => {
    if (file.key === currentKey) {
      status.playing ? player.pause() : player.play();
      return;
    }
    playFile(file);
  };

  const togglePlay = () => {
    if (!currentFile) {
      // Matches the original's empty-state affordance: pressing play with
      // nothing selected starts the first track.
      if (files.length > 0) playFile(files[0]);
      return;
    }
    status.playing ? player.pause() : player.play();
  };

  const nextIndex = (): number => {
    if (files.length === 0) return -1;
    if (shuffle && files.length > 1) {
      // Never pick the track already playing, or shuffle stalls on it.
      let pick = currentIdx;
      while (pick === currentIdx) pick = Math.floor(Math.random() * files.length);
      return pick;
    }
    return (currentIdx + 1) % files.length;
  };

  const skipNext = () => {
    const i = nextIndex();
    if (i >= 0) playFile(files[i]);
  };

  const skipPrev = () => {
    if (files.length === 0) return;
    // Standard transport behaviour: restart the track first, and only step
    // back when already near the beginning.
    if (position > 3) {
      player.seekTo(0);
      return;
    }
    const i = currentIdx <= 0 ? files.length - 1 : currentIdx - 1;
    playFile(files[i]);
  };

  // Advance when a track ends. The original faked this with a timer counting
  // down a hardcoded duration.
  useEffect(() => {
    if (!status.didJustFinish) return;
    if (repeat) {
      player.seekTo(0);
      player.play();
      return;
    }
    skipNext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status.didJustFinish]);

  const seekToFraction = (fraction: number) => {
    if (!status.isLoaded || duration <= 0) return;
    player.seekTo(Math.max(0, Math.min(fraction, 1)) * duration);
  };

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
        contentContainerStyle={{ paddingBottom: 280 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#C17745" />
        }
        ListHeaderComponent={
          <View>
            <View className="px-4 pt-3 pb-2 flex-row items-center gap-3">
              <Pressable
                onPress={() => router.back()}
                className="w-10 h-10 rounded-2xl bg-white/10 items-center justify-center active:scale-[0.94]"
              >
                <ArrowLeftIcon size={18} className="text-white" />
              </Pressable>
              <View className="flex-1 min-w-0">
                <Text className="text-white text-lg font-bold tracking-tight" numberOfLines={1}>
                  {album?.name || 'Audio'}
                </Text>
                <Text className="text-white/40 text-xs mt-0.5">
                  {files.length} track{files.length === 1 ? '' : 's'}
                </Text>
              </View>
            </View>

            {files.length > 0 && (
              <View className="px-4 pb-4 flex-row items-center gap-3">
                <View className="bg-white/[0.06] rounded-full px-3 py-1.5 flex-row items-center gap-1.5">
                  <MusicIcon size={11} className="text-white/40" />
                  <Text className="text-white/40 text-[11px] font-medium">
                    {files.length} track{files.length === 1 ? '' : 's'} · {formatBytes(totalBytes)}
                  </Text>
                </View>
              </View>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <AudioTrackRow
            file={item}
            isActive={currentKey === item.key}
            isPlaying={status.playing && currentKey === item.key}
            duration={
              currentKey === item.key && status.isLoaded && duration > 0 ? clock(duration) : null
            }
            onSelect={() => selectTrack(item)}
          />
        )}
        ListEmptyComponent={
          isLoading ? null : (
            <View className="items-center px-10 mt-20">
              <View className="w-20 h-20 rounded-full bg-white/[0.06] items-center justify-center mb-5">
                <MusicIcon size={30} className="text-white/30" />
              </View>
              <Text className="text-white text-base font-bold">No audio yet</Text>
              <Text className="text-white/40 text-sm text-center mt-2">
                Audio you upload to this album will appear here.
              </Text>
              <Pressable
                onPress={() => router.push(`/albums/upload?albumId=${albumId}&kind=audio`)}
                className="mt-7 bg-primary rounded-2xl px-7 py-3 flex-row items-center gap-2 active:scale-[0.96]"
              >
                <UploadIcon size={16} className="text-white" />
                <Text className="text-white text-sm font-bold">Upload audio</Text>
              </Pressable>
            </View>
          )
        }
      />

      {/* ── Bottom Player Bar ── */}
      {files.length > 0 && (
        <SafeAreaView edges={['bottom']} className="absolute bottom-0 left-0 right-0">
          <View className="bg-[#1E1B18] border-t border-white/[0.06]">
            {/* Mini progress along the top edge */}
            <View className="h-0.5 bg-white/[0.08]">
              {currentFile && (
                <View className="h-full bg-primary" style={{ width: `${progress}%` }} />
              )}
            </View>

            {currentFile ? (
              <View className="px-4 pt-3 pb-4">
                <View className="flex-row items-center gap-3">
                  <View
                    className="w-12 h-12 rounded-xl items-center justify-center"
                    style={{ backgroundColor: '#C1774522' }}
                  >
                    <MusicIcon size={20} color="#C17745" />
                  </View>

                  <View className="flex-1 min-w-0">
                    <Text className="text-white text-sm font-bold" numberOfLines={1}>
                      {fileNameFromKey(currentFile.key)}
                    </Text>
                    <Text className="text-white/40 text-xs mt-0.5">
                      {status.isLoaded ? formatBytes(currentFile.sizeBytes) : 'Loading…'}
                    </Text>
                  </View>

                  <Text className="text-white/30 text-xs font-mono">
                    {clock(position)} / {duration > 0 ? clock(duration) : '--:--'}
                  </Text>
                </View>

                {/* Seek bar. The original's onPress called Math.random(). */}
                <Pressable
                  className="mt-3 h-6 justify-center"
                  onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
                  onPress={(e) => seekToFraction(e.nativeEvent.locationX / Math.max(barWidth, 1))}
                >
                  <View className="h-1 bg-white/[0.12] rounded-full overflow-hidden">
                    <View
                      className="h-full bg-white/50 rounded-full"
                      style={{ width: `${progress}%` }}
                    />
                  </View>
                </Pressable>

                {/* Transport */}
                <View className="flex-row items-center justify-between mt-3 px-6">
                  <Pressable
                    onPress={() => setShuffle(!shuffle)}
                    className={`active:scale-[0.90] ${shuffle ? 'opacity-100' : 'opacity-40'}`}
                  >
                    <ShuffleIcon size={16} className="text-white" />
                  </Pressable>

                  <Pressable onPress={skipPrev} className="active:scale-[0.90]">
                    <SkipBackIcon size={22} className="text-white" />
                  </Pressable>

                  <Pressable
                    onPress={togglePlay}
                    className="w-14 h-14 rounded-full bg-primary items-center justify-center active:scale-[0.92]"
                    style={{
                      shadowColor: '#B66A40',
                      shadowOpacity: 0.3,
                      shadowRadius: 12,
                      shadowOffset: { width: 0, height: 2 },
                      elevation: 6,
                    }}
                  >
                    {status.playing ? (
                      <PauseIcon size={24} className="text-white" />
                    ) : (
                      <PlayIcon size={26} className="text-white ml-1" />
                    )}
                  </Pressable>

                  <Pressable onPress={skipNext} className="active:scale-[0.90]">
                    <SkipForwardIcon size={22} className="text-white" />
                  </Pressable>

                  <Pressable
                    onPress={() => setRepeat(!repeat)}
                    className={`active:scale-[0.90] ${repeat ? 'opacity-100' : 'opacity-40'}`}
                  >
                    <RepeatIcon size={16} className="text-white" />
                  </Pressable>
                </View>
              </View>
            ) : (
              <View className="px-4 py-4 flex-row items-center gap-3">
                <View className="w-12 h-12 rounded-xl bg-white/[0.06] items-center justify-center">
                  <MusicIcon size={20} className="text-white/30" />
                </View>
                <View className="flex-1">
                  <Text className="text-white/30 text-sm">No track selected</Text>
                  <Text className="text-white/15 text-xs mt-0.5">
                    Tap a track to start listening
                  </Text>
                </View>
                <Pressable
                  onPress={togglePlay}
                  className="w-10 h-10 rounded-full bg-white/[0.08] items-center justify-center active:scale-[0.92]"
                >
                  <PlayIcon size={16} className="text-white/50 ml-0.5" />
                </Pressable>
              </View>
            )}
          </View>
        </SafeAreaView>
      )}
    </SafeAreaView>
  );
}
