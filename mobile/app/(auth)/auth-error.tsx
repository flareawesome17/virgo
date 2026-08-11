import { View, Text, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { AlertTriangleIcon, ArrowLeftIcon, RefreshCwIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';

cssInterop(AlertTriangleIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ArrowLeftIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(RefreshCwIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

export default function AuthErrorScreen() {
  const { message, code } = useLocalSearchParams<{ message?: string; code?: string }>();

  const errorMessage = message || 'Something went wrong during authentication.';
  const errorCode = code || 'UNKNOWN';

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-background">
      <View className="flex-1 px-8 justify-center items-center" style={{ paddingBottom: 60 }}>
        {/* Error icon */}
        <View className="w-24 h-24 rounded-full bg-destructive/10 items-center justify-center mb-6"
          style={{ shadowColor: '#C76B4A', shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: 3 }, elevation: 5 }}>
          <AlertTriangleIcon size={40} color="#B44A32" />
        </View>

        <Text className="text-foreground text-[26px] font-extrabold tracking-tight text-center">
          Auth Error
        </Text>
        <Text className="text-muted-foreground text-sm text-center mt-3 leading-relaxed px-2">
          {errorMessage}
        </Text>

        {/* Error code */}
        <View className="mt-4 bg-muted rounded-xl px-4 py-2">
          <Text className="text-muted-foreground text-[11px] font-mono">Code: {errorCode}</Text>
        </View>

        {/* Actions */}
        <View className="mt-10 gap-3 w-full">
          <Pressable
            onPress={() => router.back()}
            className="bg-primary rounded-2xl py-3.5 flex-row items-center justify-center gap-2 active:scale-[0.97]"
            style={{ shadowColor: '#B66A40', shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 4 }}>
            <ArrowLeftIcon size={18} className="text-white" />
            <Text className="text-white text-base font-bold">Go Back</Text>
          </Pressable>

          <Pressable
            onPress={() => router.replace('/welcome')}
            className="bg-card rounded-2xl py-3.5 flex-row items-center justify-center gap-2 active:scale-[0.97]"
            style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
            <RefreshCwIcon size={16} className="text-muted-foreground" />
            <Text className="text-foreground text-sm font-semibold">Try Again</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}
