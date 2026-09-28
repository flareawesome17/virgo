import {
  ActivityIndicator,
  Dimensions,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeftIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { LoadFailed } from '@/components/LoadFailed';
import { RemoteImage } from '@/components/RemoteImage';
import { useShowcase, useTheme } from '@/src/hooks';
import { PALETTES } from '@/theme';

for (const Icon of [ArrowLeftIcon]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/**
 * One showcase, whole.
 *
 * The feed shows the cover and as much of the note as fits; this is where the
 * rest of the set and the rest of the note live.
 */
export default function ShowcaseScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  const { showcase, isLoading, loadFailed, refetch } = useShowcase(id);
  const width = Dimensions.get('window').width;

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
        <Text className="flex-1 text-foreground text-[15px] font-bold" numberOfLines={1}>
          {showcase?.title ?? 'Showcase'}
        </Text>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={palette.primary} />
        </View>
      ) : loadFailed || !showcase ? (
        <LoadFailed what="this showcase" onRetry={() => refetch()} />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 110 }} showsVerticalScrollIndicator={false}>
          {showcase.pieces.map((piece, i) => (
            <View key={piece.fileKey} className={i > 0 ? 'mt-1' : ''}>
              <RemoteImage
                source={{ uri: piece.url }}
                style={{ width, height: Math.round(width * 1.25) }}
                contentFit="cover"
              />
            </View>
          ))}

          <View className="px-5 pt-5">
            {showcase.caption ? (
              <Text className="text-foreground text-[14px] leading-[21px]">
                {showcase.caption}
              </Text>
            ) : null}

            {showcase.craftNote || showcase.craftTags.length > 0 ? (
              <View className="mt-5 pt-4 border-t border-border">
                <Text className="text-primary text-[10px] font-bold tracking-[1.5px]">
                  HOW IT WAS MADE
                </Text>
                {showcase.craftNote ? (
                  <Text className="text-foreground text-[14px] leading-[21px] mt-2">
                    {showcase.craftNote}
                  </Text>
                ) : null}
                {showcase.craftTags.length > 0 && (
                  <View className="flex-row flex-wrap gap-1.5 mt-3">
                    {showcase.craftTags.map((tag) => (
                      <View key={tag} className="rounded-full bg-muted px-3 py-1.5">
                        <Text className="text-secondary-foreground text-[12px] font-semibold">
                          {tag}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
                <Text className="text-muted-foreground text-[11px] leading-4 mt-3">
                  Written by the photographer. Virgo never reads this from the file.
                </Text>
              </View>
            ) : null}

            {showcase.keptCount > 0 && (
              <Text className="text-muted-foreground text-[12px] mt-5">
                Kept by {showcase.keptCount} {showcase.keptCount === 1 ? 'person' : 'people'}
              </Text>
            )}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
