import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import { CameraIcon, type LucideIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { BottomSheet } from '@/components/BottomSheet';
import { NATIVE_FEATURES } from '@/src/lib/native-features';
import { CARD_ICON, SAVED_REPLIES_ICON } from './cards/card-icons';

cssInterop(CameraIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

/** What the + sheet offers. */
export type ShareChoice =
  | 'album-photos'
  | 'date-plan'
  | 'booking'
  | 'job-post'
  | 'post'
  | 'package'
  | 'pay-card'
  | 'saved-replies'
  // From your phone: these use your storage.
  | 'photos'
  | 'file'
  // Only on a build that has the camera (NATIVE_FEATURES.camera).
  | 'camera';

const TILES: { key: ShareChoice; label: string; icon: LucideIcon; hint: string }[] = [
  { key: 'album-photos', label: 'Album photos', icon: CARD_ICON['album-photos'], hint: 'Choose photos from an album to send as a link' },
  { key: 'date-plan', label: 'Plan a date', icon: CARD_ICON['date-plan'], hint: 'Puts a date on your Schedule and invites the chat' },
  { key: 'booking', label: 'Booking', icon: CARD_ICON.booking, hint: 'Shares one of your bookings' },
  { key: 'job-post', label: 'Job post', icon: CARD_ICON['job-post'], hint: 'Shares one of your job posts' },
  { key: 'post', label: 'A post', icon: CARD_ICON.post, hint: 'Shares one of your posts' },
  { key: 'package', label: 'Package', icon: CARD_ICON.package, hint: "Shares a package's statement" },
  { key: 'pay-card', label: 'How to pay', icon: CARD_ICON['pay-card'], hint: 'Sends one of your ways to pay' },
  { key: 'saved-replies', label: 'Saved replies', icon: SAVED_REPLIES_ICON, hint: 'Puts one of your saved replies in the message' },
];

const FROM_PHONE: { key: ShareChoice; label: string; icon: LucideIcon; hint: string }[] = [
  { key: 'photos', label: 'Photos', icon: CARD_ICON.photos, hint: 'Choose up to 10 photos from your phone. They use your storage' },
  { key: 'file', label: 'A file', icon: CARD_ICON.file, hint: 'Choose a PDF from your phone. It uses your storage' },
];

const CAMERA = { key: 'camera', label: 'Camera', icon: CameraIcon, hint: 'Take a photo to send. It uses your storage' } as const;

const COLUMNS = 4;
const SIDE = 12;
const GAP = 8;

/**
 * The composer's +: what can be shared here from the rest of Virgo, which
 * uses none of your storage (album photos go as a link to the files already
 * there), and what can come from this phone, which does.
 *
 * Picking one closes the sheet; the screen opens what comes next from
 * `onClosed`, since iOS will not present a sheet or a screen over one that
 * is still leaving.
 */
export function SharePlusSheet({
  visible,
  onClose,
  onClosed,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  onClosed?: () => void;
  onPick: (choice: ShareChoice) => void;
}) {
  const { width } = useWindowDimensions();
  const tile = Math.floor((Math.min(width, 520) - SIDE * 2 - GAP * (COLUMNS - 1)) / COLUMNS);

  const tileFor = ({ key, label, icon: Icon, hint }: (typeof TILES)[number]) => {
    const accent = key === 'album-photos';
    return (
      <Pressable
        key={key}
        onPress={() => onPick(key)}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={hint}
        className="items-center rounded-2xl pt-2.5 pb-2 gap-2 active:bg-muted/60"
        style={{ width: tile }}
      >
        <View
          className={`w-12 h-12 rounded-[14px] items-center justify-center ${accent ? 'bg-primary/10' : 'bg-muted'}`}
        >
          <Icon size={22} className={accent ? 'text-primary' : 'text-foreground'} />
        </View>
        <Text
          className="text-foreground text-[13px] leading-4 font-semibold text-center"
          numberOfLines={2}
          style={{ minHeight: 32 }}
        >
          {label}
        </Text>
      </Pressable>
    );
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} onClosed={onClosed}>
      <Text className="text-foreground text-[18px] leading-[26px] font-bold px-5" accessibilityRole="header">
        Share in this chat
      </Text>
      <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[0.9px] px-5 pt-3.5 pb-2">
        From Virgo · uses none of your storage
      </Text>
      <View className="flex-row flex-wrap pb-1" style={{ paddingHorizontal: SIDE, columnGap: GAP, rowGap: 4 }}>
        {TILES.map(tileFor)}
      </View>
      <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[0.9px] px-5 pt-2 pb-2">
        From your phone · uses your storage
      </Text>
      <View className="flex-row flex-wrap pb-2" style={{ paddingHorizontal: SIDE, columnGap: GAP, rowGap: 4 }}>
        {FROM_PHONE.map(tileFor)}
        {/* The camera needs a store build: the installed apps say it's coming. */}
        {NATIVE_FEATURES.camera ? (
          tileFor(CAMERA)
        ) : (
          <View
            accessible
            accessibilityRole="button"
            accessibilityLabel="Camera, coming in the next app update"
            accessibilityState={{ disabled: true }}
            className="items-center rounded-2xl pt-2.5 pb-2 gap-1.5"
            style={{ width: tile }}
          >
            <View className="w-12 h-12 rounded-[14px] items-center justify-center bg-muted opacity-60">
              <CameraIcon size={22} className="text-foreground" />
            </View>
            <Text className="text-muted-foreground text-[13px] leading-4 font-semibold text-center" numberOfLines={1}>
              Camera
            </Text>
            <View className="rounded-full bg-primary/10 px-1.5">
              <Text className="text-primary text-[10px] leading-[14px] font-bold" numberOfLines={1}>
                Next app update
              </Text>
            </View>
          </View>
        )}
      </View>
    </BottomSheet>
  );
}
