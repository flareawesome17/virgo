import { View, Text, ScrollView, Pressable, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useState } from 'react';
import { ArrowLeftIcon, MailIcon, ArrowRightIcon, SendIcon, CheckCircleIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';

cssInterop(ArrowLeftIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(MailIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ArrowRightIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(SendIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(CheckCircleIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const canSend = email.trim().length > 0;

  const handleSend = async () => {
    if (!canSend) return;
    setLoading(true);
    // Simulate sending reset email
    await new Promise((r) => setTimeout(r, 1500));
    setLoading(false);
    setSent(true);
  };

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1">
        <ScrollView className="flex-1" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
          <View className="px-6 pt-4 pb-2 flex-row items-center gap-3">
            <Pressable onPress={() => router.back()} className="w-10 h-10 rounded-2xl bg-card items-center justify-center active:scale-[0.94]"
              style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
              <ArrowLeftIcon size={18} className="text-foreground" />
            </Pressable>
            <Text className="text-foreground text-[28px] font-bold tracking-tight">Reset Password</Text>
          </View>

          {sent ? (
            <View className="px-6 mt-12 items-center">
              <View className="w-20 h-20 rounded-full bg-[#6B8E4E18] items-center justify-center mb-6"
                style={{ shadowColor: '#6B8E4E', shadowOpacity: 0.15, shadowRadius: 16, shadowOffset: { width: 0, height: 3 }, elevation: 5 }}>
                <CheckCircleIcon size={36} style={{ color: '#6B8E4E' }} />
              </View>
              <Text className="text-foreground text-xl font-extrabold">Check Your Email</Text>
              <Text className="text-muted-foreground text-sm text-center mt-3 leading-relaxed px-4">
                If an account exists for <Text className="text-foreground font-semibold">{email}</Text>, we’ve sent a password reset link.
              </Text>
              <Pressable onPress={() => { setSent(false); setEmail(''); }} className="mt-8 active:scale-[0.97]">
                <Text className="text-primary text-sm font-semibold">Try a different email</Text>
              </Pressable>
            </View>
          ) : (
            <View className="px-6 mt-8">
              <Text className="text-muted-foreground text-sm leading-relaxed mb-6">
                Enter the email address associated with your Virgo account and we’ll send you a link to reset your password.
              </Text>

              <View>
                <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px] mb-2 ml-1">Email</Text>
                <View className="bg-card rounded-2xl px-4 py-3.5 flex-row items-center gap-3"
                  style={{ shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
                  <MailIcon size={16} className="text-muted-foreground" />
                  <TextInput value={email} onChangeText={setEmail} placeholder="you@studio.com"
                    placeholderTextColor="#A89489" className="flex-1 text-foreground text-base"
                    keyboardType="email-address" autoCapitalize="none" autoFocus />
                </View>
              </View>
            </View>
          )}
        </ScrollView>

        {!sent && (
          <View className="px-6 pb-10 pt-4 bg-background">
            <Pressable
              onPress={handleSend}
              disabled={!canSend || loading}
              className={`rounded-2xl py-4 flex-row items-center justify-center gap-2 active:scale-[0.97] ${canSend ? 'bg-primary' : 'bg-muted'}`}
              style={canSend ? { shadowColor: '#B66A40', shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 6 } : undefined}>
              <SendIcon size={17} className={canSend ? 'text-white' : 'text-muted-foreground'} />
              <Text className={`text-base font-bold ${canSend ? 'text-white' : 'text-muted-foreground'}`}>
                {loading ? 'Sending...' : 'Send Reset Link'}
              </Text>
            </Pressable>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
