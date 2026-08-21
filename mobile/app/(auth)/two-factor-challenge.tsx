import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  KeyRoundIcon,
  MailIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { useAuth, useTheme } from '@/src/hooks';
import { PALETTES } from '@/theme';

for (const Icon of [ArrowLeftIcon, ArrowRightIcon, KeyRoundIcon, MailIcon]) {
  cssInterop(Icon, {
    className: { target: 'style', nativeStyleToProp: { color: true } },
  });
}

function messageOf(error: unknown): string {
  if (error && typeof error === 'object') {
    const value = error as { reason?: string; message?: string };
    return value.reason || value.message || 'That code could not be verified.';
  }
  return 'That code could not be verified.';
}

export default function TwoFactorChallengeScreen() {
  const params = useLocalSearchParams<{ challenge?: string; email?: string }>();
  const { completeTwoFactorSignIn, resendTwoFactorCode } = useAuth();
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  const [code, setCode] = useState('');
  const [usingRecovery, setUsingRecovery] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const normalized = code.trim();
  const canSubmit = usingRecovery
    ? normalized.replace(/[^A-Za-z2-7]/g, '').length >= 10
    : /^\d{6}$/.test(normalized);

  const submit = () => {
    if (!params.challenge || !canSubmit) return;
    setError('');
    setNotice('');
    completeTwoFactorSignIn.mutate(
      { challengeToken: params.challenge, code: normalized },
      {
        onSuccess: () => router.replace('/(app)/(tabs)'),
        onError: (err) => setError(messageOf(err)),
      },
    );
  };

  const resend = () => {
    if (!params.challenge) return;
    setError('');
    setNotice('');
    resendTwoFactorCode.mutate(params.challenge, {
      onSuccess: () => setNotice('A fresh code is on its way.'),
      onError: (err) => setError(messageOf(err)),
    });
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-background">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <View className="px-6 pt-4 flex-row items-center gap-3">
          <Pressable
            onPress={() => router.replace('/sign-in')}
            accessibilityRole="button"
            accessibilityLabel="Return to sign in"
            className="w-11 h-11 rounded-xl bg-secondary items-center justify-center active:scale-[0.96]"
          >
            <ArrowLeftIcon size={18} className="text-foreground" />
          </Pressable>
          <Text className="text-foreground text-[22px] font-bold tracking-tight">
            Verify it’s you
          </Text>
        </View>

        <View className="flex-1 px-6 pt-12">
          <View className="w-14 h-14 rounded-2xl bg-primary/10 items-center justify-center mb-6">
            {usingRecovery ? (
              <KeyRoundIcon size={27} className="text-primary" />
            ) : (
              <MailIcon size={27} className="text-primary" />
            )}
          </View>
          <Text className="text-foreground text-[28px] leading-[34px] font-bold tracking-tight">
            {usingRecovery ? 'Use a recovery code' : 'Check your email'}
          </Text>
          <Text className="text-muted-foreground text-[15px] leading-[22px] mt-2 mb-7">
            {usingRecovery
              ? 'Enter one of the single-use codes you saved when you enabled two-factor authentication.'
              : `We sent a six-digit code${params.email ? ` to ${params.email}` : ' to your account email'}. It expires in ten minutes.`}
          </Text>

          <View className="bg-secondary rounded-2xl px-4 min-h-14 flex-row items-center gap-3">
            <KeyRoundIcon size={18} className="text-muted-foreground" />
            <TextInput
              value={code}
              onChangeText={(value) => {
                setCode(
                  usingRecovery
                    ? value.toUpperCase()
                    : value.replace(/\D/g, '').slice(0, 6),
                );
                setError('');
                setNotice('');
              }}
              onSubmitEditing={submit}
              placeholder={usingRecovery ? 'XXXX-XXXX-XXXX' : '000000'}
              placeholderTextColor={palette.mutedForeground}
              keyboardType={usingRecovery ? 'default' : 'number-pad'}
              autoCapitalize={usingRecovery ? 'characters' : 'none'}
              autoCorrect={false}
              textContentType="oneTimeCode"
              className={`flex-1 text-foreground font-semibold ${usingRecovery ? 'text-base' : 'text-[24px] tracking-[8px]'}`}
              accessibilityLabel={
                usingRecovery ? 'Recovery code' : 'Six-digit email code'
              }
            />
          </View>

          {error ? (
            <View className="bg-destructive/10 rounded-xl px-4 py-3 mt-3">
              <Text className="text-destructive text-sm">{error}</Text>
            </View>
          ) : null}
          {notice ? (
            <View className="bg-primary/10 rounded-xl px-4 py-3 mt-3">
              <Text className="text-primary text-sm">{notice}</Text>
            </View>
          ) : null}

          {!usingRecovery ? (
            <Pressable
              onPress={resend}
              disabled={resendTwoFactorCode.isPending || !params.challenge}
              className="self-start mt-4 py-2 active:opacity-60"
            >
              <Text className="text-primary text-sm font-semibold">
                {resendTwoFactorCode.isPending ? 'Sending…' : 'Send a new code'}
              </Text>
            </Pressable>
          ) : null}

          <Pressable
            onPress={() => {
              setUsingRecovery((value) => !value);
              setCode('');
              setError('');
              setNotice('');
            }}
            className="self-start py-2 active:opacity-60"
          >
            <Text className="text-primary text-sm font-semibold">
              {usingRecovery ? 'Use an email code instead' : 'Use a recovery code'}
            </Text>
          </Pressable>
        </View>

        <View className="px-6 pb-6">
          <Pressable
            onPress={submit}
            disabled={
              !canSubmit || completeTwoFactorSignIn.isPending || !params.challenge
            }
            accessibilityRole="button"
            accessibilityState={{
              disabled:
                !canSubmit ||
                completeTwoFactorSignIn.isPending ||
                !params.challenge,
            }}
            className={`min-h-12 rounded-xl py-4 flex-row items-center justify-center gap-2 active:scale-[0.98] ${canSubmit ? 'bg-action' : 'bg-muted'}`}
          >
            <Text
              className={`text-base font-bold ${canSubmit ? 'text-action-foreground' : 'text-muted-foreground'}`}
            >
              {completeTwoFactorSignIn.isPending ? 'Checking…' : 'Continue'}
            </Text>
            {!completeTwoFactorSignIn.isPending && (
              <ArrowRightIcon
                size={18}
                className={
                  canSubmit
                    ? 'text-action-foreground'
                    : 'text-muted-foreground'
                }
              />
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
