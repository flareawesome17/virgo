import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Platform, Pressable, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { BookmarkIcon } from 'lucide-react-native';
import { KeepSheet } from '@/components/KeepSheet';
import { useTabObstruction } from '@/components/TabScreen';
import { useAuth, useShelfActions, useTheme } from '@/src/hooks';
import { ApiError, type FeedItem } from '@/src/api';
import { clearLastShelf, getLastShelf, setLastShelf } from '@/src/lib/last-shelf';
import { profileActionMessage } from '@/src/lib/profile-media';
import { PALETTES } from '@/theme';

/** How long "Kept to …" stays up. Long enough to read and reach Change. */
const TOAST_MS = 4000;

/**
 * Keep, in one tap.
 *
 * Every Keep opened a sheet to choose a shelf, even for somebody with one
 * shelf who keeps everything on it. Now Keep goes to the shelf used last, at
 * once, and says where — "Kept to Light · Change" — with Change opening the
 * sheet for another shelf, a note, or to take it off. The first Keep, and a
 * Keep on something already kept, still open the sheet — that is where it is
 * moved to another shelf or taken off.
 *
 * Returns the handlers and what the screen renders for them: the sheet and
 * the message. `choose` skips the one-tap keep and opens the sheet, for a
 * long press on the bookmark.
 */
export function useKeepFlow() {
  const { user } = useAuth();
  const { keep } = useShelfActions();
  const [sheetItem, setSheetItem] = useState<FeedItem | null>(null);
  const [toast, setToast] = useState<{ name: string; item: FeedItem } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const showToast = useCallback((next: { name: string; item: FeedItem }) => {
    clearTimeout(timer.current);
    setToast(next);
    timer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);

  const onKeep = useCallback(
    async (item: FeedItem) => {
      // Already kept: the sheet is where it is moved or taken off.
      if (item.keptByMe || !user) {
        setSheetItem(item);
        return;
      }
      const last = await getLastShelf(user.id);
      if (!last) {
        setSheetItem(item);
        return;
      }
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      }
      showToast({ name: last.name, item });
      keep.mutate(
        { shelfId: last.id, showcaseId: item.id },
        {
          onError: (err) => {
            setToast(null);
            // The shelf has gone since: forget it, and ask where instead.
            if (err instanceof ApiError && err.status === 404) {
              clearLastShelf(user.id);
              setSheetItem(item);
              return;
            }
            Alert.alert("Couldn't keep it", profileActionMessage(err, 'keep'));
          },
        },
      );
    },
    [user, keep, showToast],
  );

  const choose = useCallback((item: FeedItem) => setSheetItem(item), []);

  const element = (
    <>
      <KeepSheet
        item={sheetItem}
        onClose={() => setSheetItem(null)}
        onKept={(shelf) => {
          if (user) setLastShelf(user.id, shelf);
        }}
      />
      {toast && (
        <KeptToast
          name={toast.name}
          onChange={() => {
            clearTimeout(timer.current);
            setToast(null);
            setSheetItem({ ...toast.item, keptByMe: true });
          }}
        />
      )}
    </>
  );

  return { onKeep, choose, element };
}

/**
 * Where it went, said over the foot of the screen: a dark bar with the shelf's
 * name in bold, and Change inside it for anybody who meant another shelf.
 */
function KeptToast({ name, onChange }: { name: string; onChange: () => void }) {
  const insets = useSafeAreaInsets();
  const obstruction = useTabObstruction();
  const { isDark } = useTheme();
  // The bar is the page's ink, so what is drawn on it is the page's paper.
  const paper = (isDark ? PALETTES.dark : PALETTES.light).background;
  return (
    <Animated.View
      entering={FadeInDown.duration(180)}
      exiting={FadeOutDown.duration(140)}
      // All in style: on the web a className beside a style here is dropped.
      style={{
        position: 'absolute',
        left: 16,
        right: 16,
        bottom: (obstruction || insets.bottom) + 12,
      }}
      accessibilityLiveRegion="polite"
    >
      <View
        className="flex-row items-center gap-2.5 rounded-2xl bg-foreground pl-4 pr-2 min-h-[52px]"
        style={{
          shadowColor: '#000',
          shadowOpacity: 0.25,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 8 },
          elevation: 6,
        }}
      >
        {/* Filled with a literal colour: currentColor draws hollow on a phone. */}
        <BookmarkIcon size={18} color={paper} fill={paper} />
        <Text className="flex-1 text-background/70 text-[15px] leading-5" numberOfLines={1}>
          Kept to <Text className="text-background font-bold">{name}</Text>
        </Text>
        <Pressable
          onPress={onChange}
          // 36 high as drawn, 44 to the finger.
          hitSlop={{ top: 4, bottom: 4, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={`Kept to ${name}. Change where`}
          className="h-9 px-3 rounded-[10px] bg-background/15 items-center justify-center active:opacity-70"
        >
          <Text className="text-background text-[14px] font-semibold">Change</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}
