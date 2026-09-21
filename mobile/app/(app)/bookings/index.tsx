import { Pressable, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ArrowLeftIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { BookingsList } from '@/components/BookingsList';

cssInterop(ArrowLeftIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

/**
 * Bookings, on their own.
 *
 * The same list as the Bookings tab under My jobs. This route exists so a
 * notification, or the web app's links, can land on it directly — a booking
 * notification without a booking id used to open `/bookings` and find nothing
 * there.
 */
export default function BookingsScreen() {
  const insets = useSafeAreaInsets();
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="flex-row items-center gap-3 px-5 py-3">
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back">
          <ArrowLeftIcon size={20} className="text-foreground" />
        </Pressable>
        <Text className="text-foreground text-lg font-bold flex-1" accessibilityRole="header">
          Bookings
        </Text>
      </View>
      <BookingsList bottomPadding={insets.bottom + 40} />
    </SafeAreaView>
  );
}
