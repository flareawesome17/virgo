import { View, Text, Pressable, ActivityIndicator, Alert } from 'react-native';
import {
  SafeAreaInsetsContext,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { MailWarningIcon, XIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { useAuth } from '@/src/hooks';
import { authApi } from '@/src/api';

cssInterop(MailWarningIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(XIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

/**
 * Tells an unverified account why nothing will save.
 *
 * The API blocks every write with a 403 the moment verification is enforced.
 * The message it returns is clear, but it only arrives *after* someone has
 * written out a hire enquiry and pressed send — by which point the useful thing
 * is not an explanation, it is the resend button. The web app has had this
 * banner since verification shipped; the phone had nothing, so a blocked write
 * there was an alert with an OK button and no way forward.
 *
 * Dismissable, but it returns on the next launch — the block is still in force,
 * and pretending otherwise would be a lie.
 */
export function VerifyEmailBanner({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const [dismissed, setDismissed] = useState(false);

  const resend = useMutation({
    mutationFn: () => authApi.resendVerification(),
    onSuccess: () =>
      Alert.alert('Link sent', 'Check your inbox, and your spam folder.'),
    onError: (err: Error) =>
      Alert.alert('Could not send the link', err.message),
  });

  // `emailVerified` is absent on responses from an older API; treating that as
  // verified keeps the banner from appearing for everyone during a rollout.
  if (!profile || profile.emailVerified !== false || dismissed) {
    return <>{children}</>;
  }

  return (
    <>
    <View
      className="flex-row items-center gap-2.5 px-4 pb-2.5"
      style={{ paddingTop: insets.top + 8, backgroundColor: '#f59e0b1a' }}
    >
      <MailWarningIcon size={16} style={{ color: '#f59e0b' }} />
      <View className="flex-1 min-w-0">
        <Text className="text-foreground text-[12px] font-bold">
          Confirm your email to finish setting up
        </Text>
        <Text className="text-muted-foreground text-[11px] mt-0.5">
          We sent a link to {profile.email}. Until then, changes will not save.
        </Text>
      </View>
      <Pressable
        className="rounded-lg px-3 py-1.5"
        style={{ backgroundColor: '#f59e0b', opacity: resend.isPending ? 0.6 : 1 }}
        disabled={resend.isPending}
        onPress={() => resend.mutate()}
      >
        {resend.isPending ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text className="text-white text-[11px] font-bold">Resend</Text>
        )}
      </Pressable>
      <Pressable onPress={() => setDismissed(true)} hitSlop={8}>
        <XIcon size={15} className="text-muted-foreground" />
      </Pressable>
    </View>

    {/*
      The banner has already covered the notch, so the screens below must not
      pad for it again. Nearly every screen opens with `SafeAreaView
      edges={['top']}`, which reads its inset from this context — overriding
      `top` to 0 is what stops a second notch-height gap appearing under the
      banner. The other edges are passed through untouched, so the home
      indicator is still cleared at the bottom.
    */}
    <SafeAreaInsetsContext.Provider value={{ ...insets, top: 0 }}>
      {children}
    </SafeAreaInsetsContext.Provider>
    </>
  );
}
