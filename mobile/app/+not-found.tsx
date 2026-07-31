import { View, Text, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, usePathname } from 'expo-router';
import { AlertTriangleIcon, ArrowLeftIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';

cssInterop(AlertTriangleIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ArrowLeftIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

/**
 * Fallback for any unmatched route.
 *
 * Without this file Expo Router renders its built-in "Unmatched Route" debug
 * page, which looks like a crash to anyone testing the app. This at least
 * names the bad path and offers a way back.
 */
export default function NotFoundScreen() {
  const pathname = usePathname();

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <View className="flex-1 items-center justify-center px-8" style={{ paddingBottom: 60 }}>
        <View
          className="w-20 h-20 rounded-full bg-[#C76B4A18] items-center justify-center mb-6"
          style={{ shadowColor: '#C76B4A', shadowOpacity: 0.15, shadowRadius: 16, shadowOffset: { width: 0, height: 3 }, elevation: 5 }}
        >
          <AlertTriangleIcon size={32} className="text-[#C76B4A]" />
        </View>

        <Text className="text-foreground text-xl font-extrabold">Screen not found</Text>
        <Text className="text-muted-foreground text-sm text-center mt-2">
          Nothing is routed at this address yet.
        </Text>

        {pathname ? (
          <View className="bg-muted rounded-xl px-3 py-2 mt-4">
            <Text className="text-muted-foreground text-xs" numberOfLines={1}>
              {pathname}
            </Text>
          </View>
        ) : null}

        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(app)/(tabs)'))}
          className="mt-8 bg-primary rounded-2xl px-8 py-3.5 flex-row items-center gap-2 active:scale-[0.96]"
          style={{ shadowColor: '#B66A40', shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 4 }}
        >
          <ArrowLeftIcon size={16} className="text-white" />
          <Text className="text-white text-base font-bold">Go back</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
