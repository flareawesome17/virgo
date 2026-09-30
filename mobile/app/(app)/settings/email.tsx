import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { ArrowLeftIcon, MailCheckIcon, MailIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { useAuth, useTheme } from '@/src/hooks';
import { PALETTES } from '@/theme';

for (const Icon of [ArrowLeftIcon, MailCheckIcon, MailIcon]) {
  cssInterop(Icon, {
    className: { target: 'style', nativeStyleToProp: { color: true } },
  });
}

/** Enough to catch a slip of the thumb. The server has the final say. */
const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Moving the account to a new email address.
 *
 * Nothing changes here: the new address is sent a link, and the account moves
 * when it is opened. The old address is told, so a stranger holding the phone
 * cannot quietly take the account's inbox.
 */
export default function ChangeEmailScreen() {
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  const { user, requestEmailChange } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const passwordRef = useRef<TextInput>(null);

  const trimmed = email.trim();
  const same = !!user && trimmed.toLowerCase() === user.email.toLowerCase();
  const problem = !trimmed
    ? null
    : same
      ? 'That is already your email address.'
      : !LOOKS_LIKE_EMAIL.test(trimmed)
        ? 'Check the address for a typo.'
        : null;
  const ready = !!trimmed && !!password && !problem;

  const submit = () => {
    if (!ready || requestEmailChange.isPending) return;
    setError('');
    requestEmailChange.mutate(
      { password, newEmail: trimmed },
      {
        onSuccess: (result) => {
          setSentTo(result.pendingEmail);
          setPassword('');
        },
        onError: (err) => setError(err.message),
      },
    );
  };

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
          contentContainerStyle={{ paddingBottom: 80 }}
        >
          <View className="px-5 pt-4 pb-2 flex-row items-center gap-3">
            <Pressable
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel="Go back"
              className="w-11 h-11 rounded-xl bg-secondary items-center justify-center active:scale-[0.96]"
            >
              <ArrowLeftIcon size={18} className="text-foreground" />
            </Pressable>
            <Text className="text-foreground text-[22px] font-bold tracking-tight flex-1">
              Change email
            </Text>
          </View>

          {sentTo ? (
            <View className="px-5 mt-4">
              <View className="w-14 h-14 rounded-2xl bg-primary/10 items-center justify-center">
                <MailCheckIcon size={26} className="text-primary" />
              </View>
              <Text className="text-foreground text-[24px] leading-[30px] font-bold tracking-tight mt-5">
                Check your new inbox
              </Text>
              <Text className="text-muted-foreground text-[15px] leading-[22px] mt-2">
                We sent a link to <Text className="text-foreground font-semibold">{sentTo}</Text>.
                Your account moves to that address when you open it. Until then, keep signing in
                with {user?.email ?? 'your current address'}.
              </Text>
              <Text className="text-muted-foreground text-[13px] leading-[19px] mt-4">
                The link lasts a day. Nothing there? Check spam, or go back and send it again.
              </Text>
              <Pressable
                onPress={() => router.back()}
                accessibilityRole="button"
                className="min-h-12 rounded-xl py-4 items-center justify-center mt-7 bg-action active:scale-[0.98]"
              >
                <Text className="text-base font-bold text-action-foreground">Done</Text>
              </Pressable>
            </View>
          ) : (
            <View className="px-5 mt-4">
              <View className="w-14 h-14 rounded-2xl bg-primary/10 items-center justify-center">
                <MailIcon size={26} className="text-primary" />
              </View>
              <Text className="text-muted-foreground text-[15px] leading-[22px] mt-4">
                You sign in with{' '}
                <Text className="text-foreground font-semibold">{user?.email ?? '—'}</Text>. We will
                send a link to the new address, and let the current one know.
              </Text>

              <Text className="text-foreground text-[13px] font-semibold mt-6 mb-2">
                New email address
              </Text>
              <TextInput
                value={email}
                onChangeText={(text) => {
                  setEmail(text);
                  setError('');
                }}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="emailAddress"
                autoComplete="email"
                returnKeyType="next"
                submitBehavior="submit"
                onSubmitEditing={() => passwordRef.current?.focus()}
                placeholder="you@example.com"
                placeholderTextColor={palette.mutedForeground}
                maxLength={255}
                className="min-h-14 bg-secondary rounded-xl px-4 text-foreground text-base"
              />
              <Text className="text-destructive text-[13px] mt-2 min-h-5">{problem ?? ''}</Text>

              <Text className="text-foreground text-[13px] font-semibold mt-3 mb-2">
                Confirm your password
              </Text>
              <TextInput
                ref={passwordRef}
                value={password}
                onChangeText={(text) => {
                  setPassword(text);
                  setError('');
                }}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="password"
                autoComplete="current-password"
                returnKeyType="send"
                onSubmitEditing={submit}
                placeholder="Your Virgo password"
                placeholderTextColor={palette.mutedForeground}
                maxLength={72}
                className="min-h-14 bg-secondary rounded-xl px-4 text-foreground text-base"
              />

              <Pressable
                onPress={submit}
                disabled={!ready || requestEmailChange.isPending}
                accessibilityRole="button"
                accessibilityState={{ disabled: !ready || requestEmailChange.isPending }}
                className={`min-h-12 rounded-xl py-4 items-center justify-center mt-6 active:scale-[0.98] ${ready ? 'bg-action' : 'bg-muted'}`}
              >
                <Text
                  className={`text-base font-bold ${ready ? 'text-action-foreground' : 'text-muted-foreground'}`}
                >
                  {requestEmailChange.isPending ? 'Sending link…' : 'Send confirmation link'}
                </Text>
              </Pressable>

              {error ? (
                <View className="bg-destructive/10 rounded-xl px-4 py-3 mt-4">
                  <Text className="text-destructive text-sm">{error}</Text>
                </View>
              ) : null}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
