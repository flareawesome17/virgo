import { Linking, Platform, Pressable, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/src/hooks';
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { authApi } from '@/src/api';
import { FormCard, FormHint } from '@/components/Form';
import { AuthButton, AuthFooter, AuthFrame, AuthTitle } from '@/components/auth/AuthFrame';
import { clock, useCountdown } from '@/components/auth/AuthFields';

/** How long before the link can be sent again. */
const RESEND_WAIT = 60;

/**
 * Only iOS has an address that opens the mail app at its inbox. Android's
 * `mailto:` opens a blank message to nobody, which is not what the button
 * says, so there the button is left out rather than made to lie.
 */
const CAN_OPEN_MAIL = Platform.OS === 'ios';

export default function CheckInboxScreen() {
  // The address comes from the sign-in attempt when verification blocked it;
  // otherwise from the session, for someone who just registered.
  const { email: emailParam, from } = useLocalSearchParams<{ email?: string; from?: string }>();
  const { user } = useAuth();
  const demoEmail = emailParam ?? user?.email ?? 'your email';
  // Sent by this screen's own Resend, as opposed to at sign-up.
  const [sent, setSent] = useState(false);
  // Arriving from a blocked sign-in, nothing has just been sent: the link, if
  // any, went out at sign-up. It used to say "we sent a link" all the same.
  const fromSignIn = from === 'sign-in' && !sent;
  // Straight from signing up, a link left a moment ago: wait before offering
  // another. From a refused sign-in nothing did, so it can be asked for at once.
  const [wait, restartWait] = useCountdown(RESEND_WAIT, from !== 'sign-in');

  /**
   * This awaited a 1000ms sleep and claimed success — no email was ever sent.
   * It now calls the public resend, which needs no session: sign-in is blocked
   * until the address is confirmed, so an authenticated resend would be
   * unreachable to exactly the people who need it.
   */
  const resend = useMutation({
    mutationFn: () => authApi.requestVerification(demoEmail),
    onSuccess: () => {
      setSent(true);
      restartWait();
    },
  });
  // Said under the card either way. Resend used to change nothing on screen
  // when it worked and nothing when it failed, so people pressed it until the
  // rate limit stopped them without saying so.
  const resendNote = resend.isError
    ? resend.error instanceof Error && resend.error.message
      ? resend.error.message
      : 'Could not send it. Try again in a moment.'
    : sent
      ? 'Sent. It can take a minute, and it sometimes lands in Spam or Promotions.'
      : null;

  const resending = resend.isPending;
  const handleResend = () => {
    if (!emailParam && !user?.email) return;
    if (wait > 0) return;
    resend.mutate();
  };

  // Back to wherever the address was typed: the sign-in form, or the last
  // step of joining with everything still filled in. There is no screen of
  // its own for changing it, because until it is confirmed there is no
  // session to change it with.
  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/welcome');
  };

  const resendOff = resending || wait > 0;

  return (
    <AuthFrame
      onBack={goBack}
      footer={
        <AuthFooter>
          {CAN_OPEN_MAIL ? (
            <AuthButton
              label="Open my mail app"
              // Nothing to say if there is no mail app to open: the other
              // button and the link in the email both still work.
              onPress={() => void Linking.openURL('message://').catch(() => {})}
            />
          ) : null}
          <AuthButton
            label="I have confirmed, sign me in"
            quiet={CAN_OPEN_MAIL}
            onPress={() => router.push('/sign-in')}
          />
        </AuthFooter>
      }
    >
      <AuthTitle title={fromSignIn ? 'Confirm your email first' : 'Check your inbox'}>
        {fromSignIn ? 'We emailed a link to ' : 'We sent a link to '}
        <Text className="text-foreground font-semibold">{demoEmail}</Text>
        {fromSignIn
          ? ' when you signed up. Open it on this phone, or send a new one below.'
          : '. Open it on this phone to finish creating your account.'}
      </AuthTitle>

      <View className="gap-3">
        <FormCard>
          <View className="min-h-[52px] flex-row items-center justify-between gap-3 px-4">
            <Text className="text-foreground text-[15px] font-medium">Nothing arrived?</Text>
            <Pressable
              onPress={handleResend}
              disabled={resendOff}
              accessibilityRole="button"
              accessibilityState={{ disabled: resendOff, busy: resending }}
              hitSlop={12}
              className="active:opacity-60"
            >
              <Text className={`text-[15px] font-semibold ${resendOff ? 'text-muted-foreground' : 'text-primary'}`}>
                {resending
                  ? 'Sending…'
                  : wait > 0
                    ? `Send again in ${clock(wait)}`
                    : fromSignIn
                      ? 'Send a new link'
                      : 'Send again'}
              </Text>
            </Pressable>
          </View>
          <View className="min-h-[52px] flex-row items-center justify-between gap-3 px-4 border-t border-border/40">
            <Text className="text-foreground text-[15px] font-medium">Wrong address?</Text>
            <Pressable onPress={goBack} accessibilityRole="button" hitSlop={12} className="active:opacity-60">
              <Text className="text-primary text-[15px] font-semibold">Change it</Text>
            </Pressable>
          </View>
        </FormCard>

        {resend.isError ? (
          <FormHint wrong>{resendNote}</FormHint>
        ) : (
          <Text accessibilityLiveRegion="polite" className="text-muted-foreground text-[12px] leading-4">
            {resendNote ?? 'It can take a minute, and it sometimes lands in Spam or Promotions.'}
          </Text>
        )}
      </View>
    </AuthFrame>
  );
}
