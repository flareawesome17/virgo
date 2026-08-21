import { View, Text, Pressable, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { UserCheckIcon, UsersIcon, MessageCircleIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { PLACEHOLDER_IMAGE } from '@/src/lib/placeholder';

cssInterop(UserCheckIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(UsersIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(MessageCircleIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

export default function FriendRequestAcceptedScreen() {
  const { name = 'Friend', avatar } = useLocalSearchParams<{ name?: string; avatar?: string }>();

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <View className="flex-1 px-5 justify-center items-center" style={{ paddingBottom: 60 }}>
        {/* Status icon */}
        <View className="w-24 h-24 rounded-full bg-[#6B8E4E18] items-center justify-center mb-6"
          style={{ shadowColor: '#6B8E4E', shadowOpacity: 0.15, shadowRadius: 20, shadowOffset: { width: 0, height: 4 }, elevation: 6 }}>
          <UserCheckIcon size={40} color="#6B8E4E" />
        </View>

        <Text className="text-foreground text-[26px] font-extrabold tracking-tight">Now Connected!</Text>
        <Text className="text-muted-foreground text-sm text-center mt-2 px-8">
          You and {name} are now confirmed friends. You can invite them to albums and workspaces.
        </Text>

        {/* Friend card */}
        <View className="mt-8 bg-card rounded-2xl p-5 items-center w-full" style={{ shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 4 }}>
          <Image
            source={{ uri: avatar || PLACEHOLDER_IMAGE }}
            style={{ width: 72, height: 72, borderRadius: 36 }}
          />
          <Text className="text-foreground text-lg font-bold mt-3">{name}</Text>
          <View className="bg-[#6B8E4E18] rounded-lg px-3 py-1 mt-2">
            <Text className="text-[#6B8E4E] text-[11px] font-bold">✓ Confirmed Friend</Text>
          </View>
        </View>

        {/* Actions */}
        <View className="mt-8 w-full gap-3">
          <Pressable onPress={() => router.push('/friends')}
            className="bg-action rounded-2xl py-3.5 items-center flex-row justify-center gap-2 active:scale-[0.97]"
            style={{ shadowColor: '#B66A40', shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 4 }}>
            <UsersIcon size={18} className="text-white" />
            <Text className="text-white text-base font-bold">View All Friends</Text>
          </Pressable>

          <Pressable onPress={() => router.push('/friends/requests')}
            className="bg-card rounded-2xl py-3.5 items-center flex-row justify-center gap-2 active:scale-[0.97]"
            style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
            <UserCheckIcon size={16} className="text-muted-foreground" />
            <Text className="text-foreground text-sm font-semibold">Back to Requests</Text>
          </Pressable>

          <Pressable onPress={() => router.navigate('/')}
            className="py-3 items-center active:scale-[0.97]">
            <Text className="text-primary text-sm font-semibold">Go to Home</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}
