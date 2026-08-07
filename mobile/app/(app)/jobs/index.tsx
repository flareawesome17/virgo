import { View, Text, Pressable } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { JobsTabs } from '@/components';
import { ArrowLeftIcon, PlusIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';

cssInterop(ArrowLeftIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(PlusIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

/**
 * Jobs as its own screen, for Settings and deep links.
 *
 * Same three tabs as the Home tab and as the web — one component, so there is
 * nothing here that can fall behind.
 */
export default function JobsScreen() {
  const insets = useSafeAreaInsets();

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="flex-row items-center gap-3 px-5 py-3">
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <ArrowLeftIcon size={20} className="text-foreground" />
        </Pressable>
        <Text className="text-foreground text-lg font-bold flex-1">Jobs</Text>
        <Pressable
          className="rounded-xl px-3 py-2 flex-row items-center gap-1.5"
          style={{ backgroundColor: '#B66A40' }}
          onPress={() => router.push('/jobs/new')}
        >
          <PlusIcon size={14} style={{ color: '#fff' }} />
          <Text className="text-white text-[12px] font-bold">Post</Text>
        </Pressable>
      </View>

      <JobsTabs bottomPadding={insets.bottom + 40} />
    </SafeAreaView>
  );
}
