import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { ScreenHeader } from '@/components';
import { InsightsPage } from '@/components/money/InsightsPage';

/**
 * Insights on its own: where a link from elsewhere lands. Inside Money it is
 * a tab, and this is the same page under a header of its own.
 */
export default function MoneyInsightsScreen() {
  const params = useLocalSearchParams<{ year?: string; month?: string }>();
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <ScreenHeader title="Insights" subtitle="Only you can see this" />
      <InsightsPage year={params.year} month={params.month} />
    </SafeAreaView>
  );
}
