import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, Text, TextInput, View } from 'react-native';
import { EyeIcon, EyeOffIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import type { DeleteProof } from '@/src/api';
import { useDeleteProof } from '@/src/hooks/useDeleteProof';
import { useWindowInsets } from '@/src/lib/window-insets';
import { useShade } from '@/components/BottomSheet';

for (const Icon of [EyeIcon, EyeOffIcon]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/**
 * "Delete X?", with the password — and, with two-factor on, the code emailed
 * for it — before anything goes.
 *
 * An Alert used to be the whole of it, and one tap on it deleted a workspace
 * from a session a stranger had signed in to (2026-10-25). Alert.prompt would
 * take a password on iOS only, so this is a card like NameSheet: at the top of
 * the screen, where the keyboard cannot cover it or its buttons.
 *
 * `onConfirm` is the delete itself, given what the server asks for; the
 * steps between are useDeleteProof's. A refusal — a wrong password, an
 * expired code — stays on the card, with the field still filled.
 */
export function DeleteConfirmSheet({
  visible,
  title,
  message,
  confirmLabel = 'Delete',
  onCancel,
  onConfirm,
  onDone,
}: {
  visible: boolean;
  title: string;
  /** What deleting it does, in a sentence or two. */
  message: string;
  confirmLabel?: string;
  onCancel: () => void;
  onConfirm: (proof: DeleteProof) => Promise<unknown>;
  /** After the delete went through; the card is closed by then. */
  onDone: () => void;
}) {
  const form = useDeleteProof();
  const [showPassword, setShowPassword] = useState(false);
  const insets = useWindowInsets();
  const shade = useShade();

  // A fresh, empty field each time it opens: a password must not wait in
  // memory for the next delete.
  const { reset } = form;
  useEffect(() => {
    if (visible) {
      reset();
      setShowPassword(false);
    }
  }, [visible, reset]);

  const value = form.step === 'password' ? form.password : form.code;
  const ready = value.trim().length > 0 && !form.busy;
  const label =
    form.step === 'password' && form.twoFactor ? 'Continue' : confirmLabel;

  const submit = async () => {
    if (!ready) return;
    if (await form.submit(onConfirm)) onDone();
  };

  const cancel = () => {
    if (form.busy) return;
    onCancel();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={cancel}>
      <View className="flex-1">
        <Pressable
          className="absolute inset-0"
          style={{ backgroundColor: shade }}
          onPress={cancel}
          accessibilityLabel="Cancel"
        />
        {/* box-none: a tap beside the card falls through to the scrim and closes it. */}
        <View pointerEvents="box-none" className="px-4" style={{ paddingTop: insets.top + 24 }}>
          <View className="bg-card rounded-3xl px-5 pt-5 pb-4">
            <Text className="text-foreground text-lg font-bold" accessibilityRole="header">
              {title}
            </Text>
            <Text className="text-muted-foreground text-sm mt-1.5 mb-4">{message}</Text>

            {form.step === 'password' ? (
              <View className="rounded-2xl border border-input bg-background flex-row items-center px-4">
                <TextInput
                  value={form.password}
                  onChangeText={form.setPassword}
                  autoFocus
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="current-password"
                  textContentType="password"
                  placeholder="Your Virgo password"
                  returnKeyType="go"
                  onSubmitEditing={() => void submit()}
                  accessibilityLabel="Your password"
                  className="flex-1 py-3.5 text-foreground text-base"
                />
                <Pressable
                  onPress={() => setShowPassword((shown) => !shown)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                  className="pl-3 active:opacity-60"
                >
                  {showPassword ? (
                    <EyeOffIcon size={17} className="text-muted-foreground" />
                  ) : (
                    <EyeIcon size={17} className="text-muted-foreground" />
                  )}
                </Pressable>
              </View>
            ) : (
              <TextInput
                value={form.code}
                onChangeText={form.setCode}
                autoFocus
                autoCapitalize="characters"
                autoCorrect={false}
                textContentType="oneTimeCode"
                autoComplete="one-time-code"
                placeholder="Email or recovery code"
                returnKeyType="go"
                onSubmitEditing={() => void submit()}
                accessibilityLabel="The code from the email"
                className="rounded-2xl border border-input bg-background px-4 py-3.5 text-foreground text-base"
              />
            )}

            {form.notice ? (
              <Text className="text-muted-foreground text-xs mt-2 ml-1">{form.notice}</Text>
            ) : form.step === 'password' && form.twoFactor ? (
              <Text className="text-muted-foreground text-xs mt-2 ml-1">
                Two-factor is on, so we will email you a code next.
              </Text>
            ) : null}
            {form.step === 'code' ? (
              <Pressable
                onPress={() => void form.resend()}
                disabled={form.busy}
                accessibilityRole="button"
                className="self-start mt-2 ml-1 active:opacity-60"
              >
                <Text className="text-action text-xs font-semibold">Send a new code</Text>
              </Pressable>
            ) : null}
            {form.error ? (
              <View className="bg-destructive/10 rounded-xl px-3 py-2.5 mt-3">
                <Text className="text-destructive text-sm" accessibilityLiveRegion="polite">
                  {form.error}
                </Text>
              </View>
            ) : null}

            <View className="flex-row gap-3 mt-5">
              <Pressable
                onPress={cancel}
                disabled={form.busy}
                className="flex-1 bg-muted rounded-2xl py-3.5 items-center active:opacity-70"
              >
                <Text className="text-foreground text-base font-semibold">Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => void submit()}
                disabled={!ready}
                accessibilityRole="button"
                className={`flex-[2] rounded-2xl py-3.5 items-center justify-center ${
                  ready ? 'bg-destructive active:opacity-85' : 'bg-muted'
                }`}
              >
                {form.busy ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text className={`text-base font-bold ${ready ? 'text-white' : 'text-muted-foreground'}`}>
                    {label}
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}
