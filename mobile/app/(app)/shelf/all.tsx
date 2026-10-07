import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeftIcon, BookmarkIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { KeptGrid } from '@/components/KeptGrid';
import { LoadFailed } from '@/components/LoadFailed';
import { useAllKept, useShelfActions, useTheme } from '@/src/hooks';
import { queryKeys, shelvesApi } from '@/src/api';
import { PALETTES } from '@/theme';

for (const Icon of [ArrowLeftIcon, BookmarkIcon]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/**
 * Everything you have kept, whichever shelf it is on, newest first and once
 * each: the collection the Taste tab leads with on your own profile.
 *
 * Only ever yours, so there is nothing to rename or make public. Taking a post
 * off here takes it off every shelf it is on — "all kept" without it is what
 * somebody asking for that means.
 *
 * A route of its own beside shelf/[id], which a static name outranks.
 */
export default function AllKeptScreen() {
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  const { entries, total, isLoading, loadFailed, refetch } = useAllKept();
  const { unkeep } = useShelfActions();
  const queryClient = useQueryClient();

  /*
   * Which shelves hold it is asked fresh rather than read off a cached list:
   * the entry does not say, and one shelf missed is a post still kept.
   */
  const removeEverywhere = async (showcaseId: string) => {
    const holding = await queryClient.fetchQuery({
      queryKey: queryKeys.shelves.holding(showcaseId),
      queryFn: () => shelvesApi.mine(showcaseId),
      staleTime: 0,
    });
    const on = holding.data.filter((shelf) => shelf.holds);
    for (const [i, shelf] of on.entries()) {
      await unkeep.mutateAsync({ shelfId: shelf.id, showcaseId, stillKept: i < on.length - 1 });
    }
  };

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
        <View className="flex-1 min-w-0 py-1">
          <Text accessibilityRole="header" className="text-foreground text-[15px] font-bold" numberOfLines={1}>
            All kept
          </Text>
          <Text className="text-muted-foreground text-[11px]">
            {total > 0 ? `${total} kept · ` : ''}Private · only you see it
          </Text>
        </View>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={palette.primary} />
        </View>
      ) : loadFailed && entries.length === 0 ? (
        <LoadFailed what="what you have kept" onRetry={() => refetch()} />
      ) : entries.length === 0 ? (
        <View className="items-center px-10 mt-20">
          <View className="w-16 h-16 rounded-full bg-primary/10 items-center justify-center mb-4">
            <BookmarkIcon size={24} className="text-primary" />
          </View>
          <Text className="text-foreground text-[15px] font-bold">Nothing kept yet</Text>
          <Text className="text-muted-foreground text-[13px] text-center mt-2 leading-5">
            Tap the bookmark on a post in the feed to keep it. Whatever shelf it goes on, it
            shows up here too.
          </Text>
        </View>
      ) : (
        <KeptGrid
          entries={entries}
          onRemove={removeEverywhere}
          removeLabel="Remove from your shelves"
          onRefresh={() => refetch()}
        />
      )}
    </SafeAreaView>
  );
}
