import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { ArrowLeftIcon, GlobeIcon, LockIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';

for (const Icon of [ArrowLeftIcon, GlobeIcon, LockIcon]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/**
 * The bar across the top of a shelf: the way back, what kind of screen this
 * is, and room on the right for its menu. The shelf's own name is not here;
 * it is the heading under the bar, where a long one has room.
 */
export function ShelfBar({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <View className="min-h-[52px] flex-row items-center gap-1 px-2 py-1">
      <Pressable
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel="Back"
        className="w-11 h-11 items-center justify-center active:opacity-60"
      >
        <ArrowLeftIcon size={22} className="text-foreground" />
      </Pressable>
      <Text className="flex-1 min-w-0 text-foreground text-[16px] leading-5 font-bold" numberOfLines={1}>
        {title}
      </Text>
      {right}
    </View>
  );
}

/**
 * A shelf's name, and under it how much is on it, who sees it and whose it
 * is. `isPublic` undefined leaves the globe or lock out, for a shelf not yet
 * known to be either.
 */
export function ShelfHeading({
  name,
  meta,
  isPublic,
}: {
  name: string;
  meta: string;
  isPublic?: boolean;
}) {
  const Icon = isPublic === undefined ? null : isPublic ? GlobeIcon : LockIcon;
  return (
    <View className="px-5 pt-2 pb-4 gap-1">
      <Text
        accessibilityRole="header"
        className="text-foreground text-[24px] leading-[30px] font-bold tracking-[-0.4px]"
      >
        {name}
      </Text>
      {meta ? (
        <View className="flex-row items-center gap-[5px]">
          {Icon ? <Icon size={13} className="text-muted-foreground" /> : null}
          <Text className="flex-1 text-muted-foreground text-[13px] leading-[18px]">{meta}</Text>
        </View>
      ) : null}
    </View>
  );
}
