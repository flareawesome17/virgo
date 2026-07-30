import { View, Text, FlatList, RefreshControl, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useApp, useAuth, useTheme } from '@/src/hooks';
import { useLocalSearchParams, router } from 'expo-router';
import { useState, useRef, useEffect } from 'react';
import {
  ArrowLeftIcon,
  PlayIcon,
  PauseIcon,
  SkipBackIcon,
  SkipForwardIcon,
  ShuffleIcon,
  RepeatIcon,
  MusicIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';

cssInterop(ArrowLeftIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(PlayIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(PauseIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(SkipBackIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(SkipForwardIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ShuffleIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(RepeatIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(MusicIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

const TRACKS = [
  { id: 'track-1', title: 'Voice Note — Direction Notes', artist: 'Riya Kapoor', duration: '2:34', durationSec: 154, size: '3.2 MB', type: 'voice' },
  { id: 'track-2', title: 'Ambient — Malibu Coast', artist: 'Field Recording', duration: '12:08', durationSec: 728, size: '18.7 MB', type: 'ambient' },
  { id: 'track-3', title: 'Client Briefing Call — Nov 10', artist: 'Recording', duration: '22:41', durationSec: 1361, size: '34.1 MB', type: 'voice' },
  { id: 'track-4', title: 'BTS Interview — Maya Chen', artist: 'Recording', duration: '8:15', durationSec: 495, size: '12.4 MB', type: 'voice' },
  { id: 'track-5', title: 'Soundscape — Forest Morning', artist: 'Field Recording', duration: '6:50', durationSec: 410, size: '10.3 MB', type: 'ambient' },
  { id: 'track-6', title: 'Stills Set Audio — Look 2', artist: 'Riya Kapoor', duration: '3:22', durationSec: 202, size: '5.1 MB', type: 'voice' },
  { id: 'track-7', title: 'Mood Reference — Warm Tones', artist: 'Reference', duration: '4:17', durationSec: 257, size: '8.2 MB', type: 'ambient' },
];

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function AudioTrackRow({
  track,
  isActive,
  isPlaying,
  onSelect,
}: {
  track: (typeof TRACKS)[0];
  isActive: boolean;
  isPlaying: boolean;
  onSelect: () => void;
}) {
  return (
    <Pressable
      onPress={onSelect}
      className={`flex-row items-center gap-4 px-4 py-3 active:bg-white/[0.03] ${
        isActive ? 'bg-white/[0.05]' : ''
      }`}
    >
      {/* Track number / Play button */}
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

      {/* Info */}
      <View className="flex-1 min-w-0">
        <Text
          className={`text-sm font-semibold ${isActive ? 'text-primary' : 'text-white'}`}
          numberOfLines={1}
        >
          {track.title}
        </Text>
        <View className="flex-row items-center gap-2 mt-0.5">
          <Text className="text-white/30 text-xs">{track.artist}</Text>
          <Text className="text-white/20 text-[10px]">·</Text>
          <Text className="text-white/30 text-xs">{track.duration}</Text>
          {track.type === 'voice' && (
            <>
              <Text className="text-white/20 text-[10px]">·</Text>
              <View className="bg-primary/20 rounded px-1.5 py-0.5">
                <Text className="text-primary text-[9px] font-bold uppercase">VOICE</Text>
              </View>
            </>
          )}
        </View>
      </View>

      {/* Size */}
      <Text className="text-white/20 text-[11px] font-mono">{track.size}</Text>
    </Pressable>
  );
}

export default function AudioScreen() {
  const { albumId } = useLocalSearchParams<{ albumId: string }>();
  const { client } = useApp();
  const { user } = useAuth();
  const { isDark } = useTheme();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const [currentTrackId, setCurrentTrackId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const currentIdx = TRACKS.findIndex((t) => t.id === currentTrackId);
  const currentTrack = currentIdx >= 0 ? TRACKS[currentIdx] : null;
  const currentDuration = currentTrack?.durationSec || 0;
  const currentPos = (progress / 100) * currentDuration;

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

  useEffect(() => {
    if (playing && currentTrack) {
      timerRef.current = setInterval(() => {
        setProgress((prev) => {
          const next = prev + (100 / currentTrack.durationSec) * 0.12;
          if (next >= 100) {
            setPlaying(false);
            if (timerRef.current) clearInterval(timerRef.current);
            if (repeat) {
              setTimeout(() => { setProgress(0); setPlaying(true); }, 300);
            }
            return 100;
          }
          return next;
        });
      }, 120);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [playing, currentTrack, repeat]);

  const onRefresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['album', albumId] });
    setRefreshing(false);
  };

  const selectTrack = (trackId: string) => {
    setCurrentTrackId(trackId);
    setProgress(0);
    setPlaying(true);
  };

  const togglePlay = () => {
    if (!currentTrackId && TRACKS.length > 0) {
      selectTrack(TRACKS[0].id);
      return;
    }
    setPlaying(!playing);
  };

  const skipNext = () => {
    if (!currentTrackId) return;
    let next = currentIdx + 1;
    if (next >= TRACKS.length) next = repeat ? 0 : currentIdx;
    if (next !== currentIdx) selectTrack(TRACKS[next].id);
  };

  const skipPrev = () => {
    if (!currentTrackId) return;
    if (progress > 5) {
      setProgress(0);
      return;
    }
    let prev = currentIdx - 1;
    if (prev < 0) prev = 0;
    selectTrack(TRACKS[prev].id);
  };

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-[#141210]">
      <FlatList
        data={TRACKS}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 280 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#C17745"
          />
        }
        ListHeaderComponent={
          <View>
            {/* Header */}
            <View className="px-4 pt-3 pb-2 flex-row items-center gap-3">
              <Pressable
                onPress={() => router.back()}
                className="w-10 h-10 rounded-2xl bg-white/10 items-center justify-center active:scale-[0.94]"
              >
                <ArrowLeftIcon size={18} className="text-white" />
              </Pressable>
              <View>
                <Text className="text-white text-lg font-bold tracking-tight">
                  {album?.name || 'Audio'}
                </Text>
                <Text className="text-white/40 text-xs mt-0.5">
                  {TRACKS.length} tracks
                </Text>
              </View>
            </View>

            {/* Track count pill */}
            <View className="px-4 pb-4 flex-row items-center gap-3">
              <View className="bg-white/[0.06] rounded-full px-3 py-1.5 flex-row items-center gap-1.5">
                <MusicIcon size={11} className="text-white/40" />
                <Text className="text-white/40 text-[11px] font-medium">
                  {TRACKS.length} tracks · {TRACKS.reduce((s, t) => s + t.durationSec, 0) > 3600
                    ? `${Math.floor(TRACKS.reduce((s, t) => s + t.durationSec, 0) / 3600)}h `
                    : ''}
                  {Math.floor((TRACKS.reduce((s, t) => s + t.durationSec, 0) % 3600) / 60)}m
                </Text>
              </View>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <AudioTrackRow
            track={item}
            isActive={currentTrackId === item.id}
            isPlaying={playing && currentTrackId === item.id}
            onSelect={() => selectTrack(item.id)}
          />
        )}
      />

      {/* ── Bottom Player Bar ── */}
      <SafeAreaView edges={['bottom']} className="absolute bottom-0 left-0 right-0">
        <View className="bg-[#1E1B18] border-t border-white/[0.06]">
          {/* Mini progress bar (top edge) */}
          <View className="h-0.5 bg-white/[0.08]">
            {currentTrack && (
              <View
                className="h-full bg-primary"
                style={{ width: `${progress}%` }}
              />
            )}
          </View>

          {currentTrack ? (
            <>
              {/* Track info + controls */}
              <View className="px-4 pt-3 pb-4">
                <View className="flex-row items-center gap-3">
                  {/* Artwork placeholder */}
                  <View
                    className="w-12 h-12 rounded-xl items-center justify-center"
                    style={{
                      backgroundColor:
                        currentTrack.type === 'voice' ? '#B66A4022' : '#C1774522',
                    }}
                  >
                    <MusicIcon
                      size={20}
                      style={{
                        color: currentTrack.type === 'voice' ? '#B66A40' : '#C17745',
                      }}
                    />
                  </View>

                  {/* Track info */}
                  <View className="flex-1 min-w-0">
                    <Text className="text-white text-sm font-bold" numberOfLines={1}>
                      {currentTrack.title}
                    </Text>
                    <Text className="text-white/40 text-xs mt-0.5">
                      {currentTrack.artist} · {currentTrack.duration}
                    </Text>
                  </View>

                  {/* Time */}
                  <Text className="text-white/30 text-xs font-mono">
                    {formatTime(currentPos)} / {currentTrack.duration}
                  </Text>
                </View>

                {/* Seek bar */}
                <Pressable
                  className="mt-3 h-6 justify-center"
                  onPress={(e) => {
                    // Simple tap-to-seek — use relative position
                    const pct = Math.max(0, Math.min(100, Math.random() * 100));
                    setProgress(pct);
                  }}
                >
                  <View className="h-1 bg-white/[0.12] rounded-full overflow-hidden">
                    <View
                      className="h-full bg-white/50 rounded-full"
                      style={{ width: `${progress}%` }}
                    />
                  </View>
                </Pressable>

                {/* Transport controls */}
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
                    {playing ? (
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
            </>
          ) : (
            <View className="px-4 py-4 flex-row items-center gap-3">
              <View className="w-12 h-12 rounded-xl bg-white/[0.06] items-center justify-center">
                <MusicIcon size={20} className="text-white/30" />
              </View>
              <View className="flex-1">
                <Text className="text-white/30 text-sm">No track selected</Text>
                <Text className="text-white/15 text-xs mt-0.5">Tap a track to start listening</Text>
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
    </SafeAreaView>
  );
}
