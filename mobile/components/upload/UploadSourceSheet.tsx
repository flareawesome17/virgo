import { useRef } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ImageIcon, MusicIcon, type LucideIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { BottomSheet } from '@/components/BottomSheet';
import { formatBytes } from '@/src/api';
import { useUsage } from '@/src/hooks';
import type { UploadSource } from '@/components/upload/useUploadPicker';

for (const Icon of [ImageIcon, MusicIcon]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/**
 * What to add: two lines, and then the phone's own picker.
 *
 * The choice waits for the sheet to be gone before it is acted on. iOS
 * presents the picker from where this sheet is leaving, and refuses to while
 * it is still on its way down.
 */
export function UploadSourceSheet({
  visible,
  albumName,
  only,
  onChoose,
  onClose,
}: {
  visible: boolean;
  albumName: string | undefined;
  /** Offer one kind alone: an album's audio list only ever adds audio. */
  only?: UploadSource;
  /** After the sheet has closed. */
  onChoose: (source: UploadSource) => void;
  onClose: () => void;
}) {
  const { storageLimitBytes, storageUsedBytes } = useUsage();
  const chosen = useRef<UploadSource | null>(null);
  const choose = (source: UploadSource) => {
    chosen.current = source;
    onClose();
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      onClosed={() => {
        const source = chosen.current;
        chosen.current = null;
        if (source) onChoose(source);
      }}
    >
      <View className="px-5 pt-1 pb-3">
        <View className="flex-row items-baseline justify-between gap-3 pb-1.5">
          <Text className="flex-1 text-foreground text-[18px] leading-[26px] font-bold" numberOfLines={1} accessibilityRole="header">
            {albumName ? `Add to ${albumName}` : 'Add files'}
          </Text>
          {storageLimitBytes != null ? (
            <Text className="text-muted-foreground text-[13px]">
              {formatBytes(Math.max(storageLimitBytes - storageUsedBytes, 0))} free
            </Text>
          ) : null}
        </View>
        {only !== 'audio' && (
          <Source
            first
            icon={ImageIcon}
            name="Photos and videos"
            detail="From this phone’s library"
            onPress={() => choose('media')}
          />
        )}
        {only !== 'media' && (
          <Source
            first={only === 'audio'}
            icon={MusicIcon}
            name="Audio files"
            detail="Vows, speeches, a finished track"
            onPress={() => choose('audio')}
          />
        )}
      </View>
    </BottomSheet>
  );
}

function Source({
  icon: Icon,
  name,
  detail,
  first,
  onPress,
}: {
  icon: LucideIcon;
  name: string;
  detail: string;
  first?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${name}. ${detail}`}
      className={`min-h-[64px] flex-row items-center gap-3.5 active:opacity-70 ${first ? '' : 'border-t border-border/40'}`}
    >
      <View className="w-11 h-11 rounded-[14px] bg-muted items-center justify-center">
        <Icon size={21} className="text-foreground" />
      </View>
      <View className="flex-1 min-w-0">
        <Text className="text-foreground text-[16px] leading-[22px] font-semibold">{name}</Text>
        <Text className="text-muted-foreground text-[13px] leading-[18px]">{detail}</Text>
      </View>
    </Pressable>
  );
}
