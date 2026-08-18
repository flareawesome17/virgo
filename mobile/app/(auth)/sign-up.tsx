import { View, Text, ScrollView, Pressable, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth, useTheme } from '@/src/hooks';
import { useQuery } from '@tanstack/react-query';
import { authApi } from '@/src/api';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import {
  ArrowLeftIcon, UserIcon, MailIcon, LockIcon, EyeIcon, EyeOffIcon, ArrowRightIcon,
  CheckIcon, MapPinIcon, Building2Icon, AtSignIcon, HomeIcon, GlobeIcon, GiftIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { PALETTES } from '@/theme';

cssInterop(ArrowLeftIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(UserIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(MailIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(LockIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(EyeIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(EyeOffIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ArrowRightIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(CheckIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(MapPinIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(Building2Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(AtSignIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(HomeIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(GlobeIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(GiftIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

/**
 * Signing up, in three steps.
 *
 * It was one screen asking for everything at once, and it was about to get a
 * postal address on top. Splitting it is not decoration: a form's cost is what
 * you see before you start, and three short screens read as less work than one
 * long one even when the fields are identical. On a phone it matters more than
 * on the web — the old form was well past a screen height before the address
 * fields existed.
 *
 * The account is created once, on the last step. The steps are progressive
 * disclosure of a single form, not three saves: abandoning halfway leaves no
 * half-made account behind and nobody wondering whether they have one.
 *
 * Mirrors `web/src/components/sign-up-wizard.tsx` step for step and field for
 * field. Same account, same questions, whichever client somebody starts on.
 */

const STEPS = ['You', 'What you do', 'Where you are'] as const;

export default function SignUpScreen() {
  const { signUp, user } = useAuth();
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;

  const [step, setStep] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Step 1
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [referralCode, setReferralCode] = useState('');

  // Step 2
  const [roles, setRoles] = useState<string[]>([]);

  // Step 3
  const [line1, setLine1] = useState('');
  const [line2, setLine2] = useState('');
  const [city, setCity] = useState('');
  const [province, setProvince] = useState('');
  const [postal, setPostal] = useState('');
  const [country, setCountry] = useState('PH');
  const [studioName, setStudioName] = useState('');
  const [socialHandle, setSocialHandle] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  /**
   * The roles come from the server, not a copy in this file — the same list
   * the register endpoint validates against, so the form cannot offer
   * something that will be rejected.
   */
  const { data: roleList } = useQuery({
    queryKey: ['auth', 'roles'],
    queryFn: () => authApi.listRoles(),
    staleTime: Infinity,
  });

  // <Redirect> rather than router.replace(): navigating during render mutates
  // the navigation container mid-render and triggers React's
  // "Cannot update a component while rendering a different component" error.
  if (process.env.EXPO_PUBLIC_RAPIDNATIVE_MODE !== 'designer' && user) {
    return <Redirect href="/(app)/(tabs)" />;
  }

  /**
   * What each step is still missing, named rather than implied.
   *
   * A greyed-out button with no explanation is the worst version of a required
   * field — you are told no and not told why. One list per step, so the button
   * can be disabled *and* the reason given.
   */
  const missing: string[][] = [
    [
      !name.trim() && 'your name',
      !email.trim() && 'an email address',
      password.length < 8 && 'a password of at least 8 characters',
      confirmPassword.length > 0 && confirmPassword !== password && 'both passwords to match',
      password.length >= 8 && !confirmPassword && 'the password confirmed',
    ].filter(Boolean) as string[],
    [roles.length === 0 && 'at least one role'].filter(Boolean) as string[],
    [
      !line1.trim() && 'a street address',
      !city.trim() && 'a city or municipality',
      !province.trim() && 'a province or region',
      country.trim().length !== 2 && 'a two-letter country code',
      !acceptedTerms && 'the Terms and Privacy Policy',
    ].filter(Boolean) as string[],
  ];

  const stepReady = missing[step].length === 0;
  const isLast = step === STEPS.length - 1;

  const toggleRole = (role: string) =>
    setRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    );

  const goBack = () => {
    setErrorMsg('');
    if (step === 0) router.back();
    else setStep((s) => s - 1);
  };

  const advance = () => {
    if (!stepReady) return;
    setErrorMsg('');
    if (!isLast) { setStep((s) => s + 1); return; }
    signUp.mutate(
      {
        email: email.trim(),
        password,
        displayName: name.trim(),
        roles,
        addressLine1: line1.trim(),
        addressLine2: line2.trim() || undefined,
        addressCity: city.trim(),
        addressProvince: province.trim(),
        addressPostal: postal.trim() || undefined,
        addressCountry: country.trim().toUpperCase(),
        studioName: studioName.trim() || undefined,
        socialHandle: socialHandle.trim() || undefined,
        referralCode: referralCode.trim() || undefined,
      },
      {
        // With the address: there is no session after signing up, so the
        // next screen has nothing to name unless it is passed one.
        onSuccess: () =>
          router.push(`/check-inbox?email=${encodeURIComponent(email.trim())}`),
        onError: (err: any) => {
          const message = err?.reason || err?.message || 'Sign up failed. Please try again.';
          setErrorMsg(message);
          // A taken email or a rejected password belongs to step one, and
          // leaving somebody on the address step with an error about their
          // email is how a form becomes a maze.
          if (/email|password/i.test(message)) setStep(0);
        },
      },
    );
  };

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1">
        <ScrollView className="flex-1" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          {/* Header */}
          <View className="px-6 pt-4 pb-2 flex-row items-center gap-3">
            <Pressable
              onPress={goBack}
              accessibilityRole="button"
              accessibilityLabel="Go back"
              className="w-11 h-11 rounded-xl bg-secondary items-center justify-center active:scale-[0.96]"
            >
              <ArrowLeftIcon size={18} className="text-foreground" />
            </Pressable>
            <View>
              <Text className="text-foreground text-[28px] font-bold tracking-tight">Create Account</Text>
              <Text className="text-muted-foreground text-sm mt-0.5">Step {step + 1} of {STEPS.length}</Text>
            </View>
          </View>

          {/* How far in, and what is still coming. Three labelled markers
              rather than a bare bar: the number says how far, the labels say
              what is left, and the second is what stops it feeling
              open-ended. */}
          <View className="px-6 mt-4 mb-5 flex-row gap-2">
            {STEPS.map((label, i) => (
              <View key={label} className="flex-1 gap-1.5">
                <View
                  className={`h-1 rounded-full ${i < step ? 'bg-action' : i === step ? 'bg-primary/60' : 'bg-muted'}`}
                />
                <Text
                  className={`text-[11px] ${i === step ? 'text-foreground font-semibold' : 'text-muted-foreground'}`}
                >
                  {label}
                </Text>
              </View>
            ))}
          </View>

          <View className="px-6 gap-4">
            {step === 0 && (
              <>
                <Field label="Full Name" icon={<UserIcon size={16} className="text-muted-foreground" />}>
                  <TextInput value={name} onChangeText={setName} placeholder="Your name"
                    placeholderTextColor={palette.mutedForeground} className="flex-1 text-foreground text-base" autoCapitalize="words" />
                </Field>

                <Field label="Email" icon={<MailIcon size={16} className="text-muted-foreground" />}>
                  <TextInput value={email} onChangeText={setEmail} placeholder="you@studio.com"
                    placeholderTextColor={palette.mutedForeground} className="flex-1 text-foreground text-base"
                    keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
                </Field>

                <Field label="Password" icon={<LockIcon size={16} className="text-muted-foreground" />}>
                  <TextInput value={password} onChangeText={setPassword} placeholder="Min. 8 characters"
                    placeholderTextColor={palette.mutedForeground} className="flex-1 text-foreground text-base"
                    secureTextEntry={!showPassword} autoCapitalize="none" />
                  <Pressable
                    onPress={() => setShowPassword(!showPassword)}
                    accessibilityRole="button"
                    accessibilityLabel={showPassword ? 'Hide passwords' : 'Show passwords'}
                    className="w-11 h-11 items-center justify-center active:scale-[0.96]"
                  >
                    {showPassword ? <EyeOffIcon size={18} className="text-muted-foreground" /> : <EyeIcon size={18} className="text-muted-foreground" />}
                  </Pressable>
                </Field>

                {/* A typo in the only password box locked people out of an
                    account they had just made, and the way back was the
                    password reset flow. */}
                <Field
                  label="Confirm Password"
                  icon={<LockIcon size={16} className="text-muted-foreground" />}
                  error={confirmPassword.length > 0 && confirmPassword !== password ? 'These do not match.' : undefined}
                >
                  <TextInput value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Re-enter password"
                    placeholderTextColor={palette.mutedForeground} className="flex-1 text-foreground text-base"
                    secureTextEntry={!showPassword} autoCapitalize="none" />
                </Field>

                {/* On the first step rather than with the other optional fields
                    two screens later: somebody who was sent a code is holding it
                    now, and a field they have to go looking for is a referral
                    that never pays. */}
                <Field
                  label="Invite Code (optional)"
                  icon={<GiftIcon size={16} className="text-muted-foreground" />}
                >
                  <TextInput
                    value={referralCode}
                    onChangeText={(v) => setReferralCode(v.toUpperCase())}
                    placeholder="From whoever invited you"
                    placeholderTextColor={palette.mutedForeground}
                    className="flex-1 text-foreground text-base tracking-[2px]"
                    autoCapitalize="characters"
                    autoCorrect={false}
                    maxLength={32}
                  />
                </Field>
              </>
            )}

            {/* Roles. Chips rather than a picker: several apply at once — a
                photographer who also cuts the SDE holds both — and a one-of
                control would force people to misrepresent themselves. */}
            {step === 1 && (
              <View>
                <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px] mb-1 ml-1">
                  What do you do? <Text className="text-destructive">*</Text>
                </Text>
                <Text className="text-muted-foreground text-xs mb-3 ml-1">
                  Pick every one that applies. It is how the right jobs find you.
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {(roleList?.data ?? []).map((role) => {
                    const on = roles.includes(role);
                    return (
                      <Pressable
                        key={role}
                        onPress={() => toggleRole(role)}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: on }}
                        className={`min-h-11 flex-row items-center gap-1.5 rounded-full px-3.5 py-2 active:scale-[0.98] ${on ? 'bg-action' : 'bg-secondary'}`}
                      >
                        {on && <CheckIcon size={12} className="text-action-foreground" />}
                        <Text className={`text-xs font-semibold ${on ? 'text-action-foreground' : 'text-foreground'}`}>
                          {role}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Text
                  className={`text-xs mt-3 ml-1 ${roles.length === 0 ? 'text-destructive' : 'text-muted-foreground'}`}
                >
                  {roles.length === 0
                    ? 'Required — choose at least one.'
                    : `${roles.length} selected — you can change these later.`}
                </Text>
              </View>
            )}

            {step === 2 && (
              <>
                <Field label="Street Address" icon={<MapPinIcon size={16} className="text-muted-foreground" />}>
                  <TextInput value={line1} onChangeText={setLine1} placeholder="123 Rizal Street, Barangay San Roque"
                    placeholderTextColor={palette.mutedForeground} className="flex-1 text-foreground text-base" maxLength={200} />
                </Field>

                <Field label="Apartment, Unit, Floor" hint="Optional." icon={<HomeIcon size={16} className="text-muted-foreground" />}>
                  <TextInput value={line2} onChangeText={setLine2} placeholder="Unit 4B"
                    placeholderTextColor={palette.mutedForeground} className="flex-1 text-foreground text-base" maxLength={200} />
                </Field>

                <View className="flex-row gap-3">
                  <View className="flex-1">
                    <Field label="City" icon={<MapPinIcon size={16} className="text-muted-foreground" />}>
                      <TextInput value={city} onChangeText={setCity} placeholder="Cebu City"
                        placeholderTextColor={palette.mutedForeground} className="flex-1 text-foreground text-base" maxLength={120} />
                    </Field>
                  </View>
                  <View className="flex-1">
                    <Field label="Province">
                      <TextInput value={province} onChangeText={setProvince} placeholder="Cebu"
                        placeholderTextColor={palette.mutedForeground} className="flex-1 text-foreground text-base" maxLength={120} />
                    </Field>
                  </View>
                </View>

                <View className="flex-row gap-3">
                  {/* Optional on purpose. Plenty of Philippine addresses have
                      no ZIP, and refusing somebody for that is refusing them
                      for where they live. */}
                  <View className="flex-1">
                    <Field label="Postal Code" hint="Optional.">
                      <TextInput value={postal} onChangeText={setPostal} placeholder="6000"
                        placeholderTextColor={palette.mutedForeground} className="flex-1 text-foreground text-base"
                        keyboardType="number-pad" maxLength={20} />
                    </Field>
                  </View>
                  <View className="flex-1">
                    <Field label="Country" icon={<GlobeIcon size={16} className="text-muted-foreground" />}>
                      <TextInput value={country} onChangeText={(v) => setCountry(v.toUpperCase())}
                        placeholderTextColor={palette.mutedForeground} className="flex-1 text-foreground text-base"
                        autoCapitalize="characters" autoCorrect={false} maxLength={2} />
                    </Field>
                  </View>
                </View>

                <Field label="Studio Name" hint="Optional — if you trade under one." icon={<Building2Icon size={16} className="text-muted-foreground" />}>
                  <TextInput value={studioName} onChangeText={setStudioName} placeholder="Northlight Studio"
                    placeholderTextColor={palette.mutedForeground} className="flex-1 text-foreground text-base" maxLength={120} />
                </Field>

                <Field label="Social" hint="Optional — an @handle, a page, or a link." icon={<AtSignIcon size={16} className="text-muted-foreground" />}>
                  <TextInput value={socialHandle} onChangeText={setSocialHandle} placeholder="@yourstudio"
                    placeholderTextColor={palette.mutedForeground} className="flex-1 text-foreground text-base"
                    autoCapitalize="none" autoCorrect={false} maxLength={200} />
                </Field>

                {/* Terms. Required, and the links open the same document the
                    app shows in Settings. */}
                <Pressable
                  onPress={() => setAcceptedTerms((v) => !v)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: acceptedTerms }}
                  className="flex-row items-start gap-3 bg-secondary rounded-xl px-4 py-3.5 active:opacity-80"
                >
                  <View
                    className={`w-5 h-5 items-center justify-center rounded-md mt-0.5 ${
                      acceptedTerms ? 'bg-action' : 'border border-input'
                    }`}
                  >
                    {acceptedTerms && <CheckIcon size={13} className="text-action-foreground" />}
                  </View>
                  <Text className="text-muted-foreground text-xs flex-1 leading-5">
                    I have read and agree to the{' '}
                    <Text
                      className="text-primary font-semibold"
                      onPress={() => router.push('/legal')}
                    >
                      Terms of Service
                    </Text>{' '}
                    and{' '}
                    <Text
                      className="text-primary font-semibold"
                      onPress={() => router.push('/legal?tab=privacy')}
                    >
                      Privacy Policy
                    </Text>
                    . <Text className="text-destructive">*</Text>
                  </Text>
                </Pressable>

                <Text className="text-muted-foreground text-xs leading-5 px-1">
                  Your address is private. It is never shown on your profile or
                  to anyone you work with.
                </Text>
              </>
            )}

            {/* Says what is still missing rather than leaving a dead button to
                be puzzled over. */}
            {!stepReady ? (
              <Text className="text-muted-foreground text-xs text-center px-2">
                Still needed: {missing[step].join(', ')}.
              </Text>
            ) : null}

            {errorMsg ? (
              <View className="bg-destructive/10 rounded-xl px-4 py-3">
                <Text className="text-destructive text-sm">{errorMsg}</Text>
              </View>
            ) : null}
          </View>
        </ScrollView>

        {/* Bottom */}
        <View className="px-6 pb-10 pt-4 bg-background gap-4">
          <View className="flex-row items-center gap-3">
            {step > 0 && (
              <Pressable
                onPress={goBack}
                accessibilityRole="button"
                className="min-h-12 rounded-xl py-4 px-5 flex-row items-center justify-center gap-2 bg-secondary active:scale-[0.98]"
              >
                <ArrowLeftIcon size={18} className="text-foreground" />
                <Text className="text-foreground text-base font-semibold">Back</Text>
              </Pressable>
            )}
            <Pressable
              onPress={advance}
              disabled={!stepReady || signUp.isPending}
              accessibilityRole="button"
              accessibilityState={{ disabled: !stepReady || signUp.isPending }}
              className={`min-h-12 flex-1 rounded-xl py-4 flex-row items-center justify-center gap-2 active:scale-[0.98] ${stepReady ? 'bg-action' : 'bg-muted'}`}>
              <Text className={`text-base font-bold ${stepReady ? 'text-action-foreground' : 'text-muted-foreground'}`}>
                {signUp.isPending ? 'Creating account...' : isLast ? 'Create Account' : 'Continue'}
              </Text>
              {!signUp.isPending && (
                isLast
                  ? <CheckIcon size={18} className={stepReady ? 'text-action-foreground' : 'text-muted-foreground'} />
                  : <ArrowRightIcon size={18} className={stepReady ? 'text-action-foreground' : 'text-muted-foreground'} />
              )}
            </Pressable>
          </View>
          <View className="flex-row items-center justify-center gap-1">
            <Text className="text-muted-foreground text-sm">Already have an account?</Text>
            <Pressable onPress={() => router.push('/sign-in')} className="active:opacity-60">
              <Text className="text-primary text-sm font-bold">Sign In</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/**
 * One labelled input row. Fifteen of these were the same eight lines of
 * shadow and rounding copied over, which is how two of them ended up with
 * different corner radii.
 */
function Field({
  label,
  hint,
  error,
  icon,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <View>
      <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px] mb-2 ml-1">{label}</Text>
      <View className="bg-secondary rounded-xl px-4 py-3.5 flex-row items-center gap-3">
        {icon}
        {children}
      </View>
      {error ? (
        <Text className="text-destructive text-xs mt-1.5 ml-1">{error}</Text>
      ) : hint ? (
        <Text className="text-muted-foreground text-xs mt-1.5 ml-1">{hint}</Text>
      ) : null}
    </View>
  );
}
