import { View, Text, Pressable, TextInput, Alert } from 'react-native';
import { useAuth } from '@/src/hooks';
import { Redirect, router } from 'expo-router';
import { useRef, useState } from 'react';
import { FormField, FormHint, FormInput, FormLabel } from '@/components/Form';
import { AuthButton, AuthFooter, AuthFooterLine, AuthFrame, AuthTitle } from '@/components/auth/AuthFrame';
import { PasswordInput } from '@/components/auth/AuthFields';

export default function SignInScreen() {
  const { signIn, user } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Above the early return: a hook after it is skipped on the render that
  // redirects, and React then throws "Rendered fewer hooks than expected".
  const passwordRef = useRef<TextInput>(null);

  // <Redirect> rather than router.replace(): navigating during render mutates
  // the navigation container mid-render and triggers React's
  // "Cannot update a component while rendering a different component" error.
  if (process.env.EXPO_PUBLIC_RAPIDNATIVE_MODE !== 'designer' && user) {
    return <Redirect href="/(app)/(tabs)" />;
  }

  const canSubmit = email.trim().length > 0 && password.length > 0;

  const handleSignIn = (unpause = false) => {
    // The keyboard's Go as well as the button: a second press while the
    // first was in flight signed in twice, or asked for a second code.
    if (!canSubmit || signIn.isPending) return;
    setErrorMsg('');
    signIn.mutate(
      { email: email.trim(), password, ...(unpause ? { unpause: true } : {}) },
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
              // Nothing was sent by this attempt; the screen words it so.
              params: { email: err.email ?? email.trim(), from: 'sign-in' },
            });
            return;
          }
          // Paused by its owner: there was no way back before the date. Offer
          // it here, where they have just proved it is theirs.
          if (err?.code === 'ACCOUNT_DISABLED' && !unpause) {
            Alert.alert(
              'This account is paused',
              `${err?.reason || 'You paused this account.'} Unpause it now and sign in?`,
              [
                { text: 'Not now', style: 'cancel' },
                { text: 'Unpause and sign in', onPress: () => handleSignIn(true) },
              ],
            );
            return;
          }
          const msg =
            err?.reason ||
            err?.message ||
            'That email and password do not match. Check both, or reset the password.';
          setErrorMsg(msg);
        },
      }
    );
  };

  return (
    <AuthFrame
      onBack={() => router.back()}
      footer={
        <AuthFooter>
          {/* There was a "Continue with Google" button here that did nothing —
              no handler, no provider, no OAuth client. Offering a sign-in
              method that cannot sign anyone in is worse than not offering it:
              somebody with a Google-created account taps it, gets nothing, and
              reasonably concludes the app is broken. It comes back when it
              works. */}
          <AuthButton
            label={signIn.isPending ? 'Signing in…' : 'Sign in'}
            onPress={() => handleSignIn()}
            disabled={!canSubmit}
            busy={signIn.isPending}
          />
          <AuthFooterLine lead="New to Virgo?" action="Create an account" onPress={() => router.push('/sign-up')} />
        </AuthFooter>
      }
    >
      <AuthTitle title="Welcome back">Sign in to Virgo.</AuthTitle>

      <FormField label="Email">
        <FormInput
          value={email}
          onChangeText={setEmail}
          placeholder="you@studio.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="username"
          autoComplete="email"
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
          submitBehavior="submit"
        />
      </FormField>

      {/* Built by hand rather than with FormField: the way out for a
          forgotten password sits on the label's own line, beside the field it
          is about, and the kit's label is a word alone. */}
      <View className="gap-2">
        <View className="flex-row items-baseline justify-between">
          <FormLabel>Password</FormLabel>
          <Pressable
            onPress={() => router.push('/forgot-password')}
            accessibilityRole="button"
            accessibilityLabel="Forgot password?"
            hitSlop={12}
            className="active:opacity-60"
          >
            <Text className="text-primary text-[15px] leading-5 font-semibold">Forgot it?</Text>
          </Pressable>
        </View>
        <PasswordInput
          inputRef={passwordRef}
          value={password}
          onChangeText={setPassword}
          placeholder="Your password"
          wrong={!!errorMsg}
          textContentType="password"
          autoComplete="current-password"
          returnKeyType="go"
          onSubmitEditing={() => handleSignIn()}
        />
        {/* Under the password, not in a banner of its own: the answer never
            says which of the two was wrong, and this is the one to retype. */}
        {errorMsg ? <FormHint wrong>{errorMsg}</FormHint> : null}
      </View>
    </AuthFrame>
  );
}
