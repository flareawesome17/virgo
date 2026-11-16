import { Pressable, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useAuth } from '@/src/hooks';
import { useHoldUpdates } from '@/src/lib/ota-updates';
import { FormField, FormHint, FormInput } from '@/components/Form';
import { AuthButton, AuthFooter, AuthFooterLine, AuthFrame, AuthTitle } from '@/components/auth/AuthFrame';
import { clock, CodeBoxes, useCountdown } from '@/components/auth/AuthFields';

/** How long before another code can be asked for. One was sent on the way here. */
const RESEND_WAIT = 30;

function messageOf(error: unknown): string {
  if (error && typeof error === 'object') {
    const value = error as { reason?: string; message?: string };
    return value.reason || value.message || 'That code could not be verified.';
  }
  return 'That code could not be verified.';
}

export default function TwoFactorChallengeScreen() {
  // A code fetched from email, or a form half filled: see useHoldUpdates.
  useHoldUpdates();
  const params = useLocalSearchParams<{ challenge?: string; email?: string }>();
  const { completeTwoFactorSignIn, resendTwoFactorCode } = useAuth();
  const [code, setCode] = useState('');
  const [usingRecovery, setUsingRecovery] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  // Asking again the second the screen opens sends two codes, and the first
  // to arrive is then the one that no longer works.
  const [wait, restartWait] = useCountdown(RESEND_WAIT, true);

  const normalized = code.trim();
  const canSubmit = usingRecovery
    ? normalized.replace(/[^A-Za-z2-7]/g, '').length >= 10
    : /^\d{6}$/.test(normalized);

  const submit = () => {
    // Go pressed twice used the code twice: the second attempt failed and
    // could burn the emailed code before the first answer arrived.
    if (!params.challenge || !canSubmit || completeTwoFactorSignIn.isPending) return;
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
    if (!params.challenge || wait > 0) return;
    setError('');
    setNotice('');
    resendTwoFactorCode.mutate(params.challenge, {
      onSuccess: () => {
        setNotice('A fresh code is on its way.');
        restartWait();
      },
      onError: (err) => setError(messageOf(err)),
    });
  };

  const onChangeCode = (value: string) => {
    setCode(
      usingRecovery
        ? value.toUpperCase()
        : value.replace(/\D/g, '').slice(0, 6),
    );
    setError('');
    setNotice('');
  };

  const resendOff = resendTwoFactorCode.isPending || !params.challenge || wait > 0;

  return (
    <AuthFrame
      onBack={() => router.replace('/sign-in')}
      backLabel="Return to sign in"
      footer={
        <AuthFooter>
          <AuthButton
            label={completeTwoFactorSignIn.isPending ? 'Checking…' : 'Verify'}
            onPress={submit}
            disabled={!canSubmit || !params.challenge}
            busy={completeTwoFactorSignIn.isPending}
          />
          <AuthFooterLine lead="Not you?" action="Use another account" onPress={() => router.replace('/sign-in')} />
        </AuthFooter>
      }
    >
      <AuthTitle title={usingRecovery ? 'Use a recovery code' : 'Enter the code'}>
        {usingRecovery
          ? 'Enter one of the single-use codes you saved when you enabled two-factor authentication.'
          : `We emailed a 6-digit code${params.email ? ` to ${params.email}` : ' to your account email'}. It is good for ten minutes.`}
      </AuthTitle>

      {usingRecovery ? (
        <FormField label="Recovery code" hint={error || undefined} wrong={!!error}>
          <FormInput
            value={code}
            onChangeText={onChangeCode}
            onSubmitEditing={submit}
            placeholder="XXXX-XXXX-XXXX"
            keyboardType="default"
            autoCapitalize="characters"
            autoCorrect={false}
            textContentType="oneTimeCode"
            wrong={!!error}
            accessibilityLabel="Recovery code"
          />
        </FormField>
      ) : (
        <View className="gap-2">
          <CodeBoxes
            value={code}
            onChangeText={onChangeCode}
            onSubmitEditing={submit}
            wrong={!!error}
            accessibilityLabel="Six-digit email code"
            autoFocus
          />
          {error ? <FormHint wrong>{error}</FormHint> : notice ? <FormHint>{notice}</FormHint> : null}
        </View>
      )}

      <View className="gap-4">
        {!usingRecovery ? (
          <View className="flex-row items-center justify-between">
            <Text className="text-muted-foreground text-[13px] leading-[18px]">Nothing arrived?</Text>
            <Pressable
              onPress={resend}
              disabled={resendOff}
              accessibilityRole="button"
              accessibilityState={{ disabled: resendOff }}
              hitSlop={12}
              className="active:opacity-60"
            >
              <Text
                className={`text-[15px] leading-5 font-semibold ${resendOff ? 'text-muted-foreground' : 'text-primary'}`}
              >
                {resendTwoFactorCode.isPending
                  ? 'Sending…'
                  : wait > 0
                    ? `Send it again in ${clock(wait)}`
                    : 'Send a new code'}
              </Text>
            </Pressable>
          </View>
        ) : null}

        <Pressable
          onPress={() => {
            setUsingRecovery((value) => !value);
            setCode('');
            setError('');
            setNotice('');
          }}
          accessibilityRole="button"
          hitSlop={12}
          className="self-start active:opacity-60"
        >
          <Text className="text-primary text-[15px] leading-5 font-semibold">
            {usingRecovery ? 'Use an email code instead' : 'Use a recovery code'}
          </Text>
        </Pressable>
      </View>
    </AuthFrame>
  );
}
