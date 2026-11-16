import { Pressable, ScrollView, Text, View } from 'react-native';
import { AlertCircleIcon } from 'lucide-react-native';
import { RemoteImage } from '@/components/RemoteImage';
import { VideoThumbnail } from '@/components/VideoThumbnail';
import { MAX_SHOWCASE_ITEMS } from '@/src/api';
import { useTheme } from '@/src/hooks';
import { PALETTES } from '@/theme';
import { FilmMark, pieceLine, type PieceAbout, type PieceKind } from './parts';

/** On a photograph, whatever the theme. */
const ON_PHOTO = 'rgba(20,16,13,0.6)';

/**
 * What is chosen, in order — including anything picked in another album,
 * which the grid below no longer shows. Tap one to make it the cover, move it,
 * or take it out: changing the cover meant taking everything out and picking
 * again in a new order.
 *
 * A film on its own is shown as what it is, one row with its name and length,
 * rather than as a strip of one.
 */
export function ChosenStrip({
  picked,
  stills,
  kinds,
  about,
  faultyKey,
  onArrange,
}: {
  picked: string[];
  stills: Record<string, string>;
  kinds: Record<string, PieceKind>;
  about: Record<string, PieceAbout>;
  /** The piece the server turned down, marked until it is dealt with. */
  faultyKey?: string;
  onArrange: (index: number) => void;
}) {
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  const filmAlone = picked.length === 1 && kinds[picked[0]] === 'video';

  const thumb = (key: string, i: number, numbered: boolean) => {
    const bad = faultyKey === key;
    const film = kinds[key] === 'video';
    return (
      <Pressable
        key={key}
        onPress={() => onArrange(i)}
        accessibilityRole="button"
        accessibilityLabel={`Chosen, number ${i + 1}${i === 0 ? ', the cover' : ''}${bad ? ', cannot be posted' : ''}. Arrange.`}
        className="bg-muted active:opacity-80"
        style={{
          width: 64,
          height: 64,
          borderRadius: 12,
          overflow: 'hidden',
          borderWidth: bad ? 2 : 0,
          borderColor: palette.destructive,
        }}
      >
        {stills[key] ? (
          <RemoteImage source={{ uri: stills[key] }} style={{ flex: 1 }} />
        ) : film ? (
          <View className="flex-1 items-center justify-center bg-secondary">
            <VideoThumbnail size={38} />
          </View>
        ) : null}
        {numbered ? (
          <View
            className="absolute left-1 top-1 h-[18px] min-w-[18px] px-1 rounded-full items-center justify-center"
            style={{ backgroundColor: ON_PHOTO }}
          >
            <Text className="text-[11px] font-bold" style={{ color: '#FFFFFF' }}>{i + 1}</Text>
          </View>
        ) : null}
        {numbered && i === 0 ? (
          <View className="absolute left-0 right-0 bottom-0 py-0.5" style={{ backgroundColor: ON_PHOTO }}>
            <Text className="text-[10px] font-bold text-center" style={{ color: '#FFFFFF' }}>Cover</Text>
          </View>
        ) : null}
        {!numbered && film ? <FilmMark durationMs={about[key]?.durationMs} /> : null}
        {bad ? (
          <View className="absolute right-1 top-1 w-5 h-5 rounded-full bg-destructive items-center justify-center">
            <AlertCircleIcon size={12} color="#FFFFFF" />
          </View>
        ) : null}
      </Pressable>
    );
  };

  return (
    <View className="gap-3">
      <View className="px-5 flex-row items-baseline justify-between">
        <Text
          accessibilityRole="header"
          className="text-foreground text-[17px] leading-6 font-bold tracking-[-0.2px]"
        >
          Chosen
        </Text>
        <Text className="text-muted-foreground text-[13px] leading-[18px]">
          {filmAlone ? 'One film' : `${picked.length} of ${MAX_SHOWCASE_ITEMS}`}
        </Text>
      </View>

      {filmAlone ? (
        <View className="px-5 flex-row items-center gap-3">
          {thumb(picked[0], 0, false)}
          <View className="flex-1 min-w-0">
            <Text numberOfLines={1} className="text-foreground text-[15px] leading-5 font-semibold">
              {about[picked[0]]?.name ?? 'A film'}
            </Text>
            {pieceLine(about[picked[0]], true) ? (
              <Text numberOfLines={1} className="text-muted-foreground text-[13px] leading-[18px]">
                {pieceLine(about[picked[0]], true)}
              </Text>
            ) : null}
          </View>
        </View>
      ) : picked.length > 0 ? (
        <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}
          >
            {picked.map((key, i) => thumb(key, i, true))}
          </ScrollView>
          <Text className="px-5 text-muted-foreground text-[13px] leading-[18px]">
            The first is the cover. Tap one to move it or take it out.
          </Text>
        </>
      ) : null}
    </View>
  );
}
