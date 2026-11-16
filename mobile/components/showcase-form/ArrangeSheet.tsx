import { Pressable, Text, View } from 'react-native';
import { ArrowLeftIcon, ArrowRightIcon, StarIcon, Trash2Icon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { BottomSheet } from '@/components/BottomSheet';
import { RemoteImage } from '@/components/RemoteImage';
import { VideoThumbnail } from '@/components/VideoThumbnail';
import { pieceLine, type PieceAbout, type PieceKind } from './parts';

for (const Icon of [ArrowLeftIcon, ArrowRightIcon, StarIcon, Trash2Icon]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/**
 * Arranging one chosen piece: cover, earlier, later, out. A sheet, not an
 * alert: Android shows an alert's first three buttons and drops the rest.
 *
 * Moving earlier or later keeps the sheet open on the piece as it moves, so
 * it can be walked along the row; making it the cover or taking it out is the
 * end of the errand, and closes it.
 */
export function ArrangeSheet({
  index,
  count,
  still,
  kind,
  about,
  onCover,
  onEarlier,
  onLater,
  onRemove,
  onClose,
}: {
  /** Which chosen piece, from 0; null while the sheet is shut. */
  index: number | null;
  count: number;
  still?: string;
  kind?: PieceKind;
  about?: PieceAbout;
  onCover: () => void;
  onEarlier: () => void;
  onLater: () => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const line = pieceLine(about);
  return (
    <BottomSheet visible={index !== null} onClose={onClose}>
      <View className="pt-2 pb-3">
        <Text
          accessibilityRole="header"
          className="px-5 text-foreground text-[18px] leading-[26px] font-bold tracking-[-0.2px]"
        >
          {index === 0 ? 'The cover' : `Number ${(index ?? 0) + 1}`}
        </Text>

        <View className="px-5 pt-2.5 pb-1.5 flex-row items-center gap-3">
          <View className="bg-muted" style={{ width: 72, height: 72, borderRadius: 14, overflow: 'hidden' }}>
            {still ? (
              <RemoteImage source={{ uri: still }} style={{ flex: 1 }} />
            ) : kind === 'video' ? (
              <View className="flex-1 items-center justify-center bg-secondary">
                <VideoThumbnail size={42} />
              </View>
            ) : null}
          </View>
          {line ? (
            <Text numberOfLines={3} className="flex-1 text-muted-foreground text-[13px] leading-[18px]">
              {line}
            </Text>
          ) : null}
        </View>

        {index !== null && index > 0 && (
          <ArrangeRow
            icon={StarIcon}
            label="Make it the cover"
            note="It goes first, and is what the feed shows."
            onPress={onCover}
          />
        )}
        {index !== null && index > 0 && (
          <ArrangeRow icon={ArrowLeftIcon} label="Move earlier" onPress={onEarlier} />
        )}
        {index !== null && index < count - 1 && (
          <ArrangeRow icon={ArrowRightIcon} label="Move later" onPress={onLater} />
        )}
        <ArrangeRow icon={Trash2Icon} label="Take it out" destructive onPress={onRemove} />

        <View className="px-5 pt-2">
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            className="h-11 rounded-[14px] bg-muted items-center justify-center active:opacity-80"
          >
            <Text className="text-foreground text-[15px] font-semibold">Done</Text>
          </Pressable>
        </View>
      </View>
    </BottomSheet>
  );
}

function ArrangeRow({
  icon: Icon,
  label,
  note,
  onPress,
  destructive,
}: {
  icon: typeof StarIcon;
  label: string;
  note?: string;
  onPress: () => void;
  destructive?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={note ? `${label}. ${note}` : label}
      className="min-h-14 flex-row items-center gap-3.5 px-5 py-2 active:opacity-60"
    >
      <View
        className={`w-10 h-10 rounded-xl items-center justify-center ${destructive ? 'bg-destructive/10' : 'bg-muted'}`}
      >
        <Icon size={19} className={destructive ? 'text-destructive' : 'text-foreground'} />
      </View>
      <View className="flex-1">
        <Text
          className={`text-[15px] leading-5 font-semibold ${destructive ? 'text-destructive' : 'text-foreground'}`}
        >
          {label}
        </Text>
        {note ? <Text className="text-muted-foreground text-[13px] leading-[18px]">{note}</Text> : null}
      </View>
    </Pressable>
  );
}
