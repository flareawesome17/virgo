import {
  Alert,
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
import { useRef, useState, type RefObject } from 'react';
import { ArrowLeftIcon, EyeIcon, EyeOffIcon, KeyRoundIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { useAuth, useTheme } from '@/src/hooks';
import { PALETTES } from '@/theme';

for (const Icon of [ArrowLeftIcon, EyeIcon, EyeOffIcon, KeyRoundIcon]) {
  cssInterop(Icon, {
    className: { target: 'style', nativeStyleToProp: { color: true } },
  });
}

/** The same floor and bcrypt ceiling the API enforces. */
const MIN_LENGTH = 8;
const MAX_LENGTH = 72;

/**
 * Changing the password of a signed-in account.
 *
 * The server signs every other device out and hands this one a fresh session,
 * so nobody is bounced to the sign-in screen for doing the right thing.
 */
export default function ChangePasswordScreen() {
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  const { changePassword } = useAuth();

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState('');
  const nextRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  // Said before the button is pressed, so the only errors left for the server
  // are the ones it alone can know: a wrong current password, or a reused one.
  const problem = !next
    ? null
    : next.length < MIN_LENGTH
      ? `At least ${MIN_LENGTH} characters.`
      : next.length > MAX_LENGTH
        ? `At most ${MAX_LENGTH} characters.`
        : // Not while the second copy is still a correct start of the first.
          confirm && !next.startsWith(confirm)
          ? 'The two new passwords do not match.'
          : null;
  const ready = !!current && !!next && confirm === next && !problem;

  const submit = () => {
    if (!ready || changePassword.isPending) return;
    setError('');
    changePassword.mutate(
      { currentPassword: current, newPassword: next },
      {
        onSuccess: () => {
          Alert.alert(
            'Password changed',
            'Any other phone or browser signed in to your account has been signed out.',
            [{ text: 'Done', onPress: () => router.back() }],
          );
        },
        onError: (err) => setError(err.message),
      },
    );
  };

  const field = (
    label: string,
    value: string,
    onChange: (value: string) => void,
    options: {
      ref?: RefObject<TextInput | null>;
      placeholder: string;
      current?: boolean;
      onSubmit: () => void;
      last?: boolean;
    },
  ) => (
    <View className="mt-5">
      <Text className="text-foreground text-[13px] font-semibold mb-2">{label}</Text>
      <TextInput
        ref={options.ref}
        value={value}
        onChangeText={(text) => {
          onChange(text);
          setError('');
        }}
        secureTextEntry={!visible}
        autoCapitalize="none"
        autoCorrect={false}
        // Tells password managers which field is which: fill the saved one
        // into "current", offer to generate and save into "new".
        textContentType={options.current ? 'password' : 'newPassword'}
        autoComplete={options.current ? 'current-password' : 'new-password'}
        returnKeyType={options.last ? 'done' : 'next'}
        onSubmitEditing={options.onSubmit}
        submitBehavior={options.last ? 'blurAndSubmit' : 'submit'}
        placeholder={options.placeholder}
        placeholderTextColor={palette.mutedForeground}
        maxLength={MAX_LENGTH + 1}
        className="min-h-14 bg-secondary rounded-xl px-4 text-foreground text-base"
      />
    </View>
  );

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
              Change password
            </Text>
          </View>

          <View className="px-5 mt-4">
            <View className="w-14 h-14 rounded-2xl bg-primary/10 items-center justify-center">
              <KeyRoundIcon size={26} className="text-primary" />
            </View>
            <Text className="text-muted-foreground text-[15px] leading-[22px] mt-4">
              Other phones and browsers signed in to your account will be signed out. This one
              stays signed in.
            </Text>

            {field('Current password', current, setCurrent, {
              placeholder: 'The password you use now',
              current: true,
              onSubmit: () => nextRef.current?.focus(),
            })}
            {field('New password', next, setNext, {
              ref: nextRef,
              placeholder: `At least ${MIN_LENGTH} characters`,
              onSubmit: () => confirmRef.current?.focus(),
            })}
            {field('Confirm new password', confirm, setConfirm, {
              ref: confirmRef,
              placeholder: 'Type it again',
              onSubmit: submit,
              last: true,
            })}

            <View className="flex-row items-center justify-between mt-3 min-h-6">
              <Text className="text-destructive text-[13px] flex-1 pr-3">{problem ?? ''}</Text>
              <Pressable
                onPress={() => setVisible((v) => !v)}
                accessibilityRole="button"
                accessibilityLabel={visible ? 'Hide passwords' : 'Show passwords'}
                hitSlop={12}
                className="flex-row items-center gap-1.5"
              >
                {visible ? (
                  <EyeOffIcon size={15} className="text-muted-foreground" />
                ) : (
                  <EyeIcon size={15} className="text-muted-foreground" />
                )}
                <Text className="text-muted-foreground text-[13px] font-semibold">
                  {visible ? 'Hide' : 'Show'}
                </Text>
              </Pressable>
            </View>

            <Pressable
              onPress={submit}
              disabled={!ready || changePassword.isPending}
              accessibilityRole="button"
              accessibilityState={{ disabled: !ready || changePassword.isPending }}
              className={`min-h-12 rounded-xl py-4 items-center justify-center mt-6 active:scale-[0.98] ${ready ? 'bg-action' : 'bg-muted'}`}
            >
              <Text
                className={`text-base font-bold ${ready ? 'text-action-foreground' : 'text-muted-foreground'}`}
              >
                {changePassword.isPending ? 'Changing…' : 'Change password'}
              </Text>
            </Pressable>

            {error ? (
              <View className="bg-destructive/10 rounded-xl px-4 py-3 mt-4">
                <Text className="text-destructive text-sm">{error}</Text>
              </View>
            ) : null}

            <Pressable
              onPress={() => router.push('/(auth)/forgot-password')}
              accessibilityRole="link"
              hitSlop={8}
              className="self-center mt-6 py-2"
            >
              <Text className="text-primary text-sm font-semibold">
                Forgot your current password?
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
