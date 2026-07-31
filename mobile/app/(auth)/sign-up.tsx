import { View, Text, ScrollView, Pressable, TextInput, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/src/hooks';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import {
  ArrowLeftIcon, UserIcon, MailIcon, LockIcon, EyeIcon, EyeOffIcon, ArrowRightIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';

cssInterop(ArrowLeftIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(UserIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(MailIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(LockIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(EyeIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(EyeOffIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ArrowRightIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

export default function SignUpScreen() {
  const { signUp, user } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // <Redirect> rather than router.replace(): navigating during render mutates
  // the navigation container mid-render and triggers React's
  // "Cannot update a component while rendering a different component" error.
  if (process.env.EXPO_PUBLIC_RAPIDNATIVE_MODE !== 'designer' && user) {
    return <Redirect href="/(app)/(tabs)" />;
  }

  const validate = (): string | null => {
    if (!name.trim()) return 'Please enter your name.';
    if (!email.trim()) return 'Please enter your email.';
    if (password.length < 8) return 'Password must be at least 8 characters.';
    if (password !== confirmPassword) return 'Passwords do not match.';
    return null;
  };

  const canSubmit = name.trim().length > 0 && email.trim().length > 0 && password.length >= 8 && confirmPassword.length > 0;

  const handleSignUp = () => {
    const err = validate();
    if (err) { setErrorMsg(err); return; }
    setErrorMsg('');
    signUp.mutate(
      // displayName was collected and validated, then dropped — every new
      // account ended up with a null name despite the user typing one.
      { email: email.trim(), password, displayName: name.trim() },
      {
        onSuccess: () => router.push('/check-inbox'),
        onError: (err: any) => {
          setErrorMsg(err?.reason || err?.message || 'Sign up failed. Please try again.');
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
            <Pressable onPress={() => router.back()} className="w-10 h-10 rounded-2xl bg-card items-center justify-center active:scale-[0.94]"
              style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
              <ArrowLeftIcon size={18} className="text-foreground" />
            </Pressable>
            <View>
              <Text className="text-foreground text-[28px] font-bold tracking-tight">Create Account</Text>
              <Text className="text-muted-foreground text-sm mt-0.5">Join the Virgo creative OS</Text>
            </View>
          </View>

          {/* Google button */}
          <View className="px-6 mt-6">
            <Pressable className="bg-card rounded-2xl py-3.5 flex-row items-center justify-center gap-3 active:scale-[0.97] border border-border"
              style={{ shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
              <Text className="text-base font-bold" style={{ color: '#4285F4' }}>G</Text>
              <Text className="text-foreground text-sm font-semibold">Continue with Google</Text>
            </Pressable>

            <View className="flex-row items-center gap-3 my-6">
              <View className="flex-1 h-px bg-border" />
              <Text className="text-muted-foreground text-xs font-medium">or sign up with email</Text>
              <View className="flex-1 h-px bg-border" />
            </View>
          </View>

          {/* Form */}
          <View className="px-6 gap-4">
            <View>
              <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px] mb-2 ml-1">Full Name</Text>
              <View className="bg-card rounded-2xl px-4 py-3.5 flex-row items-center gap-3"
                style={{ shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
                <UserIcon size={16} className="text-muted-foreground" />
                <TextInput value={name} onChangeText={setName} placeholder="Your name"
                  placeholderTextColor="#A89489" className="flex-1 text-foreground text-base" autoCapitalize="words" />
              </View>
            </View>
            <View>
              <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px] mb-2 ml-1">Email</Text>
              <View className="bg-card rounded-2xl px-4 py-3.5 flex-row items-center gap-3"
                style={{ shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
                <MailIcon size={16} className="text-muted-foreground" />
                <TextInput value={email} onChangeText={setEmail} placeholder="you@studio.com"
                  placeholderTextColor="#A89489" className="flex-1 text-foreground text-base"
                  keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
              </View>
            </View>
            <View>
              <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px] mb-2 ml-1">Password</Text>
              <View className="bg-card rounded-2xl px-4 py-3.5 flex-row items-center gap-3"
                style={{ shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
                <LockIcon size={16} className="text-muted-foreground" />
                <TextInput value={password} onChangeText={setPassword} placeholder="Min. 8 characters"
                  placeholderTextColor="#A89489" className="flex-1 text-foreground text-base"
                  secureTextEntry={!showPassword} autoCapitalize="none" />
                <Pressable onPress={() => setShowPassword(!showPassword)} className="active:scale-[0.90]">
                  {showPassword ? <EyeOffIcon size={18} className="text-muted-foreground" /> : <EyeIcon size={18} className="text-muted-foreground" />}
                </Pressable>
              </View>
            </View>
            <View>
              <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px] mb-2 ml-1">Confirm Password</Text>
              <View className="bg-card rounded-2xl px-4 py-3.5 flex-row items-center gap-3"
                style={{ shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
                <LockIcon size={16} className="text-muted-foreground" />
                <TextInput value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Re-enter password"
                  placeholderTextColor="#A89489" className="flex-1 text-foreground text-base"
                  secureTextEntry={!showPassword} autoCapitalize="none" />
              </View>
            </View>

            {errorMsg ? (
              <View className="bg-destructive/10 rounded-xl px-4 py-3">
                <Text className="text-destructive text-sm">{errorMsg}</Text>
              </View>
            ) : null}
          </View>
        </ScrollView>

        {/* Bottom */}
        <View className="px-6 pb-10 pt-4 bg-background gap-4">
          <Pressable
            onPress={handleSignUp}
            disabled={!canSubmit || signUp.isPending}
            className={`rounded-2xl py-4 flex-row items-center justify-center gap-2 active:scale-[0.97] ${canSubmit ? 'bg-primary' : 'bg-muted'}`}
            style={canSubmit ? { shadowColor: '#B66A40', shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 6 } : undefined}>
            <Text className={`text-base font-bold ${canSubmit ? 'text-white' : 'text-muted-foreground'}`}>
              {signUp.isPending ? 'Creating account...' : 'Create Account'}
            </Text>
            {!signUp.isPending && <ArrowRightIcon size={18} className={canSubmit ? 'text-white' : 'text-muted-foreground'} />}
          </Pressable>
          <View className="flex-row items-center justify-center gap-1">
            <Text className="text-muted-foreground text-sm">Already have an account?</Text>
            <Pressable onPress={() => router.push('/sign-in')} className="active:opacity-60">
              <Text className="text-primary text-sm font-bold">Sign In</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
