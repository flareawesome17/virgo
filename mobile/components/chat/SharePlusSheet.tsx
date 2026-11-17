import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { BottomSheet } from '@/components/BottomSheet';
import { CARD_ICON, SAVED_REPLIES_ICON } from './cards/card-icons';

/** What the + sheet offers. */
export type ShareChoice =
  | 'album-photos'
  | 'date-plan'
  | 'booking'
  | 'job-post'
  | 'post'
  | 'package'
  | 'pay-card'
  | 'saved-replies';

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

const COLUMNS = 4;
const SIDE = 12;
const GAP = 8;

/**
 * The composer's +: what can be shared here from the rest of Virgo. None of
 * it uses storage — album photos go as a link to the files already there.
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

  return (
    <BottomSheet visible={visible} onClose={onClose} onClosed={onClosed}>
      <Text className="text-foreground text-[18px] leading-[26px] font-bold px-5" accessibilityRole="header">
        Share in this chat
      </Text>
      <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[0.9px] px-5 pt-3.5 pb-2">
        From Virgo · uses none of your storage
      </Text>
      <View className="flex-row flex-wrap pb-2" style={{ paddingHorizontal: SIDE, columnGap: GAP, rowGap: 4 }}>
        {TILES.map(({ key, label, icon: Icon, hint }) => {
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
        })}
      </View>
    </BottomSheet>
  );
}
