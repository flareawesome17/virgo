import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { authApi } from '@/src/api';
import { FormField, FormNotice } from '@/components/Form';
import { AuthButton, AuthFooter, AuthFrame, AuthTitle } from '@/components/auth/AuthFrame';
import { PasswordInput } from '@/components/auth/AuthFields';

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
  // What is wrong with the password as typed, as opposed to what the server
  // refused: the first sits under the field, the second above the button.
  const [fieldError, setFieldError] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const reset = useMutation({
    mutationFn: () => authApi.resetPassword(token as string, password),
    onError: (err: any) =>
      setErrorMsg(err?.message || 'Could not reset the password. Please try again.'),
  });

  // One field, with an eye. It was typed twice so a typo could be caught;
  // looking at it catches the same typo.
  const submit = () => {
    if (reset.isPending) return;
    setErrorMsg('');
    setFieldError('');
    if (password.length < 8) {
      setFieldError('Use at least 8 characters.');
      return;
    }
    reset.mutate();
  };

  // No token means the link was truncated, or somebody opened this screen
  // directly.
  if (!token) {
    return (
      <AuthFrame
        onBack={() => router.replace('/(auth)/sign-in')}
        backLabel="Back"
        footer={
          <AuthFooter>
            <AuthButton label="Request a new link" onPress={() => router.replace('/(auth)/forgot-password')} />
          </AuthFooter>
        }
      >
        <AuthTitle title="Link is incomplete">
          That link is missing its token. Open the whole link from the email, including everything after the
          question mark.
        </AuthTitle>
      </AuthFrame>
    );
  }

  if (reset.isSuccess) {
    return (
      <AuthFrame
        footer={
          <AuthFooter>
            <AuthButton label="Sign in" onPress={() => router.replace('/(auth)/sign-in')} />
          </AuthFooter>
        }
      >
        <AuthTitle title="Password changed">
          You can sign in with it now. Every other device has been signed out.
        </AuthTitle>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame
      onBack={() => router.replace('/(auth)/sign-in')}
      backLabel="Back"
      footer={
        <AuthFooter>
          {/* Usually about the link (used already, or too old), not about
              what was typed, so it is not hung on the field. */}
          {errorMsg ? <FormNotice title="That did not save" body={errorMsg} /> : null}
          <AuthButton
            label={reset.isPending ? 'Saving…' : 'Set new password'}
            onPress={submit}
            disabled={password.length < 8}
            busy={reset.isPending}
          />
        </AuthFooter>
      }
    >
      <AuthTitle title="Choose a new password">Make it one you have not used here before.</AuthTitle>

      <FormField
        label="New password"
        hint={fieldError || 'At least 8 characters. Longer is stronger.'}
        wrong={!!fieldError}
      >
        <PasswordInput
          value={password}
          onChangeText={(next) => {
            setPassword(next);
            setFieldError('');
          }}
          placeholder="At least 8 characters"
          wrong={!!fieldError}
          autoFocus
          returnKeyType="go"
          onSubmitEditing={submit}
        />
      </FormField>
    </AuthFrame>
  );
}
