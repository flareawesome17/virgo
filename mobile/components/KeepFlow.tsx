import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Platform, Pressable, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { BookmarkIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { KeepSheet } from '@/components/KeepSheet';
import { useTabObstruction } from '@/components/TabScreen';
import { useAuth, useShelfActions } from '@/src/hooks';
import { ApiError, type FeedItem } from '@/src/api';
import { clearLastShelf, getLastShelf, setLastShelf } from '@/src/lib/last-shelf';
import { profileActionMessage } from '@/src/lib/profile-media';

cssInterop(BookmarkIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

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

function KeptToast({ name, onChange }: { name: string; onChange: () => void }) {
  const insets = useSafeAreaInsets();
  const obstruction = useTabObstruction();
  return (
    <Animated.View
      entering={FadeInDown.duration(180)}
      exiting={FadeOutDown.duration(140)}
      className="absolute left-4 right-4"
      style={{ bottom: (obstruction || insets.bottom) + 12 }}
      accessibilityLiveRegion="polite"
    >
      <View
        className="flex-row items-center rounded-2xl bg-foreground pl-4 pr-1.5 min-h-[52px]"
        style={{
          shadowColor: '#000',
          shadowOpacity: 0.18,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 4 },
          elevation: 6,
        }}
      >
        <BookmarkIcon size={16} className="text-background" />
        <Text className="flex-1 ml-2.5 text-background text-[13px] font-semibold" numberOfLines={1}>
          Kept to {name}
        </Text>
        <Pressable
          onPress={onChange}
          accessibilityRole="button"
          accessibilityLabel={`Kept to ${name}. Change where`}
          className="min-h-[44px] px-3.5 rounded-xl items-center justify-center active:opacity-70"
        >
          <Text className="text-background text-[13px] font-bold">Change</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}
