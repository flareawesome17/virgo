import { View, Text, Pressable } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { JobsTabs } from '@/components';
import type { JobsTab } from '@/components/JobsTabs';
import { ArrowLeftIcon, PlusIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';

cssInterop(ArrowLeftIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(PlusIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

/**
 * Accepts web's spelling as well as this screen's own.
 *
 * The tab is `applied` here and `applications` on web; a link built for one
 * should not miss on the other, and neither name is worth a rename across
 * three files to unify.
 */
const TAB_ALIASES: Record<string, JobsTab> = {
  browse: 'browse',
  posted: 'posted',
  applied: 'applied',
  applications: 'applied',
  bookings: 'bookings',
};

/**
 * My jobs.
 *
 * Defaults to Posted — where a job-application notification lands, and where
 * the applications it is about live. `?tab=` overrides it, so an accepted
 * applicant can be sent to Applications instead of to their own postings.
 */
export default function MyJobsScreen() {
  const insets = useSafeAreaInsets();
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  const initialTab: JobsTab = TAB_ALIASES[tab ?? ''] ?? 'posted';

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="flex-row items-center gap-3 px-5 py-3">
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <ArrowLeftIcon size={20} className="text-foreground" />
        </Pressable>
        <Text className="text-foreground text-lg font-bold flex-1">My jobs</Text>
        <Pressable
          className="rounded-xl px-3 py-2 flex-row items-center gap-1.5"
          style={{ backgroundColor: '#B66A40' }}
          onPress={() => router.push('/jobs/new')}
        >
          <PlusIcon size={14} color="#fff" />
          <Text className="text-white text-[12px] font-bold">Post</Text>
        </Pressable>
      </View>

      {/* ?tab= so a notification can land on the right one — an accepted
          applicant belongs on Applications, not on their own postings. */}
      <JobsTabs initialTab={initialTab} bottomPadding={insets.bottom + 40} />
    </SafeAreaView>
  );
}
