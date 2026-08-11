import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  ArrowLeftIcon,
  LockIcon,
  EyeIcon,
  EyeOffIcon,
  CheckCircleIcon,
  AlertCircleIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { authApi } from '@/src/api';

for (const Icon of [
  ArrowLeftIcon, LockIcon, EyeIcon, EyeOffIcon, CheckCircleIcon, AlertCircleIcon,
]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/**
 * Completes a password reset.
 *
 * Reached from the emailed link. The app registers the `virgo` scheme, so
 * `virgo://reset-password?token=…` opens here directly; the same link on the
 * web opens the browser version. Either way the token comes in as a query
 * param and is redeemed by the same endpoint.
 */
export default function ResetPasswordScreen() {
  const { token } = useLocalSearchParams<{ token?: string }>();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const reset = useMutation({
    mutationFn: () => authApi.resetPassword(token as string, password),
    onError: (err: any) =>
      setErrorMsg(err?.message || 'Could not reset the password. Please try again.'),
  });

  const submit = () => {
    setErrorMsg('');
    if (password.length < 8) {
      setErrorMsg('Use at least 8 characters.');
      return;
    }
    // Checked here rather than only on the server: retyping is the whole point
    // of the second field, and a round trip to learn they differ is a slower
    // way to say so.
    if (password !== confirm) {
      setErrorMsg('Those two passwords do not match.');
      return;
    }
    reset.mutate();
  };

  const canSubmit = password.length >= 8 && confirm.length > 0 && !reset.isPending;

  // No token means the link was truncated, or somebody opened this screen
  // directly.
  if (!token) {
    return (
      <SafeAreaView edges={['top']} className="flex-1 bg-background">
        <View className="px-6 pt-4">
          <Pressable
            onPress={() => router.replace('/(auth)/sign-in')}
            className="w-10 h-10 rounded-2xl bg-card items-center justify-center active:scale-[0.94]"
          >
            <ArrowLeftIcon size={18} className="text-foreground" />
          </Pressable>
        </View>
        <View className="flex-1 items-center justify-center px-8">
          <View className="w-20 h-20 rounded-full bg-destructive/10 items-center justify-center mb-6">
            <AlertCircleIcon size={34} className="text-destructive" />
          </View>
          <Text className="text-foreground text-xl font-extrabold">Link is incomplete</Text>
          <Text className="text-muted-foreground text-sm text-center mt-3 leading-relaxed">
            That link is missing its token. Open the whole link from the email,
            including everything after the question mark.
          </Text>
          <Pressable
            onPress={() => router.replace('/(auth)/forgot-password')}
            className="mt-8 bg-primary rounded-2xl px-7 py-3.5 active:scale-[0.97]"
          >
            <Text className="text-white text-base font-bold">Request a new link</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (reset.isSuccess) {
    return (
      <SafeAreaView edges={['top']} className="flex-1 bg-background">
        <View className="flex-1 items-center justify-center px-8">
          <View
            className="w-20 h-20 rounded-full items-center justify-center mb-6"
            style={{ backgroundColor: '#6B8E4E18' }}
          >
            <CheckCircleIcon size={36} color="#6B8E4E" />
          </View>
          <Text className="text-foreground text-xl font-extrabold">Password changed</Text>
          <Text className="text-muted-foreground text-sm text-center mt-3 leading-relaxed">
            You can sign in with it now. Every other device has been signed out.
          </Text>
          <Pressable
            onPress={() => router.replace('/(auth)/sign-in')}
            className="mt-8 bg-primary rounded-2xl px-8 py-3.5 active:scale-[0.97]"
          >
            <Text className="text-white text-base font-bold">Sign in</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <ScrollView
          className="flex-1"
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 40 }}
        >
          <View className="px-6 pt-4 pb-2 flex-row items-center gap-3">
            <Pressable
              onPress={() => router.replace('/(auth)/sign-in')}
              className="w-10 h-10 rounded-2xl bg-card items-center justify-center active:scale-[0.94]"
              style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}
            >
              <ArrowLeftIcon size={18} className="text-foreground" />
            </Pressable>
          </View>

          <View className="px-6 mt-4">
            <Text className="text-foreground text-[28px] font-extrabold tracking-tight">
              Choose a new password
            </Text>
            <Text className="text-muted-foreground text-sm mt-2 leading-relaxed">
              Make it one you have not used here before.
            </Text>
          </View>

          <View className="px-6 mt-8 gap-5">
            <View>
              <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px] mb-2 ml-1">
                New password
              </Text>
              <View
                className="bg-card rounded-2xl px-4 py-3.5 flex-row items-center gap-3"
                style={{ shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}
              >
                <LockIcon size={16} className="text-muted-foreground" />
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="At least 8 characters"
                  placeholderTextColor="#A89489"
                  className="flex-1 text-foreground text-base"
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoFocus
                />
                <Pressable onPress={() => setShowPassword((v) => !v)} hitSlop={8}>
                  {showPassword ? (
                    <EyeOffIcon size={16} className="text-muted-foreground" />
                  ) : (
                    <EyeIcon size={16} className="text-muted-foreground" />
                  )}
                </Pressable>
              </View>
            </View>

            <View>
              <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px] mb-2 ml-1">
                Confirm password
              </Text>
              <View
                className="bg-card rounded-2xl px-4 py-3.5 flex-row items-center gap-3"
                style={{ shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}
              >
                <LockIcon size={16} className="text-muted-foreground" />
                <TextInput
                  value={confirm}
                  onChangeText={setConfirm}
                  placeholder="Type it again"
                  placeholderTextColor="#A89489"
                  className="flex-1 text-foreground text-base"
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                />
              </View>
            </View>

            {errorMsg ? (
              <View className="bg-destructive/10 rounded-xl px-4 py-3">
                <Text className="text-destructive text-sm">{errorMsg}</Text>
              </View>
            ) : null}
          </View>
        </ScrollView>

        <View className="px-6 pb-10 pt-4 bg-background">
          <Pressable
            onPress={submit}
            disabled={!canSubmit}
            className={`rounded-2xl py-4 flex-row items-center justify-center gap-2 active:scale-[0.97] ${canSubmit ? 'bg-primary' : 'bg-muted'}`}
            style={canSubmit ? { shadowColor: '#B66A40', shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 6 } : undefined}
          >
            {reset.isPending && <ActivityIndicator size="small" color="#FFFFFF" />}
            <Text className={`text-base font-bold ${canSubmit ? 'text-white' : 'text-muted-foreground'}`}>
              {reset.isPending ? 'Saving…' : 'Set new password'}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
