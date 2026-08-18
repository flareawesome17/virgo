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
import { useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import {
  ArrowLeftIcon,
  CheckCircle2Icon,
  ClipboardIcon,
  KeyRoundIcon,
  MailIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
  ShieldOffIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import {
  useAuth,
  useBeginTwoFactorSecurityAction,
  useBeginTwoFactorSetup,
  useConfirmTwoFactorSetup,
  useDisableTwoFactor,
  useRegenerateTwoFactorRecoveryCodes,
  useResendTwoFactorCode,
  useTheme,
  useTwoFactorStatus,
} from '@/src/hooks';
import { PALETTES } from '@/theme';
import type { TwoFactorSetup } from '@/src/api';

for (const Icon of [
  ArrowLeftIcon,
  CheckCircle2Icon,
  ClipboardIcon,
  KeyRoundIcon,
  MailIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
  ShieldOffIcon,
]) {
  cssInterop(Icon, {
    className: { target: 'style', nativeStyleToProp: { color: true } },
  });
}

type SecurityAction = 'disable' | 'regenerate' | null;

function messageOf(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Something went wrong. Please try again.';
}

export default function TwoFactorSettingsScreen() {
  const { user } = useAuth();
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  const status = useTwoFactorStatus(!!user);
  const beginSetup = useBeginTwoFactorSetup();
  const confirmSetup = useConfirmTwoFactorSetup();
  const resend = useResendTwoFactorCode();
  const beginSecurityAction = useBeginTwoFactorSecurityAction();
  const disable = useDisableTwoFactor();
  const regenerate = useRegenerateTwoFactorRecoveryCodes();

  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [action, setAction] = useState<SecurityAction>(null);
  const [actionChallenge, setActionChallenge] =
    useState<TwoFactorSetup | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const start = () => {
    if (!password) return;
    setError('');
    setNotice('');
    beginSetup.mutate(password, {
      onSuccess: (result) => {
        setSetup(result);
        setPassword('');
      },
      onError: (err) => setError(messageOf(err)),
    });
  };

  const confirm = () => {
    if (!setup || !/^\d{6}$/.test(code)) return;
    setError('');
    setNotice('');
    confirmSetup.mutate(
      { challengeToken: setup.challengeToken, code },
      {
        onSuccess: (result) => {
          setRecoveryCodes(result.recoveryCodes);
          setCode('');
          setSetup(null);
        },
        onError: (err) => setError(messageOf(err)),
      },
    );
  };

  const resendSetupCode = () => {
    if (!setup) return;
    setError('');
    setNotice('');
    resend.mutate(setup.challengeToken, {
      onSuccess: () => setNotice('A fresh code is on its way.'),
      onError: (err) => setError(messageOf(err)),
    });
  };

  const runSecurityAction = () => {
    if (!action) return;
    setError('');
    setNotice('');
    if (!actionChallenge) {
      if (!password) return;
      beginSecurityAction.mutate(
        {
          password,
          action: action === 'disable' ? 'disable' : 'recovery',
        },
        {
          onSuccess: (challenge) => {
            setActionChallenge(challenge);
            setPassword('');
          },
          onError: (err) => setError(messageOf(err)),
        },
      );
      return;
    }
    const normalized = code.trim();
    const valid =
      /^\d{6}$/.test(normalized) ||
      normalized.replace(/[^A-Za-z2-7]/gi, '').length >= 10;
    if (!valid) return;
    const input = {
      challengeToken: actionChallenge.challengeToken,
      code: normalized,
    };
    if (action === 'disable') {
      disable.mutate(input, {
        onSuccess: () => router.replace('/sign-in'),
        onError: (err) => setError(messageOf(err)),
      });
      return;
    }
    regenerate.mutate(input, {
      onSuccess: (result) => {
        setRecoveryCodes(result.recoveryCodes);
        setAction(null);
        setActionChallenge(null);
        setPassword('');
        setCode('');
      },
      onError: (err) => setError(messageOf(err)),
    });
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
            <View className="flex-1">
              <Text className="text-foreground text-[22px] font-bold tracking-tight">
                Two-factor authentication
              </Text>
              <Text className="text-muted-foreground text-sm mt-0.5">
                Protect sign-in with a code sent to your email
              </Text>
            </View>
          </View>

          <View className="px-5 mt-6">
            {status.isLoading ? (
              <View className="h-40 rounded-3xl bg-secondary" />
            ) : recoveryCodes.length > 0 ? (
              <RecoveryCodes
                codes={recoveryCodes}
                onCopy={() => Clipboard.setStringAsync(recoveryCodes.join('\n'))}
                onDone={() => setRecoveryCodes([])}
              />
            ) : setup ? (
              <EmailSetup
                setup={setup}
                code={code}
                onCodeChange={(value) => {
                  setCode(value.replace(/\D/g, '').slice(0, 6));
                  setError('');
                  setNotice('');
                }}
                onConfirm={confirm}
                onResend={resendSetupCode}
                pending={confirmSetup.isPending}
                resending={resend.isPending}
                palette={palette}
              />
            ) : status.data?.enabled ? (
              <EnabledState
                email={status.data.email}
                remaining={status.data.recoveryCodesRemaining}
                enabledAt={status.data.enabledAt}
                action={action}
                challenge={actionChallenge}
                password={password}
                code={code}
                onAction={(next) => {
                  setAction(next);
                  setActionChallenge(null);
                  setPassword('');
                  setCode('');
                  setError('');
                }}
                onPasswordChange={setPassword}
                onCodeChange={(value) => setCode(value.toUpperCase())}
                onSubmit={runSecurityAction}
                onResend={() => {
                  if (!actionChallenge) return;
                  resend.mutate(actionChallenge.challengeToken, {
                    onSuccess: () => setNotice('A fresh code is on its way.'),
                    onError: (err) => setError(messageOf(err)),
                  });
                }}
                pending={
                  beginSecurityAction.isPending ||
                  disable.isPending ||
                  regenerate.isPending
                }
                resending={resend.isPending}
                palette={palette}
              />
            ) : (
              <DisabledState
                email={status.data?.email}
                password={password}
                onPasswordChange={setPassword}
                onSubmit={start}
                pending={beginSetup.isPending}
                palette={palette}
              />
            )}

            {error ? (
              <View className="bg-destructive/10 rounded-xl px-4 py-3 mt-4">
                <Text className="text-destructive text-sm">{error}</Text>
              </View>
            ) : null}
            {notice ? (
              <View className="bg-primary/10 rounded-xl px-4 py-3 mt-4">
                <Text className="text-primary text-sm">{notice}</Text>
              </View>
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function DisabledState({
  email,
  password,
  onPasswordChange,
  onSubmit,
  pending,
  palette,
}: {
  email?: string;
  password: string;
  onPasswordChange: (value: string) => void;
  onSubmit: () => void;
  pending: boolean;
  palette: typeof PALETTES.light;
}) {
  return (
    <View>
      <View className="w-14 h-14 rounded-2xl bg-primary/10 items-center justify-center">
        <ShieldCheckIcon size={27} className="text-primary" />
      </View>
      <Text className="text-foreground text-[24px] leading-[30px] font-bold tracking-tight mt-5">
        Add a second sign-in step
      </Text>
      <Text className="text-muted-foreground text-[15px] leading-[22px] mt-2">
        After your password, Virgo will email a one-time code
        {email ? ` to ${email}` : ''}. No separate authenticator app is needed.
      </Text>
      <Text className="text-foreground text-[13px] font-semibold mt-7 mb-2">
        Confirm your password
      </Text>
      <TextInput
        value={password}
        onChangeText={onPasswordChange}
        onSubmitEditing={onSubmit}
        secureTextEntry
        autoCapitalize="none"
        placeholder="Your Virgo password"
        placeholderTextColor={palette.mutedForeground}
        className="min-h-14 bg-secondary rounded-xl px-4 text-foreground text-base"
      />
      <Pressable
        onPress={onSubmit}
        disabled={!password || pending}
        className={`min-h-12 rounded-xl py-4 items-center justify-center mt-4 active:scale-[0.98] ${password ? 'bg-action' : 'bg-muted'}`}
      >
        <Text
          className={`text-base font-bold ${password ? 'text-action-foreground' : 'text-muted-foreground'}`}
        >
          {pending ? 'Sending code…' : 'Send verification code'}
        </Text>
      </Pressable>
    </View>
  );
}

function EmailSetup({
  setup,
  code,
  onCodeChange,
  onConfirm,
  onResend,
  pending,
  resending,
  palette,
}: {
  setup: TwoFactorSetup;
  code: string;
  onCodeChange: (value: string) => void;
  onConfirm: () => void;
  onResend: () => void;
  pending: boolean;
  resending: boolean;
  palette: typeof PALETTES.light;
}) {
  const ready = /^\d{6}$/.test(code);
  return (
    <View>
      <View className="w-14 h-14 rounded-2xl bg-primary/10 items-center justify-center">
        <MailIcon size={27} className="text-primary" />
      </View>
      <Text className="text-foreground text-[24px] font-bold tracking-tight mt-5">
        Check your email
      </Text>
      <Text className="text-muted-foreground text-[15px] leading-[22px] mt-2">
        We sent a six-digit code to {setup.email}. Enter it below within ten
        minutes to finish setup.
      </Text>
      <Text className="text-foreground text-[13px] font-semibold mt-7 mb-2">
        Verification code
      </Text>
      <TextInput
        value={code}
        onChangeText={onCodeChange}
        onSubmitEditing={onConfirm}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        placeholder="000000"
        placeholderTextColor={palette.mutedForeground}
        className="min-h-14 bg-secondary rounded-xl px-4 text-foreground text-[22px] font-semibold tracking-[8px]"
      />
      <Pressable
        onPress={onResend}
        disabled={resending}
        className="self-start py-3 active:opacity-60"
      >
        <Text className="text-primary text-sm font-semibold">
          {resending ? 'Sending…' : 'Send a new code'}
        </Text>
      </Pressable>
      <Pressable
        onPress={onConfirm}
        disabled={!ready || pending}
        className={`min-h-12 rounded-xl py-4 items-center justify-center mt-1 active:scale-[0.98] ${ready ? 'bg-action' : 'bg-muted'}`}
      >
        <Text
          className={`text-base font-bold ${ready ? 'text-action-foreground' : 'text-muted-foreground'}`}
        >
          {pending ? 'Verifying…' : 'Enable two-factor authentication'}
        </Text>
      </Pressable>
    </View>
  );
}

function EnabledState({
  email,
  remaining,
  enabledAt,
  action,
  challenge,
  password,
  code,
  onAction,
  onPasswordChange,
  onCodeChange,
  onSubmit,
  onResend,
  pending,
  resending,
  palette,
}: {
  email: string;
  remaining: number;
  enabledAt: string | null;
  action: SecurityAction;
  challenge: TwoFactorSetup | null;
  password: string;
  code: string;
  onAction: (value: SecurityAction) => void;
  onPasswordChange: (value: string) => void;
  onCodeChange: (value: string) => void;
  onSubmit: () => void;
  onResend: () => void;
  pending: boolean;
  resending: boolean;
  palette: typeof PALETTES.light;
}) {
  return (
    <View>
      <View className="rounded-3xl bg-primary/10 p-5 flex-row gap-4">
        <View className="w-11 h-11 rounded-2xl bg-card items-center justify-center">
          <CheckCircle2Icon size={22} className="text-primary" />
        </View>
        <View className="flex-1">
          <Text className="text-foreground text-base font-bold">
            Two-factor authentication is on
          </Text>
          <Text className="text-muted-foreground text-sm leading-[20px] mt-1">
            Sign-in codes go to {email}. {remaining} recovery code
            {remaining === 1 ? '' : 's'} remaining
            {enabledAt
              ? ` · Enabled ${new Date(enabledAt).toLocaleDateString()}`
              : ''}
          </Text>
        </View>
      </View>

      {!action ? (
        <View className="mt-6 gap-3">
          <Pressable
            onPress={() => onAction('regenerate')}
            className="min-h-14 rounded-2xl bg-secondary px-4 flex-row items-center gap-3 active:scale-[0.99]"
          >
            <RefreshCwIcon size={18} className="text-primary" />
            <View className="flex-1">
              <Text className="text-foreground text-sm font-semibold">
                Replace recovery codes
              </Text>
              <Text className="text-muted-foreground text-xs mt-0.5">
                Invalidates every code you saved before
              </Text>
            </View>
          </Pressable>
          <Pressable
            onPress={() => onAction('disable')}
            className="min-h-14 rounded-2xl border border-destructive/30 px-4 flex-row items-center gap-3 active:scale-[0.99]"
          >
            <ShieldOffIcon size={18} className="text-destructive" />
            <View className="flex-1">
              <Text className="text-destructive text-sm font-semibold">
                Turn off two-factor authentication
              </Text>
              <Text className="text-muted-foreground text-xs mt-0.5">
                You will be signed out on every device
              </Text>
            </View>
          </Pressable>
        </View>
      ) : (
        <View className="mt-7">
          <Text className="text-foreground text-xl font-bold tracking-tight">
            {action === 'disable'
              ? 'Turn off protection'
              : 'Replace recovery codes'}
          </Text>
          <Text className="text-muted-foreground text-sm leading-[20px] mt-1 mb-5">
            {challenge
              ? `Enter the six-digit code sent to ${challenge.email}, or use a saved recovery code.`
              : 'Confirm your password first. We’ll email a short-lived verification code.'}
          </Text>
          {challenge ? (
            <>
              <TextInput
                value={code}
                onChangeText={onCodeChange}
                autoCapitalize="characters"
                autoCorrect={false}
                textContentType="oneTimeCode"
                placeholder="Email or recovery code"
                placeholderTextColor={palette.mutedForeground}
                className="min-h-14 bg-secondary rounded-xl px-4 text-foreground text-base"
              />
              <Pressable
                onPress={onResend}
                disabled={resending}
                className="self-start py-3 active:opacity-60"
              >
                <Text className="text-primary text-sm font-semibold">
                  {resending ? 'Sending…' : 'Send a new code'}
                </Text>
              </Pressable>
            </>
          ) : (
            <TextInput
              value={password}
              onChangeText={onPasswordChange}
              secureTextEntry
              autoCapitalize="none"
              placeholder="Virgo password"
              placeholderTextColor={palette.mutedForeground}
              className="min-h-14 bg-secondary rounded-xl px-4 text-foreground text-base"
            />
          )}
          <View className="flex-row gap-3 mt-4">
            <Pressable
              onPress={() => onAction(null)}
              className="flex-1 min-h-12 rounded-xl bg-muted items-center justify-center"
            >
              <Text className="text-foreground text-sm font-semibold">Cancel</Text>
            </Pressable>
            <Pressable
              onPress={onSubmit}
              disabled={
                challenge
                  ? !(
                      /^\d{6}$/.test(code.trim()) ||
                      code.replace(/[^A-Za-z2-7]/gi, '').length >= 10
                    ) || pending
                  : !password || pending
              }
              className={`flex-[2] min-h-12 rounded-xl items-center justify-center ${action === 'disable' ? 'bg-destructive' : 'bg-action'}`}
            >
              <Text className="text-white text-sm font-bold">
                {pending
                  ? challenge
                    ? 'Checking…'
                    : 'Sending…'
                  : !challenge
                    ? 'Send verification code'
                    : action === 'disable'
                      ? 'Turn off and sign out'
                      : 'Replace codes'}
              </Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

function RecoveryCodes({
  codes,
  onCopy,
  onDone,
}: {
  codes: string[];
  onCopy: () => void;
  onDone: () => void;
}) {
  return (
    <View>
      <View className="w-14 h-14 rounded-2xl bg-primary/10 items-center justify-center">
        <KeyRoundIcon size={26} className="text-primary" />
      </View>
      <Text className="text-foreground text-[24px] leading-[30px] font-bold tracking-tight mt-5">
        Save your recovery codes
      </Text>
      <Text className="text-muted-foreground text-[15px] leading-[22px] mt-2">
        Each code works once if you cannot reach your email. Store them somewhere
        private; Virgo cannot show these codes again.
      </Text>
      <View className="bg-secondary rounded-2xl p-4 mt-5 flex-row flex-wrap">
        {codes.map((value) => (
          <Text
            key={value}
            className="text-foreground text-sm font-semibold py-2"
            style={{ width: '50%' }}
          >
            {value}
          </Text>
        ))}
      </View>
      <Pressable
        onPress={onCopy}
        className="min-h-12 rounded-xl border border-primary/30 mt-4 flex-row items-center justify-center gap-2 active:scale-[0.98]"
      >
        <ClipboardIcon size={16} className="text-primary" />
        <Text className="text-primary text-sm font-bold">Copy all codes</Text>
      </Pressable>
      <Pressable
        onPress={onDone}
        className="min-h-12 rounded-xl bg-action mt-3 items-center justify-center active:scale-[0.98]"
      >
        <Text className="text-action-foreground text-sm font-bold">
          I’ve saved them
        </Text>
      </Pressable>
    </View>
  );
}
