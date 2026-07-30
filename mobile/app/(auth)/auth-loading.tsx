import { View, Text, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function AuthLoadingScreen() {
  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-background">
      <View className="flex-1 items-center justify-center gap-6">
        {/* Logo */}
        <View className="w-20 h-20 rounded-[22px] bg-primary items-center justify-center"
          style={{ shadowColor: '#B66A40', shadowOpacity: 0.3, shadowRadius: 20, shadowOffset: { width: 0, height: 6 }, elevation: 8 }}>
          <Text className="text-white text-3xl font-extrabold tracking-tight">V</Text>
        </View>

        <Text className="text-foreground text-xl font-bold tracking-tight">Virgo</Text>

        <View className="items-center gap-3">
          <ActivityIndicator size="small" color="#B66A40" />
          <Text className="text-muted-foreground text-sm">Securing your session...</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}
