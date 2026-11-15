import { useEffect } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { CheckIcon, HeartIcon, PauseIcon, PlayIcon, ShuffleIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { useTheme } from '@/src/hooks';
import { clock } from '@/src/lib/media-grid';
import { PALETTES } from '@/theme';
import type { StoredFile } from '@/src/api';

for (const Icon of [CheckIcon, HeartIcon, PauseIcon, PlayIcon, ShuffleIcon]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/** One bar of the equaliser, scaled from its base so it grows upward. */
function Bar({ playing, from, duration, color }: { playing: boolean; from: number; duration: number; color: string }) {
  const height = useSharedValue(from);

  useEffect(() => {
    cancelAnimation(height);
    height.value = playing
      ? withRepeat(withTiming(1, { duration }), -1, true)
      : withTiming(0.28, { duration: 160 });
    return () => cancelAnimation(height);
  }, [playing, duration, height]);

  const style = useAnimatedStyle(() => ({ transform: [{ scaleY: height.value }] }));

  return (
    <Animated.View
      style={[{ width: 3, height: 14, borderRadius: 2, backgroundColor: color, transformOrigin: 'bottom' }, style]}
    />
  );
}

/**
 * The three bars beside the recording that is playing.
 *
 * They stop when playback stops: a row that is merely chosen should not look
 * like a row that is making sound.
 */
export function PlayingBars({ playing, color }: { playing: boolean; color: string }) {
  return (
    <View className="flex-row items-end gap-[2px] h-3.5">
      <Bar playing={playing} from={0.45} duration={460} color={color} />
      <Bar playing={playing} from={1} duration={330} color={color} />
      <Bar playing={playing} from={0.7} duration={570} color={color} />
    </View>
  );
}

/** "21 December · 3:48 PM", from the recorder when it wrote one, else the upload. */
export function recordedLabel(file: StoredFile): string {
  const stamp = file.takenAt ?? file.createdAt;
  const [date, time = ''] = stamp.split('T');
  const [y, m, d] = date.split('-').map(Number);
  const day = new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
  // An upload time is in UTC and would be hours out; only the recorder's own
  // clock, which carries no zone, is shown as a time of day.
  if (!file.takenAt || !time) return day;
  const [hh, mm] = time.split(':').map(Number);
  const at = new Date(y, m - 1, d, hh, mm).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${day} · ${at}`;
}

/**
 * One recording, as a row of the card every list in the app uses.
 *
 * Recordings were grey squares with a music note in the album's grid, cropped
 * to the size of a photograph and telling nothing a recording has to tell: its
 * name, when, and how long.
 *
 * It draws its own share of the card's edge, so a virtualised list can be one
 * card without a wrapper around rows it has not rendered.
 */
export function RecordingRow({
  file,
  number,
  first,
  last,
  active,
  playing,
  loading,
  selecting,
  selected,
  onPress,
  onLongPress,
}: {
  file: StoredFile;
  /** Its place in the list, shown while it is not the one playing. */
  number: number;
  first: boolean;
  last: boolean;
  active: boolean;
  playing: boolean;
  loading: boolean;
  selecting?: boolean;
  selected?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  const name = file.mediaTitle || file.originalName;

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={280}
      accessibilityRole={selecting ? 'checkbox' : 'button'}
      accessibilityState={selecting ? { checked: !!selected } : { selected: active }}
      accessibilityLabel={`Recording ${number}, ${name}${file.picked ? ', picked by your client' : ''}`}
      accessibilityHint={selecting ? undefined : 'Hold for more'}
      className={`min-h-[60px] flex-row items-center gap-3 pl-2.5 pr-4 bg-card border-x border-border/40 active:opacity-70 ${
        first ? 'rounded-t-[20px] border-t' : 'border-t'
      } ${last ? 'rounded-b-[20px] border-b' : ''}`}
    >
      <View
        className={`w-10 h-10 rounded-xl items-center justify-center ${
          selected ? 'bg-action' : active ? 'bg-primary/15' : 'bg-muted'
        }`}
      >
        {selecting ? (
          selected ? (
            <CheckIcon size={18} className="text-action-foreground" />
          ) : (
            <View className="w-[18px] h-[18px] rounded-full border-2 border-muted-foreground/50" />
          )
        ) : active && loading ? (
          <ActivityIndicator size="small" color={palette.primary} />
        ) : active ? (
          <PlayingBars playing={playing} color={palette.primary} />
        ) : (
          <Text className="text-muted-foreground text-[14px] font-semibold">{number}</Text>
        )}
      </View>
      <View className="flex-1 min-w-0">
        <Text
          className={`text-[15px] leading-5 font-semibold ${active && !selecting ? 'text-primary' : 'text-foreground'}`}
          numberOfLines={1}
        >
          {name}
        </Text>
        <Text className="text-muted-foreground text-[13px] leading-[18px]" numberOfLines={1}>
          {file.mediaArtist || recordedLabel(file)}
        </Text>
      </View>
      {file.picked ? <HeartIcon size={14} color={palette.primary} fill={palette.primary} /> : null}
      <Text className="text-secondary-foreground text-[13px] font-semibold" style={{ fontVariant: ['tabular-nums'] }}>
        {file.durationMs ? clock(file.durationMs / 1000) : file.processingStatus === 'pending' ? '…' : '--:--'}
      </Text>
    </Pressable>
  );
}

/**
 * Play all, and shuffle: the one filled button a list of recordings has.
 */
export function PlayAllBar({
  playing,
  loading,
  shuffle,
  onPlay,
  onShuffle,
}: {
  /** Something from this list is playing now. */
  playing: boolean;
  loading: boolean;
  shuffle: boolean;
  onPlay: () => void;
  onShuffle: () => void;
}) {
  return (
    <View className="flex-row gap-2">
      <Pressable
        onPress={onPlay}
        accessibilityRole="button"
        accessibilityLabel={playing ? 'Pause' : 'Play all'}
        className="flex-1 h-11 rounded-[14px] bg-action flex-row items-center justify-center gap-2 active:opacity-85"
      >
        {loading ? (
          <ActivityIndicator size="small" color={PALETTES.light.actionForeground} />
        ) : playing ? (
          <PauseIcon size={15} color={PALETTES.light.actionForeground} fill={PALETTES.light.actionForeground} />
        ) : (
          <PlayIcon size={15} color={PALETTES.light.actionForeground} fill={PALETTES.light.actionForeground} />
        )}
        <Text className="text-action-foreground text-[15px] font-semibold">{playing ? 'Pause' : 'Play all'}</Text>
      </Pressable>
      <Pressable
        onPress={onShuffle}
        accessibilityRole="switch"
        accessibilityState={{ checked: shuffle }}
        accessibilityLabel="Shuffle"
        className={`w-11 h-11 rounded-[14px] items-center justify-center active:opacity-70 ${
          shuffle ? 'bg-primary/15' : 'bg-muted'
        }`}
      >
        <ShuffleIcon size={19} className={shuffle ? 'text-primary' : 'text-foreground'} strokeWidth={shuffle ? 2.5 : 2} />
      </Pressable>
    </View>
  );
}
