import { useCallback, useEffect, useState } from 'react';
import { AppState, Linking, Pressable, Text, View } from 'react-native';
import { ArrowUpCircleIcon, XIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import {
  checkForNewBuild,
  dismissUpdate,
  updateDestination,
  type AvailableUpdate,
} from '@/src/lib/app-update';

for (const Icon of [ArrowUpCircleIcon, XIcon]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/**
 * Says a new build is waiting, when one is.
 *
 * The app had no way to mention this. Updates that are only JavaScript arrive
 * on their own and say nothing, which is right — but a change to native code
 * cannot, and until now that meant a build sitting in TestFlight unmentioned
 * while the installed copy looked perfectly current. The only way to find out
 * was to go and check.
 *
 * Renders nothing the rest of the time, which is almost always.
 */
export function UpdateBanner() {
  const [update, setUpdate] = useState<AvailableUpdate | null>(null);

  const look = useCallback(() => {
    void checkForNewBuild().then((found) => {
      if (found) setUpdate(found);
    });
  }, []);

  useEffect(() => {
    look();
    // Coming back to the app is the natural moment to notice — and the check
    // is throttled to a few times a day, so this costs a cached miss.
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') look();
    });
    return () => sub.remove();
  }, [look]);

  if (!update) return null;

  const destination = updateDestination();

  return (
    <View className="flex-row items-center gap-2.5 border-b border-border/40 bg-secondary px-4 py-2">
      <ArrowUpCircleIcon size={16} className="text-primary" />

      <Pressable
        onPress={() => void Linking.openURL(destination.url)}
        accessibilityRole="button"
        accessibilityLabel={`Virgo ${update.version} is available. ${destination.label}.`}
        className="flex-1 active:opacity-70"
      >
        <Text className="text-foreground text-[12px] font-semibold" numberOfLines={1}>
          Virgo {update.version} is available
        </Text>
        {/* The installed version alongside it, because "an update is
            available" on an app somebody updated yesterday reads as a bug
            rather than as news. */}
        <Text className="text-muted-foreground text-[11px]" numberOfLines={1}>
          You have {update.installed} · {destination.label}
        </Text>
      </Pressable>

      <Pressable
        onPress={() => {
          void dismissUpdate(update.version);
          setUpdate(null);
        }}
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
        hitSlop={8}
        className="active:opacity-70"
      >
        <XIcon size={15} className="text-muted-foreground" />
      </Pressable>
    </View>
  );
}
