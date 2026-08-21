import { View, Text, ScrollView, Pressable, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth, useTheme } from '@/src/hooks';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import {
  ArrowLeftIcon, MailIcon, LockIcon, EyeIcon, EyeOffIcon, ArrowRightIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { PALETTES } from '@/theme';

cssInterop(ArrowLeftIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(MailIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(LockIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(EyeIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(EyeOffIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ArrowRightIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

export default function SignInScreen() {
  const { signIn, user } = useAuth();
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // <Redirect> rather than router.replace(): navigating during render mutates
  // the navigation container mid-render and triggers React's
  // "Cannot update a component while rendering a different component" error.
  if (process.env.EXPO_PUBLIC_RAPIDNATIVE_MODE !== 'designer' && user) {
    return <Redirect href="/(app)/(tabs)" />;
  }

  const canSubmit = email.trim().length > 0 && password.length > 0;

  const handleSignIn = () => {
    if (!canSubmit) return;
    setErrorMsg('');
    signIn.mutate(
      { email: email.trim(), password },
      {
        onSuccess: (result) => {
          if ('twoFactorRequired' in result) {
            router.push({
              pathname: '/two-factor-challenge',
              params: {
                challenge: result.challengeToken,
                email: result.email,
              },
            });
            return;
          }
          router.replace('/(app)/(tabs)');
        },
        onError: (err: any) => {
          // Signing in is blocked until the address is confirmed, so the
          // useful destination is the resend screen, not an error banner.
          if (err?.code === 'EMAIL_NOT_VERIFIED') {
            router.push({
              pathname: '/check-inbox',
              params: { email: err.email ?? email.trim() },
            });
            return;
          }
          const msg = err?.reason || err?.message || 'Sign in failed. Please check your credentials.';
          setErrorMsg(msg);
        },
      }
    );
  };

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1">
        <ScrollView className="flex-1" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
          {/* Header */}
          <View className="px-6 pt-4 pb-2 flex-row items-center gap-3">
            <Pressable
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel="Go back"
              className="w-11 h-11 rounded-xl bg-secondary items-center justify-center active:scale-[0.96]"
            >
              <ArrowLeftIcon size={18} className="text-foreground" />
            </Pressable>
            <View>
              <Text className="text-foreground text-[28px] font-bold tracking-tight">Sign In</Text>
              <Text className="text-muted-foreground text-sm mt-0.5">Welcome back to Virgo</Text>
            </View>
          </View>

          {/* There was a "Continue with Google" button here that did nothing —
              no handler, no provider, no OAuth client. Offering a sign-in
              method that cannot sign anyone in is worse than not offering it:
              somebody with a Google-created account taps it, gets nothing, and
              reasonably concludes the app is broken. It comes back when it
              works. */}

          {/* Form */}
          <View className="px-6 gap-4">
            {/* Email */}
            <View>
              <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px] mb-2 ml-1">Email</Text>
              <View className="bg-secondary rounded-xl px-4 py-3.5 flex-row items-center gap-3">
                <MailIcon size={16} className="text-muted-foreground" />
                <TextInput value={email} onChangeText={setEmail} placeholder="you@studio.com"
                  placeholderTextColor={palette.mutedForeground} className="flex-1 text-foreground text-base"
                  keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
              </View>
            </View>

            {/* Password */}
            <View>
              <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px] mb-2 ml-1">Password</Text>
              <View className="bg-secondary rounded-xl px-4 py-3.5 flex-row items-center gap-3">
                <LockIcon size={16} className="text-muted-foreground" />
                <TextInput value={password} onChangeText={setPassword} placeholder="Your password"
                  placeholderTextColor={palette.mutedForeground} className="flex-1 text-foreground text-base"
                  secureTextEntry={!showPassword} autoCapitalize="none" />
                <Pressable
                  onPress={() => setShowPassword(!showPassword)}
                  accessibilityRole="button"
                  accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                  className="w-11 h-11 items-center justify-center active:scale-[0.96]"
                >
                  {showPassword ? <EyeOffIcon size={18} className="text-muted-foreground" /> : <EyeIcon size={18} className="text-muted-foreground" />}
                </Pressable>
              </View>
            </View>

            {/* Error */}
            {errorMsg ? (
              <View className="bg-destructive/10 rounded-xl px-4 py-3">
                <Text className="text-destructive text-sm">{errorMsg}</Text>
              </View>
            ) : null}

            {/* Forgot password */}
            <Pressable onPress={() => router.push('/forgot-password')} className="items-end active:opacity-60">
              <Text className="text-primary text-sm font-semibold">Forgot password?</Text>
            </Pressable>
          </View>
        </ScrollView>

        {/* Bottom */}
        <View className="px-6 pb-10 pt-4 bg-background gap-4">
          <Pressable
            onPress={handleSignIn}
            disabled={!canSubmit || signIn.isPending}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canSubmit || signIn.isPending }}
            className={`min-h-12 rounded-xl py-4 flex-row items-center justify-center gap-2 active:scale-[0.98] ${canSubmit ? 'bg-action' : 'bg-muted'}`}>
            <Text className={`text-base font-bold ${canSubmit ? 'text-action-foreground' : 'text-muted-foreground'}`}>
              {signIn.isPending ? 'Signing in...' : 'Sign In'}
            </Text>
            {!signIn.isPending && <ArrowRightIcon size={18} className={canSubmit ? 'text-action-foreground' : 'text-muted-foreground'} />}
          </Pressable>
          <View className="flex-row items-center justify-center gap-1">
            <Text className="text-muted-foreground text-sm">Don’t have an account?</Text>
            <Pressable onPress={() => router.push('/sign-up')} className="active:opacity-60">
              <Text className="text-primary text-sm font-bold">Sign Up</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
