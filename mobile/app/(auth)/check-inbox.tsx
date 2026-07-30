import { View, Text, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { MailIcon, ArrowRightIcon, SendIcon, RefreshCwIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { useState } from 'react';

cssInterop(MailIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ArrowRightIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(SendIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(RefreshCwIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

const demoEmail = 'riya@virgo.studio';

export default function CheckInboxScreen() {
  const [resending, setResending] = useState(false);

  const handleResend = async () => {
    setResending(true);
    await new Promise((r) => setTimeout(r, 1000));
    setResending(false);
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-background">
      <View className="flex-1 px-8 justify-center items-center" style={{ paddingBottom: 60 }}>
        {/* Icon */}
        <View className="relative mb-8">
          <View className="w-24 h-24 rounded-full bg-primary/10 items-center justify-center"
            style={{ shadowColor: '#B66A40', shadowOpacity: 0.15, shadowRadius: 20, shadowOffset: { width: 0, height: 4 }, elevation: 6 }}>
            <MailIcon size={40} className="text-primary" />
          </View>
          {/* Pulse dot */}
          <View className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-primary items-center justify-center">
            <View className="w-2.5 h-2.5 rounded-full bg-white" />
          </View>
        </View>

        <Text className="text-foreground text-[26px] font-extrabold tracking-tight text-center">
          Check Your Inbox
        </Text>
        <Text className="text-muted-foreground text-sm text-center mt-3 leading-relaxed px-2">
          We sent a verification link to{' '}
          <Text className="text-foreground font-semibold">{demoEmail}</Text>
        </Text>

        {/* Visual email card */}
        <View className="mt-8 bg-card rounded-2xl p-5 w-full" style={{ shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 5 }}>
          <View className="flex-row items-center gap-3 mb-4">
            <View className="w-10 h-10 rounded-xl bg-primary/10 items-center justify-center">
              <SendIcon size={18} className="text-primary" />
            </View>
            <View className="flex-1">
              <Text className="text-foreground text-sm font-bold">Verify your email</Text>
              <Text className="text-muted-foreground text-xs mt-0.5">From: Virgo • 1 min ago</Text>
            </View>
          </View>
          <Text className="text-muted-foreground text-xs leading-relaxed">
            Click the button below to verify your email address and activate your Virgo account. This link expires in 24 hours.
          </Text>
          <View className="mt-4 bg-primary/10 rounded-xl px-4 py-3 items-center">
            <Text className="text-primary text-sm font-bold">Verify Email Address →</Text>
          </View>
        </View>

        {/* Resend */}
        <View className="mt-8 gap-3 w-full">
          <Pressable
            onPress={handleResend}
            disabled={resending}
            className="bg-card rounded-2xl py-3.5 flex-row items-center justify-center gap-2 active:scale-[0.97]"
            style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
            <RefreshCwIcon size={16} className="text-primary" />
            <Text className="text-foreground text-sm font-semibold">
              {resending ? 'Resending...' : 'Resend Email'}
            </Text>
          </Pressable>

          <Pressable onPress={() => router.push('/sign-in')} className="py-3 items-center active:scale-[0.97]">
            <Text className="text-muted-foreground text-sm">
              Already verified?{' '}
              <Text className="text-primary font-bold">Sign In</Text>
            </Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}
