import { Pressable, Text } from 'react-native';
import { router } from 'expo-router';
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { authApi } from '@/src/api';
import { FormField, FormInput, FormNotice } from '@/components/Form';
import { AuthButton, AuthFooter, AuthFooterLine, AuthFrame, AuthTitle } from '@/components/auth/AuthFrame';

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  /**
   * This screen used to await a 1500ms sleep and claim success — no email was
   * ever sent. It now calls the real endpoint.
   *
   * The server answers identically whether or not the address has an account,
   * so the confirmation below must not imply one exists.
   */
  const request = useMutation({
    mutationFn: (address: string) => authApi.forgotPassword(address),
    onSuccess: () => setSent(true),
    onError: (err: any) =>
      setErrorMsg(err?.message || 'Could not send the email. Please try again.'),
  });

  const loading = request.isPending;
  const canSend = email.trim().length > 0;

  const handleSend = () => {
    if (!canSend || loading) return;
    setErrorMsg('');
    request.mutate(email.trim());
  };

  const signInLine = (
    <AuthFooterLine lead="Remembered it?" action="Sign in" onPress={() => router.replace('/sign-in')} />
  );

  if (sent) {
    return (
      <AuthFrame onBack={() => router.back()} backLabel="Back" footer={<AuthFooter>{signInLine}</AuthFooter>}>
        <AuthTitle title="Check your email">
          If an account exists for <Text className="text-foreground font-semibold">{email}</Text>, we’ve sent a
          password reset link.
        </AuthTitle>
        <Pressable
          onPress={() => { setSent(false); setEmail(''); }}
          accessibilityRole="button"
          hitSlop={12}
          className="self-start active:opacity-60"
        >
          <Text className="text-primary text-[15px] leading-5 font-semibold">Try a different email</Text>
        </Pressable>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame
      onBack={() => router.back()}
      backLabel="Back"
      footer={
        <AuthFooter>
          {/* Not under the field: the server never says an address is wrong
              (see above), so what fails here is the sending, not the typing. */}
          {errorMsg ? <FormNotice title="That did not send" body={errorMsg} /> : null}
          <AuthButton
            label={loading ? 'Sending…' : 'Send the link'}
            onPress={handleSend}
            disabled={!canSend}
            busy={loading}
          />
          {signInLine}
        </AuthFooter>
      }
    >
      <AuthTitle title="Reset your password">
        Enter the email you signed up with. We will send a link to choose a new one.
      </AuthTitle>

      <FormField label="Email">
        <FormInput
          value={email}
          onChangeText={setEmail}
          placeholder="you@studio.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoFocus
          autoCorrect={false}
          textContentType="username"
          autoComplete="email"
        />
      </FormField>
    </AuthFrame>
  );
}
