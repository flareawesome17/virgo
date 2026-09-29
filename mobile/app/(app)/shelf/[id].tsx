import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeftIcon, BookmarkIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { LoadFailed } from '@/components/LoadFailed';
import { RemoteImage } from '@/components/RemoteImage';
import { useShelfEntries, useTheme } from '@/src/hooks';
import { makerOf } from '@/src/api';
import { PALETTES } from '@/theme';

for (const Icon of [ArrowLeftIcon, BookmarkIcon]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/**
 * One shelf.
 *
 * Every kept thing names whoever made it and links to their showcase — that
 * credit is the reason keeping somebody's work is something they benefit from
 * rather than something done to them. The note underneath is the keeper's own.
 */
export default function ShelfScreen() {
  const { id, own } = useLocalSearchParams<{ id?: string; own?: string }>();
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  // Somebody else's shelf reads through the public route, which returns the
  // public ones only. Defaults to your own, which is where most of these open
  // from.
  const { entries, isLoading, loadFailed, refetch } = useShelfEntries(id, {
    own: own !== '0',
  });

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <View className="flex-row items-center pl-1 pr-3 border-b border-border">
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Back"
          className="w-11 h-11 items-center justify-center"
        >
          <ArrowLeftIcon size={20} className="text-foreground" />
        </Pressable>
        <Text className="flex-1 text-foreground text-[15px] font-bold">Shelf</Text>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={palette.primary} />
        </View>
      ) : loadFailed && entries.length === 0 ? (
        <LoadFailed what="this shelf" onRetry={() => refetch()} />
      ) : entries.length === 0 ? (
        <View className="items-center px-10 mt-20">
          <View className="w-16 h-16 rounded-full bg-primary/10 items-center justify-center mb-4">
            <BookmarkIcon size={24} className="text-primary" />
          </View>
          <Text className="text-foreground text-[15px] font-bold">Nothing on this shelf</Text>
          <Text className="text-muted-foreground text-[13px] text-center mt-2 leading-5">
            Work kept here shows up with whoever made it. If they take a piece down, it
            leaves the shelf.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60, gap: 22 }}>
          {entries.map((entry) => (
            <View key={entry.showcaseId}>
              <Pressable
                onPress={() => router.push(`/showcase/${entry.showcaseId}`)}
                accessibilityRole="button"
                accessibilityLabel={entry.title ?? 'Open this showcase'}
              >
                <RemoteImage
                  source={{ uri: entry.url }}
                  style={{ width: '100%', height: 200, borderRadius: 13 }}
                  contentFit="cover"
                />
              </Pressable>

              <View className="flex-row items-center gap-2 mt-2">
                <View className="w-6 h-6 rounded-full bg-primary/15 items-center justify-center">
                  <Text className="text-primary text-[10px] font-bold">
                    {makerOf(entry).displayName.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <Pressable
                  onPress={() =>
                    makerOf(entry).handle ? router.push(`/u/${makerOf(entry).handle}`) : undefined
                  }
                  accessibilityRole="button"
                  className="flex-1 min-w-0"
                >
                  <Text className="text-foreground text-[12px] font-bold" numberOfLines={1}>
                    {makerOf(entry).displayName}
                  </Text>
                </Pressable>
                {entry.craftTags.length > 0 && (
                  <Text className="text-muted-foreground text-[11px]" numberOfLines={1}>
                    {entry.craftTags.slice(0, 2).join(' · ')}
                  </Text>
                )}
              </View>

              {entry.note ? (
                <View className="mt-1.5 pl-2.5 border-l-2 border-border">
                  <Text className="text-secondary-foreground text-[12px] leading-[17px] italic">
                    {entry.note}
                  </Text>
                </View>
              ) : null}
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
