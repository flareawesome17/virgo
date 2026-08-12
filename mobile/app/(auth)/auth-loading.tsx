import { View, Text, ActivityIndicator, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function AuthLoadingScreen() {
  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-background">
      <View className="flex-1 items-center justify-center gap-6">
        {/* Logo */}
        {/* The real mark. Matches the welcome screen this hands off to — the
            two are seen back to back, and a letter-in-a-box turning into a
            logo mid-launch reads as two different apps. */}
        <Image
          source={require('@/assets/splash-icon.png')}
          style={{ width: 88, height: 88 }}
          resizeMode="contain"
          accessibilityLabel="Virgo"
        />

        <Text className="text-foreground text-xl font-bold tracking-tight">Virgo</Text>

        <View className="items-center gap-3">
          <ActivityIndicator size="small" color="#B66A40" />
          <Text className="text-muted-foreground text-sm">Securing your session...</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}
