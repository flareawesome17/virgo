import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useAuth, useTheme } from '@/src/hooks';
import { FormNotice } from '@/components/Form';
import { appleSignInAvailable, askApple } from '@/src/lib/apple-sign-in';

/**
 * "Continue with Apple".
 *
 * Apple's own button, drawn by the system: its mark and wording are Apple's to
 * set and the review guidelines ask for exactly this. Sized to sit in the
 * footer with the app's buttons, 52 high with the same corner.
 *
 * Draws nothing where Apple sign-in is not there (Android, the web, an iPhone
 * with no Apple ID), so the screens that hold it need no condition.
 */
export function AppleButton() {
  const { signInWithApple } = useAuth();
  const { isDark } = useTheme();
  const [available, setAvailable] = useState(false);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    appleSignInAvailable().then((yes) => {
      if (alive) setAvailable(yes);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!available) return null;

  const busy = asking || signInWithApple.isPending;

  const press = async () => {
    if (busy) return;
    setError('');
    setAsking(true);
    try {
      const proof = await askApple();
      // Closed Apple's sheet: nothing to say.
      if (!proof) return;
      const result = await signInWithApple.mutateAsync(proof);
      if ('twoFactorRequired' in result) {
        router.push({
          pathname: '/two-factor-challenge',
          params: { challenge: result.challengeToken, email: result.email },
        });
      }
      // Otherwise the session is set and the signed-out screens redirect on
      // their own; a new account is sent on to "Almost there" by the layout.
    } catch (err: any) {
      setError(err?.reason || err?.message || 'Apple sign-in did not go through. Try again.');
    } finally {
      setAsking(false);
    }
  };

  return (
    <View className="gap-3" style={{ opacity: busy ? 0.6 : 1 }} pointerEvents={busy ? 'none' : 'auto'}>
      {error ? <FormNotice title="That did not go through" body={error} /> : null}
      <AppleAuthentication.AppleAuthenticationButton
        buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
        // Apple's rule: the white button on dark, the black one on light.
        buttonStyle={
          isDark
            ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
            : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
        }
        cornerRadius={14}
        style={{ height: 52, width: '100%' }}
        onPress={press}
      />
    </View>
  );
}
